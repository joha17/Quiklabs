# Guía para especificar y construir un laboratorio de Quiklabs

Documento base para quien **levanta los requerimientos técnicos** de una práctica nueva y para quien la programa.
Resume cómo están hechas las Prácticas 2, 3, 4, 5, 6 y 10: tecnologías, arquitectura, modelo físico, reglas
pedagógicas, pruebas, integración con la plataforma y los tipos de decisiones que se toman en el camino.

La referencia más completa y reciente es la **Práctica 10** (`docs/PRACTICA10.md`). Úsela como ejemplo de cada
archivo mencionado aquí.

---

## 1. Qué es un laboratorio de Quiklabs (principios que no se negocian)

1. **Se manipula, no se hace clic en «Siguiente».** El estudiante arrastra, inclina, vierte, agita, calienta, pesa y
   lee instrumentos en una mesada 3D. La práctica avanza cuando el **mundo** muestra evidencia de que una etapa se
   cumplió, nunca por un botón de avance.
2. **La ciencia vive en un dominio puro y determinista.** Masas, concentraciones, temperaturas, presiones y
   reacciones se calculan en TypeScript sin DOM, sin Three.js y sin React. La escena 3D **solo dibuja** el estado y
   **solo informa hechos geométricos** (poses, ángulo de inclinación, impacto, altura del ojo).
3. **Los errores tienen consecuencias reales, no mensajes inventados.** Una burbuja en la pipeta da menos volumen y,
   por lo tanto, un resultado sesgado. La retroalimentación explica la consecuencia observada y su causa.
4. **Se evalúa con los datos del propio estudiante.** Los cálculos se corrigen contra lo que corresponde a las
   lecturas que obtuvo, no contra el valor ideal de la guía.
5. **Misma semilla + mismos comandos ⇒ mismo resultado.** Esto permite reanudar, verificar la nota en el servidor
   y repetir el intento completo.
6. **Todo tiene alternativa accesible.** Cualquier gesto se puede hacer con teclado o desde el panel de acciones.
   Las lecturas de los instrumentos están en texto, y el lienzo 3D nunca es la única vía.
7. **Ante una ambigüedad, se elige la opción más simple y segura** y se registra en `docs/DECISIONES.md`.

---

## 2. Tecnologías

| Capa | Tecnología | Uso |
|---|---|---|
| Lenguaje | TypeScript 6 estricto | Todo el código (cliente, dominio, Worker) |
| Empaquetado | Vite 8 | Desarrollo (`npm run dev`, puerto 5173) y build estático (`dist/`) |
| Interfaz | React 19 + Zustand 5 | HUD, paneles, libreta, revisión; un *store* por práctica |
| Flujo pedagógico | XState 5 | Máquina de etapas por evidencia (`workflow.machine.ts`) |
| 3D | Three.js 0.186 + React Three Fiber 9 + drei 10 | Escena, sala, cristalería procedural, cámara orbital |
| Física de objetos | Rapier (`@react-three/rapier` 2) | Caídas, apoyos y vuelcos (solo P2–P4; desde P5, apoyo por controlador) |
| Textos | i18next + react-i18next | `src/locales/es/practiceNN.json` (todo texto visible, también eventos) |
| Pruebas | Vitest 5 · Playwright 1.63 · axe-core | Unitarias, integración, repetición, e2e con GPU y accesibilidad |
| Calidad | ESLint 10 + typescript-eslint | Incluye la **regla de arquitectura** (ver §3) |
| Backend | Cloudflare Workers + Hono + D1 (SQLite) | Cuentas, cursos, matrícula, fechas, entregas y nota validada en el servidor |
| Despliegue | `wrangler` | `quiklabs.app`, `www.quiklabs.app` y `quiklabs.baconpunch.xyz` (dominios declarados en `wrangler.jsonc`; `workers.dev` desactivado) |

Restricciones de equipo objetivo: **GPU integrada** (p. ej. Intel Iris), navegador con WebGL 2, 1440 × 900.
Nada que no aporte información científica (bloom, SSAO, etc.) entra si encarece cada fotograma.

---

## 3. Arquitectura

