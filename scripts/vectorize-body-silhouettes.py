"""Vectoriza las siluetas F/M con Potrace y actualiza body-silhouettes.ts."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from potrace import Bitmap, BezierSegment

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "scripts" / "body-silhouette-sources"
ASSETS_DIR = ROOT / "src" / "assets" / "clinical-ficha" / "body"
TS_PATH = ROOT / "src" / "lib" / "clinical-ficha" / "body-silhouettes.ts"
PREVIEW_PATH = ROOT / "scripts" / "body-silhouette-preview.html"
VIEWBOX = (100.0, 130.0)
PADDING = 5.0
UPSCALE = 8

CONST_MAP = {
    "female_front": "frontFemale",
    "female_back": "backFemale",
    "female_side": "sideFemale",
    "male_front": "frontMale",
    "male_back": "backMale",
    "male_side": "sideMale",
}


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def xy(point) -> tuple[float, float]:
    return float(point.x), float(point.y)


def point_to_path(curves) -> str:
    if not curves:
        raise RuntimeError("Potrace no devolvió curvas")
    curve = max(curves, key=lambda item: abs(item._path.area) if hasattr(item, "_path") else len(item))
    start_x, start_y = xy(curve.start_point)
    parts = [f"M{fmt(start_x)} {fmt(start_y)}"]
    for segment in curve:
        end_x, end_y = xy(segment.end_point)
        if isinstance(segment, BezierSegment):
            c1x, c1y = xy(segment.c1)
            c2x, c2y = xy(segment.c2)
            parts.append(f"C{fmt(c1x)} {fmt(c1y)} {fmt(c2x)} {fmt(c2y)} {fmt(end_x)} {fmt(end_y)}")
        else:
            corner_x, corner_y = xy(segment.c)
            parts.append(f"L{fmt(corner_x)} {fmt(corner_y)} L{fmt(end_x)} {fmt(end_y)}")
    parts.append("Z")
    return "".join(parts)


def parse_bounds(d: str) -> tuple[float, float, float, float]:
    numbers = [float(token) for token in d.replace(",", " ").replace("C", " ").replace("L", " ").replace("M", " ").replace("Z", " ").split()]
    xs = numbers[0::2]
    ys = numbers[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def transform_path(d: str, scale: float, ox: float, oy: float) -> str:
    out: list[str] = []
    token = ""
    coords: list[str] = []
    i = 0
    while i < len(d):
        ch = d[i]
        if ch.isalpha():
            if token:
                coords.append(token)
                token = ""
            if coords:
                out.extend(transform_coords(coords, scale, ox, oy))
                coords = []
            out.append(ch)
        elif ch in " ,":
            if token:
                coords.append(token)
                token = ""
        else:
            token += ch
        i += 1
    if token:
        coords.append(token)
    if coords:
        out.extend(transform_coords(coords, scale, ox, oy))
    return "".join(out)


def transform_coords(coords: list[str], scale: float, ox: float, oy: float) -> list[str]:
    rendered: list[str] = []
    for index, raw in enumerate(coords):
        value = float(raw)
        mapped = value * scale + (ox if index % 2 == 0 else oy)
        prefix = "" if index == 0 else " "
        rendered.append(prefix + fmt(mapped))
    return rendered


def mask_from_png(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    alpha = image.split()[-1]
    width, height = alpha.size
    mid = alpha.resize((width * UPSCALE, height * UPSCALE), Image.Resampling.NEAREST)
    mid = mid.filter(ImageFilter.GaussianBlur(radius=UPSCALE * 0.9))
    binary = mid.point(lambda value: 255 if value > 128 else 0)
    # Bitmap.invert() da vuelta la máscara: mandamos el fondo como "tinta"
    # para que Potrace trace la figura y no el rectángulo exterior.
    return np.array(binary, dtype=np.uint8) < 128


def vectorize(path: Path) -> str:
    mask = mask_from_png(path)
    bitmap = Bitmap(mask, blacklevel=0.5)
    traced = bitmap.trace(turdsize=40, alphamax=0.35, opticurve=True, opttolerance=0.55)
    print(f"  curves={len(traced)} areas={[getattr(c._path, 'area', None) for c in traced]}")
    raw = point_to_path(traced)
    min_x, min_y, max_x, max_y = parse_bounds(raw)
    source_w = max(max_x - min_x, 1)
    source_h = max(max_y - min_y, 1)
    target_w = VIEWBOX[0] - PADDING * 2
    target_h = VIEWBOX[1] - PADDING * 2
    scale = min(target_w / source_w, target_h / source_h)
    ox = (VIEWBOX[0] - source_w * scale) / 2 - min_x * scale
    oy = (VIEWBOX[1] - source_h * scale) / 2 - min_y * scale
    return transform_path(raw, scale, ox, oy)


def write_svg_asset(name: str, d: str) -> None:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {int(VIEWBOX[0])} {int(VIEWBOX[1])}" '
        f'role="img" aria-hidden="true"><path d="{d}" fill="currentColor" fill-opacity="0.1" '
        f'stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>\n'
    )
    (ASSETS_DIR / f"{name}.svg").write_text(svg, encoding="utf-8")


def update_ts(paths: dict[str, str]) -> None:
    content = TS_PATH.read_text(encoding="utf-8")
    for name, const_name in CONST_MAP.items():
        marker = f"const {const_name} =\n\t'"
        start = content.index(marker) + len(marker)
        end = content.index("';", start)
        content = content[:start] + paths[name] + content[end:]
    TS_PATH.write_text(content, encoding="utf-8")


def write_preview(paths: dict[str, str]) -> None:
    cards = []
    for name, d in paths.items():
        cards.append(
            f'<figure><svg viewBox="0 0 100 130"><path d="{d}" fill="#9aa0a6"/></svg>'
            f"<figcaption>{name}</figcaption></figure>"
        )
    html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Siluetas</title>
<style>
body{{margin:0;padding:24px;background:#111;color:#eee;font-family:sans-serif}}
main{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}}
figure{{margin:0;background:#1b1b1b;border-radius:16px;padding:16px;text-align:center}}
svg{{width:100%;height:auto;max-height:420px}}
figcaption{{margin-top:8px;font-size:13px}}
</style></head><body><main>{''.join(cards)}</main></body></html>
"""
    PREVIEW_PATH.write_text(html, encoding="utf-8")


def main() -> None:
    paths: dict[str, str] = {}
    for name in CONST_MAP:
        src = SOURCE_DIR / f"{name}.png"
        d = vectorize(src)
        paths[name] = d
        write_svg_asset(name, d)
        print(f"{name}: {len(d)} chars")
    update_ts(paths)
    write_preview(paths)
    print(f"Preview: {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
