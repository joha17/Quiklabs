# Biología B06 — Atlas celular comparado (procariotas, protistas, plantas y sangre)

Sexta práctica de **Biología General**: diversidad y estructura celular comparadas con evidencia propia. El estudiante
clasifica las muestras (fresca o permanente), pela la epidermis inferior de *Tradescantia* con la pinza, monta
*Paramecium* (con metilcelulosa) y *Euglena* vivos y registra su movilidad mientras los mira, prepara un frotis bucal con
azul de metileno y una hoja de *Elodea*, observa *Bacillus cereus* y un frotis sanguíneo en láminas permanentes (100X con
aceite solo si tiene el módulo de inmersión), rotula regiones sobre sus propias capturas y mide longitudes con la escala
del objetivo y su incertidumbre.

**Reutiliza B01–B02**: sala, microscopio compuesto y sus gestos, montaje húmedo, cubreobjetos, frotis bucal, caja de
láminas permanentes, captura, runtime, cinta reproducible, calificación en el servidor, fotos del docente y
demostración. B06 agrega la maceta de *Tradescantia*, los goteros de cultivo vivo, la viabilidad y viscosidad de los
protistas, el aceite de inmersión, la tinción de Wright, las marcas de región, la morfometría y los bloqueos de
bioseguridad (lanceta, cultivo cerrado).

```text
Aumento total = ocular × objetivo                           (REF-01)
Campo visual (µm) = 1000 · FN / objetivo                    (REF-02…04; FN = 18 mm, caso hipotético de la guía)
Escala: µm/px = campo / 1000 px de la captura               (incertidumbre relativa 2 %; 0,5 % con micrómetro)
L = p · s     u_L = √((p·u_s)² + (s·u_p)²)                  (REF-05/06; u_p = 2 px)
Velocidad aparente PREDICHA = v_ref · viabilidad / (1 + k·fracción de metilcelulosa)   (nunca es evidencia)
```

> **Modelo didáctico.** FN, velocidades de referencia, viscosidad, pérdida de viabilidad y tiempos de Wright son
> parámetros de software (`params.ts`, estado `hypothetical`/`pending`). Sin video con escala temporal no hay velocidad
> evaluable (REF-09, PCEL-11). Las imágenes del ocular son ilustraciones con manifiesto o fotos aprobadas por el docente.

## Acceso e identificador

Panel de la plataforma (tarjeta 16, área **Biología**) o enlace `#b06`. Migración `0016_course_labs_b06.sql`: reconstruye
`course_labs` y `lab_photos` para admitir `'b06'` en sus `CHECK`. En la semilla, **Biología General I** (`c_bg1_01`) tiene
`b06` abierta desde el 2026-11-24. Intentos `b06-<semilla>-<marca>`; la calificación del servidor reproduce la cinta con
`dispatchDiv`. Fotos del docente: *Tradescantia*, *Paramecium*, *Euglena*, *Bacillus* y sangre.

| Estación | Contenido |
|---|---|
| A | EPP, fichas del reto, zona sin desinfectar, contenedores de vidrio, biológicos y residuos comunes |
| B | Preparación vegetal: maceta de *Tradescantia*, *Elodea*, goteros (agua, azul de metileno, Lugol, nigrosina, metilcelulosa), portaobjetos (sl5 con restos, sl6 rajado), cubreobjetos, pinza, bisturí, papeles y pañuelo |
| C | Microscopio compartido y goteros de cultivo de *Paramecium* y *Euglena* |
| D | Caja de láminas permanentes (fxB, fxS, fxO no asignada, fxB2 quebrada, wr1 para Wright), aceite (con módulo), Wright y tampón, placa de *B. cereus* cerrada, lancetas bloqueadas |
| E | Frotis bucal: hisopos y fuente virtual de epitelio |
| F | Libreta, bandeja de limpieza y cierre |

## Arquitectura

