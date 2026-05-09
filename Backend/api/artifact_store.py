"""Pluggable artifact storage for run outputs (reports, screenshots, video).

LocalArtifactStore serves files directly via FastAPI FileResponse.
S3ArtifactStore (future) will return presigned URLs.
Selected via ARTIFACT_STORE=local|s3 env var.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, runtime_checkable

_ARTIFACTS_ROOT = Path(os.environ.get("ARTIFACT_DIR", "artifacts"))


@dataclass
class ArtifactMeta:
    name: str            # relative path: "screenshots/step_01.png"
    type: str            # report | video | screenshot | diff | trace
    url: str             # URL the frontend can fetch
    size_bytes: int
    step: int | None = None           # set for screenshots
    assertion_id: str | None = None   # set for diffs


@runtime_checkable
class ArtifactStore(Protocol):
    def save(self, run_id: str, filename: str, data: bytes) -> ArtifactMeta: ...
    def get_url(self, run_id: str, filename: str) -> str: ...
    def list(self, run_id: str) -> list[ArtifactMeta]: ...
    def delete_run(self, run_id: str) -> None: ...


class LocalArtifactStore:
    """Stores artifacts on the local filesystem under artifacts/{run_id}/.

    URLs are /api/runs/{run_id}/artifacts/{filename} served by FastAPI.
    """

    def __init__(self, root: Path = _ARTIFACTS_ROOT) -> None:
        self._root = root

    def _run_dir(self, run_id: str) -> Path:
        return self._root / run_id

    def save(self, run_id: str, filename: str, data: bytes) -> ArtifactMeta:
        dest = self._run_dir(run_id) / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return self._meta(run_id, filename, len(data))

    def get_url(self, run_id: str, filename: str) -> str:
        return f"/api/runs/{run_id}/artifacts/{filename}"

    def list(self, run_id: str) -> list[ArtifactMeta]:
        run_dir = self._run_dir(run_id)
        if not run_dir.exists():
            return []
        metas: list[ArtifactMeta] = []
        for path in sorted(run_dir.rglob("*")):
            if path.is_file():
                rel = str(path.relative_to(run_dir))
                metas.append(self._meta(run_id, rel, path.stat().st_size))
        return metas

    def delete_run(self, run_id: str) -> None:
        import shutil
        run_dir = self._run_dir(run_id)
        if run_dir.exists():
            shutil.rmtree(run_dir)

    def get_path(self, run_id: str, filename: str) -> Path:
        return self._run_dir(run_id) / filename

    def _meta(self, run_id: str, rel: str, size: int) -> ArtifactMeta:
        ftype = _classify(rel)
        step = _step_number(rel) if ftype == "screenshot" else None
        aid = _assertion_id(rel) if ftype == "diff" else None
        return ArtifactMeta(
            name=rel,
            type=ftype,
            url=self.get_url(run_id, rel),
            size_bytes=size,
            step=step,
            assertion_id=aid,
        )


def _classify(rel: str) -> str:
    if rel.startswith("screenshots/"):
        return "screenshot"
    if rel.startswith("diffs/"):
        return "diff"
    if rel == "video.mp4":
        return "video"
    if rel == "trace.json":
        return "trace"
    if rel in ("report.html", "report.md"):
        return "report"
    return "other"


def _step_number(rel: str) -> int | None:
    # screenshots/step_03.png -> 3
    name = Path(rel).stem  # step_03
    try:
        return int(name.split("_")[-1])
    except ValueError:
        return None


def _assertion_id(rel: str) -> str | None:
    # diffs/A1_diff.png -> A1
    name = Path(rel).stem  # A1_diff
    parts = name.rsplit("_", 1)
    return parts[0] if len(parts) == 2 else None


# Module-level singleton — swap for S3ArtifactStore when ARTIFACT_STORE=s3
def get_store() -> LocalArtifactStore:
    backend = os.environ.get("ARTIFACT_STORE", "local")
    if backend == "s3":
        raise NotImplementedError("S3ArtifactStore not yet implemented")
    return LocalArtifactStore()
