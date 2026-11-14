# Módulo sites

Paquete `@lunar/sites`: catálogo de sitios, coordenadas personalizadas y control de tiempo.

## API pública
- `parseSites(json)` / `loadSites(ctx)`: validan `data/sites/sites.json` con `@lunar/security` (ids Apollo desde `APOLLO_SITE_IDS`, longitud canónica en (-180, 180]). Devuelven `Result<LunarSite[]>`, nunca lanzan.
- `validateCustomSite({ name, lat, lon })`: devuelve un sitio `custom-1` (`program: 'custom'`, `verified: false`) o errores por campo.
- `createTimeController(initialUtc, ephemeris, clock?)`: `TimeController` con `stepLunarDays(n)` (mes sinódico 29.53059 d) y `jumpToNext(site, 'sunrise' | 'sunset' | 'earthrise')`.
- UI DOM: `mountSiteList`, `mountCustomForm`, `mountTimeline`. Usan solo `textContent` y botones nativos accesibles.

## Registro
`apps/web/src/modules/sites.ts` carga `sites/sites.json` con `ctx.dataUrl`, y asigna `services.sites` (`list`, `add`) y `services.time`. Los saltos de evento usan `services.ephemeris` en el momento de la llamada, así que el orden de registro con el módulo de efemérides no importa.

## Errores
Catálogo inválido o ausente: `setup` lanza con el mensaje de `loadSites`. Fecha inválida en la línea de tiempo: se muestra el error y no se cambia la hora.
