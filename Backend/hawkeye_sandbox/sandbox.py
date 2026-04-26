from __future__ import annotations

import dataclasses
import contextlib
import time
import uuid
import subprocess
from typing import Optional, Iterator, Iterable

from .logger import get_logger

logger = get_logger()


@dataclasses.dataclass(frozen=True)
class SandboxConfig:
    url: str
    browser: str = "chromium"  # chromium | firefox | webkit
    width: int = 1366
    height: int = 768
    depth: int = 24

    image: str = "project-hawkeye-hawkeye-sandbox:latest"

    # Container internal ports
    novnc_port: int = 6080
    cdp_proxy_port: int = 9223  # only meaningful for chromium
    chrome_cdp_port: int = 9222

    # Host publishing and returned URLs
    host: str = "127.0.0.1"
    scheme: str = "http"

    # Runtime
    name_prefix: str = "hawkeye-sandbox-run"
    shm_size: str = "1g"


@dataclasses.dataclass(frozen=True)
class SandboxHandle:
    container_id: str
    container_name: str
    novnc_url: str
    cdp_url: Optional[str]
    recording_container_path: Optional[str] = None

    def __str__(self) -> str:
        return f"{self.container_name} novnc={self.novnc_url} cdp={self.cdp_url or '-'}"


class SandboxManager:
    """
    Spawns an isolated sandbox container per run.

    External callers can import this class and call spawn() with a URL, browser,
    and screen size. The sandbox will launch the requested website on boot.
    """

    def __init__(self) -> None:
        pass

    def start_recording(
        self,
        handle: SandboxHandle,
        *,
        width: int = 1366,
        height: int = 768,
        fps: int = 20,
        container_path: str = "/tmp/hawkeye-run.mp4",
    ) -> SandboxHandle:
        """
        Start recording the sandbox X11 display (:99) to an MP4 inside the container.
        Requires ffmpeg in the sandbox image.
        """
        # Wait briefly for Xvfb to come up.
        for _ in range(30):
            ready = subprocess.run(
                ["docker", "exec", handle.container_name, "bash", "-lc", "test -S /tmp/.X11-unix/X99"],
                check=False,
            )
            if ready.returncode == 0:
                break
            time.sleep(0.2)

        log_path = "/tmp/hawkeye-ffmpeg.log"
        cmd = (
            f"rm -f {container_path} {log_path}; "
            f"ffmpeg -y -loglevel info -video_size {width}x{height} -framerate {fps} "
            f"-f x11grab -i :99.0 -c:v libx264 -preset ultrafast -pix_fmt yuv420p {container_path} "
            f"> {log_path} 2>&1"
        )
        subprocess.run(
            ["docker", "exec", "-d", handle.container_name, "bash", "-lc", cmd],
            check=False,
        )
        return dataclasses.replace(handle, recording_container_path=container_path)

    def stop_recording(self, handle: SandboxHandle) -> None:
        """
        Stop ffmpeg recording (SIGINT so mp4 finalizes).
        """
        subprocess.run(
            ["docker", "exec", handle.container_name, "bash", "-lc", "pkill -INT -f 'ffmpeg.*x11grab' || true"],
            check=False,
        )
        subprocess.run(["docker", "exec", handle.container_name, "bash", "-lc", "sleep 1"], check=False)

    def fetch_recording(self, handle: SandboxHandle, *, host_path: str) -> str:
        """
        Copy the recorded MP4 from the container to host_path.
        """
        if not handle.recording_container_path:
            raise RuntimeError("No recording_container_path set on handle (did you call start_recording?).")
        import os

        os.makedirs(os.path.dirname(host_path) or ".", exist_ok=True)
        # Wait briefly for ffmpeg to create the file.
        for _ in range(30):
            test = subprocess.run(
                ["docker", "exec", handle.container_name, "bash", "-lc", f"test -s {handle.recording_container_path}"],
                check=False,
            )
            if test.returncode == 0:
                break
            time.sleep(0.2)
        cp = subprocess.run(
            ["docker", "cp", f"{handle.container_name}:{handle.recording_container_path}", host_path],
            check=False,
        )
        if cp.returncode != 0 or not os.path.exists(host_path):
            # Try to copy ffmpeg log for debugging.
            subprocess.run(
                ["docker", "cp", f"{handle.container_name}:/tmp/hawkeye-ffmpeg.log", host_path + ".ffmpeg.log"],
                check=False,
            )
            raise RuntimeError(
                f"Recording file not found in container at {handle.recording_container_path}. "
                f"Copied log to {host_path}.ffmpeg.log"
            )
        return host_path

    @contextlib.contextmanager
    def managed(self, cfg: SandboxConfig, *, timeout_s: int = 45, remove: bool = True) -> Iterator[SandboxHandle]:
        """
        Spawn a sandbox and guarantee cleanup on exit.

        Usage:
            with SandboxManager().managed(SandboxConfig(...)) as handle:
                ...
        """
        handle = self.spawn(cfg, timeout_s=timeout_s)
        try:
            yield handle
        finally:
            # If user started a recording, stop it cleanly before teardown.
            if handle.recording_container_path:
                self.stop_recording(handle)
            self.stop(handle, remove=remove)

    def spawn(self, cfg: SandboxConfig, *, timeout_s: int = 45) -> SandboxHandle:
        run_id = uuid.uuid4().hex[:10]
        name = f"{cfg.name_prefix}-{run_id}"
        logger.info("spawning sandbox name=%s browser=%s", name, cfg.browser)

        env = {
            "DISPLAY": ":99",
            "SCREEN_WIDTH": str(cfg.width),
            "SCREEN_HEIGHT": str(cfg.height),
            "SCREEN_DEPTH": str(cfg.depth),
            "CHROME_URL": cfg.url,
            "BROWSER": cfg.browser,
            "CHROME_CDP_PORT": str(cfg.chrome_cdp_port),
        }

        cmd = ["docker", "run", "-d", "--name", name, "--shm-size", cfg.shm_size]
        for k, v in env.items():
            cmd += ["-e", f"{k}={v}"]

        # Bind to cfg.host and let Docker choose random host ports.
        cmd += ["-p", f"{cfg.host}::{cfg.novnc_port}"]
        cmd += ["-p", f"{cfg.host}::{cfg.cdp_proxy_port}"]
        cmd += [cfg.image]

        logger.debug("docker run: %s", " ".join(cmd))
        res = subprocess.run(cmd, check=True, capture_output=True, text=True)
        container_id = res.stdout.strip()

        deadline = time.time() + timeout_s
        novnc_url: Optional[str] = None
        cdp_url: Optional[str] = None
        while time.time() < deadline:
            port_out = subprocess.run(
                ["docker", "port", name],
                capture_output=True,
                text=True,
            ).stdout
            for line in port_out.splitlines():
                # Example: 6080/tcp -> 127.0.0.1:49154
                if line.startswith(f"{cfg.novnc_port}/tcp ->"):
                    host_port = line.rsplit(":", 1)[-1].strip()
                    novnc_url = f"{cfg.scheme}://{cfg.host}:{host_port}/"
                if line.startswith(f"{cfg.cdp_proxy_port}/tcp ->"):
                    host_port = line.rsplit(":", 1)[-1].strip()
                    cdp_url = f"{cfg.scheme}://{cfg.host}:{host_port}"

            if novnc_url:
                break
            time.sleep(0.2)

        if not novnc_url:
            raise RuntimeError("Sandbox started, but noVNC port was not published in time.")

        # CDP is only expected to work for chromium-family browsers.
        if cfg.browser.lower() not in ("chromium", "chrome", "msedge", "edge"):
            cdp_url = None

        handle = SandboxHandle(
            container_id=container_id,
            container_name=name,
            novnc_url=novnc_url,
            cdp_url=cdp_url,
        )
        logger.info("spawned %s", handle)
        return handle

    def spawn_all(
        self,
        *,
        url: str,
        width: int = 1366,
        height: int = 768,
        depth: int = 24,
        image: str = "project-hawkeye-hawkeye-sandbox:latest",
        host: str = "127.0.0.1",
        scheme: str = "http",
        timeout_s: int = 45,
    ) -> list[tuple[str, SandboxHandle]]:
        """Spawn one container per supported browser."""
        browsers = ["chromium", "chrome", "msedge", "firefox", "webkit"]
        out: list[tuple[str, SandboxHandle]] = []
        for b in browsers:
            h = self.spawn(
                SandboxConfig(
                    url=url,
                    browser=b,
                    width=width,
                    height=height,
                    depth=depth,
                    image=image,
                    host=host,
                    scheme=scheme,
                ),
                timeout_s=timeout_s,
            )
            out.append((b, h))
        return out

    @contextlib.contextmanager
    def managed_all(
        self,
        *,
        url: str,
        width: int = 1366,
        height: int = 768,
        depth: int = 24,
        image: str = "project-hawkeye-hawkeye-sandbox:latest",
        host: str = "127.0.0.1",
        scheme: str = "http",
        timeout_s: int = 45,
        remove: bool = True,
    ) -> Iterator[list[tuple[str, SandboxHandle]]]:
        """Like spawn_all(), but always stops the spawned containers."""
        handles: list[tuple[str, SandboxHandle]] = []
        try:
            handles = self.spawn_all(
                url=url,
                width=width,
                height=height,
                depth=depth,
                image=image,
                host=host,
                scheme=scheme,
                timeout_s=timeout_s,
            )
            yield handles
        finally:
            for _, h in handles:
                self.stop(h, remove=remove)

    def stop_all(self, handles: Iterable[SandboxHandle], *, remove: bool = True, timeout_s: int = 10) -> None:
        for h in handles:
            self.stop(h, remove=remove, timeout_s=timeout_s)

    def stop(self, handle: SandboxHandle, *, remove: bool = True, timeout_s: int = 10) -> None:
        logger.info("stopping sandbox name=%s remove=%s", handle.container_name, remove)
        if remove:
            subprocess.run(["docker", "rm", "-f", handle.container_id], check=False)
        else:
            subprocess.run(["docker", "stop", "-t", str(timeout_s), handle.container_id], check=False)

