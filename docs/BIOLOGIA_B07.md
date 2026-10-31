# B07 · Microbiología en evidencia: medios, colonias y tinción de Gram

Séptima práctica de Biología, sobre el mismo microscopio y las mismas físicas de B01–B06. Es estrictamente virtual: placas selladas, sin cultivo, incubación ni llama; el autoclave y el mechero son maquetas.

## Arquitectura

Inyección en capas: `dispatchMicro → dispatchDiv → dispatchCell → dispatchB01`.

- Dominio: `src/simulation/micro-world/` (`model.ts` puro, `world.ts`, `commands.ts`, `types.ts`, `geometry.ts`).
- Práctica: `src/practices/practice-b07/` (definición, parámetros, evidencia, máquina, rúbrica, libreta, escenarios, reanudación).
- Motor: `src/engine/optical/microController.ts`, `objects3dMicro.ts`; ilustraciones en `src/engine/instruments/optical/illustrationsMicro.ts`.
- Interfaz: `src/app/b07/`. `BenchPanelB07` agrupa fichas, visor con retícula y trazado digital.

## Estaciones y flujo

`INTRO → PPE_CHECK → LAB.{MEDIA, PLATES, DISTRIBUTION, STAIN, OPTICS, INTERPRETATION, CLEANUP, COMPLETE} → SUBMISSION → REVIEW`, por evidencia.

| Estación | Contenido |
|---|---|
| A | Frascos, caldo sellado, fichas y residuos |
| B | Bandeja de placas, tablero de trazado, asa |
| C | Visor con retícula calibrada |
| D | Portaobjetos, área de frotis, rejilla y frascos de tinción |
| E | Microscopio, caja de controles; aceite solo con el módulo S19 |
| F | Libreta, cierre y maquetas |

## Modelo

- Retención didáctica: `R₊(u) = clamp(0,92 − 0,60·máx(0, u−1), 0, 1)`, `R₋(u) = clamp(0,12 + 0,75·máx(0, 1−u), 0, 1)`. `u` es un índice adimensional, no un tiempo.
- Diámetro: `D = n·s`, `u_D = √((s·u_n)² + (n·u_s)²)`. 120 px × 0,025 mm/px, u = 2 px → 3,00 ± 0,05 mm.
- Trazado: solapamiento geométrico en celdas de 0,25 cm; umbral 0,20. No predice crecimiento.
- Cobertura válida del frotis: 0,15–0,60.
- Las colonias son datos deterministas del recurso (`plateLayout`), nunca el resultado de un cultivo.

## Pruebas

`src/tests/integration/b07-{flow,errors,locale,demo,solids}.test.ts`, `src/tests/unit/b07-science.test.ts`, `replay.test.ts` y `src/tests/e2e/b07{,-demo}.spec.ts`. `helpersB07.ts` contiene la ruta ideal por comandos.

## Despliegue

La migración `migrations/0017_course_labs_b07.sql` debe aplicarse en remoto **antes** de desplegar. El curso `c_bg1_01` abre B07 el 2026-12-01.
