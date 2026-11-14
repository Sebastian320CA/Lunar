"""Synthetic-DEM checks for build_horizons (no real data). Run: python -m pytest or python test_build_horizons.py"""
import math

import numpy as np

from build_horizons import Dem, R_MOON_M, horizon_profile


def _flat(ppd=4.0):
    return Dem(np.zeros((int(180 * ppd), int(360 * ppd)), dtype=np.float32), ppd, 0.0)


def test_flat_terrain_is_about_zero():
    prof = horizon_profile(_flat(), 10.0, 20.0, 0.0, 1.0, 50_000.0)
    assert len(prof) == 360
    assert max(prof) < 0.01 and max(prof) > -0.1


def test_raised_observer_dips_below_horizontal():
    prof = horizon_profile(_flat(), 10.0, 20.0, 0.0, 1.0, 200_000.0)
    h = horizon_profile(_flat(), 10.0, 20.0, 5.0, 1.0, 200_000.0)
    assert max(h) <= max(prof) + 1e-6


def test_wall_to_the_east_is_seen_only_there():
    dem = _flat()
    d = dem.data
    # 1000 m wall at lon 21 deg (about 30 km east of lon 20 at lat 0)
    col = int((21.0) * dem.ppd)
    d[:, col : col + 2] = 1000.0
    prof = horizon_profile(dem, 0.0, 20.0, 0.0, 1.0, 60_000.0)
    t = math.radians(1.125)  # centre of the first full-height pixel (col 84, pixel-registered)
    r1 = R_MOON_M + 1000.0
    expected = math.degrees(math.atan2(r1 * math.cos(t) - R_MOON_M, r1 * math.sin(t)))
    # wall begins up to one 0.25 deg pixel earlier because of bilinear sampling
    assert expected - 0.1 < prof[90] < expected + 0.5
    assert prof[90] > 0.5
    assert prof[270] < 0.05


if __name__ == "__main__":
    test_flat_terrain_is_about_zero()
    test_raised_observer_dips_below_horizontal()
    test_wall_to_the_east_is_seen_only_there()
    print("ok")
