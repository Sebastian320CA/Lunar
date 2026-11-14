"""Compara azimut/elevacion de Sol y Tierra (sitios Apollo, 5 fechas) contra JPL Horizons.

Horizons (API https://ssd.jpl.nasa.gov/api/horizons.api) se consulta con observador en la superficie de la Luna
(CENTER='coord@301', SITE_COORD=lon,lat,alt_km), QUANTITIES=4 (azimut/elevacion aparentes, sin refraccion).
Las coordenadas de sites.json son selenograficas en el marco Mean Earth (ME), por eso el calculo local aqui usa
MOON_ME_DE440_ME421 y no el marco de ejes principales del binario. Imprime el error angular maximo en grados.

Uso: python compare_horizons.py [--dates 2025-03-01T00:00:00 ...]
Requiere red, spiceypy y kernels descargados. Las fechas por defecto son solo puntos de muestreo dentro de 2025-2030.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.parse
import urllib.request

from ephem_lib import FRAME_ME, ROOT, load_kernels

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
DEFAULT_DATES = [
    "2025-03-14T06:00:00",
    "2026-07-04T18:30:00",
    "2027-11-21T00:00:00",
    "2028-12-31T12:00:00",
    "2029-05-09T09:15:00",
]
MOON_RADIUS_KM = 1737.4  # esfera de referencia lunar (Horizons trata la Luna como esfera)
BODIES = {"sun": ("SUN", "10"), "earth": ("EARTH", "399")}


def local_az_el(vec, lat_deg: float, lon_deg: float):
    """Azimut (0=N, horario) y elevacion de un vector en el marco ME para un sitio sobre esfera."""
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    up = (math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat))
    east = (-math.sin(lon), math.cos(lon), 0.0)
    north = (-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat))
    dot = lambda a, b: sum(x * y for x, y in zip(a, b))  # noqa: E731
    vec = tuple(v - MOON_RADIUS_KM * u for v, u in zip(vec, up))  # topocentrico (paralaje)
    n = math.sqrt(dot(vec, vec))
    e, nn, u = dot(vec, east) / n, dot(vec, north) / n, dot(vec, up) / n
    return math.degrees(math.atan2(e, nn)) % 360.0, math.degrees(math.asin(max(-1.0, min(1.0, u))))


def horizons_az_el(body_id: str, lat: float, lon: float, utc: str):
    params = {
        "format": "json", "COMMAND": f"'{body_id}'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER", "CENTER": "'coord@301'", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{lon},{lat},0'", "TLIST": f"'{utc.replace('T', ' ')}'",
        "QUANTITIES": "'4'", "CSV_FORMAT": "YES", "ANG_FORMAT": "DEG", "APPARENT": "AIRLESS",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as r:  # noqa: S310 (https fijo)
        text = json.loads(r.read().decode("utf-8"))["result"]
    block = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()[0]
    nums = [f for f in (c.strip() for c in block.split(",")) if f]
    az, el = float(nums[-2]), float(nums[-1])
    return az, el


def angdiff(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dates", nargs="+", default=DEFAULT_DATES)
    args = ap.parse_args()
    import spiceypy as spice

    sites = [s for s in json.loads((ROOT / "data" / "sites" / "sites.json").read_text(encoding="utf-8"))
             if s["program"] == "apollo"]
    load_kernels()
    worst = 0.0
    print("site,date,body,az_here,el_here,az_horizons,el_horizons,err_az_deg,err_el_deg")
    for s in sites:
        for d in args.dates:
            et = spice.str2et(d.replace("T", " ") + " UTC")
            for name, (spice_name, hid) in BODIES.items():
                v, _ = spice.spkpos(spice_name, et, FRAME_ME, "LT+S", "MOON")
                az, el = local_az_el(v, s["latDeg"], s["lonDeg"])
                haz, hel = horizons_az_el(hid, s["latDeg"], s["lonDeg"], d)
                # el error de azimut cerca del cenit no es significativo: ponderar por cos(elevacion)
                eaz = angdiff(az, haz) * math.cos(math.radians(el))
                eel = abs(el - hel)
                worst = max(worst, eaz, eel)
                print(f"{s['id']},{d},{name},{az:.4f},{el:.4f},{haz:.4f},{hel:.4f},{eaz:.4f},{eel:.4f}")
    print(f"ERROR MAXIMO (grados): {worst:.6f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
