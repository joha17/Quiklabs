# Práctica 6 — Calorimetría

Calor específico del hierro, identificación de un metal incógnito y, de forma opcional, calor de combustión de un
alimento con una bomba calorimétrica virtual. Laboratorio 3D con la misma base que las Prácticas 2 a 5 (React Three
Fiber, XState v5, Zustand, i18next, Vitest y Playwright). La especificación pide 2.5D con PixiJS y Matter.js; aquí se
usa la escena 3D existente y se mantienen sus reglas científicas, de seguridad, de validación y de evaluación.

```text
q_metal + q_agua (+ q_calorímetro + q_entorno) = 0        c_metal = −q_agua / [m_metal·(Tf − Ti_metal)]
```

## Acceso

Panel de la plataforma (tarjeta «Práctica 6») o enlace `#p6` cuando el curso la tiene abierta. Modos Práctica,
Guiado, Evaluación y Docente, y **Ver demostración** (ensayo completo del hierro con los mismos gestos del estudiante).

| Estación | Contenido |
|---|---|
| A | Balanza de triple brazo (módulo compartido con la P5), probeta de 100 mL, botella de agua, piseta, frascos de clavos y del incógnito, espátula, gradilla con dos tubos |
| B | Calorímetro de vaso (dos vasos de espuma y tapa con dos orificios), termómetro digital, agitador, toalla |
| C | Plantilla calentadora con perilla, beaker de 400 mL (baño), termómetro del baño, pinza para tubo |
| D | Bomba calorimétrica virtual: recipiente, unidad con camisa y pantalla, oxígeno virtual, balanza analítica, muestras |
| E | Lavadero |

## Correcciones de la guía (§2), visibles al docente

- «Calor de combustión del hierro» → **calor específico** del hierro y del incógnito (no hay combustión del metal).
- El calor específico no es conductividad térmica (pregunta de análisis 1).
- Modo **ideal** (aislado, `C_cal = 0`, con etiqueta visible) y **realista** (vaso, tapa, termómetro, pérdidas).
- La temperatura del metal no se iguala a la del baño: el motor la integra; el estudiante debe medir el baño.
- El metal va bajo el nivel del baño y la boca del tubo fuera del agua.
- Masas por diferencia (tubo vacío y con metal; probeta vacía y con agua); nunca 50,0 mL = 50,0 g.
- El incógnito lo elige el docente (o la semilla) de un banco con valores próximos (Cu, Zn, latón) y se identifica
  con `z = |c − c_ref| / √(u² + u_ref²)`.
- La ebullición depende de la presión configurada (ecuación de Antoine; 100 °C a 101,325 kPa).
- Cuadro 6.3 en cal/g, kcal/g, J/g o kJ/g con 1 cal = 4,184 J.

## Arquitectura

```text
src/simulation/calorimetry/        ecuaciones (equilibrio ideal y corregido, c, error, Antoine, incertidumbre,
                                   Monte Carlo, identificación, máximo), banco de metales, alimentos y perfiles de bomba
src/simulation/instruments/        balanza de triple brazo reutilizable (oscilador amortiguado, cero, nivel, carga caliente)
src/simulation/calorimetry-world/  mundo: agua en recipientes, piezas de metal discretas, plantilla, baño, tubos,
                                   calorímetro de nodos acoplados, termómetros con retardo, lecturas, ensayos; bomba
                                   calorimétrica con máquina de estados y enclavamientos (bomb.ts)
src/practices/practice-06/         definición, parámetros, escenarios y catálogo de errores, libreta, evidencia,
                                   máquina XState, rúbrica, resultados esperados
src/engine/instruments/            modelo 3D compartido de la balanza de triple brazo
src/engine/calor/                  fachada CalorLab3D, controlador (vertido inclinado, piseta, espátula, pinza, tapa,
                                   agitador, termómetros, perilla), modelos procedurales, escena y cámara
src/app/p6/                        store, runtime (registro encadenado por hash), HUD, panel de instrumentos, lupa de la
                                   balanza, seguridad, acciones, libreta (Cuadros 6.1–6.3, gráficas), revisión, demostración
src/locales/es/practice6.json      textos (`p6.*`, `p6fb.*`)
```

## Modelo térmico

