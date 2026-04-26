from __future__ import annotations

import dataclasses
import time
import uuid
import subprocess
from typing import Optional


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

    def spawn(self, cfg: SandboxConfig, *, timeout_s: int = 45) -> SandboxHandle:
        run_id = uuid.uuid4().hex[:10]
        name = f"{cfg.name_prefix}-{run_id}"

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

        return SandboxHandle(
            container_id=container_id,
            container_name=name,
            novnc_url=novnc_url,
            cdp_url=cdp_url,
        )

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

    def stop(self, handle: SandboxHandle, *, remove: bool = True, timeout_s: int = 10) -> None:
        if remove:
            subprocess.run(["docker", "rm", "-f", handle.container_id], check=False)
        else:
            subprocess.run(["docker", "stop", "-t", str(timeout_s), handle.container_id], check=False)

