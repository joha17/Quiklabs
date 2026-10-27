# Biología B01 — Del preparado a la observación

Primera práctica de **Biología General**: microscopía y estereoscopía experimental. El estudiante prepara un montaje
húmedo de *Elodea*, lo observa con el microscopio compuesto de 4X a 40X manipulando cada mando, toma una lámina fija de
una caja y la devuelve a su ranura, y observa una hoja y un insecto con el estereoscopio. Misma base que las prácticas de
Química (React Three Fiber, XState v5, Zustand, i18next, Vitest y Playwright).

**El instrumento 3D es la interfaz** (revisión del 26-10-2026): cada mando se toma con el ratón en su lugar y se gira
o desliza sobre su pivote (perillas, revólver, palancas de la pinza y del iris, mandos X/Y, oculares, carro y zoom del
estéreo). El panel de acciones queda como alternativa accesible y emite los mismos comandos del dominio.

```text
M_total = M_ocular × M_objetivo            10X × 4/10/40 = 40/100/400X
FOV ≈ FN / M_objetivo (mm)                 FN = 18 mm HIPOTÉTICO → 4,50 / 1,80 / 0,45 mm
d ≈ 0,61 λ / NA                            λ = 550 nm, NA = 0,65 → ≈ 516 nm (teórico; no lo garantiza una imagen)
nitidez = exp(−½ (error de foco / σ)²)     σ por objetivo: curva VISUAL, no profundidad de campo real
```

> **Imágenes del ocular: ilustraciones didácticas generadas por el sistema, no microfotografías.** El modelo de
> manifiesto versionado (§4.3) ya está en el dominio; la biblioteca para que el docente o la administración suban
> fotografías reales (almacenamiento de objetos + pantallas) queda para una iteración siguiente.

## Acceso e identificador

Panel de la plataforma (tarjeta en el área **Biología**) o enlace `#b01` cuando el curso la tiene abierta. Las prácticas
de Biología usan el prefijo **`b`** (`b01`…`b10`); Química conserva `p01`, `p2`–`p10`. Migración
`0010_course_labs_b01.sql`; en la semilla, curso **Biología General I** (`c_bg1_01`, docente Dra. Méndez, dos
estudiantes) con `b01` abierta desde el 2026-10-20. El identificador de intento `b01-<semilla>-<marca>` lo acepta la
calificación del servidor.

| Estación | Contenido |
|---|---|
| A | EPP (bata, calzado cerrado, cabello recogido, manos limpias; guantes opcionales), contenedor de vidrio roto, residuos biológicos |
| B | Área de montaje, placa con *Elodea*, dos portaobjetos, caja de cubreobjetos, gotero de agua destilada y de lugol (no asignado), pinza fina, bisturí, papel absorbente, papel de lente, toalla |
| C | Microscopio compuesto binocular (proporciones de un LX 400): cabezal a 30° con distancia interpupilar y dioptría, revólver inclinado 4X/10X/40X, platina mecánica con pinza de palanca y mandos coaxiales X/Y, macro y micro coaxiales a ambos lados, condensador de Abbe con iris y perilla de altura, lámpara LED con rueda de intensidad e interruptor |
| D | Caja de láminas fijas (12 ranuras): epidermis de cebolla teñida (asignada), tallo de maíz y raíz de *Ranunculus* |
| E | Estereoscopio de zoom (proporciones de un Luxeo 6Z): base con platina que se ilumina desde abajo, columna con carro (altura del cabezal) y cremallera de enfoque que sube y baja el cuerpo óptico, zoom 0,7–4,5X a ambos lados, cabezal a 45° con oculares deslizantes y dioptrías en cada ocular, anillo de luz incidente y diales de luz; hoja vegetal e insecto |
| F | Bandeja de limpieza; libreta y cierre del puesto |

## Arquitectura (módulos compartidos para las próximas prácticas de Biología)

