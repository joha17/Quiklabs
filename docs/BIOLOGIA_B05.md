# Biología B05 — Cinética en acción (catalasa, amilasa y regulación enzimática)

Quinta práctica de **Biología General**: cinética enzimática medida, no anunciada. El estudiante prepara él mismo los
tres lotes (almidón en placa con pastilla y termómetro, extracto de hígado sin calor, amilasa), mide el O₂ de la catalasa
con un colector sellado y el cronómetro, compara línea base, blanco sin tejido, tratamiento térmico y pH, incuba la
amilasa a 37 °C y revela alícuotas a 0/120/300/600 s con Lugol y Benedict, observa gránulos de almidón de papa con el
microscopio compartido y calcula tasa inicial, moles de O₂ (PV = nRT) y unidades glucosilo con sus propias lecturas.

**Reutiliza B01–B03**: sala, microscopio de cuatro objetivos (4X/10X/40X/100X, retenes a 0/90/180/270°) y sus gestos,
montaje húmedo de papa con Lugol, captura, runtime, cinta reproducible, calificación en el servidor, fotos del docente y
demostración. B05 agrega la cinética, el colector de gas, baños María, placas con agitación magnética, pipetas de
1/5/10 mL, goteros de reactivos, tiras de pH, residuos por clase y el módulo ADH opcional.

```text
Catalasa:   v = kcat·[E]act·[H₂O₂]/(Km + [H₂O₂]) · f(T) · g(pH)      2 H₂O₂ → 2 H₂O + O₂
Desnaturalización: d[E]act/dt = −k(T,pH)·[E]act   (irreversible; enfriar no la recupera, BIO5-19)
O₂: generado = disuelto + colector + venteado + atrapado            (balance conservativo, BIO5-18)
Colector:  V = n·R·T/P  (escala 0–50 mL, resolución 0,5 mL, sello < 0,9 → fuga)
Amilasa:   almidón → dextrinas → maltosa (glucosilos conservados); Lugol ∝ cadenas largas, Benedict ∝ reductores
ADH (opcional): etanol + NAD⁺ → acetaldehído + NADH;  A340 = ε·b·c (ε = 6220 L·mol⁻¹·cm⁻¹); metanol compite (Ki)
```

> **Modelo didáctico.** Actividades por gramo de tejido, Km, kcat, temperaturas de desnaturalización y sensibilidades de
> los indicadores son parámetros de software (`params.ts`, estado `pending` salvo ε340), no medidas de un tejido real
> (BIO5-11). Las imágenes del ocular son ilustraciones con manifiesto o fotos aprobadas por el docente.

## Acceso e identificador

Panel de la plataforma (tarjeta 15, área **Biología**) o enlace `#b05`. Migración `0015_course_labs_b05.sql`: reconstruye
`course_labs` y `lab_photos` para admitir `'b05'` en sus `CHECK`. En la semilla, **Biología General I** (`c_bg1_01`) tiene
`b05` abierta desde el 2026-11-17. Intentos `b05-<semilla>-<marca>`; la calificación del servidor reproduce la cinta con
`dispatchEnz`.

| Estación | Contenido |
|---|---|
| A | EPP, contenedores de residuos acuosos, con cobre/yodo y biológicos; vidrio |
| B | Preparaciones P1–P3: probetas de 100/25/10 mL, balanza con bote y tara, espátulas, frascos de almidón y amilasa, bisturí y tabla, hígado, placas hp1/hp2 con pastillas |
| C | Baño María 1 (incubación, 35 °C) y 2 (Benedict, 90 °C), pinza de tubos, termómetro |
| D | Catalasa: gradilla, peróxido 0,100 mol/L (y frasco vencido según escenario), colector graduado con llave, cronómetro 1, goteros de HCl y NaOH, tiras de pH |
| E | Amilasa: tubos de incubación y alícuotas, cronómetro 2, goteros de Lugol, Benedict y agua |
| F | Microscopio compuesto de B01 (sin cambios) con raspado de papa y Lugol |
| G | Módulo ADH opcional: cubetas de cuarzo (1 cm), semimicro (0,5 cm) y plástico, fotómetro UV, mechero |

