# Modulo terrain (perfiles de horizonte)

Paquete `@lunar/terrain`. Entrega el `TerrainService` del contrato (`getHorizon(site) -> HorizonProfile`).

## API

- `createTerrainService(loadProfile)`: lee un perfil precalculado y valida que `elevationDeg.length = 360 / azimuthStepDeg`.
- `validateProfile(profile)`: devuelve `null` si es valido, o un texto con el error.
- `horizonElevationAt(profile, azimuthDeg)`: interpolacion lineal con cierre circular (359.5 grados mezcla con 0).
- `sphericalHorizon(observerHeightM = 0)`: respaldo sin DEM. 0 grados a altura 0; depresion geometrica `acos(R/(R+h))` si h > 0. Usa `demResolutionM = 1737400` (centinela) y `demSource` que empieza con "PENDIENTE: sin DEM".
- `computeHorizonFromDem(tile, lat, lon, observerHeightM, stepDeg)`: horizonte en ejecucion por trazado de rayos con muestreo bilineal y caida por curvatura.

## Formato de teselas (`DemTile`)

Arreglo tipado `data` (alturas en metros, fila por fila de norte a sur) con `width`, y georreferencia: `westDeg`, `northDeg`, `pixelDegLon`, `pixelDegLat`. Fuera de la tesela, el muestreo devuelve `NaN`.

## Limites del DEM

La precision del horizonte esta acotada por la resolucion del DEM (`demResolutionM`), no por la aritmetica. Un DEM grueso suaviza crestas y subestima o sobrestima el horizonte local. La UI muestra `demResolutionM` y `demSource`. El respaldo esferico no contiene relieve.

## Registro en la app

`apps/web/src/modules/terrain.ts` carga `data/terrain/<siteId>.json` con `ctx.dataUrl`. Si el archivo falta o es invalido usa `sphericalHorizon(0)`. Publica `services.terrain`.
