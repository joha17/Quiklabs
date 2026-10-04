# Práctica 3 — Mechero de Bunsen y prueba de cationes a la llama

Laboratorio 3D construido sobre la misma base que la Práctica 2: React + React Three Fiber + Rapier, XState v5,
Zustand, i18next, Vitest y Playwright. A diferencia de la especificación original (PixiJS 2.5D), aquí se usa la
escena 3D existente; las reglas científicas, de seguridad y de validación de la especificación se mantienen.

## Acceso

La portada es un **menú de laboratorios** (`src/app/LabMenu.tsx`). Cada práctica conserva su propio flujo
(configuración → laboratorio → revisión) y su propio intento guardado. El hash de la URL abre una práctica directamente:
`#p2` o `#p3`.

## Arquitectura

```text
src/simulation/
├── spectroscopy/spectrum.ts   espectros por líneas/bandas, filtro, CIE 1931, color de pantalla, región cromática
├── combustion/combustion.ts   aireación, régimen, geometría y campo térmico de la llama, productos (conservación C/H/O)
└── flame-world/               mundo de la práctica: mechero, sala (gas, CO), manguera, cápsula, asas, tubos,
                               vidrio, atomizadores, seguridad; comandos y paso fijo determinista (20 Hz)
src/practices/practice-03/     definición, instrumentos, perfiles de cationes, incógnita, escenarios de error,
                               libreta, evidencia, máquina XState, rúbrica, resultados esperados
src/engine/flame/              fachada FlameLab3D, controlador de interacción, modelos procedurales, material de llama
                               (shader), escena, cámara y audio
src/app/p3/                    store, runtime, HUD, panel de seguridad, acciones, libreta, partes, diálogos, revisión
src/locales/es/practice3.json  textos de la Práctica 3 y del menú
```

`gesto → comando → dominio → estado + eventos → escena`, igual que en la Práctica 2: la escena solo informa hechos
geométricos (poses, alineación del vidrio con la cámara, calidad del agarre) y el dominio decide las consecuencias.

## Supuestos y límites científicos

| Aspecto | Modelo | Configurable en |
|---|---|---|
| Flujo de gas | `mesa × aguja × integridad`; manguera desconectada o agrietada = fuga | `params.ts` (`nominalMaxFlowMlS`) |
| Aireación | `airMix = tiro × collar × eficiencia / max(flujo, 0,05)` (índice normalizado, no estequiométrico) | `intakeEfficiency` |
| Régimen | amarilla < 0,10 < transicional < 0,35 < azul; retroceso con aire > 0,95 y flujo < 0,3; llama levantada con aire > 1,1 o flujo > 0,88 | `yellowMax`, `transitionalMax`, `flashback*`, `lift*` |
| Altura | `2 + 15·√flujo·factor` (al abrir el aire la llama se acorta: hay que subir el gas para 10 cm) | `targetFlameCm`, `flameToleranceCm` |
| Productos | C → CO₂ (55–98 % según aire), CO y hollín; H → H₂O; O₂ consumido; balance elemental exacto | `sootShare` |
| Temperatura | cono interno 350–900 °C, máximo junto a la punta del cono interno (1 200 °C en llama azul, 950 °C amarilla), enfriamiento en la periferia y la punta | `combustion.ts` |
| CO | variable ambiental en ppm con eliminación por ventilación; alarma y corte automático; nunca humo visible | `coWarnPpm`, `coAlarmPpm`, `coShutdownPpm` |
| Gas acumulado | mL locales con eliminación por ventilación; bloqueo del encendido sobre el umbral | `gasWarnMl`, `gasAlarmMl`, `gasBlockMl` |
| Hollín | `producción × contacto × captura`; cobertura `1 − e^(−m/1,2 mg)`; trazado por régimen | `combustion.ts`, `world.ts` |
| Térmica | asa τ = 0,35 s al calentar y 3,5 s al enfriar; cápsula τ = 16 s / 110–140 s; nada se enfría al instante | `world.ts` |
| Emisión | carga ∝ tiempo y profundidad (aro 3 mg; vástago extra = sobrecarga); agua → ~100 °C; consumo `m·k·volatilidad·excitación(T)`; 1–5 s de color útil | `sampleConsumption`, `loopRingCapacityMg` |
| Espectros | Li 670,8/610,4; Na 589,0/589,6 (muy intenso); K 404,4/404,7, 691/694, 766,5/769,9; Ca bandas CaOH ~606–622; Cu bandas CuCl 478–538; Ba 553,5 + bandas | `cation-profiles.ts` |
| Vidrio de cobalto | transmisión tabulada (bloquea ~589 nm a 0,2 %, deja pasar azul/violeta y rojo profundo); actúa por fragmento solo si el rayo cámara→llama cruza el vidrio | `COBALT_TRANSMISSION` |
| Color | integración CIE 1931 (tabla 10 nm), sRGB lineal, recorte de gama y compresión `1 − e^(−L)` que conserva el tono | `exposure`, `emissionScale` |
| Contaminación | Na ambiental débil; asa en la mesada acumula Na; asas que se tocan transfieren 30 %; asa ajena o caliente contamina el tubo | `world.ts` |

Simplificaciones: no hay cinética de combustión ni CFD; la forma de la llama es una superficie de revolución
paramétrica con ruido; el brillo de dibujo de la llama se normaliza (la pantalla no reproduce la luminancia real) y el
tono siempre sale del espectro. El dibujo de los penachos usa solo la emisión de la muestra, sumada a la llama base.

## Errores simulables

Ver `SIMULATED_ERRORS` en `src/practices/practice-03/error-scenarios.ts` (más de 30, con consecuencia observable) y la
prueba «al menos 20 errores simulables» de `src/tests/integration/p3-flow.test.ts`. Escenarios docentes: manguera
agrietada, asa contaminada con sodio, corriente de aire y ventilación deficiente.

## Accesibilidad

- Todo se opera con ratón, táctil o teclado: ← → eligen objeto, Intro toma/suelta, flechas mueven, Q/E o RePág/AvPág
  ajustan la altura, P es la acción de la herramienta, Esc cancela; las válvulas tienen controles deslizantes y
  botones ± con `aria-valuetext` en palabras («media apertura»).
- Identificación de partes: además del clic en el modelo, una lista por **forma y posición** (no por nombre).
- Narración del estado de la llama en el panel de seguridad («Llama azul, 10 cm, dos conos definidos, estable»).
- Subtítulos para cada sonido; alertas con símbolo además del color.
- Apoyo de visión cromática (Ajustes): espectro y nombre de la región cromática **después** de registrar la observación.
- «Reducir movimiento» elimina la oscilación sin quitar color, forma ni altura de la llama.

## Pruebas

- `src/tests/unit/p3-science.test.ts`: §26.1–26.3 (combustión, térmica/hollín y espectros).
- `src/tests/integration/p3-flow.test.ts`: §26.4 (ruta ideal con apagado, aire abierto, fuga, gas acumulado, cápsulas,
  contaminación y HCl, mezcla Na/K, las seis incógnitas, persistencia y determinismo, atomizador, entrega bloqueada).
- `src/tests/e2e/p3.spec.ts`: menú, accesibilidad (axe), perilla y encendedor con el ratón, imán del asa, color de la
  llama y entrega bloqueada con gas abierto.
