# Módulo i18n

Paquete `@lunar/i18n`: traducciones, idioma activo y enfoque de la Tierra según el idioma.

## API pública
- `createI18n(sceneGetter, opts?)`: implementa `I18nApi` (`t`, `setLanguage`, `onChange`) más `addResources(ns, dict)`, `tv(key, vars)` (interpolación `{var}`, plurales con `Intl.PluralRules` usando `count`), `getLanguage()` y `dir()` (`rtl` para `ar`). Una clave ausente devuelve la propia clave. El idioma inicial sale de `navigator.languages`; el respaldo es `en`.
- `loadLocales(i18n)` / `createLoadedI18n(sceneGetter)`: registran los 13 JSON de `src/locales` (namespaces `common`, `menu`, `panel`, `about`, `scene`, `time`, `errors`). Las claves quedan como `<namespace>.<clave>`, por ejemplo `panel.close`.
- `LANGUAGE_FOCUS` / `getLanguageFocus(lang)`: tabla editable idioma → lat/lon. Al llamar `setLanguage`, se invoca `scene.focusEarthOn(lat, lon)` si hay escena.

## Registro
`apps/web/src/modules/i18n.ts` asigna `services.i18n` con las traducciones cargadas. La escena se resuelve al cambiar de idioma mediante `services.scene`, así que el orden de registro no importa.

## Cómo probar
`pnpm --filter @lunar/i18n test` (núcleo, paridad de claves entre idiomas). `pnpm --filter @lunar/i18n build` verifica los tipos.

## Límites conocidos
- Solo `es` y `en` están revisados. Los otros 11 idiomas son plantillas copiadas de `en` con la marca "traduccion automatica pendiente de revision".
- Las coordenadas de `LANGUAGE_FOCUS` son capitales aproximadas con `verified: false` (cosmético, no científico) hasta ejecutar `tools/i18n-data/build_focus.py`.
- Otros módulos aportan sus textos con `services.i18n.addResources` (claves `<módulo>.<clave>`).

## Solicitudes de contrato
Ninguna.