```text
src/
├── simulation/          DOMINIO PURO: mundos, comandos, eventos, modelos científicos, instrumentos, RNG.
│   ├── core/            rng.ts (mulberry32 con estado serializable), math (hash estable)…
│   ├── instruments/     instrumentos reutilizables (balanza analítica, triple brazo, sensor de presión…)
│   ├── <modelo>/        ecuaciones de la práctica (p. ej. gas-laws/: gas ideal, vapor, hidrostática, Henry, ajustes)
│   └── <x>-world/       el mundo de la práctica: types.ts, commands.ts, events.ts, world.ts, geometry.ts
├── practices/
│   ├── practice-NN/     definición, parámetros, escenarios y errores, libreta, evidencia, máquina XState,
│   │                    rúbrica, resultados esperados, reanudación segura
│   ├── grading.ts       adaptadores de calificación y repetición (los usa el Worker)
│   └── tape.ts          formato de la cinta de comandos
├── engine/
│   ├── <x>/             fachada <X>Lab3D, host (lo que el motor pide a la app), controlador de gestos,
│   │                    objetos 3D procedurales, escena R3F, cámara por estación
│   ├── renderers/       materiales compartidos, lathe (cristalería de revolución), texturas, líquidos
│   ├── effects/         animaciones de acción, partículas, audio, etiquetas, estilo cel shading (Toon3D)
│   ├── scene/           sala (`room.ts`), luces, entorno, cuerpos Rapier
│   └── quality.ts       niveles Alta / Media / Baja
├── app/pNN/             store (Zustand), runtime (paso fijo + cinta + bitácora), HUD, panel de acciones, libreta,
│                        seguridad, revisión, persistencia, demostración (director + guion)
├── locales/es/          practiceNN.json
└── tests/               unit/ · integration/ · e2e/ · helpersNN.ts
worker/                  API (Hono), núcleo sin Cloudflare (core/), semilla (seed/)
migrations/              esquema D1 versionado (000N_*.sql)
```

### Regla de dependencias (ESLint la hace cumplir)

- `src/simulation/**` **no puede importar** `three`, `@react-three/*`, `@dimforge/*`, React, `engine/` ni `app/`.
- El Worker solo puede importar `src/simulation` y `src/practices` (nunca React, Three, XState ni la interfaz).
  Por eso la evaluación (`rubric.ts`) y la evidencia (`evidence.ts`) deben ser **funciones puras**.

### Ciclo de cada fotograma

```text
gesto (ratón / teclado / panel) → controlador → COMANDO → dominio (dispatch) → estado + eventos → escena (solo lee)
                                                   ↑
                         runtime.advance(dt): pasos fijos de 0,05 s (20 Hz), independientes de los fps
```

- El dominio avanza con **paso fijo** (`params.dtS = 0.05`). La aceleración del tiempo (×1/×2/×5/×10) ejecuta más
  pasos por fotograma, no pasos más largos. Se suspende sola mientras se vierte o se aprieta (precisión de medida).
- La física y las animaciones **nunca cambian masas ni composición**: el balance es idéntico con y sin escena 3D
  (prueba automática que reproduce en Node, sin escena, los comandos grabados en el navegador).

---

## 4. Anatomía de una práctica (archivos que hay que crear)

Ejemplo real: Práctica 10 (≈ 12 000 líneas en 96 archivos).

