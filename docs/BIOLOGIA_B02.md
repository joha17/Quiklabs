# Biología B02 — Células bajo la lente

Segunda práctica de **Biología General**: estructuras y organelos celulares. El estudiante prepara sus propios
montajes —cortes finos de frutos pigmentados, un raspado de papa con Lugol, pulpa de pera con esclereidas y un frotis
bucal teñido— y una hoja de *Elodea*; los observa de 4X a 40X con el mismo microscopio compuesto de B01 y compara
cloroplastos, cromoplastos y amiloplastos con **capturas propias**. Lo que se ve depende del espesor, del colorante, del
tiempo de contacto y de los mandos: nada se tiñe ni se enfoca solo.

**Reutiliza todo B01**: sala, microscopio articulado y sus gestos, estereoscopio, caja de láminas, montaje húmedo
(gota, cubreobjetos inclinado, burbujas), observación y captura, runtime, cinta reproducible, calificación en el
servidor y demostración. B02 solo agrega la obtención de tejido, la tinción y su propia libreta, rúbrica y errores.

```text
M_total = M_ocular × M_objetivo            10X × 4/10/40 = 40/100/400X
d ≈ 0,61 λ / NA                            λ = 0,55 µm; NA 0,10 / 0,25 / 0,65 → ≈ 3,4 / 1,3 / 0,52 µm (teórico)
corte:   A = (10·L)² · 0,5 mm²             e = espesor del gesto (fino 0,15 mm · grueso 0,8 mm; límite 0,4 mm)
raspado: e = 0,06 + 0,22·p mm              A = (10·d)² · 0,2 · (0,4 + p) mm²; desgarro si p > 0,75
hisopo:  carga = min(1, t / 2·t_min) · (0,5 + 0,5·p) · 2 mg   (nada con t < 0,5 s)
extendido: densidad = (carga/2)·(1,6/L)·(0,5 + 0,6·p)·0,55   (> 0,7 = células superpuestas)
Lugol:   revelado si contacto ≥ 20 s; sobretinción 0,5·V/V_exceso (≥ 0,7 por encima de 0,11 mL)
```

> **Imágenes del ocular: ilustraciones didácticas generadas por el sistema, no microfotografías.** Cada condición
> (material + preparación + tinción) elige un activo con manifiesto; si no hay recurso aprobado para la condición, la
> imagen no cambia (Lugol con poco contacto sigue «sin teñir») o se declara faltante (incidencia CEL68, sin descuento).

## Acceso e identificador

Panel de la plataforma (tarjeta 12, área **Biología**) o enlace `#b02`. Migración `0011_course_labs_b02.sql` (amplía el
`CHECK` de `course_labs.lab_id`); en la semilla, el curso **Biología General I** (`c_bg1_01`) tiene `b02` abierta desde
el 2026-10-27. Intentos `b02-<semilla>-<marca>`; la calificación del servidor reproduce la cinta con `dispatchCell`.

| Estación | Contenido |
|---|---|
| A | EPP (bata, calzado cerrado, cabello recogido, manos limpias; guantes opcionales), vidrio roto, residuos biológicos y **residuos comunes** |
| B | Área de preparación vegetal, **tabla de corte**, placa con *Elodea*, fuentes de tejido (papa, tomate, chile, zanahoria, pera, guayaba, manzana), seis portaobjetos (uno con restos), ocho cubreobjetos, goteros de agua, Lugol, azul de metileno y eosina 1 %, pinza, bisturí, **espátula**, papeles |
| C | Microscopio compuesto de B01 (sin cambios) |
| D | **Área de preparación animal**, caja de hisopos estériles, **fuente virtual de epitelio** (sin muestra real); caja de láminas fijas (cebolla asignada; maíz no asignado) |
| E | Estereoscopio con hoja e insecto (ruta opcional S16) |
| F | Bandeja de limpieza (admite todas las láminas: dos columnas por tres filas y luego apiladas); libreta y cierre |

## Arquitectura

