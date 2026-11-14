"""Prueba de validacion del encabezado con un archivo sintetico diminuto.

Ejecutar (requiere numpy; no requiere spiceypy ni red):  python -m unittest test_header -v
"""
import json
import struct
import tempfile
import unittest
from pathlib import Path

from ephem_lib import validate_header
from generate import write_dataset


class HeaderTest(unittest.TestCase):
    def test_synthetic_file_roundtrip(self):
        import numpy as np

        rows = np.arange(18, dtype="<f8").reshape(3, 6)
        with tempfile.TemporaryDirectory() as d:
            h = write_dataset(rows, "2025-01-01T00:00:00Z", 600, "MOON_PA_DE440", Path(d))
            raw = (Path(d) / "ephemeris.bin").read_bytes()
            self.assertEqual(len(raw), h["count"] * 48)
            self.assertEqual(struct.unpack("<d", raw[8:16])[0], 1.0)
            on_disk = json.loads((Path(d) / "ephemeris.json").read_text(encoding="utf-8"))
            self.assertIsNone(validate_header(on_disk))

    def test_invalid_headers_rejected(self):
        good = {
            "version": 1, "frame": "F", "startUtc": "2025-01-01T00:00:00Z", "stepSeconds": 600, "count": 1,
            "units": "km", "fields": ["sunX", "sunY", "sunZ", "earthX", "earthY", "earthZ"], "sha256": "0" * 64,
        }
        self.assertIsNone(validate_header(good))
        for key, bad in [("version", 0), ("frame", ""), ("startUtc", "2025-01-01"), ("stepSeconds", 0),
                         ("count", 0), ("units", "m"), ("fields", ["a"]), ("sha256", "A" * 64)]:
            self.assertIsNotNone(validate_header({**good, key: bad}), key)
        self.assertIsNotNone(validate_header(None))

    def test_non_finite_rejected(self):
        import numpy as np

        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                write_dataset(np.full((1, 6), np.nan), "2025-01-01T00:00:00Z", 600, "F", Path(d))


if __name__ == "__main__":
    unittest.main()