```text
src/simulation/div-world/            mundo B06: envuelve dispatchCell (B02 → B01); fichas, epidermis, cultivos vivos,
                                     aceite y lentes, Wright, marcas, mediciones, bioseguridad, viabilidad por paso
src/practices/practice-b06/          definición, parámetros (CODE_MAP_B06), 28 escenarios, 75 errores, libreta,
                                     resultados esperados, evidencia, máquina XState, rúbrica (6 componentes), reanudación
src/engine/optical/divController.ts  gestos sobre el CellController: pelar con la pinza, pañuelo y papel sobre la lente
src/engine/optical/objects3dDiv.ts   maceta, frasco de aceite con nivel, frascos de Wright, pañuelo, zona sucia, placa,
                                     lancetas y fichas
src/engine/instruments/optical/illustrationsDiv.ts   ilustraciones de Tradescantia, cultivos, bacterias y sangre
src/app/b06/                         store, simulación, paneles, marcador de capturas (CaptureMarkerB06), libreta,
                                     revisión, demo
src/locales/es/practiceB06.json      textos (`b06.*`, `b06fb.*`)
```

`codeMap` traduce los códigos de B01 (`E*`) y B02 (`CEL**`) a `CEL-0NN`; los que no son error en B06 se descartan.

## Etapas por evidencia

`INTRO → PPE_CHECK → CLASSIFICATION → PREPARATION → PROTISTS → FIXED_SLIDES → COMPARISONS → ANALYSIS → CLEANUP →
COMPLETE → SUBMISSION → REVIEW`. Cada transición depende de banderas del mundo y la libreta (`b06StageEvidence`, con
latch `stage:*`): fichas clasificadas e inspección del microscopio, montajes frescos usables, movilidad registrada de
ambos protistas (salvo recurso ausente), láminas permanentes capturadas y devueltas, marcas válidas y medición, libreta
completa y puesto restaurado.

## Rúbrica

| Componente | Peso |
|---|---|
| Seguridad y conservación del equipo | 15 % |
| Preparaciones frescas | 15 % |
| Operación óptica | 20 % |
| Observaciones comparativas | 20 % |
| Morfometría y razonamiento | 15 % |
| Libreta, rotulación y conclusiones | 15 % |

Con módulo de inmersión se califica la captura a 100X con aceite; sin él, que no se pida el 100X (CEL-039). Las
respuestas abiertas y las limitaciones quedan para revisión docente (`null`). Recurso ausente, escala ausente o foto de
otro objetivo difieren el ítem sin descuento. La ruta ideal obtiene 0,969 (el resto es la revisión docente).

## Errores

71 errores atribuibles (CEL-001…071) y cuatro incidencias de recursos (CEL-072…075). Los de interpretación y registro
(CEL-037, 043, 046, 047 y 061–071) son `nb:*` y se detectan contrastando la libreta con las capturas, marcas y
mediciones del propio intento; los demás son hechos del mundo con consecuencia (montaje contaminado o seco, burbujas,
lente con aceite, captura inválida, organismos inmóviles, marca rechazada, bloqueo). Las incidencias (`incident:*`)
nunca dejan `err:*`. `b06-errors.test.ts` tiene una fixture por código.

## Pruebas

| Archivo | Qué verifica |
|---|---|
| `integration/b06-science.test.ts` | REF-01…12: aumento, campo, escala, incertidumbre, viscosidad, sin velocidad sin video |
| `integration/b06-flow.test.ts` | ruta ideal solo con comandos: sin errores, balances conservados, COMPLETE, reanudación |
| `integration/b06-errors.test.ts` | 71 errores + 4 incidencias con su consecuencia; ruta ideal sin problemas; localizar a 4X con láminas permanentes |
| `integration/b06-demo.test.ts` | demostración sin navegador con gestos reales: un error deliberado (CEL-016) y su recuperación, puesto cerrado, cinta reproducible |
| `integration/b06-locale.test.ts` | textos de etapas, escenarios, errores, rúbrica y cada clave literal |
| `integration/replay.test.ts` | dos semillas (una con 100X): calificación del servidor y repetición exacta |
| `e2e/b06.spec.ts`, `e2e/b06-demo.spec.ts` | panel, accesibilidad (axe), epidermis y Paramecium desde el panel, demostración completa en la escena 3D |
