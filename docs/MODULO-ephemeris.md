# Modulo ephemeris

Paquete `@lunar/ephemeris`. Calcula posicion del Sol y la Tierra vistos desde un sitio lunar. Implementa `EphemerisService` (`getSky`, `getSeries`, `findEvents`).

## Marco de referencia

- Luna fija, Mean Earth (ME), origen en el centro de la Luna, unidades km. Coincide con las coordenadas de los sitios.
- Los vectores Sol y Tierra se rotan al marco horizontal local (`toAzEl`): azimut desde el norte hacia el este, elevacion sobre el horizonte.

## Fuentes

- `BinarySource`: lee `data/ephemeris/ephemeris.json` (encabezado) y `ephemeris.bin` (Float64 little-endian, 6 columnas por fila: sol xyz, tierra xyz). Verifica version, tamano (`count*48` bytes) y SHA-256 antes de usarlo. Datos generados con SPICE (DE440s).
- `AnalyticSource`: aproximacion de Meeus (Sol, Luna truncada, libracion optica). Se usa si el binario falta o no valida.
- Interpolacion: Lagrange de 4 puntos entre filas (lineal si hay menos de 4). Error medido en `binary.test.ts`: error relativo maximo menor que 1e-9 sobre una funcion suave, incluidos los bordes.

## Calculo del cielo

- Se usa el **limbo superior** (elevacion del centro + radio angular) para decidir si el cuerpo esta sobre el horizonte.
- `aboveTerrainHorizon` compara con la elevacion del terreno en el azimut del cuerpo (interpolacion lineal circular del `HorizonProfile`; 0 si no hay perfil).
- `directCommsAvailable` depende de la Tierra sobre el horizonte.
- Sin refraccion: la Luna no tiene atmosfera.
- `findEvents` escanea cada 10 min y refina por biseccion (resolucion de 1 s). Devuelve eventos ascendentes en [start, end).

## Metadatos y aviso de aproximacion

`getEphemerisMeta(source)` devuelve `{source, approximate, note}`. Con `AnalyticSource`, `approximate` es `true` y la UI debe mostrar `note` (error esperado de decimas de grado). Con el binario SPICE, la exactitud frente a Horizons sigue **PENDIENTE** hasta ejecutar `compare_horizons.py`.

## Registro en la web

`apps/web/src/modules/ephemeris.ts` carga los datos con `ctx.dataUrl`; ante cualquier fallo usa `AnalyticSource`. Publica `services.ephemeris` y `services.ephemerisMeta`. El servicio de terreno se consulta de forma diferida en cada llamada. El `.bin` (~12.6 MB) supera `assetsInlineLimit` de Vite, por lo que se sirve como archivo y no se incrusta.
