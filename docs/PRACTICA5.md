# Práctica 5 — Relaciones estequiométricas

Laboratorio 3D construido sobre la misma base que las Prácticas 2 a 4: React + React Three Fiber, XState v5, Zustand,
i18next, Vitest y Playwright. Descomposición térmica del clorato de potasio con dióxido de manganeso como catalizador:

```text
            MnO₂, Δ
2 KClO₃(s) ────────→ 2 KCl(s) + 3 O₂(g)
```

El estudiante pesa con una **balanza de triple brazo** el tubo vacío, con MnO₂ y con la mezcla; calienta, enfría y pesa
hasta **masa constante**; con SUS masas calcula el KCl y el O₂ teóricos y el rendimiento porcentual.

## Acceso

Desde el panel de la plataforma (tarjeta «Práctica 5») o con el enlace `#p5`, si el curso la tiene abierta. Modos
Práctica, Guiado, Evaluación y Docente, y **Ver demostración** (semilla fija): una mano virtual hace la ruta completa
con el mismo controlador que el estudiante.

| Estación | Contenido |
|---|---|
| A | Balanza de triple brazo (pesas de 100 g, 10 g y 0–10 g; tornillo de cero; nivel de burbuja), papel y brocha |
| B | Frascos de KClO₃ y MnO₂, una espátula dedicada a cada uno, bandeja de mezcla, tapón; distractores incompatibles (azúcar, mortero) |
| C | Gradilla refractaria, pinza para tubo, termómetro infrarrojo |
| D | Soporte universal con nuez y pinza, pantalla de seguridad, mechero de la Práctica 3 bajo la campana |
| E | Residuos sólidos (KCl + MnO₂) y piseta |

## Arquitectura

```text
src/simulation/stoichiometry/   masas molares, estequiometría, incertidumbre por diferencia, masa constante,
                                validación de cadenas de análisis dimensional
src/simulation/stoich-world/    mundo de la práctica: balanza (oscilador amortiguado), tubo (térmica + cinética),
                                pinza del soporte, espátulas, frascos, derrames, lecturas, seguridad; paso fijo de 0,05 s.
                                El mechero es el sub-mundo de la Práctica 3 (`w.gas`).
src/practices/practice-05/      definición (estaciones, posiciones), parámetros, escenarios y catálogo de errores,
                                ecuación, libreta, evidencia, máquina XState, rúbrica, resultados esperados
src/engine/stoich/              fachada StoichLab3D, controlador (arrastre, imán de la espátula, pesas, pinzas, llama),
                                modelos procedurales, escena, cámara
src/app/p5/                     store, runtime, HUD, lupa de la balanza, guía, inventario, seguridad, acciones,
                                libreta (Cuadros 5.1 y 5.2, cadenas, ecuación, gráfica), revisión, demostración
src/locales/es/practice5.json   textos de la Práctica 5 (claves `p5.*` y `p5fb.*`)
```

`gesto → comando → dominio → estado + eventos → escena`. La escena solo informa poses y gestos medidos (por ejemplo, la
rapidez del vaivén del tubo en la mano); el dominio decide las lecturas, la química y las consecuencias.

## Modelo científico

| Aspecto | Modelo | Parámetro |
|---|---|---|
| Balanza | Oscilador amortiguado del fiel (periodo 1,7 s); desequilibrio = carga + error de cero − tornillo + desnivel − empuje de carga caliente + ruido − pesas | `pointerPeriodS`, `pointerDamping`, `pointerSpanG` |
| Lectura | Suma de las pesas redondeada a 0,1 g; incertidumbre ±0,05 g. Válida solo con el fiel quieto en la marca ≥ 1 s, cero comprobado y la carga a ±3 °C del ambiente | `resolutionG`, `uncertaintyG`, `allowedDeltaC` |
| Ruido | Proceso de Ornstein–Uhlenbeck (corriente de aire, vibración) y fluctuación proporcional a la temperatura de la carga | `hotFluctuationGPerK` |
| Carga caliente | La corriente convectiva empuja el platillo: masa aparente menor (≈ 0,0035 g/K) | `hotLiftGPerK` |
| Térmica del tubo | Vidrio (en la llama), muestra y parte superior con capacidades y acoplamientos; calor = potencia de la llama × fracción captada × contacto; radiación, aire, gradilla | `flameCaptureFrac`, `glass*`, `sample*` |
| Cinética | Arrhenius con vía catalizada (Ea 120 kJ/mol, actividad ∝ MnO₂ saturable × homogeneidad) y sin catalizar (Ea 200 kJ/mol), saturada `k/(1 + k/kMax)`; reacción exotérmica | `catA`, `catEaJ`, `uncatA`, `uncatEaJ`, `kMax` |
| Pérdida mecánica | Si la rapidez específica de O₂ y el calentamiento de la muestra superan sus umbrales, el gas arrastra sólido por la boca | `expulsionThreshold`, `expulsionRampKs` |
| Tensión térmica | Gradiente vidrio–parte superior y calentamiento brusco acumulan tensión; con 1 el tubo se agrieta | `stressGradientK`, `stressRampK` |
| Balance | K, Cl, O y Mn se conservan (tubo + O₂ liberado + sólido perdido + derrames) | `elementTotals` |
| Masa constante | Dos lecturas válidas consecutivas tras calentar que difieren ≤ 0,1 g | `constantMassCriterionG` |

