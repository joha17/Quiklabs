# Laboratorio virtual · Práctica 2 — Clasificación de la materia y técnicas de separación

Simulador web **3D** en español para **Química General I** (Three.js + React Three Fiber + Rapier).
El estudiante **manipula** el material (arrastra, inclina para verter, agita, calienta, filtra, evapora, enfría):
no hay botones «Siguiente». Toda la cristalería, los líquidos y la sala se generan por código.

- **Parte A:** propiedades físicas de Zn, grafito, azufre, NaCl, sacarosa y aceite (6 tubos).
- **Parte B:** separación de carbón + KNO₃ (1:5) por disolución, filtración, evaporación y cristalización.

## Requisitos y comandos

Node 20+ (probado con Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # salida estática en dist/
npm run preview    # sirve dist/ en http://localhost:4173
npm test           # Vitest: núcleo científico (§17.1), geometría 3D sin DOM + integración (§17.2)
npm run test:e2e   # Playwright (§17.3): interacción 3D, 17.1-10, capturas por estación y calidad, axe-core
npm run lint       # ESLint (regla de arquitectura: simulation/ no importa Three, Rapier ni React)
```

> En Linux/macOS, para las pruebas e2e: `npx playwright install chromium` y quite `channel` en `playwright.config.ts`.
> Las capturas de las pruebas quedan en `e2e-shots/` (`estacion-<A–E>-<HIGH|MEDIUM|LOW>.png`, acciones, sala).
> Requiere un navegador con WebGL 2.

## Modos

| Modo | Descripción |
|---|---|
| Práctica | Retroalimentación de consecuencias y «qué revisar» en la libreta. Balanza para pesar la muestra. |
| Guiado | Pasos de la etapa actual, zonas de encaje visibles, pista tras dos revisiones, vial prepesado de 2,50 g. |
| Evaluación | Sin pistas ni correcciones hasta la entrega (sí alertas de seguridad). |
| Docente (depuración) | Panel con masas, fases, concentraciones, saturación, temperaturas, balance y eventos. |
| Demostración | Botón «Ver demostración» en la portada: el simulador hace la práctica completa, paso a paso y con explicaciones, usando los mismos gestos que el estudiante. Pausa, velocidad y saltar paso; al final, «Hacerlo yo» en modo Práctica o Guiado. No se guarda ni se evalúa. |

## Controles

| Acción | Ratón / táctil | Teclado |
|---|---|---|
| Elegir objeto | clic / toque | `Tab` (enfocar mesada) + flechas |
| Mover | arrastrar (se levanta sobre lo demás) | `Intro` tomar · flechas mover (`Mayús` = 5 cm) · `Intro` soltar · `Esc` cancelar |
| Verter (acople) | acercar el recipiente con contenido a uno receptor (probeta→tubo/vaso/cápsula/embudo, vaso→embudo/probeta, jarra→baño, papel o vial→vaso, cualquiera→residuos) y detenerse: se acopla con el pico sobre la boca. Mantener el clic derecho (o «Verter») lo inclina poco a poco; al soltarlo se endereza. Soltar el clic izquierdo lo deja de pie al lado | mantener `P`; `Q` / `E` ajustan |
| Inclinar a mano | rueda mientras se sostiene · botones ⟲ ⟳ (segundo dedo) | `Q` / `E` |
| Varilla / sonda (imán) | acercarlas a la boca del vaso: entran solas (la varilla sigue en la mano para agitar en círculos) | — |
| Vaso bajo el embudo | soltarlo cerca de la espiga del embudo montado: queda sobre la placa del soporte con la espiga tocando la pared | — |
| Papel absorbente | llevar la espátula sucia encima: se limpia sola · soltar el papel sobre un derrame: lo seca | — |
| Agitar | sacudir de lado a lado lo que se sostiene · varilla dentro + giros | mantener `A` |
| Espátula / pala (imán) | sin soltar el clic, acercar la punta a un frasco: se acopla, se inclina y carga sola; acercarla a un tubo o vaso: deposita. Sigue en la mano. Soltar sobre el papel absorbente la limpia | lo mismo con flechas mientras se sostiene |
| Gotero (imán) | acercarlo al frasco: aspira solo; acercarlo al tubo: se acopla a la boca y cada clic derecho suelta 1 gota. Soltarlo ahí lo deja en reposo (clic = 1 gota) | `P` = 1 gota |
| Piseta (acople automático) | si está en la mesada junto a la probeta (o a un vaso, tubo, cápsula o embudo), mantenerla pulsada o «Apretar» la acopla sola y la llena. Acercar la piseta a la probeta o al vaso, por cualquier lado: se alinea sola con la boquilla sobre la boca; mantener el clic derecho echa agua. Soltarla cerca la deja acoplada en reposo (mantenerla pulsada sin mover = agua; arrastrarla = separarla). También al revés: soltar la probeta o el vaso junto a la piseta lo encaja bajo la boquilla (la piseta se resalta antes de soltar) | mantener `P` |
| Plantilla | arrastrar la perilla hacia arriba/abajo · control deslizante | — |
| Cámara | arrastrar el fondo (orbitar) · botón derecho (desplazar) · rueda (zoom) · doble clic en un objeto (acercar) · un dedo en el fondo (orbitar) · dos dedos (zoom y desplazar) · botones A–E y panel ⟲ ⟳ ▲ ▼ ＋ － ⌂ | `1`–`5` estaciones · `J`/`L` orbitar · `I`/`K` inclinar la vista · `+`/`−` zoom · `0` restablecer |
| Leer la probeta | «👁 Nivel del ojo» alinea la cámara con el menisco (sin paralaje) | — |
| Calidad gráfica | Ajustes → Automática / Alta / Media / Baja | — |

## Arquitectura (§3.3)

```text
src/
├── simulation/   Dominio puro (sin DOM, sin Three/Rapier/React): mezclas, solubilidad, disolución,
│                 térmico, evaporación, cristalización, filtración, seguridad, balance, RNG con semilla.
├── engine/
│   ├── Lab3D.ts      Fachada del renderizador (lo único que la UI conoce del motor).
│   ├── units.ts      Conversión mesada (cm) ↔ escena (1 unidad = 1 cm, Y arriba).
│   ├── quality.ts    Niveles Alta/Media/Baja.
│   ├── scene/        Canvas R3F, sala, luces, cámara orbital (CameraRig), cuerpos Rapier, puente de interacción.
│   ├── renderers/    Cristalería lathe, líquidos recortados, sólidos/cristales instanciados, papel, texturas.
│   ├── physics/      Geometría de vertido (volumen bajo un plano), dimensiones, soportes y encaje.
│   ├── interaction/  Gestos → comandos (arrastre, inclinación, vertido, agitación, herramientas).
│   └── effects/      Animaciones de acción, partículas, chorro, vapor, audio.
├── app/          React: HUD, acciones, libreta, diálogos, revisión, persistencia, i18n, store (Zustand).
│   └── demo/     Demostración automática: director (mano virtual), guion de la práctica y panel.
├── practices/practice-02/
│                 definición (inventario y disposición), instruments.ts (perfiles de cristalería),
│                 sustancias y curvas, parámetros, máquina XState, evidencia, rúbrica, resultados y errores.
├── locales/es/   Textos (i18next).
└── tests/        unit/ · integration/ · e2e/ (interacción, visuales por estación y calidad, rendimiento)
```

- El dominio avanza con **paso fijo de 20 Hz** (`runtime.advance`); Rapier con su propio paso de 60 Hz.
  Ninguno depende de los fotogramas.
- `gesto → comando → dominio → estado + eventos → escena`. La escena solo **lee** el estado y emite hechos
  geométricos (ángulo de inclinación, impacto del chorro, golpe) como comandos; el dominio decide las consecuencias.
- La física y la animación nunca cambian masa ni composición: el balance es idéntico con y sin escena 3D (prueba 17.1-10).
- Determinismo: misma semilla + mismos comandos ⇒ mismo resultado (prueba 17.1-9).

Documentación adicional: [docs/DECISIONES.md](docs/DECISIONES.md), [docs/SUPUESTOS_CIENTIFICOS.md](docs/SUPUESTOS_CIENTIFICOS.md),
[docs/ACCESIBILIDAD.md](docs/ACCESIBILIDAD.md), [docs/RENDIMIENTO.md](docs/RENDIMIENTO.md).

## Configuración científica

- Sustancias, curvas de solubilidad y propiedades: `src/practices/practice-02/substances.ts`.
- Constantes del modelo (térmicas, filtración, cristalización, seguridad): `src/practices/practice-02/params.ts`.
- Recipientes (capacidades, conductancias, áreas): `src/simulation/entities/vessel.ts` (`VESSEL_DEFAULTS`).
- Dimensiones de la cristalería 3D (perfiles de revolución, cm): `src/practices/practice-02/instruments.ts`.
- Resultados de referencia (§9): `src/practices/practice-02/expected-results.ts`.

## Persistencia y privacidad

El intento (mundo, libreta, semilla, registro de acciones, estado del flujo) se guarda en `localStorage`
cada 5 s y al ocultar la pestaña. Al reanudar se restaura **en pausa**. No hay servidor ni cuentas.
El registro y la libreta se pueden exportar en JSON desde la libreta y la pantalla de revisión.

## Página de inicio

La aplicación abre con la **página de inicio de Quiklabs** (`src/app/landing/`). Detrás del contenido hay una escena
**Three.js en dibujo lineal** (`scene/LabBackdrop.ts`) que la cámara recorre con el scroll: un matraz gigante vertiendo,
una **valoración HCl/NaOH con fenolftaleína** cuyo pH se calcula de verdad (`scene/titration.ts`) y avanza con el
scroll o con los botones de la tarjeta, una mesada isométrica y moléculas. Incluye una galería de capturas reales del
simulador (`public/landing/*.webp`), las prácticas con su botón de entrada, capacidades, pasos y una sección para
docentes. Textos en `src/locales/es/landing.json`; fuente Nunito local (`@fontsource-variable/nunito`). Sin WebGL la
página funciona igual, sin la escena; con «reducir movimiento» la escena queda quieta.

**Modo oscuro:** la portada sigue el modo del sistema y tiene un botón sol/luna que lo fija para toda la aplicación
(`src/app/theme.ts`: `data-theme` en `<html>`, recordado en este navegador). En oscuro, la escena 3D se rehace como un
«plano técnico»: papel casi negro verdoso, líneas claras y los mismos acentos.

## Plataforma académica (beta)

El acceso es por **licencia universitaria**: no hay registro; la administración crea las cuentas (o importa el padrón) y
los estudiantes entran mientras estén matriculados. Roles: administración, docente y estudiante, cada uno con su panel.
Backend en el mismo Worker de Cloudflare (Hono + base de datos D1, esquema en `migrations/`, datos ficticios en `worker/seed/seed.sql`). Cuentas de prueba,
módulos, desarrollo y despliegue: [docs/BETA.md](docs/BETA.md).

## Práctica 3 — Mechero de Bunsen y prueba de cationes a la llama

La aplicación abre con un **menú de laboratorios**; desde ahí se entra a la Práctica 2 o a la Práctica 3
(también por enlace directo: `#p2`, `#p3`). La Práctica 3 usa la misma pila (R3F + Rapier, XState, Zustand,
i18next) y la misma estructura (dominio puro → comandos → escena), con modos Práctica, Guiado, Evaluación y Docente.
Detalles, supuestos científicos y accesibilidad: [docs/PRACTICA3.md](docs/PRACTICA3.md).

## Práctica 4 — Reacciones químicas

Neutralización, precipitación (CaCO₃ y Fe(OH)₃), redox Fe/Cu²⁺ y combustión e hidratación del Mg, con editor de
ecuaciones validado por átomos y carga, clasificación de residuos y demostración automática (`#p4`).
Detalles, supuestos científicos y accesibilidad: [docs/PRACTICA4.md](docs/PRACTICA4.md).

## Práctica 5 — Relaciones estequiométricas

Descomposición térmica del KClO₃ con MnO₂: balanza de triple brazo (calibración, pesadas por diferencia, fiel que
oscila), mezcla segura, montaje inclinado, calentamiento gradual hasta masa constante, análisis dimensional y
rendimiento porcentual calculado con las masas medidas; demostración automática (`#p5`).
Detalles, supuestos científicos y accesibilidad: [docs/PRACTICA5.md](docs/PRACTICA5.md).

## Práctica 6 — Calorimetría

Calor específico del hierro y de un metal incógnito con un calorímetro de vaso (agua y metal por diferencia, menisco,
baño en ebullición, traslado, agitación y máximo de temperatura), modelo ideal y corregido, incertidumbre e
identificación con z, y una bomba calorimétrica virtual opcional con enclavamientos; demostración automática (`#p6`).
Detalles, supuestos científicos y accesibilidad: [docs/PRACTICA6.md](docs/PRACTICA6.md).