EPP: bata, calzado cerrado, cabello recogido, manos limpias y **guantes** (peróxido, HCl/NaOH, Benedict caliente).

## Arquitectura

```text
src/simulation/enz-world/            mundo B05: envuelve dispatchCell (B02 → B01); especies, recipientes, vertido,
                                     pipetas, goteros, placas y baños, colector, cronómetros, tiras, lecturas, residuos
  chemistry.ts / kinetics.ts         pH con tampón, Lugol, Benedict, Michaelis–Menten con T/pH, desnaturalización, O₂
src/practices/practice-b05/          definición, parámetros, 28 escenarios, 101 errores + B05RES, libreta,
                                     evidencia, máquina XState, rúbrica (6 componentes), reanudación
src/engine/optical/enzController.ts  gestos sobre el CellController: verter, pipetear (Q/E volumen), goteros (Shift = 3),
                                     espátula, bisturí, pinza, termómetro, tiras, colector
src/engine/optical/objects3dEnz.ts   frascos que se inclinan, pipetas, placas con pastilla girando, baños con LED,
                                     colector con columna de agua, cronómetros, fotómetro, mechero
src/app/b05/                         store, simulación, paneles (instrumentos, acciones accesibles, seguridad), libreta,
                                     revisión, demo
src/locales/es/practiceB05.json      textos (`b05.*`, `b05fb.*`); el equipo compartido usa `b02.*` / `b01.*`
```

B05 **no importa** `bio-world` ni `biochem` (B04): la química enzimática de B04 se desarrolló en paralelo y la
unificación queda pendiente (BIO5-09).

## Etapas por evidencia

`SETUP → PREP → CONTROLS → CATALASE → FACTORS → AMY_SETUP → AMY_ASSAYS → MICRO → ADH → ANALYSIS → COMPLETE`. Cada
transición depende de banderas calculadas del mundo y la libreta (`b05StageEvidence`): lotes P1–P3 aceptados por sus
lecturas reales, blanco medido, serie de gas con al menos cuatro lecturas, tratamientos térmico y de pH, contacto
amilasa–almidón con alícuotas leídas, captura de gránulos válida, ADH solo si está asignado y puesto restaurado.

## Rúbrica

| Componente | Peso |
|---|---|
| Seguridad, EPP y recuperación | 15 % |
| Preparación y controles | 15 % |
| Catalasa y registro de gas | 25 % |
| Amilasa y ensayos | 20 % |
| Análisis cuantitativo | 15 % |
| Libreta y explicación científica | 10 % |

El ADH, si no tiene curva UV validada (SC26), no se asigna ni se califica (BIO5-16). B05RES (recurso faltante) excluye el
ítem sin descuento (BIO5-20).

## Errores

95 errores de la especificación (M01–M12, C01–C16, T01–T12, A01–A16, H01–H10, N01–N12, S01–S08, PREP01–PREP09), seis
del microscopio compartido (MIC01–MIC06, traducidos desde los códigos de B01/B02 por `CODE_MAP_B05`) y la incidencia
B05RES. Los de cálculo e interpretación (`nb:*`) se detectan contrastando la libreta con las lecturas del propio intento;
los demás son hechos del mundo con consecuencia física (gas perdido, actividad reducida, volumen derramado, lectura
sesgada, bloqueo). `b05-errors.test.ts` tiene una fixture por código.

## Pruebas

| Archivo | Qué verifica |
|---|---|
| `unit/b05-science.test.ts` | casos de §8: gas máximo, glucosilos, inhibición competitiva, absorbancia, reparto de O₂ |
| `integration/b05-flow.test.ts` | ruta ideal solo con comandos: sin errores, balances conservados (1e-9), COMPLETE, determinismo con reanudación |
| `integration/b05-errors.test.ts` | 101 errores + B05RES con su consecuencia; la ruta ideal sin problemas en la libreta |
| `integration/b05-demo.test.ts` | demostración sin navegador con gestos reales, sin errores, puesto cerrado, cinta reproducible |
| `integration/b05-locale.test.ts` | textos de etapas, banderas, escenarios, errores, rúbrica, calidades y cada clave literal |
| `integration/replay.test.ts` | dos semillas: calificación del servidor sin observaciones y repetición exacta |