```text
src/simulation/specimens/thin-section.ts   corte, raspado, hisopo, extendido; qué deja ver la preparación (nunca agrega)
src/simulation/specimens/stain-model.ts    recetas por muestra, contacto del Lugol, elección del activo por condición
src/simulation/specimens/assets.ts         manifiestos B02 (visible / inferido / no evaluable) y sus variantes
src/simulation/cell-world/                 mundo B02: envuelve dispatchB01 y agrega fuentes, tabla, herramientas con
                                           restos, hisopos, zonas por lámina, libros de colorantes y de biomasa
src/practices/practice-b02/                definición, parámetros, 18 escenarios, 68 errores (CEL01–CEL68), libreta
                                           (11 cuadros + 10 preguntas), evidencia, máquina XState, rúbrica, reanudación
src/engine/optical/cellController.ts       gestos de tejido sobre el controlador de B01 (hooks spots/floorAt/sharedSpot)
src/engine/optical/objects3dCell.ts        fuentes, tabla, espátula, hisopos, fuente de epitelio, residuos comunes
src/engine/instruments/optical/illustrationsCell.ts   parénquima (cromoplastos, almidón, esclereidas) y frotis bucal
src/app/b02/                               store, simulación (sim.ts), paneles, libreta, revisión, demo
src/locales/es/practiceB02.json            textos (`b02.*`, `b02fb.*`); el motor sigue usando `b01.cmd/hint/part/grip`
```

El motor óptico se generalizó sin cambiar B01: `OpticalHost` acepta `stations`, `roomVariant` y `createController`;
`OpticalRuntime<W>` recibe una `OpticalSim` (`dispatch`, `step`, `summary`), por defecto la de B01. B01 conserva todas
sus pruebas (unidad, integración, repetición y e2e).

## Mundo celular

- **Zonas por lámina** (`m:<muestra>:<n>`, controles `ctl:`): hasta tres por portaobjetos, separadas ≥ 0,6 cm
  (CEL11 si se superponen). Cada zona guarda preparación, espesor, área, desgarro, masa y activo.
- **Herramientas con restos**: bisturí, espátula y pinza conservan la muestra que tocaron hasta limpiarlas con papel
  de lente; usarlas sobre otra muestra contamina (CEL10). La punta del gotero que toca tejido queda contaminada (CEL29).
- **Libros conservados**: agua y cada colorante (inicial = frascos + montajes + residuos + derrames + evaporado) y
  biomasa (fuentes + tabla + herramientas + montajes + residuos). Tolerancia 1e-6.
- **Recursos**: asignación de muestras por semilla (la manzana nunca se asigna: CEL06), activos del docente (S17) y
  faltantes (S18 → incidencia `CEL68`, ítems de la rúbrica diferidos con `null`).

## Pruebas

| Archivo | Qué comprueba |
|---|---|
| `b02-flow.test.ts` | Ruta ideal sin errores (12 capturas válidas, nota 0,969), máquina de etapas, reanudación |
| `b02-errors.test.ts` | Un caso por código (CEL01–CEL68), catálogo completo, ruta ideal limpia |
| `b02-science.test.ts` | Espesor, raspado, hisopo, extendido, Lugol (contacto y exceso), resolución, conservación |
| `b02-locale.test.ts` | Textos de cada código, etapa, bandera, escenario, muestra, reactivo, ítem y estructura |
| `b02-demo.test.ts` | Demostración sin navegador con el `CellController`: un solo error deliberado (CEL14), 8 capturas válidas, cinta reproducible |
| `replay.test.ts` | Repetición determinista y calificación en el servidor (semillas 2202 y 31, con reanudación) |
| `e2e/b02.spec.ts`, `e2e/b02-demo.spec.ts` | Escena real: accesibilidad, papa con Lugol, frotis bucal y la demostración completa |

## Parámetros pendientes de calibración

Espesores, áreas, carga del hisopo, densidad del extendido, tiempo de contacto y umbral de exceso de Lugol son
**didácticos** (`params.ts`, estado `pending`); no son medidas de laboratorio. La resolución es la teórica de Abbe y
no se garantiza por una imagen. Sin micrómetro calibrado la libreta no admite escalas en µm (CEL54).
