"""Pillow-based pixel diff between two PNG images."""
from __future__ import annotations
import io

from PIL import Image
import numpy as np


def diff_images(img_a: bytes, img_b: bytes) -> tuple[float, bytes]:
    """
    Compare two PNG images. Returns (diff_ratio, diff_png).
    diff_ratio: 0.0 = identical, 1.0 = completely different.
    diff_png: highlighted diff image as PNG bytes.
    """
    a = Image.open(io.BytesIO(img_a)).convert("RGBA")
    b = Image.open(io.BytesIO(img_b)).convert("RGBA")

    if a.size != b.size:
        b = b.resize(a.size, Image.LANCZOS)

    arr_a = np.array(a, dtype=np.float32)
    arr_b = np.array(b, dtype=np.float32)

    diff = np.abs(arr_a - arr_b)
    diff_mask = diff.max(axis=2) > 10
    diff_ratio = float(diff_mask.sum()) / (a.width * a.height)

    out = np.ones_like(arr_a) * 255
    out[diff_mask] = [255, 0, 0, 255]
    out[~diff_mask] = arr_a[~diff_mask]

    diff_img = Image.fromarray(out.astype(np.uint8), "RGBA")
    buf = io.BytesIO()
    diff_img.save(buf, format="PNG")
    return diff_ratio, buf.getvalue()
