"""Descarga los kernels NAIF a data/ephemeris/kernels/ y verifica SHA-256.

Uso:
  python download_kernels.py            # descarga lo que falta y verifica contra kernels.json
  python download_kernels.py --lock     # escribe en kernels.json los SHA-256 observados (confianza en el primer uso)
  python download_kernels.py --strict   # falla si algun kernel no tiene SHA-256 fijado (PENDIENTE)

NAIF no publica SHA-256 por kernel. Un sha256 null es PENDIENTE: el hash observado se imprime, pero no se
puede considerar verificado contra una fuente oficial hasta compararlo con otra descarga/mirror de confianza.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request

from ephem_lib import KERNEL_DIR, TOOL_DIR

MANIFEST = TOOL_DIR / "kernels.json"


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lock", action="store_true", help="fija en kernels.json los hashes observados")
    ap.add_argument("--strict", action="store_true", help="falla si hay hashes PENDIENTE")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    KERNEL_DIR.mkdir(parents=True, exist_ok=True)
    status = 0
    for k in manifest["kernels"]:
        dest = KERNEL_DIR / k["file"]
        if not dest.is_file():
            url = manifest["baseUrl"] + k["path"]
            print(f"descargando {url}")
            tmp = dest.with_suffix(dest.suffix + ".part")
            with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:  # noqa: S310 (https fijo)
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            tmp.replace(dest)
        digest = sha256_file(dest)
        expected = k.get("sha256")
        if expected is None:
            print(f"PENDIENTE  {k['file']}  sha256 observado={digest}")
            if args.lock:
                k["sha256"] = digest
            elif args.strict:
                status = 1
        elif expected != digest:
            print(f"ERROR      {k['file']}  esperado={expected} observado={digest}", file=sys.stderr)
            dest.unlink()  # no dejar un kernel no verificado en disco
            status = 1
        else:
            print(f"OK         {k['file']}  {digest}")
    if args.lock:
        MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("kernels.json actualizado (hashes observados, no publicados por NAIF).")
    return status


if __name__ == "__main__":
    sys.exit(main())