| Nodo / proceso | Modelo | Parámetro |
|---|---|---|
| Plantilla | Termostato proporcional (perilla → consigna), 800 W máx., inercia 1500 J/°C, pérdidas y radiación | `plateMaxW`, `plateHeatCapJPerC` |
| Baño | Agua + vidrio; recibe de la plantilla, pierde al aire, evapora; a la temperatura de ebullición el exceso evapora (2257 J/g) y la «violencia» de la ebullición salpica | `plateBeakerWPerC`, `beakerAirWPerC` |
| Tubo | Vidrio ← baño según la fracción de metal sumergida; metal ← vidrio por contacto (más rápido con agua dentro); el vidrio que asoma es una aleta débil; en el fondo, recibe de la plantilla | `tubeBathWPerC`, `metalTubeWPerC` |
| Traslado | El metal se enfría a través del vidrio al aire mientras dura el traslado | `tubeAirWPerC` |
| Calorímetro | Metal → capa inferior del agua ⇄ capa superior (la mezcla depende de la agitación) → vaso → ambiente (tapa abierta ×4) | `metalWater*`, `mix*`, `cupHeatCapJPerC` |
| Termómetros | `dT/dt = (T_sensor − T_indicada)/τ`, τ = 5 s, resolución 0,1 °C; el sensor ve la capa superior, el aire si el bulbo no está sumergido, o el fondo/metal si lo toca | `thermometer` |
| Calor específico | Constante o `c(T)` (modo avanzado); dispersión entre muestras dentro del intervalo del material | `cpModel`, `sampleDispersion` |

Resultados de referencia (pruebas): hierro con técnica correcta → metal a ≈ 99 °C con el baño a 100 °C; c corregido
≈ 0,43 (−4 %) y c ideal ≈ 0,40 (el modelo ideal subestima). Traslado de 60 s, poco tiempo en el baño o sin agitar → c
menor, con las causas explicadas en la revisión. En modo ideal la energía del calorímetro se conserva (< 10⁻⁶); en
modo realista lo que pierde el sistema coincide con lo acumulado en el entorno (< 2 %). El agua y el metal conservan
su masa entre recipientes, derrames y evaporación.

## Bomba calorimétrica (§20)

Simulación educativa: no describe la operación de un equipo real. Perfiles genéricos A (isoperibólico) y B
(adiabático) con presión de llenado, límites de presión, energía y masa. Máquina de estados `UNASSEMBLED → … → OPENED`;
la ignición exige perfil, inspección, constante energética, muestra, alambre, recipiente cerrado, hermeticidad,
presión dentro del perfil, inmersión, camisa cerrada y línea base estable. No se abre presurizada (bloqueo crítico).
`q_muestra = C·ΔT_corregido − q_alambre − q_auxiliares`; ΔT corregido por el método de las pendientes. El agua de la
cubeta distinta del perfil cambia la constante efectiva; el alambre sin contacto no enciende la muestra; tocando el
crisol hay cortocircuito; con humedad o baja presión la combustión es incompleta (hollín). La revisión compara la
energía bruta con la de la etiqueta nutricional.

## Evaluación

Seguridad e inspección 15 %, balanza y probeta 15 %, montaje 10 %, calentamiento y transferencia 20 %, registro de
temperatura 10 %, cálculos e incertidumbre 20 %, interpretación e identificación 10 %; la bomba se evalúa aparte.
Los cálculos se comparan con lo que corresponde a las lecturas que el estudiante obtuvo (§16).

## Errores simulables

`SIMULATED_ERRORS_P6` (≈ 60 códigos) y la prueba «al menos 30 errores distintos» de `src/tests/integration/p6-flow.test.ts`.
Escenarios docentes: cero desajustado, desnivel, corriente de aire, probeta mojada, tubo mojado, tubo agrietado,
termómetro descalibrado, calorímetro mal aislado y sello de la bomba dañado.

## Accesibilidad

Todo se hace también desde el panel de acciones (vertidos mantenidos, gotas, pesas, tornillo, lectura del menisco,
termómetros y su profundidad, tapa, agitación, piezas de metal, traslados con la pinza, perilla y el procedimiento de
la bomba). Panel de instrumentos con las pantallas de los termómetros, lupa de la balanza, vista a la altura del
menisco o del fiel, descripciones en palabras (en Evaluación sin volúmenes exactos), subtítulos y gráficas con tabla.

## Pruebas

- `src/tests/unit/p6-science.test.ts`: §30.1–30.5 (conservación, termodinámica, valores numéricos, instrumentos,
  incertidumbre e identificación, bomba).
- `src/tests/integration/p6-flow.test.ts`: ruta ideal completa con máquina y evaluación, Cu ambiguo con Zn y latón,
  guardado y determinismo, errores con consecuencia causal y ≥ 30 errores simulables.
- `src/tests/e2e/p6.spec.ts`: menú y accesibilidad (axe), vertido con el ratón, piseta y menisco, termómetro, tapa,
  baño y pinza, quemadura, entrega bloqueada y demostración.