| Capa | Archivo | Contenido |
|---|---|---|
| Dominio | `simulation/<x>-world/types.ts` | `PNNWorld` (estado **serializable**: `tick`, `timeS`, `seed`, `rng`, `params`, objetos, líquidos, dispositivos, `evidence`, `events`, `scenarios`, totales iniciales para conservación) |
| | `commands.ts` | Unión discriminada `PNNCommand` (`{ type: 'tare' }`, `{ type: 'setPour'; sourceId; targetId; tiltDeg }`…) y `UNLOGGED_PNN_COMMANDS` (movimientos continuos que no van a la bitácora) |
| | `events.ts` | `emit` (evento con secuencia y tiempo), `latch` (una sola vez por clave), `flag` (marca de tiempo de evidencia), `bump` (contadores) |
| | `world.ts` | `createXWorld(spec, seed, params)`, `dispatchX(w, cmd)` → `{ ok, code }`, `stepXWorld(w)`, conservación (`elementTotals`), resumen para depuración |
| | `<modelo>/*.ts` | Ecuaciones con unidades explícitas (rechazar °C donde va K), cada una con su prueba |
| Práctica | `practice-NN/index.ts` | `newPracticeNNWorld({ mode, seed, scenarios?, params? })` |
| | `definition.ts` | Estaciones (A–F con objetivo de cámara), posiciones iniciales en cm, inventario, modo |
| | `params.ts` | `DEFAULT_PNN_PARAMS`: **toda constante configurable** con comentario de su origen y calibración |
| | `error-scenarios.ts` | Escenarios docentes (condiciones iniciales) y catálogo `SIMULATED_ERRORS_PNN` (código, grupo, evidencia que lo detecta) |
| | `notebook.ts` | Estructura de la libreta (cuadros, filas, unidades, lecturas importables, actividades) |
| | `evidence.ts` | `pNNStageEvidence(w, nb)` → banderas por etapa (las experimentales se **fijan** una vez cumplidas) |
| | `workflow.machine.ts` | Máquina XState: `INTRO → PPE_CHECK → LAB.{etapas} → SUBMISSION → REVIEW`, transiciones `always` con guardas por evidencia |
| | `expected-results.ts` | Lo que corresponde a las lecturas del estudiante (no el ideal) |
| | `rubric.ts` | `evaluatePNN(w, nb)` → componentes con pesos, ítems y claves de retroalimentación |
| | `resume.ts` | `sanitizeOnResumeNN(w)`: al reanudar, nada en la mano, vertidos detenidos, llaves cerradas |
| Motor 3D | `engine/<x>/<X>Lab3D.ts` | Fachada: lo único que React conoce del motor (cámara, controlador, audio, calidad, contexto por fotograma) |
| | `host.ts` | Interfaz que la app inyecta al motor (`runtime`, `t`, `select`, `notify`, `sound`, `reducedMotion`, `guidedHints`…) |
| | `controller.ts` | Gestos → comandos (arrastre, acoples, imán de herramientas, vertido, inclinación, teclado) |
| | `objects3d.ts`, `<X>Scene.tsx`, `CameraRigNN.tsx`, `layout.ts` | Modelos procedurales, escena R3F, cámara por estación |
| App | `app/pNN/store.ts`, `runtime.ts`, `persistence.ts` | Estado de UI, puente con el dominio (paso fijo, cinta, bitácora encadenada por hash), guardado |
| | `PNNApp`, `IntroScreenNN`, `LabScreenNN`, `HudNN`, `ActionPanelNN`, `NotebookPanelNN`, `SafetyPanelNN`, `ReviewScreenNN`, `InventoryNN`, `DebugPanelNN`, `describe.ts`, `feedback.ts` | Pantallas y paneles |
| | `demo/director.ts`, `demo/script.ts`, `DemoPanelNN.tsx` | Demostración automática con la «mano virtual» |
| Textos | `locales/es/practiceNN.json` | `pNN.*` (interfaz, eventos, etapas) y `pNNfb.*` (retroalimentación) |
| Pruebas | `tests/unit/pNN-science.test.ts`, `tests/integration/pNN-flow.test.ts`, `tests/integration/replay.test.ts`, `tests/e2e/pNN.spec.ts`, `tests/helpersNN.ts` | Ver §11 |
| Docs | `docs/PRACTICANN.md`, filas en `docs/DECISIONES.md`, `README.md` | Ver §13 |

---

## 5. Modelo de dominio (reglas de programación)

- **Estado serializable**: el mundo completo se guarda como JSON (localStorage y entrega). Nada de clases,
  funciones ni referencias circulares dentro del mundo.
- **Determinismo**: aleatoriedad solo con `rand(w)` (mulberry32, `simulation/core/rng.ts`) sobre `w.rng`. Nunca
  `Math.random()`, `Date.now()` ni nada que dependa de los fps dentro del dominio. El tiempo es `w.tick · dtS`.
- **Comandos con hechos, no con consecuencias**: la escena envía `setPour { tiltDeg }`, no «verter 3 mL». El caudal
  sale de la geometría (nivel frente al pico) y lo calcula el dominio.
