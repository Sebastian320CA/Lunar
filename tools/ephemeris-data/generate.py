"""Genera data/ephemeris/ephemeris.bin y ephemeris.json (formato EphemerisBinaryHeader).

Filas: sunX,sunY,sunZ,earthX,earthY,earthZ (km, Float64 little-endian), vectores desde el centro de la Luna
en el marco MOON_PA_DE440 (ejes principales, orientacion y libracion del PCK DE440). El tiempo de la fila i es
startUtc + i*stepSeconds. El rango es [start, end] inclusive.

Uso: python generate.py [--start 2025-01-01T00:00:00Z] [--end 2030-01-01T00:00:00Z] [--step-seconds 600]
                        [--frame MOON_PA_DE440] [--out-dir ../../data/ephemeris]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from ephem_lib import FIELDS, FRAME_PA, OUT_DIR, ROW_BYTES, load_kernels, sun_earth_km, validate_header


def parse_utc(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def write_dataset(rows, start_utc: str, step_seconds: float, frame: str, out_dir: Path) -> dict:
    """Escribe .bin y .json a partir de un arreglo (n, 6) y valida el encabezado. Sin dependencia de SPICE."""
    import numpy as np

    arr = np.ascontiguousarray(rows, dtype="<f8")
    if arr.ndim != 2 or arr.shape[1] != 6 or arr.shape[0] < 1:
        raise ValueError("rows debe tener forma (n>=1, 6)")
    if not np.isfinite(arr).all():
        raise ValueError("rows contiene valores no finitos")
    data = arr.tobytes()
    header = {
        "version": 1,
        "frame": frame,
        "startUtc": start_utc,
        "stepSeconds": step_seconds,
        "count": int(arr.shape[0]),
        "units": "km",
        "fields": list(FIELDS),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    err = validate_header(header)
    if err:
        raise ValueError(err)
    if len(data) != header["count"] * ROW_BYTES:
        raise ValueError("tamano del binario != count*48")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "ephemeris.bin").write_bytes(data)
    (out_dir / "ephemeris.json").write_text(json.dumps(header, indent=2) + "\n", encoding="utf-8")
    return header


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2025-01-01T00:00:00Z")
    ap.add_argument("--end", default="2030-01-01T00:00:00Z")
    ap.add_argument("--step-seconds", type=int, default=600)
    ap.add_argument("--frame", default=FRAME_PA)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    a = ap.parse_args()

    import numpy as np
    import spiceypy as spice

    t0, t1 = parse_utc(a.start), parse_utc(a.end)
    span = int((t1 - t0).total_seconds())
    if span < 0 or a.step_seconds <= 0 or span % a.step_seconds != 0:
        print("rango/paso invalido: end >= start y (end-start) multiplo del paso", file=sys.stderr)
        return 2
    count = span // a.step_seconds + 1

    load_kernels()
    et0 = spice.str2et(a.start.replace("T", " ").replace("Z", " UTC"))
    ets = et0 + np.arange(count, dtype=np.float64) * a.step_seconds
    rows = sun_earth_km(ets, a.frame)
    header = write_dataset(rows, a.start, a.step_seconds, a.frame, a.out_dir)
    print(json.dumps(header, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
