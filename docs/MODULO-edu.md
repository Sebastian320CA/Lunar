# Módulo edu
Paquete `@lunar/edu`: trivia, modo clase y modo calculadora (Requisitos 8.1, 8.2, 8.3).

| Entrada | Archivo | Qué hace |
|---|---|---|
| `createTrivia`, `questionBank` | `engine.ts` | Motor de trivia con banco `questions.json` (es/en), semilla fija para pruebas. |
| `createClassSession` | `classMode.ts` | Sesión de clase: equipos, rondas y puntajes. |
| `toClassPackage`, `exportClassPackage`, `importClassPackage` | `classPackage.ts` | Paquete de clase en JSON. La importación valida con `@lunar/security` y devuelve `Result`. |
| `mountTriviaView` | `ui/triviaView.ts` | Vista accesible por teclado: 1-9 elige, Enter o Espacio avanza. |
| `mountTeacherPanel`, `mountProjectorView` | `ui/` | Panel del docente y vista de proyector. |
| `mountCalculatorMode` | `ui/calculatorMode.ts` | Modo calculadora. |

Todo el texto se escribe con `textContent`; el contenido importado no se trata como HTML.

## Modo calculadora: suposición
Se asume un dispositivo tipo calculadora: **solo texto, solo teclado y pantalla pequeña**, sin 3D, sin canvas ni WebGL y sin botones. Una sola pantalla `<pre>`; las teclas 1-9 responden y Enter continúa. Si el dispositivo real tiene otras capacidades, esta suposición debe revisarse.

## Fuentes de los datos
Cada pregunta del banco cita una fuente de hechos. Las fuentes **deben contrastarse por muestreo** (spot-check) antes de usar el banco en clase o de ampliarlo; no se verifican automáticamente.

## Registro
`apps/web/src/modules/edu.ts` registra la pestaña `edu` (clave i18n `edu.title`) y carga `@lunar/edu` con `import()` dinámico al abrirla. El idioma de la trivia sale de la clave `edu.lang` (`es` o `en`).