- **Resultado de cada comando**: `{ ok, code }`. Un código de rechazo (`WRONG_TUBE`, `TOOL_EMPTY`…) tiene texto en
  i18n y la escena lo muestra; el dominio no conoce la interfaz.
- **Eventos**: `emit(w, code, severity, params)` con severidad (`info`, `warn`, `danger`, `critical`). Usar `latch`
  para avisos que deben salir una sola vez y `rearm` para volver a habilitarlos.
- **Evidencia** (`w.evidence`): contadores y marcas de tiempo (`flag`) que leen la máquina, la rúbrica y la revisión.
  Prefijos usados: `err:*` (error cometido), `latch:*`, `stage:*` (etapa fijada), `scenario:*`.
- **Conservación**: cada práctica declara su invariante (masa, elementos C/H/O/Na, átomos y carga…) y una prueba la
  verifica en todo el recorrido. El servidor también la revisa.
- **Parámetros**: todo número que un docente o un científico podría discutir va en `params.ts`, con el valor de
  referencia y por qué se eligió. Modos científicos cuando aplique (P10: **curricular** reproduce la guía con
  R ≈ −1 %; **realista** agrega Henry, ρ(T), transitorios y elasticidad, con R ≈ −12 %). El modo se muestra siempre.
- **Instrumentos reutilizables** en `simulation/instruments/` (balanza analítica, triple brazo, sensor de presión),
  con su vista en `engine/instruments/`. Si cambiar uno compartido altera resultados calibrados de otra práctica,
  esa práctica conserva su copia (decisión P6-2).

---

## 6. Física, geometría y unidades

| Tema | Regla |
|---|---|
| Unidades | 1 unidad de escena = **1 cm**. Mesada: x a lo largo (0–560 cm), y en profundidad (0–64 cm), z hacia arriba → escena (X = x, Y = z, Z = −y). Gravedad −981 cm/s². Todo en `engine/units.ts` |
| Cristalería | Perfiles de revolución (*lathe*) en cm: radio exterior, altura, pared y fondo (`instruments.ts`). El mismo perfil da el volumen ↔ altura (`liquidLevel`, integración por rebanadas) que usan el vertido, el líquido dibujado y las marcas de graduación (la marca de 10 mL encierra exactamente 10,0 mL; hay prueba) |
| Líquidos | La cavidad del recipiente recortada por un **plano horizontal del mundo** (sigue horizontal aunque el recipiente rote), con tapa de superficie y menisco |
| Vidrio | `MeshPhysicalMaterial` transparente con barniz y reflejos del entorno. **Sin `transmission`**: en Three.js el vidrio transmisivo ocultaba el líquido |
| Física de objetos | P2–P4: Rapier. Cinemático mientras está en reposo, en un soporte o en la mano; dinámico temporal al soltarlo sobre la mesada; al quedarse quieto escribe su pose (`setPose`). Golpes > 250 cm/s se informan al dominio (`drop`), que decide la rotura. Desde P5 los objetos **no caen**: el controlador los apoya en su soporte o en la mesada (más predecible y barato) |
| Soportes y acoples | Zonas de apoyo (placa, balanza, gradilla, baño) con radio de encaje; acople para verter (el pico queda sobre la boca y la pose se recalcula con la inclinación); «imán» de herramientas (espátula, gotero, piseta) que actúan sin soltar el clic |
| Selección | *Raycast* sobre **volúmenes invisibles simples** por objeto (y partes, como una perilla), nunca sobre la malla detallada |
| Paralaje | La lectura accesible del menisco depende de la altura real de la cámara (pendiente > 0,08 ⇒ ±1 división). «Nivel del ojo» alinea la cámara y da la lectura exacta |
| Tolerancias de gesto | Pulsar sin mover = acción; mover = levantar. Para objetos en reposo con acción propia (piseta) la tolerancia es mayor (14 px antes de apretar, 24 px apretando), porque en un panel táctil el cursor se corre al presionar |

---

## 7. Flujo pedagógico, modos y evaluación

### Modos (todas las prácticas)