```text
src/simulation/instruments/optical/   microscopio (tipos y modelo: aumento, campo, platina, foco, separación, luz,
                                      revólver), estereoscopio (zoom, foco, luz, binocular), caja de láminas
src/simulation/specimens/             montaje húmedo (gotas, cubreobjetos y burbujas, hidratación, daño, contaminación),
                                      balance del líquido, manifiestos de activos con regiones anotadas
src/simulation/optical-world/         mundo de B01: tipos, comandos (hechos del gesto), eventos, geometría, 68 errores
src/practices/practice-b01/           definición, parámetros con estado de calibración, 18 escenarios y 68 errores,
                                      libreta (8 cuadros + 7 preguntas), evidencia, máquina XState, rúbrica, reanudación
src/engine/optical/                   fachada OpticalLab3D, controlador de gestos (piezas tomadas, resorte del revólver y
                                      de la pinza, envío cuantizado por fotograma), escena, cámara
src/engine/optical/parts.ts           registro de piezas: agarre (perilla, palanca, deslizamiento, pulsador), volúmenes
                                      sobre la pieza y tabla KIN ángulo visible ↔ magnitud del dominio
src/engine/optical/gestures.ts        geometría del arrastre: tangente proyectada del punto tomado / eje en pantalla
src/engine/optical/models/            CompoundMicroscopeRig, StereoMicroscopeRig (piezas articuladas, conjuntos rígidos
                                      fusionados por material) y utilidades de geometría
src/engine/instruments/optical/       ilustraciones procedurales y vista del ocular (solo presentación)
src/app/b01/                          store, runtime, HUD, panel de acciones, ocular, libreta, seguridad, revisión, demo
src/locales/es/practiceB01.json       textos (`b01.*`, `b01fb.*`)
```

## Modelo (curricular, `scientificMode: 'curricular'`)

| Proceso | Modelo |
|---|---|
| Platina y foco | Altura de la platina = Z₀ + 2 mm/vuelta (macro) + 0,1 mm/vuelta (micro, ±1 mm); plano focal fijo por objetivo con holgura parfocal; el error de foco y la separación objetivo–preparación salen de la pila (portaobjetos 1 mm, película de líquido, cubreobjetos 0,17 mm) |
| Separación y choque | Distancia de trabajo 17 / 7 / 0,6 mm `pending`. Bajo 0,3 mm: banda persistente y el macro no acerca más; ≤ 0: choque (daño, vidrio roto, accidente consumado) |
| Iluminación | Luminancia = luz × (0,35 + 0,65·diafragma) × condensador; bandas útiles por objetivo; contraste penalizado fuera de banda (visual, no fotométrico) |
| Revólver | Enclavamientos cada 120°, vuelta completa (de 4X hacia atrás llega el 40X); entre posiciones no hay objetivo operativo. Al soltarlo a ≤ 12° de una posición, el resorte lo encaja |
| Gestos | `gesture begin/end` alrededor de cada arrastre; los pasos se envían cuantizados una vez por fotograma. E22 suma las vueltas de macro a 40X del gesto; E34 compara con la vista del inicio del gesto |
| Binocular | Compuesto y estéreo: distancia interpupilar y dioptrías en el estado; no cambian aumento ni nitidez de la muestra (E77, E78). En el compuesto, una separación lejos de la del usuario muestra dos círculos en el ocular |
| Platina X/Y | El centro del campo en la muestra = −(X, Y) − desalineación de la lámina; la imagen del compuesto se dibuja invertida |
| Montaje | Gota 0,03–0,07 mL según la fuerza; burbujas f(ángulo, velocidad, líquido) con posiciones del RNG serializable; fragmento > 1,6 cm no cabe bajo la cubierta; exceso > 0,12 mL flota; evaporación y deshidratación con paso fijo |
| Observación | Registrar exige mirar 1,5 s sin tocar los mandos; vale si hay objetivo enclavado, luz en banda, nitidez ≥ 0,6, tejido en el campo, sin burbuja en el centro y montaje útil. Las estructuras visibles son las regiones anotadas que corta el campo y que el manifiesto declara observables a ese aumento |
| Estereoscopio | Campo = 22 mm / zoom; enfoque por cabezal + perilla; luz incidente para opacos y reflejo con incidente intensa; con imagen mono la vista es «2D»; el ajuste binocular solo cuenta con par L/R (S15) |
| Conservación | Líquido: inicial = goteros + montajes + residuos + derrames + evaporado (error < 1e-6 mL). Piezas: cubreobjetos y portaobjetos se cuentan, rotos incluidos |

## Errores, escenarios y rúbrica

- 78 errores (`error-scenarios.ts`) con disparador, efecto, evidencia y `b01fb.Enn`: `E01`–`E68` de la primera versión
  y `E69`–`E74`, `E77`–`E79`, `E83` de la manipulación directa (macro acercando mientras se mira por el ocular, macro a
  40X hasta la zona de choque, revólver soltado entre posiciones o girado tirando de un objetivo, pinza sobre una lámina
  fuera de su asiento, carro contra su tope, interpupilar o dioptrías usadas para enfocar, objetivo mayor sin distancia
  de trabajo, zoom sin recentrar). Los casos propuestos que repetían un error existente se registran con ese código
  (`ERROR_ALIASES_B01`). E60–E62 son de la libreta. Cada error tiene una fixture que ejecuta el gesto y comprueba la
  consecuencia (`b01-errors.test.ts`, 78/78).
