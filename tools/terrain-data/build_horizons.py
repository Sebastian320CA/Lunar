#!/usr/bin/env python3
"""Build per-site horizon profiles (HorizonProfile JSON) from a local lunar DEM.

Build-time tool only. The app never downloads data at runtime.

Input : data/sites/sites.json (LunarSite[]) and a LOLA DEM already on disk.
Output: data/terrain/<siteId>.json  ->  {azimuthStepDeg, elevationDeg[360/step],
        demResolutionM, demSource}

No DEM is bundled and none is downloaded here. Without --dem the script exits
with an error and writes nothing (no fabricated output).

Supported DEM layouts (simple cylindrical / equirectangular only):
  * raw binary grid (PDS .IMG data part, no header)   --dem X.IMG --rows --cols --ppd ...
  * GeoTIFF in equirectangular projection (needs rasterio; optional)  --dem X.tif

Geometry: sphere of reference radius 1737.4 km (IAU lunar reference sphere).
No atmosphere, so no refraction. Elevation angle of a terrain point as seen from
an observer at radius r0 = R + z0 + h, target radius r1 = R + z, central angle
t = d / R:
    horizontal = r1 * sin(t);  vertical = r1 * cos(t) - r0
    elevation  = atan2(vertical, horizontal)
The profile value per azimuth is the maximum over all samples along the ray.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

R_MOON_M = 1_737_400.0  # reference radius, m (IAU lunar reference sphere)
MAX_MAST_M = 5.0

DEM_CREDIT = (
    "LOLA gridded DEM (LRO), NASA PDS Geosciences Node "
    "(pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/). "
    "Build-time source only. Inspirado en NASA Space Apps - No avalado por la NASA"
)


class Dem:
    """Equirectangular DEM: heights in metres above the 1737.4 km sphere."""

    def __init__(self, data: np.ndarray, ppd: float, lon0_deg: float, lat_top_deg: float = 90.0):
        self.data = data  # shape (rows, cols), float-convertible
        self.ppd = float(ppd)
        self.lon0 = float(lon0_deg)
        self.lat_top = float(lat_top_deg)
        self.rows, self.cols = data.shape

    @property
    def pixel_m(self) -> float:
        """Pixel size at the equator, metres."""
        return 2.0 * math.pi * R_MOON_M / (360.0 * self.ppd)

    def sample(self, lat_deg: np.ndarray, lon_deg: np.ndarray) -> np.ndarray:
        """Bilinear sample (pixel-registered grid). NaN outside latitude coverage."""
        row = (self.lat_top - lat_deg) * self.ppd - 0.5
        col = ((lon_deg - self.lon0) % 360.0) * self.ppd - 0.5
        outside = (row < -0.5) | (row > self.rows - 0.5)
        row = np.clip(row, 0.0, self.rows - 1.0)
        r0 = np.floor(row).astype(np.int64)
        r1 = np.minimum(r0 + 1, self.rows - 1)
        fr = row - r0
        c0 = np.floor(col).astype(np.int64) % self.cols
        c1 = (c0 + 1) % self.cols
        fc = col - np.floor(col)
        d = self.data
        top = d[r0, c0] * (1 - fc) + d[r0, c1] * fc
        bot = d[r1, c0] * (1 - fc) + d[r1, c1] * fc
        out = top * (1 - fr) + bot * fr
        return np.where(outside, np.nan, out)


def destination(lat_deg: float, lon_deg: float, az_deg: float, dist_m: np.ndarray):
    """Great-circle destination on the reference sphere (az 0 = north, clockwise)."""
    lat1 = math.radians(lat_deg)
    lon1 = math.radians(lon_deg)
    az = math.radians(az_deg)
    t = dist_m / R_MOON_M
    sin_lat2 = math.sin(lat1) * np.cos(t) + math.cos(lat1) * np.sin(t) * math.cos(az)
    lat2 = np.arcsin(np.clip(sin_lat2, -1.0, 1.0))
    lon2 = lon1 + np.arctan2(
        math.sin(az) * np.sin(t) * math.cos(lat1),
        np.cos(t) - math.sin(lat1) * sin_lat2,
    )
    return np.degrees(lat2), (np.degrees(lon2) + 540.0) % 360.0 - 180.0


def horizon_profile(
    dem: Dem,
    lat_deg: float,
    lon_deg: float,
    observer_height_m: float = 0.0,
    az_step_deg: float = 1.0,
    max_dist_m: float = 100_000.0,
    step_m: float | None = None,
) -> list[float]:
    """Ray-march the DEM; returns elevation angles (deg) for azimuths 0, step, ..."""
    if not (0.0 <= observer_height_m <= 100.0):
        raise ValueError("observer height out of range")
    n_az = int(round(360.0 / az_step_deg))
    if abs(n_az * az_step_deg - 360.0) > 1e-9:
        raise ValueError("azimuth step must divide 360")
    step = step_m if step_m else dem.pixel_m / 2.0
    dist = np.arange(step, max_dist_m + step, step)
    z0 = float(dem.sample(np.array([lat_deg]), np.array([lon_deg]))[0])
    if math.isnan(z0):
        raise ValueError("site outside DEM coverage")
    r0 = R_MOON_M + z0 + observer_height_m
    t = dist / R_MOON_M
    out: list[float] = []
    for i in range(n_az):
        lat2, lon2 = destination(lat_deg, lon_deg, i * az_step_deg, dist)
        z = dem.sample(lat2, lon2)
        ok = ~np.isnan(z)
        if not ok.any():
            out.append(0.0)
            continue
        r1 = R_MOON_M + z[ok]
        tt = t[ok]
        elev = np.arctan2(r1 * np.cos(tt) - r0, r1 * np.sin(tt))
        out.append(round(float(np.degrees(elev.max())), 4))
    return out


def load_raw(path: Path, rows: int, cols: int, dtype: str, scale: float, offset_m: float,
             ppd: float, lon0: float) -> Dem:
    arr = np.memmap(path, dtype=np.dtype(dtype), mode="r", shape=(rows, cols))
    # Lazy scale/offset: materialise as float32 (large DEMs: use a regional crop).
    data = arr.astype(np.float32) * np.float32(scale) + np.float32(offset_m)
    return Dem(data, ppd, lon0)


def load_geotiff(path: Path) -> Dem:
    try:
        import rasterio  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("GeoTIFF input needs rasterio (pip install rasterio)") from exc
    with rasterio.open(path) as src:
        t = src.transform
        if t.b != 0 or t.d != 0 or abs(abs(t.a) - abs(t.e)) > 1e-12:
            raise SystemExit("GeoTIFF must be equirectangular (square degree pixels)")
        data = src.read(1).astype(np.float32)
        ppd = 1.0 / abs(t.a)
        return Dem(data, ppd, t.c, t.f)


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[2]
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dem", type=Path, help="local DEM file (not downloaded by this tool)")
    p.add_argument("--sites", type=Path, default=root / "data" / "sites" / "sites.json")
    p.add_argument("--out", type=Path, default=root / "data" / "terrain")
    p.add_argument("--site", action="append", help="only these site ids")
    p.add_argument("--observer-height-m", type=float, default=0.0, help="default 0")
    p.add_argument("--mast-m", type=float, choices=[1, 2, 3, 4, 5], help="mast height option 1..5 m")
    p.add_argument("--az-step-deg", type=float, default=1.0)
    p.add_argument("--max-dist-km", type=float, default=100.0)
    p.add_argument("--out-suffix", default="", help="e.g. -mast3 -> <siteId>-mast3.json")
    p.add_argument("--demSource", dest="dem_source", default=None,
                   help="override demSource text (default: credit + file name)")
    # raw-binary parameters
    p.add_argument("--rows", type=int)
    p.add_argument("--cols", type=int)
    p.add_argument("--ppd", type=float, help="pixels per degree")
    p.add_argument("--lon0", type=float, default=0.0, help="longitude of left edge (0 or -180)")
    p.add_argument("--dtype", default="<i2", help="numpy dtype, check the PDS label (SAMPLE_TYPE)")
    p.add_argument("--scale", type=float, default=1.0, help="metres per DN, check the PDS label")
    p.add_argument("--offset-m", type=float, default=0.0,
                   help="added to DN*scale to get height above the 1737.4 km sphere")
    a = p.parse_args(argv)

    if a.dem is None:
        print("PENDIENTE: no DEM given. Nothing written. See tools/terrain-data/README.md.",
              file=sys.stderr)
        return 2
    if not a.dem.is_file():
        print(f"DEM not found: {a.dem}", file=sys.stderr)
        return 2

    height = float(a.mast_m) if a.mast_m else a.observer_height_m
    if a.dem.suffix.lower() in (".tif", ".tiff"):
        dem = load_geotiff(a.dem)
    else:
        if not (a.rows and a.cols and a.ppd):
            print("raw DEM needs --rows --cols --ppd", file=sys.stderr)
            return 2
        dem = load_raw(a.dem, a.rows, a.cols, a.dtype, a.scale, a.offset_m, a.ppd, a.lon0)

    sites = json.loads(a.sites.read_text(encoding="utf-8"))
    a.out.mkdir(parents=True, exist_ok=True)
    source = a.dem_source or f"{DEM_CREDIT}; file {a.dem.name}"
    for s in sites:
        sid = s["id"]
        if a.site and sid not in a.site:
            continue
        try:
            elev = horizon_profile(dem, s["latDeg"], s["lonDeg"], height,
                                   a.az_step_deg, a.max_dist_km * 1000.0)
        except ValueError as exc:
            print(f"{sid}: skipped ({exc})", file=sys.stderr)
            continue
        prof = {
            "azimuthStepDeg": a.az_step_deg,
            "elevationDeg": elev,
            "demResolutionM": round(dem.pixel_m, 2),
            "demSource": source,
        }
        (a.out / f"{sid}{a.out_suffix}.json").write_text(
            json.dumps(prof, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{sid}: wrote {len(elev)} azimuths, max {max(elev):.3f} deg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
