# tools/terrain-data

Build-time tool that turns a lunar DEM into one `HorizonProfile` per site (`data/terrain/<siteId>.json`). It is not used at runtime and downloads nothing.

## DEM source (credit)

LOLA (Lunar Orbiter Laser Altimeter, LRO) gridded digital elevation models, NASA PDS Geosciences Node: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/>.

Other build-time sources (not used by this script, listed for reference): Moon Trek WMTS (<https://trek.nasa.gov/moon/>) and LROC QuickMap (<https://quickmap.lroc.asu.edu/>). Any data taken from them must be credited and is never fetched at runtime.

PENDIENTE: exact product name and resolution. Confirm in the PDS volume (`DATA/LOLA_GDR/` and the `.LBL` label) which `LDEM_*` product to use. Cylindrical global products are coarse (hundreds of metres per pixel); polar stereographic products (`LDEM_80S_*`, `LDEM_80N_*`) have finer pixels near the poles but use a different projection, which this script does not read yet. From the label take `SAMPLE_TYPE`, `SCALING_FACTOR`, `OFFSET`, `MAP_RESOLUTION`, `LINES`, `LINE_SAMPLES` and `WESTERNMOST_LONGITUDE`, and pass them as `--dtype --scale --offset-m --ppd --rows --cols --lon0`. Heights must end up in metres above the 1737.4 km sphere.

## Usage (Windows PowerShell)

```powershell
pip install numpy            # rasterio only if you pass a GeoTIFF
python tools/terrain-data/build_horizons.py --dem C:\dem\LDEM_64.IMG --rows 11520 --cols 23040 --ppd 64 --lon0 0 --dtype "<i2" --scale 0.5 --offset-m 0
python tools/terrain-data/build_horizons.py --dem C:\dem\crop.tif --mast-m 3 --out-suffix -mast3
python tools/terrain-data/test_build_horizons.py     # synthetic checks, no DEM
```

The values above are examples of the argument shape, not verified product parameters. Take them from the label.

Options: `--observer-height-m` (default 0), `--mast-m 1..5`, `--az-step-deg` (default 1, must divide 360), `--max-dist-km` (default 100), `--site <id>` (repeatable), `--sites`, `--out`.

## Method

Ray-march per azimuth (0 = north, clockwise) along great circles on a sphere of radius 1737.4 km, sampling every half pixel with bilinear interpolation. For each sample the elevation angle seen from the observer (site height from the DEM plus observer height) accounts for curvature. The horizon is the maximum along the ray. No refraction (no atmosphere). `demResolutionM` is the pixel size at the equator.

## Limits

- Accuracy is set by DEM resolution, not by the arithmetic. Features smaller than a pixel (rocks, small craters) are invisible, and coarse DEMs smooth ridges.
- Site coordinates have their own uncertainty (see `data/sites/sites.json`).
- Rays beyond the DEM edge (latitude) are ignored; the maximum distance bounds the search, so very distant mountains are missed.
- Only equirectangular DEMs are read. Near the poles use a regional equirectangular crop or add a stereographic reader.

## Results (PENDIENTE: no DEM has been processed)

| Site id | Profile file | Status | Source to confirm |
|---|---|---|---|
| apollo-11 | `data/terrain/apollo-11.json` | PENDIENTE | LOLA LDEM (PDS Geosciences Node) |
| apollo-12 | `data/terrain/apollo-12.json` | PENDIENTE | LOLA LDEM |
| apollo-14 | `data/terrain/apollo-14.json` | PENDIENTE | LOLA LDEM |
| apollo-15 | `data/terrain/apollo-15.json` | PENDIENTE | LOLA LDEM |
| apollo-16 | `data/terrain/apollo-16.json` | PENDIENTE | LOLA LDEM |
| apollo-17 | `data/terrain/apollo-17.json` | PENDIENTE | LOLA LDEM |
| clps-im-1-odysseus | `data/terrain/clps-im-1-odysseus.json` | PENDIENTE | LOLA LDEM_80S polar product (needs stereographic reader or crop) |
| clps-blue-ghost-m1 | `data/terrain/clps-blue-ghost-m1.json` | PENDIENTE | LOLA LDEM |
| intl-slim | `data/terrain/intl-slim.json` | PENDIENTE | LOLA LDEM |
| intl-chandrayaan-3 | `data/terrain/intl-chandrayaan-3.json` | PENDIENTE | LOLA LDEM_80S or regional crop |
| intl-change-4 | `data/terrain/intl-change-4.json` | PENDIENTE | LOLA LDEM |

Until profiles exist, the app uses the spherical fallback (`sphericalHorizon`) with `demSource` starting "PENDIENTE: sin DEM".
