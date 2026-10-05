# Práctica 4 — Reacciones químicas

Laboratorio 3D construido sobre la misma base que las Prácticas 2 y 3: React + React Three Fiber + Rapier, XState v5,
Zustand, i18next, Vitest y Playwright. La especificación original describe una escena 2.5D; aquí se usa la escena 3D
existente y se mantienen las reglas científicas, de seguridad, de validación y de evaluación de la especificación.

## Acceso

Desde el **menú de laboratorios** (tarjeta «Práctica 4») o con el enlace directo `#p4`. Modos Práctica, Guiado,
Evaluación y Docente, como en las otras prácticas, y **Ver demostración** (semilla fija `P4_DEMO_SEED`): una mano
virtual hace los módulos A–C usando el mismo controlador que el estudiante.

| Módulo | Experimento | Estación |
|---|---|---|
| A | Neutralización HCl 0,10 M + NaOH 0,10 M con fenolftaleína, sonda de temperatura | A |
| B1 | Na₂CO₃ + CaCl₂ → CaCO₃(s) (gotas, 1:1) | B |
| B2 | FeCl₃ + NaOH 0,15 M (1:1 en volumen; el OH⁻ es limitante) → Fe(OH)₃(s) parcial | B |
| C1 | Clavo de Fe (lija, óxido) en CuSO₄ durante 10 min con cronómetro | C |
| C2 | Combustión de una cinta de Mg con pinza para crisol, pantalla y cápsula | D (mechero de la Práctica 3) |
| C3 | MgO + H₂O + fenolftaleína | D |

## Arquitectura

```text
src/simulation/chemistry/      motor químico genérico: fórmulas, especies, mezcla, equilibrios, precipitación,
                               color (Beer–Lambert), validación de ecuaciones por átomos y carga
src/simulation/reaction-world/ mundo de la práctica: recipientes con celda «bulk» y «pluma», goteros, metales,
                               cinta de Mg, derrames, desechos, seguridad; comandos y paso fijo determinista (20 Hz).
                               El mechero es el sub-mundo de la Práctica 3 (`w.gas`), avanzado con `stepFlame`.
src/practices/practice-04/     especies, reacciones, instrumental, definición, parámetros, escenarios de error,
                               libreta, ecuaciones de referencia, evidencia, máquina XState, rúbrica, resultados esperados
src/engine/reaction/           fachada ReactionLab3D, controlador (arrastre, acople de vertido, imanes, pinzas, pantalla),
                               líquidos, modelos procedurales, protección de la luz del Mg, escena, cámara y audio
src/app/p4/                    store, runtime, HUD, guía, inventario, panel de seguridad, acciones, editor de ecuaciones,
                               libreta, diálogos, revisión, demostración
src/locales/es/practice4.json  textos de la Práctica 4
```

`gesto → comando → dominio → estado + eventos → escena`. La escena solo informa hechos geométricos (poses, inclinación,
agitación medida, alineación de la pantalla, si la cinta está a la vista); el dominio decide la química y las consecuencias.

## Supuestos y límites científicos

| Aspecto | Modelo | Configurable en |
|---|---|---|
| Especies | Explícitas, con fase, ΔH°f, masa molar (desde la fórmula), absorbancia RGB y velocidad de sedimentación | `species.ts` |
| Reacciones | Balanceadas (se verifica átomo y carga al construir el contexto); se aplican como grado de avance | `reactions.ts` |
| Ácido–base | Libro de protones sobre el agua: pH desde el exceso neto con Kw(T), `h = (d + √(d² + 4Kw))/2` | `mixture.ts` |
| Equilibrios rápidos | CO₃²⁻/HCO₃⁻/CO₂(aq) e hidrólisis del Fe³⁺, resueltos por bisección de `log Q = log K` | `reactions.ts` |
| Precipitación | Ksp (CaCO₃ 3,36·10⁻⁹; Fe(OH)₃ amorfo 4·10⁻³⁸; Cu(OH)₂, Mg(OH)₂…), relajación `1 − e^(−k·dt)` | `kPrecip` |
| Calor | Ley de Hess con ΔH°f; capacidad calorífica del líquido y del vidrio; pérdidas al aire | `THERMAL` en `instruments.ts` |
| Mezcla | Lo añadido entra en la «pluma» y se mezcla con `k = base + agitación·k_agit` (remolinos rosados transitorios, precipitado local) | `mixBase`, `mixStir`, `entrainment` |
| Color | Beer–Lambert por canal con el camino óptico de cada recipiente; fenolftaleína rosa con `smoothstep(8,2; 10)` | `PATH_CM`, `PHENOLPHTHALEIN_PINK_ABS` |
| Redox Fe/Cu²⁺ | Velocidad ∝ área limpia × [Cu²⁺]; el óxido (escenario «clavo oxidado») y la capa de Cu frenan; la lija la quita por segmentos | `kRedoxFe`, `cuCoatRefMgCm2` |
| Al (opcional) | Pasivación inicial 0,995 (la capa de Al₂O₃ casi no deja reaccionar) | `settings.aluminum` |
| Combustión del Mg | Ignición a ≥ 650 °C en la punta; frente de 0,8 cm/s; reparto humo/caída/queda; O₂ y N₂ del aire con balance; Mg₃N₂ opcional | `mgIgnitionC`, `mgBurnCmS`, `settings.mgNitride` |
| Hidratación | MgO + H₂O → Mg(OH)₂ con `kHydration`; pH ≈ 10,3 en la suspensión | `kHydration` |
| Volúmenes | Nivel ↔ volumen por tablas precalculadas desde el perfil 3D; retención en paredes al vaciar | `holdupMl` |

