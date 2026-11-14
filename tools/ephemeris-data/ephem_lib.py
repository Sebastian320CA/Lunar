"""Utilidades compartidas: rutas, validacion de encabezado y calculo de vectores.

La validacion del encabezado replica `validateHeader` de packages/ephemeris/src/binary.ts.
`spiceypy` solo se importa dentro de las funciones que lo necesitan.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOL_DIR = Path(__file__).resolve().parent
KERNEL_DIR = ROOT / "data" / "ephemeris" / "kernels"
OUT_DIR = ROOT / "data" / "ephemeris"

FIELDS = ["sunX", "sunY", "sunZ", "earthX", "earthY", "earthZ"]
COLS = 6
ROW_BYTES = COLS * 8
FRAME_PA = "MOON_PA_DE440"
FRAME_ME = "MOON_ME_DE440_ME421"
METAKERNEL_FILES = [
    "naif0012.tls",
    "pck00011.tpc",
    "de440s.bsp",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
]

_UTC_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$")
_SHA = re.compile(r"^[0-9a-f]{64}$")


def validate_header(h: object) -> str | None:
    """Devuelve un mensaje de error o None. Misma logica que validateHeader (TypeScript)."""
    if not isinstance(h, dict):
        return "header: not an object"
    v = h.get("version")
    if isinstance(v, bool) or not isinstance(v, int) or v < 1:
        return "header.version: integer >= 1 required"
    if not isinstance(h.get("frame"), str) or not h["frame"]:
        return "header.frame: non-empty string required"
    s = h.get("startUtc")
    if not isinstance(s, str) or not _UTC_Z.match(s):
        return "header.startUtc: ISO 8601 UTC with Z suffix required"
    st = h.get("stepSeconds")
    if isinstance(st, bool) or not isinstance(st, (int, float)) or not st > 0:
        return "header.stepSeconds: number > 0 required"
    c = h.get("count")
    if isinstance(c, bool) or not isinstance(c, int) or c < 1:
        return "header.count: integer >= 1 required"
    if h.get("units") != "km":
        return "header.units: 'km' required"
    if h.get("fields") != FIELDS:
        return "header.fields: must be sunX,sunY,sunZ,earthX,earthY,earthZ"
    sha = h.get("sha256")
    if not isinstance(sha, str) or not _SHA.match(sha):
        return "header.sha256: 64 lowercase hex chars required"
    return None


def load_kernels() -> None:
    """Carga los kernels locales (falla con mensaje claro si falta alguno)."""
    import spiceypy as spice

    missing = [f for f in METAKERNEL_FILES if not (KERNEL_DIR / f).is_file()]
    if missing:
        raise FileNotFoundError(f"Faltan kernels en {KERNEL_DIR}: {missing}. Ejecuta download_kernels.py")
    for f in METAKERNEL_FILES:
        spice.furnsh(str(KERNEL_DIR / f))


def sun_earth_km(ets, frame: str = FRAME_PA):
    """Vectores Moon->Sun y Moon->Earth (km) en `frame`, shape (n, 6).

    Correccion 'LT+S' (posicion aparente: tiempo de luz y aberracion estelar), observador = centro de la Luna.
    El marco lleva la orientacion lunar (libracion incluida) del PCK de alta precision.
    """
    import numpy as np
    import spiceypy as spice

    out = np.empty((len(ets), COLS), dtype="<f8")
    for i, et in enumerate(ets):
        out[i, 0:3], _ = spice.spkpos("SUN", float(et), frame, "LT+S", "MOON")
        out[i, 3:6], _ = spice.spkpos("EARTH", float(et), frame, "LT+S", "MOON")
    return out
