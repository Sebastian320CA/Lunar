#!/usr/bin/env python3
"""Generate packages/i18n/src/languageFocus.generated.json from Natural Earth.

Needs network (run manually, not at runtime). Source: Natural Earth
"Admin 0 - Countries" (public domain), https://www.naturalearthdata.com
Uses the label point (LABEL_X / LABEL_Y) of each country as focus coordinates.
If this fails, keep the approximate capital coordinates (verified: false) in
packages/i18n/src/languageFocus.ts.
"""
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

URL = "https://naturalearth.s3.amazonaws.com/110m_cultural/ne_110m_admin_0_countries.zip"
# lang -> ISO_A3 (ADM0_A3 for robustness)
LANGS = {
    "en": "USA", "zh": "CHN", "ja": "JPN", "es": "COL", "pt": "BRA", "fr": "FRA",
    "de": "DEU", "ru": "RUS", "hi": "IND", "ar": "EGY", "it": "ITA", "ko": "KOR", "tr": "TUR",
}
OUT = Path(__file__).resolve().parents[2] / "packages/i18n/src/languageFocus.generated.json"


def main() -> int:
    try:
        raw = urllib.request.urlopen(URL, timeout=60).read()
    except Exception as exc:  # network unavailable
        print(f"No network or download failed: {exc}. Keeping approximate table.", file=sys.stderr)
        return 1
    try:
        import shapefile  # pyshp
    except ImportError:
        print("Install pyshp: pip install pyshp", file=sys.stderr)
        return 1
    z = zipfile.ZipFile(io.BytesIO(raw))
    names = {n.rsplit(".", 1)[-1]: n for n in z.namelist()}
    r = shapefile.Reader(
        shp=io.BytesIO(z.read(names["shp"])),
        dbf=io.BytesIO(z.read(names["dbf"])),
        shx=io.BytesIO(z.read(names["shx"])),
    )
    fields = [f[0] for f in r.fields[1:]]
    by_a3 = {}
    for rec in r.records():
        d = dict(zip(fields, rec))
        by_a3[d.get("ADM0_A3")] = d
    out = {}
    for lang, a3 in LANGS.items():
        d = by_a3.get(a3)
        if not d:
            print(f"Missing {a3}", file=sys.stderr)
            continue
        out[lang] = {"country": d["NAME"], "latDeg": d["LABEL_Y"], "lonDeg": d["LABEL_X"], "verified": True}
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
