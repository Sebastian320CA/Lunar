"""Download Natural Earth countries (110m) and write simplified SVG paths for menu buttons.

Source: Natural Earth (public domain), https://www.naturalearthdata.com
Run once at data-prep time (needs network); the app itself stays offline.
Output: data/menu-shapes.json  { "<ISO_A3>": "<svg path d, viewBox 0 0 100 100>" }
STATUS: PENDING - not run yet; the menu falls back to rounded shapes.
"""
import io
import json
import pathlib
import urllib.request
import zipfile

URL = "https://naturalearth.s3.amazonaws.com/110m_cultural/ne_110m_admin_0_countries.zip"
OUT = pathlib.Path(__file__).resolve().parents[2] / "data" / "menu-shapes.json"
TOLERANCE = 0.5  # degrees, Douglas-Peucker


def _dp(points, tol):
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5 or 1e-12
    idx, dmax = 0, 0.0
    for i in range(1, len(points) - 1):
        d = abs(dy * points[i][0] - dx * points[i][1] + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            idx, dmax = i, d
    if dmax > tol:
        return _dp(points[: idx + 1], tol)[:-1] + _dp(points[idx:], tol)
    return [points[0], points[-1]]


def _to_path(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    x0, y0 = min(xs), min(ys)
    scale = 100 / (max(max(xs) - x0, max(ys) - y0) or 1)
    parts = []
    for ring in rings:
        pts = _dp(ring, TOLERANCE)
        if len(pts) < 3:
            continue
        coords = [f"{(x - x0) * scale:.1f} {100 - (y - y0) * scale:.1f}" for x, y in pts]
        parts.append("M" + " L".join(coords) + " Z")
    return " ".join(parts)


def main():
    import shapefile  # pyshp: pip install pyshp

    with urllib.request.urlopen(URL, timeout=60) as r:
        z = zipfile.ZipFile(io.BytesIO(r.read()))
    base = "ne_110m_admin_0_countries"
    sf = shapefile.Reader(
        shp=io.BytesIO(z.read(base + ".shp")),
        dbf=io.BytesIO(z.read(base + ".dbf")),
        shx=io.BytesIO(z.read(base + ".shx")),
    )
    out = {}
    for rec, shp in zip(sf.records(), sf.shapes()):
        parts = list(shp.parts) + [len(shp.points)]
        rings = [shp.points[parts[i] : parts[i + 1]] for i in range(len(parts) - 1)]
        d = _to_path(rings)
        if d:
            out[rec["ADM0_A3"]] = d
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out), encoding="utf-8")
    print(f"wrote {len(out)} shapes to {OUT} (Natural Earth, public domain)")


if __name__ == "__main__":
    main()