| Modo | Comportamiento |
|---|---|
| Práctica | Consecuencias y «qué revisar» en la libreta |
| Guiado | Pasos de la etapa actual, zonas de encaje visibles, pista tras dos revisiones; puede simplificar insumos (p. ej. vial prepesado) |
| Evaluación | Sin pistas ni correcciones hasta la entrega (sí alertas de seguridad); descripciones sin valores exactos |
| Docente (depuración) | Panel con el estado interno (masas, fases, presiones, eventos, balance) |
| Demostración | El simulador hace la práctica con los **mismos gestos** que el estudiante (director que maneja el controlador real); no se guarda ni se evalúa |

El docente fija en la plataforma el modo exigido, la apertura y el cierre por curso.

### Máquina de etapas (XState)

- Estados `INTRO → PPE_CHECK (EPP obligatorio) → LAB.{etapas} → SUBMISSION → REVIEW`.
- Cada etapa avanza con una transición `always` cuya guarda es una **bandera de evidencia**. No hay eventos
  «siguiente». Se usa `history` para volver de la confirmación de entrega.
- Las etapas experimentales se **fijan** al cumplirse (vaciar el reactor no borra lo que ya se hizo).

### Libreta

- Cuadros con filas, unidades e incertidumbre por celda. Las **lecturas se importan solo después de observar el
  instrumento** (cada lectura tiene un id: `m…` masa, `v…` volumen, `t…` temperatura, `p…` presión, `h…` altura).
- Los **cálculos los escribe el estudiante**; la rúbrica detecta errores típicos (°C en lugar de K, signo de la
  altura, olvidar la presión de vapor, conversión de mmHg).
- Las respuestas abiertas se puntúan con heurísticas y se marcan «para revisión docente».

### Rúbrica

- Componentes con pesos que suman 1 (P10: seguridad y montaje 15 %, preparación 20 %, reacción 15 %, cálculo de R 20 %,
  Boyle 15 %, ajuste 10 %, actividades 5 %). Ítems con `ok: true | false | null` (null = revisión docente).
- Un **accidente anula** el puntaje de seguridad.
- Retroalimentación con **consecuencia primero** («El volumen de CO₂ salió 8 % bajo porque…») y clave `pNNfb.*`.

### Errores simulables

- Catálogo mínimo de **40 errores** por práctica (P10 tiene 62), agrupados (gravimetría, volumetría, gas, reacción,
  presión, seguridad…). Cada uno declara **qué evidencia lo detecta** (`err:*` en el mundo o `nb:*` en la libreta)
  y debe tener una consecuencia causal en los datos, probada en integración.
- **Escenarios docentes**: condiciones iniciales activables (balanza desnivelada, termómetro descalibrado, manguera
  doblada, sello dañado…).

### Seguridad

- EPP obligatorio antes de entrar.
- **Bloqueos críticos** como banda roja persistente con explicación y acción de recuperación (no un modal), para
  poder actuar sobre la mesada.
- Alertas de seguridad visibles en todos los modos.

---

## 8. Escena 3D, estilo visual y rendimiento

- **Todo es procedural**: cristalería, líquidos, equipos, rótulos (`CanvasTexture` que solo se redibuja si cambia
  el texto) y la sala (`engine/scene/room.ts`). No hay modelos descargados.
- **Sala**: recinto cerrado; la cámara no sale de él, no rodea por detrás de la mesada y tiene límites de distancia
  y ángulo. Estaciones A–F con vista predefinida; transición suave (instantánea con «reducir movimiento»).
- **Etiquetas de nombre** siempre visibles sobre cada objeto (17 px mínimo; ámbar el seleccionado).
- **Estilo** (en curso, empezando por la P2): *cel shading* (luz en tres bandas) y **contorno oscuro** alrededor de
  cada objeto del laboratorio, para que el vidrio transparente se distinga contra fondos claros
  (`engine/effects/Toon3D.tsx`; se marca cada objeto con `outlineObject` y la sala con `outlineOccluder`).
- **Calidad** Alta / Media / Baja (`engine/quality.ts`) con selección automática (4 s de calentamiento, 3 s de medida;
  < 28 fps baja un nivel). Ningún nivel cambia datos científicos.
