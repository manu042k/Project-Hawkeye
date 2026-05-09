"""Run visual_design assertions: fetch Figma frame, diff against actual screenshot."""
from __future__ import annotations
from pathlib import Path

from orchestrator.models.results import AssertionResult


async def run_visual_assertion(
    assertion_id: str,
    description: str,
    params: dict,
    actual_screenshot: bytes,
    figma_token: str,
    output_dir: Path,
) -> AssertionResult:
    from orchestrator.vision.figma_client import export_frame_png, parse_figma_url
    from orchestrator.vision.pixel_diff import diff_images

    figma_url = params.get("figma_frame", "")
    threshold = float(params.get("threshold", 0.05))

    try:
        file_key, node_id = parse_figma_url(figma_url)
        figma_png = await export_frame_png(file_key, node_id, figma_token)
        diff_ratio, diff_png = diff_images(figma_png, actual_screenshot)

        diff_path = output_dir / f"{assertion_id}_diff.png"
        diff_path.write_bytes(diff_png)

        passed = diff_ratio <= threshold
        return AssertionResult(
            assertion_id=assertion_id,
            type="visual_design",
            description=description,
            passed=passed,
            status="passed" if passed else "failed",
            details=(
                f"Pixel diff: {diff_ratio:.1%} (threshold {threshold:.1%}). "
                f"Diff image: {diff_path.name}"
            ),
        )
    except Exception as exc:
        return AssertionResult(
            assertion_id=assertion_id,
            type="visual_design",
            description=description,
            passed=False,
            status="error",
            details=f"Visual assertion error: {exc}",
        )