Resultados de referencia (semilla de las pruebas): equivalencia a pH 7 con +0,4 °C; ≈ 15 mg de CaCO₃ en B1;
Fe(OH)₃ parcial con sobrenadante amarillo en B2 (relación 1:3 explicada en la retroalimentación); ≈ 14 mg de Cu en
10 min con clavo lijado; ≈ 35 mg de Mg → ≈ 49 mg de MgO recogidos.

Simplificaciones: no hay difusión espacial continua (dos celdas por recipiente); los iones complejos se tratan solo
de forma conceptual (§ complejos); la combustión del Mg no resuelve la llama ni la radiación, solo su intensidad
(protección de exposición en pantalla).

## Ecuaciones

El editor (`EquationEditor.tsx`) valida **por átomos y carga**, no por texto: `validateEquation` comprueba balance,
coeficientes mínimos, fases, especies no disociadas (sólidos, gases, agua, electrolitos débiles), espectadores tachados,
electrones en el lado correcto de las semirreacciones y que la reacción sea la observada (H₃O⁺ ≡ H⁺ + H₂O).
Las referencias de cada experimento están en `EXPERIMENT_REFS` y la ecuación iónica completa se arma por disociación.

## Seguridad

Bloqueos críticos (§18.3): no se enciende con la fenolftaleína (etanol) a menos de 30 cm del mechero; la cinta de Mg
no se acerca a la llama sin advertencia aceptada, pantalla colocada, cápsula debajo y EPP; la pinza para tubo no sirve
para el Mg; no se echa agua sobre el Mg caliente; los residuos con metales o sólidos no van al desagüe; no se entrega
con el mechero encendido, el gas abierto, residuos pendientes o un incidente sin resolver.

## Errores simulables

Ver `SIMULATED_ERRORS_P4` en `src/practices/practice-04/error-scenarios.ts` (35 códigos con consecuencia observable) y
la prueba «al menos 25 errores distintos» de `src/tests/integration/p4-flow.test.ts`. Escenarios docentes: beaker
mojado, gotero contaminado con ácido, clavo oxidado, tubo sucio y manguera agrietada.

## Accesibilidad

- Ratón, táctil o teclado, con los mismos atajos que las otras prácticas; vertido con acople y control fino.
- Lista de material con descripciones en palabras (en Evaluación no se dan volúmenes exactos: el estudiante lee la probeta).
- Subtítulos para cada sonido; alertas con símbolo además del color.
- Luz del Mg: la escena limita la exposición y oscurece la vista si se mira la cinta sin pantalla.

## Pruebas

- `src/tests/unit/p4-science.test.ts`: fórmulas, balance, pH, equilibrios, precipitados, colores, redox, Mg, validación de ecuaciones.
- `src/tests/integration/p4-flow.test.ts`: §28.6 (ruta ideal con evaluación y máquina, NaOH equivocado, Fe parcial,
  gotero contaminado, clavo oxidado y lijado, combustión parcial, derrame y balance, residuos, persistencia y
  determinismo), §18.3 (bloqueos) y ≥ 25 errores simulables.
- `src/tests/e2e/p4.spec.ts`: menú, accesibilidad (axe), EPP y vertido con el ratón.