- **Presupuesto verificado por prueba**: ≤ **200 llamadas de dibujo** y ≤ **500 000 triángulos** por estación y nivel.
  Usar *instancing* para granos, cristales, gotas y partículas; materiales compartidos por nivel; fusionar la geometría
  estática.
- **Carga diferida**: la escena (R3F + Rapier WASM, ~2,9 MB) se descarga al entrar al laboratorio.
- **Pérdida de contexto WebGL**: la escena se recrea desde el estado del dominio, que nunca se pierde.

---

## 9. Interacción y accesibilidad

- Ratón, táctil (un dedo sostiene y otro usa ⟲ ⟳) y **teclado**: `Tab` enfoca la mesada, flechas eligen objeto,
  `Intro` toma y suelta, flechas mueven (`Mayús` = 5 cm), `Q`/`E` inclinan, `A` agita, `P`/`Espacio` acción principal,
  `Esc` cancela; `1`–`5` estaciones, `J`/`L`/`I`/`K` cámara.
- **Panel de acciones** que repite todo con botones («mantener» funciona con puntero y teclado).
- **Lista de material en el DOM**: cada objeto es un botón que lo selecciona y lleva la cámara hasta él.
- **Descripciones** en `aria-live` del objeto seleccionado («Vaso 1: 9,6 mL, suspensión negra, 72,3 °C»). En
  Evaluación no se dan valores exactos. Los valores numéricos solo aparecen si el instrumento correspondiente lo mide.
- Subtítulos de sonidos, «reducir movimiento» (animaciones ≤ 0,15 s), gráficas con tabla equivalente.
- Auditoría axe-core sin errores graves ni críticos (prueba e2e).

---

## 10. Persistencia, cinta del intento y nota en el servidor

- El intento (mundo, libreta, semilla, bitácora, estado del flujo) se guarda en `localStorage` cada 5 s y al ocultar
  la pestaña. Al reanudar queda **en pausa** y se aplica `sanitizeOnResumeNN` (mismo código en app y repetición).
- La **cinta** `[tic, comando]` graba todo comando aplicado (incluidos los movimientos) y una marca `#resume`. Se
  guarda por bloques en IndexedDB.
- La bitácora de acciones con significado se **encadena por hash** (`previousHash`, `stateHash`).
- **Calificación en el servidor**: el cliente envía el estado final, las opciones y la cinta. El Worker recalcula la
  nota con la rúbrica (la del navegador no se usa), reconstruye el mundo inicial y compara semilla, parámetros y
  escenarios, revisa el reloj y la conservación, y comprueba el modo exigido. Los problemas se anotan, no rechazan
  la entrega. La repetición completa la hace el navegador del docente («Verificar intento»).
- Para esto cada práctica registra un **adaptador** en `src/practices/grading.ts`: `create`, `dispatch`, `step`,
  `sanitize`, `latch`, `evaluate`, `fixed`, `conserved`, `mode`.

---

## 11. Pruebas obligatorias

| Nivel | Archivo | Qué cubre |
|---|---|---|
| Unitarias | `tests/unit/pNN-science.test.ts` | Cada ecuación con su **caso de referencia** numérico de la especificación (p. ej. R ≈ 0,082057 con V ≈ 30,185 mL; P(5,0 mL) = 188,6 kPa) |
| Integración | `tests/integration/pNN-flow.test.ts` | Ruta ideal completa por comandos (sin escena) dentro de los rangos esperados con varias semillas; conservación; máquina y evaluación; cada error del catálogo con consecuencia causal; guardado |
| Repetición | `tests/integration/replay.test.ts` | Repetición determinista con reanudación a mitad |
| e2e | `tests/e2e/pNN.spec.ts` | Menú y axe, interacciones reales con ratón/teclado (las manipulaciones no usan atajos del dominio), capturas, presupuesto de dibujo |
| Plataforma | `tests/unit/platform-api.test.ts` | El nuevo `LabId` en cursos, matrícula y entregas |

`npm test`, `npm run lint`, `npm run build` (incluye verificación de tipos del cliente y del Worker) y
`npm run test:e2e` deben pasar antes de entregar.

---