Resultados de referencia (pruebas):

| Técnica | Sólido perdido | Conversión |
|---|---|---|
| Llama suave (poco gas y aire) 5 min y luego normal | ≈ 0 g | 100 % en 10 min |
| Llama normal desde el inicio | ≈ 0,04 g | 100 % |
| Llama fuerte desde el inicio | ≈ 0,16 g | 98 % |

Ruta ideal: 17,6 → 17,8 → 19,3 g; tras calentar 18,7 → 18,7 g (masa constante), rendimiento ≈ 99 %. Con mala mezcla
hacen falta más ciclos; con un primer calentamiento corto queda KClO₃ y el rendimiento aparente supera 100 %.

Simplificaciones: la muestra es un único nodo térmico; la fusión del clorato (356 °C) se representa en la vista y en
la cinética, no como cambio de fase con calor latente; el O₂ liberado no se recoge (la práctica no lo mide).

## Seguridad

Bloqueos críticos (el gas se cierra y la acción se detiene): mezcla contaminada (grasa, papel, azúcar), tubo tapado,
boca hacia la persona, tubo agrietado, KClO₃ por encima del límite, moler el clorato, agua sobre el vidrio caliente,
caída del tubo con la pinza floja y llama sin supervisión. Tomar el tubo caliente con la mano produce una quemadura
simulada (se usa la pinza para tubo). No se entrega con el mechero encendido, el gas abierto o el tubo caliente.

## Evaluación

Por evidencia (§22), con los cálculos comparados con lo que corresponde a las masas que el estudiante midió:
seguridad e inspección 20 %, balanza y pesadas 20 %, preparación y montaje 15 %, calentamiento y masa constante 20 %,
cálculos estequiométricos 15 %, análisis 10 % (las preguntas abiertas quedan para el docente).

## Errores simulables

`SIMULATED_ERRORS_P5` en `src/practices/practice-05/error-scenarios.ts` (≈ 45 códigos con consecuencia observable) y la
prueba «al menos 25 errores distintos» de `src/tests/integration/p5-flow.test.ts`. Escenarios docentes: cero
desajustado, balanza desnivelada, corriente de aire, pesas fuera de cero, tubo húmedo, tubo agrietado, espátula con
grasa y manguera agrietada.

## Accesibilidad

- Todo se puede hacer desde el panel de acciones: pesas (selectores y pesa fina con −/+), tornillo de cero, lectura,
  traslado del tubo (mano o pinza), espátulas, pinza del soporte (inclinación, dirección de la boca, altura, presión),
  llama y su desplazamiento a lo largo del tubo.
- Lupa de la balanza con la escala del fiel y las pesas; vista a la altura del fiel (V) para leer sin paralaje.
- Descripciones en palabras (posición del fiel, capas o mezcla, fusión, temperatura en categorías; en Evaluación sin
  temperatura exacta). Subtítulos para cada sonido.

## Pruebas

- `src/tests/unit/p5-science.test.ts`: estequiometría, análisis dimensional, balanza, cinética, térmica, masa
  constante y balance de elementos.
- `src/tests/integration/p5-flow.test.ts`: ruta ideal con máquina y evaluación, balanza sin calibrar, orden incorrecto,
  calentamiento rápido, pesada en caliente y rendimiento > 100 %, contaminación, persistencia y determinismo,
  bloqueos críticos y ≥ 25 errores simulables.
- `src/tests/e2e/p5.spec.ts`: menú y accesibilidad (axe), tornillo de cero y pesas con el ratón, tubo al platillo,
  espátula con imán, quemadura con el tubo caliente, entrega bloqueada y demostración.
