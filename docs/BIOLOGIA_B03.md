# Biología B03 — Fronteras celulares (membranas y permeabilidad)

Tercera práctica de **Biología General**: fronteras celulares. El estudiante monta él mismo membranas en cámaras de dos
compartimentos, prueba el sello, mide el paso de un trazador, dializa proteína y sal, compara agua con un jarabe por
ósmosis y observa *Elodea* en agua, NaCl 0,9 % y NaCl 5 % con el mismo microscopio compuesto de B01/B02. Lo que mide
sale de la membrana elegida, el apriete de la pinza, los volúmenes vertidos, el tiempo y el ángulo del ojo frente al
menisco: nada pasa ni se lee «solo».

**Reutiliza B01 y B02**: sala, microscopio de cuatro objetivos (4X/10X/40X/100X) y sus gestos, montaje húmedo,
observación y captura, runtime, cinta reproducible, calificación en el servidor, fotos del docente y demostración.
B03 agrega el transporte a través de membranas, la cristalería con vertido, la pipeta, los ensayos de Biuret y AgNO₃ y su
propia libreta, rúbrica y errores.

```text
Soluto:  dn/dt = P · A_util · (C_A − C_B)            P por material y soluto (cm/s), A_util = A · areaFactor
Agua:    J_v = Lp · A_util · (Δπ − ΔP)               Δπ = i·M·R·T (T en K), ΔP = ρ·g·Δh (columna de cada lado)
Sello:   fuga si vueltas < sealTurns; rotura si vueltas > tearTurns (película: paso convectivo no selectivo)
Humectación: P_efectiva = P · wet01 (la membrana seca deja pasar menos hasta humedecerse)
Lectura de volumen: v_leída = v + paralaje(ángulo del ojo); resolución de la escala por recipiente
Biuret:  violeta si proteína ≥ umbral tras el tiempo de desarrollo; AgCl visible si n(Ag⁺·Cl⁻) ≥ umbral
```

> **Modelo didáctico.** Permeabilidades, Lp, umbrales de los ensayos y respuestas de *Elodea* son valores de software
> (`params.ts`, estado `pending`), no medidas de un material real. Las imágenes del ocular son ilustraciones con manifiesto
> o fotos aprobadas por el docente.

## Acceso e identificador

Panel de la plataforma (tarjeta 13, área **Biología**) o enlace `#b03`. Migración `0013_course_labs_b03.sql`: reconstruye
`course_labs` y `lab_photos` para admitir `'b03'` en sus `CHECK` (SQLite no modifica un `CHECK`; los datos y las claves de
R2 se conservan). En la semilla, el curso **Biología General I** (`c_bg1_01`) tiene `b03` abierta desde el 2026-11-03.
Intentos `b03-<semilla>-<marca>`; la calificación del servidor reproduce la cinta con `dispatchPerm`.

| Estación | Contenido |
|---|---|
| A | Bandeja de membranas (diálisis D-12 en cinco lotes, poro ancho W-100, celofán no caracterizado, película plástica), plato de remojo, cámara 1 (difusión), frasco de trazador, colorímetro |
| B | Cámara 2 (diálisis), clara de huevo modelada, NaCl 5 %, probeta 1, gradilla con siete tubos, goteros de Biuret y AgNO₃ 0,1 M, pipeta de 5 mL y vaso de enjuague |
| C | Cámara 3 (ósmosis) con tapa, jarabes (asignado, concentrado y «light»), agua, probeta 2, termómetro |
| D | Área de preparación con *Elodea* y goteros de agua, NaCl 0,9 % y NaCl 5 %; portaobjetos y cubreobjetos |
| E | Microscopio compuesto de B01 (sin cambios) |
| F | Residuos químicos (Ag/Cu), vidrio roto, residuos biológicos y comunes; libreta y cierre |

EPP: bata, calzado cerrado, cabello recogido, manos limpias y **guantes obligatorios** (Biuret con cobre, AgNO₃).
`B01Params.ppeRequired` permite la lista por práctica sin cambiar B01/B02.

## Arquitectura