## 12. Integración con la plataforma (lista de cambios)

1. `src/app/shell.ts`: agregar `pNN` a `LabId`, `ROUTES` e `isLab` (ruta `#pNN`).
2. `worker/core/types.ts`: agregar `pNN` a `LabId` y `LAB_IDS`.
3. `src/practices/tape.ts`: agregar `pNN` a `GradedLab`; `grading.ts`: adaptador, `GRADED_LABS` y la expresión de
   `seedFromAttemptId`.
4. **Migración** `migrations/000N_course_labs_pNN.sql`: SQLite no permite cambiar un `CHECK`, así que se reconstruye
   `course_labs` copiando los datos. **Aplicarla en producción antes de desplegar el código**:
   `npm run db:migrate:remote`.
5. `worker/seed/make-seed.mjs` → `npm run seed` (datos ficticios con la práctica abierta en algún curso).
6. `src/app/LabMenu.tsx` (tarjeta e intento guardado), `src/main.tsx` (asa `window.__pNN` para pruebas), paneles de
   estudiante y docente, textos `menu.labs.pNN`.
7. Despliegue: `git push` a `main` o `npx wrangler deploy` (dominios de `routes` en `wrangler.jsonc`; uno añadido solo desde el panel se borra al desplegar).

---

## 13. Tipos de decisiones (y cómo se registran)

Toda decisión que no sale literal de la especificación se agrega como fila en `docs/DECISIONES.md`
(`| # | Situación | Decisión |`, numeradas `PNN-1`, `PNN-2`…). Las categorías que aparecen una y otra vez:

| Tipo | Pregunta que resuelve | Ejemplos reales |
|---|---|---|
| **Correcciones de la guía** | La guía de laboratorio tiene un error científico o de nombre | Ecuación sin H₂O; altura hidrostática **con signo**; «Veinier» → Vernier; el GPS-BTA mide presión **absoluta** (no se le suma la atmosférica); balón de 100,00 mL y no de 50 |
| **Nivel de realismo** | ¿Qué fenómenos se modelan y cuáles se simplifican? | Modo curricular frente a realista (P10-2); KNO₃ técnico al 98,5 % para que las purezas surjan del balance; Arrhenius saturado para que la descomposición dure minutos (P5-3) |
| **Calibración** | ¿Qué constantes hacen que los tiempos y resultados sean razonables? | Reacción que termina en 1–2 min con agitación suave; compresión de 1 s que calienta ≈ 10 K y se relaja en ≈ 3 s; pérdidas del vaso ajustadas para que leer tarde cueste ≈ 0,15 °C |
| **Técnica con consecuencia** | ¿Cómo hacer que una buena práctica importe en los datos? | Balanza «estable» = ±2 divisiones durante 1,5 s con puertas cerradas; el fiel de la triple brazo oscila y solo vale quieto; sin agitar, el termómetro ve otra temperatura |
| **Jugabilidad frente a realismo** | El gesto real es incómodo con ratón | Herramientas con «imán» (decisión 61); acople automático de la piseta (62); apretarla nunca moja la mesada (65); tolerancia de movimiento al presionar |
| **Legibilidad visual** | Algo no se distingue en pantalla | Agua azul claro con menisco oscuro (66); contornos y cel shading para el vidrio; etiquetas de nombre siempre visibles (71) |
| **Seguridad** | ¿Qué se bloquea y cómo? | Banda roja persistente en lugar de modal (13); la placa se corta si se evapora un filtrado con carbón (14); el tapón salta a > 10 kPa sobre la atmosférica |
| **Evaluación** | ¿Contra qué se corrige? | Contra las lecturas del propio estudiante (P5-4); respuestas abiertas para revisión docente (21); un accidente anula seguridad |
| **Arquitectura y reutilización** | ¿Se reutiliza o se copia? | Mechero de la P3 como sub-mundo en P4 y P5; balanza compartida, pero la P5 conserva su copia calibrada (P6-2); sin caída física desde la P5 |
| **Rendimiento** | ¿Cabe en una GPU integrada? | Sin postproceso pesado (44); sala en Lambert en Media/Baja (55); fusionar geometría estática; presupuesto de llamadas |
| **Plataforma** | Datos, seguridad y despliegue | D1 frente a KV (PL-2); nota recalculada en el servidor (PL-3); repetición en el navegador del docente por el límite de CPU del Worker |