- 22 escenarios `B01-S01`…`S22` que solo cambian el estado inicial (residuo, hoja grande, gotero limitado, montaje sin
  agua, cubreobjetos tomado plano, luz baja, condensador, platina descentrada, pinza cerrada, 40X al inicio, láminas
  parecidas, dos planos focales, insecto brillante, estereoscopio desenfocado, par L/R, 2D declarado, etiquetas en
  clave, reanudación a mitad del montaje, cámara de costado, revólver entre posiciones, lámina torcida bajo la pinza,
  estéreo con zoom alto y enfoque en el tope). La ruta ideal pasa en los 22 sin errores (`b01-flow.test.ts`).
- Rúbrica 15/20/25/10/10/20 (seguridad, preparación fresca, microscopio, láminas fijas, estereoscopio, libreta). Un
  choque consumado anula solo la seguridad; las respuestas abiertas quedan para el docente.

## Demostración

Catorce secuencias (§16) con la mano virtual sobre el controlador real; los mandos se toman y se giran por el mismo
camino que el ratón (el revólver gira de a 12° hasta encajar, la palanca de la pinza se empuja): EPP y partes; hoja de *Elodea* al centro; gota y
**recuperación controlada** (cubierta casi plana y de golpe → burbujas → se levanta y se baja inclinada y lenta);
encendido en 4X; pinza; mirar de lado y enfocar con el macro; micro y registro; 10X y 40X; libreta; estacionar y
retirar; lámina fija y su ranura; hoja e insecto al estereoscopio; cierre. Termina con un solo error (E10, el
deliberado) y su cinta se repite por el dominio (`b01-demo.test.ts`).

## Accesibilidad

Con el ratón: clic sostenido sobre la pieza y arrastre (la rueda del ratón sobre una perilla también la gira); al pasar
aparece el nombre de la pieza y el gesto. Cada gesto tiene equivalente en el panel de acciones (pinza, gotero con fuerza
y lugar, bisturí, papeles, cubreobjetos con inclinación y velocidad, caja, cierre; los mandos de ambos instrumentos,
plegados bajo «Mandos accesibles», con la preferencia recordada) y en el teclado (flechas, Intro, P, Q/E sobre el mando
seleccionado con un clic o la inclinación, O ocular, C registrar, L mirar de lado, 1–6 estaciones). Paridad probada en
`b01-input-parity.test.ts`. El ocular tiene
alternativa textual de estado operativo (objetivo, luz, enfoque, muestra) sin nombrar estructuras. axe-core sin
violaciones graves en la portada de la práctica, el laboratorio y la libreta.

## Pruebas de la revisión

`b01-focus-kinematics.test.ts` (vueltas → mm, enclavamientos, ida y vuelta del carro, binocular que no enfoca, gestos
juzgados enteros), `b01-input-parity.test.ts`, `b01-replay-after-upgrade.test.ts` y `b01-mouse.spec.ts` (Playwright:
los dos equipos operados solo con `page.mouse` sobre las piezas, sin el panel).

## Pendiente

- **Fase 2 — fotografías reales:** carga y asignación por docente/administración, almacenamiento, manifiesto con
  planos focales y escala, renderizado fotográfico del ocular según el estado, incidencias no penalizables por falta de
  activo; S23 depende de ello. Hasta entonces el ocular usa ilustraciones declaradas.
- Resaltado discreto de la pieza siguiente en el modo Guiado (hoy el guiado indica el paso con texto).
- E86 (afirmar relieve binocular con una foto 2D) necesita un campo de la libreta que aún no existe.

## Pendiente de validación

Número de campo, aperturas numéricas, distancias de trabajo, pasos de los mandos, curva de nitidez, bandas de luz,
volumen de gota, modelo de burbujas, recorridos del cabezal binocular y cotas de los equipos 3D (proporciones tomadas
de vistas publicitarias, sin medidas): valores `pending`/`hypothetical` en `params.ts` (con su fuente). Bloquean una
Evaluación institucional con validez óptica, no el uso como prototipo docente. La especificación no autoriza el uso en
producción sin esa revisión.
