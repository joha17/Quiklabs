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
| Piseta (acople automático) | acercar la piseta a la probeta o al vaso, por cualquier lado: se alinea sola con la boquilla sobre la boca; mantener el clic derecho echa agua. Soltarla cerca la deja acoplada en reposo (mantenerla pulsada sin mover = agua; arrastrarla = separarla). También al revés: soltar la probeta o el vaso junto a la piseta lo encaja bajo la boquilla (la piseta se resalta antes de soltar) | mantener `P` |
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