Criterio por defecto ante una ambigüedad: **la opción más simple y segura**, sin inventar datos científicos.

---

## 14. Plantilla de especificación (lo que debe entregar quien levanta los requerimientos)

Usar secciones numeradas (`§`) para que el código y las decisiones las citen.

1. **Identificación**: número, nombre, curso, duración esperada, partes (A, B…).
2. **Objetivos de aprendizaje** y qué debe poder hacer o concluir el estudiante.
3. **Fundamento científico**: ecuaciones balanceadas, fórmulas con unidades, constantes con su fuente
   (CRC, NIST, PubChem…), y **correcciones conocidas de la guía** (§13, «Correcciones de la guía»).
4. **Estaciones e inventario**: tabla por estación con cada objeto, capacidad, **dimensiones en cm** (diámetro, alto,
   pared) o perfil, resolución e incertidumbre de cada instrumento, y si es movible.
5. **Procedimiento por etapas**: para cada etapa, qué hace el estudiante y **qué evidencia observable** demuestra que
   la cumplió (esto se convierte en banderas y guardas de la máquina).
6. **Modelo físico por proceso**: tabla «proceso → modelo» (como en `docs/PRACTICA10.md`), con las simplificaciones
   permitidas y qué es configurable.
7. **Parámetros por defecto** y rango que el docente puede cambiar.
8. **Valores de referencia**: resultados de la ruta ideal con tolerancias (p. ej. R dentro de ±2 %), al menos un
   caso numérico resuelto a mano para las pruebas unitarias.
9. **Errores simulables** (mínimo 40): código, grupo, cómo ocurre, **consecuencia en los datos**, cómo se detecta
   (mundo o libreta) y texto de retroalimentación.
10. **Escenarios docentes**: condiciones iniciales activables (instrumento descalibrado, material dañado…).
11. **Seguridad**: EPP, acciones peligrosas, cuáles son bloqueo crítico, cuáles alerta, y la recuperación de cada una.
12. **Libreta**: cuadros (filas, unidades, incertidumbre), qué lecturas se importan, cálculos que escribe el
    estudiante, errores de cálculo típicos a detectar, actividades y preguntas abiertas.
13. **Rúbrica**: componentes, pesos (suman 100 %), ítems y qué anula puntaje.
14. **Interacciones**: gesto de cada acción con ratón, teclado y panel; qué se acopla solo; tolerancias.
15. **Accesibilidad**: lecturas en texto, alternativa a cada gesto, qué se oculta en Evaluación.
16. **Demostración**: guion paso a paso con la explicación de cada paso.
17. **Criterios de aceptación** verificables (tiempos, rangos, número de errores, rendimiento).

---

## 15. Lista de verificación antes de entregar

- [ ] `simulation/` sin imports de Three, React, Rapier, motor ni app (lint en verde).
- [ ] Mundo serializable; sin `Math.random`/`Date.now` en el dominio; determinismo probado con varias semillas.
- [ ] Conservación probada en todo el recorrido.
- [ ] Ruta ideal dentro de los valores de referencia; cada error del catálogo con consecuencia y prueba.
- [ ] Máquina avanza solo por evidencia; etapas experimentales fijadas.
- [ ] Rúbrica pura (la importa el Worker); adaptador en `grading.ts`; `sanitizeOnResumeNN`.
- [ ] Todos los textos en `practiceNN.json`; retroalimentación con consecuencia primero.
- [ ] Toda acción con alternativa de teclado y de panel; axe sin errores graves.
- [ ] Presupuesto ≤ 200 llamadas y ≤ 500 000 triángulos en las 3 calidades.
- [ ] `LabId` en cliente y Worker, migración aplicada en producción antes del deploy, semilla actualizada.
- [ ] `docs/PRACTICANN.md`, filas `PNN-*` en `docs/DECISIONES.md` y sección en `README.md`.
- [ ] `npm test`, `npm run lint`, `npm run build` y `npm run test:e2e` en verde.
