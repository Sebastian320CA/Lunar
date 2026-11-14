# tools/ephemeris-data

Genera `data/ephemeris/ephemeris.bin` y `ephemeris.json` (contrato `EphemerisBinaryHeader`, lector en `packages/ephemeris/src/binary.ts`).

## Requisitos

Python 3.10+, `spiceypy`, `numpy` (`python -m pip install -r requirements.txt`). Red solo para descargar kernels y para `compare_horizons.py`.

## Uso (PowerShell, desde `tools/ephemeris-data`)

```powershell
python -m pip install -r requirements.txt
python download_kernels.py          # kernels a data/ephemeris/kernels/ (ignorado por git)
python generate.py --frame MOON_ME_DE440_ME421   # 2025-01-01..2030-01-01 UTC, paso 600 s, marco ME (publicado)
python compare_horizons.py          # Apollo x 5 fechas contra JPL Horizons
python -m unittest test_header -v   # prueba del encabezado con archivo sintetico
```

`generate.py` acepta `--start`, `--end`, `--step-seconds`, `--frame`, `--out-dir`. El rango es inclusivo; `end - start` debe ser multiplo del paso.

## Formato de salida

- `ephemeris.bin`: Float64 little-endian, `count` filas x 6 (`sunX, sunY, sunZ, earthX, earthY, earthZ`), km, sin encabezado interno. Tamano = `count * 48` bytes.
- `ephemeris.json`: `version, frame, startUtc, stepSeconds, count, units:'km', fields, sha256` (SHA-256 del `.bin`). `generate.py` valida el encabezado antes de terminar con la misma logica que `validateHeader`.
- Fila `i` = `startUtc + i * stepSeconds`.

## Marco y calculo

- Vectores desde el centro de la Luna (`MOON`) hacia `SUN` y `EARTH`, en el marco **`MOON_ME_DE440_ME421`** (Mean Earth, rotacion constante respecto a `MOON_PA_DE440`, definida en `moon_de440_250416.tf`; orientacion del PCK `moon_pa_de440_200625.bpc`). Es un marco fijo a la Luna que ya incluye libracion fisica y optica. El valor por defecto de `--frame` en el script sigue siendo `MOON_PA_DE440`; los datos publicados se generan con `--frame MOON_ME_DE440_ME421`.
- Correccion `LT+S` (tiempo de luz y aberracion estelar). Sin refraccion (la Luna no tiene atmosfera).
- Paso fijo de 10 min en escala UTC; no hay segundos intercalares programados en el rango segun `naif0012.tls`.
- **Marco ME por defecto (decision tomada).** Las coordenadas de `data/sites/sites.json` son selenograficas en el marco Mean Earth (ME). La diferencia PA-ME es de unos 860 m en la superficie (~0.03 grados). Para no rotar en runtime ni arrastrar ese sesgo, los datos se generan directamente en ME: `python generate.py --frame MOON_ME_DE440_ME421`. Usa `--frame MOON_PA_DE440` solo si necesitas ejes principales. El respaldo analitico (Meeus) usa el mismo convenio (Luna fija, ME aproximado).

## Kernels (NAIF generic_kernels, nombres verificados)

| Archivo | Ruta | Uso |
|---|---|---|
| `naif0012.tls` | `lsk/` | segundos intercalares |
| `de440s.bsp` | `spk/planets/` | efemeride planetaria (1849-2150) |
| `pck00011.tpc` | `pck/` | constantes de forma |
| `moon_pa_de440_200625.bpc` | `pck/` | orientacion lunar de alta precision |
| `moon_de440_250416.tf` | `fk/satellites/` | definicion de marcos lunares |

SHA-256: NAIF no publica hashes por kernel. `kernels.json` guarda los hashes **observados** en la primera descarga (`--lock`). **PENDIENTE:** contrastarlos con una segunda fuente de confianza. `download_kernels.py` borra un kernel cuyo hash no coincide con el fijado. Usa `--strict` para fallar si algun hash es `null`.

## Resultados

Ejecucion hecha en esta maquina (Python 3.12, spiceypy 8.4.0):

| Dato | Valor |
|---|---|
| `count` | 262945 filas (12 621 360 bytes) |
| `startUtc` / `stepSeconds` | 2025-01-01T00:00:00Z / 600 |
| `frame` | MOON_ME_DE440_ME421 |
| `sha256` | `bf037e782ea423b77aec655f13b40db6f04511fef579d1bcec953910479bd499` |

Comparacion con JPL Horizons (sitios Apollo 11, 12, 14, 15, 16, 17; fechas 2025-03-14T06:00, 2026-07-04T18:30, 2027-11-21T00:00, 2028-12-31T12:00, 2029-05-09T09:15 UTC; Sol y Tierra; azimut ponderado por cos(elevacion) y elevacion; observador topocentrico en esfera de 1737.4 km):

| Fuente | Error maximo (grados) |
|---|---|
| spiceypy (marco ME, kernels de arriba) vs Horizons | 0.000013 |

Limites: la comparacion usa el marco ME y las mismas familias DE440/DE441, asi que valida el pipeline (tiempos, marcos, correcciones), no es una verificacion independiente de las efemerides. No valida la interpolacion del lector TypeScript. Los hashes de kernels siguen PENDIENTE (ver arriba).