```text
src/simulation/membrane-transport/model.ts   flujo de soluto y de agua, π(T), presión hidrostática, Biuret y AgCl
src/simulation/perm-world/                   mundo B03: envuelve dispatchCell (B02 → B01) y agrega membranas, cámaras de
                                             dos lados, recipientes con solutos, vertido, pipeta, tubos rotulados,
                                             lecturas de instrumentos y libros conservados de agua y solutos
src/practices/practice-b03/                  definición, parámetros, 20 escenarios, 65 errores (PERM01–PERM65) + PERMRES,
                                             libreta (6 cuadros + 10 preguntas), evidencia, máquina XState, rúbrica, reanudación
src/engine/optical/permController.ts         gestos de B03 sobre el CellController (membrana a la junta, vertido con P,
                                             pipeta con Q/E, goteros en tubos, termómetro, lectura con el ángulo del ojo)
src/engine/optical/objects3dPerm.ts          membranas, cámaras (líquido por lado, pinza, tapa, charco), frascos y
                                             probetas que se inclinan al verter, pipeta, gradilla y tubos, colorímetro
src/app/b03/                                 store, simulación (sim.ts), paneles, libreta, revisión, demo
src/locales/es/practiceB03.json              textos (`b03.*`, `b03fb.*`); el equipo compartido usa `b02.*` / `b01.*`
```

El motor no cambió para B01/B02: `OpticalHost` agrega el opcional `eyeTargetOf(target)` (la cámara «ojo al menisco»
apunta al nivel real del líquido) y el runtime acepta el tipo de comando de B03, que es un superconjunto.

## Mundo de permeabilidad

- **Cámaras de dos lados**: cada lado es un recipiente con volumen y cantidades de agua, sal, trazador, glucosa y
  proteína. La membrana instalada fija el área útil (centrado), la humectación, la integridad y el sello (vueltas de la
  pinza). Con sello insuficiente hay fuga a la mesada y mezcla convectiva; por encima de la resistencia, rotura.
- **Prueba de fugas**: dos lecturas del mismo lado separadas por `leakTestS` sin cambio de nivel. Cargar solutos sin
  ella es PERM07.
- **Vertido y pipeta**: el frasco o la probeta vierte mientras se mantiene (P empieza, P detiene); la pipeta aspira el
  volumen elegido, deja una película que arrastra soluto si no se enjuaga (PERM27) y descarga entera.
- **Lecturas**: cada lectura queda registrada con instrumento, valor, unidad y momento; el volumen incluye el paralaje
  del ángulo real de la cámara (PERM40). La libreta **importa** esas lecturas, nunca valores ideales.
- **Tiempo acelerado**: es un pedido al dominio (`requestTimeScale`), rechazado mientras se vierte, se pipetea o se lleva
  una hoja (PERM18).
- **Libros conservados**: volumen y cada soluto (inicial = recipientes + derrames + residuos + evaporado). Tolerancia
  1e-6. Todos los valores del estado son finitos (el derrame tiene capacidad 1e9, no `Infinity`), porque el estado viaja
  como JSON y la repetición del servidor lo compara exacto.

## Pruebas

| Archivo | Qué comprueba |
|---|---|
| `b03-flow.test.ts` | Ruta ideal sin errores con conservación y nota > 0,85; máquina hasta COMPLETE; determinismo y reanudación |
| `b03-errors.test.ts` | Un caso por código (PERM01–PERM65 y PERMRES) con su consecuencia real, más extras |
| `b03-science.test.ts` | Referencias del modelo (REF-01..12), Biuret, Elodea y libreta vacía |
| `b03-locale.test.ts` | Textos de cada código, etapa, guía, bandera, escenario, rótulo, ítem, lectura y cada clave literal del código |
| `b03-demo.test.ts` | Demostración sin navegador con el `PermController`: un solo error deliberado (PERM02, la fuga), sello probado, siete tubos leídos y desechados, Elodea en tres medios, cinta reproducible |
| `replay.test.ts` | Repetición determinista y calificación en el servidor (semillas 3303 y 47, con reanudación) |

## Parámetros pendientes de calibración

Permeabilidades por material y soluto, Lp, vueltas de sello y de rotura, tiempos de humectación, de prueba de fugas,
de desarrollo del Biuret y de incubación, umbrales de color y de precipitado, y la respuesta osmótica de *Elodea* son
**didácticos** (`params.ts`, estado `pending`). Una concentración numérica del trazador solo es evaluable con curva de
calibración (PERM20). El 0,9 % no se declara isotónico para *Elodea* sin observarlo (PERM60).
