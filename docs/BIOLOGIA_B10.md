# B10 · Tejidos animales y anatomía comparada

Décima práctica de Biología, sobre las mismas físicas, mesada y motor óptico de B01–B09. Va del tejido al organismo: láminas fijas, muestras pequeñas al estereoscopio, modelos 3D rotulables, aves, cráneos y huellas.

## Arquitectura

Inyección en capas: `dispatchAnimal → dispatchDiv → dispatchCell → dispatchB01`.

- Dominio: `src/simulation/animal-world/` (`catalog`, `codes`, `materials`, `geometry`, `commands`, `world`, `types`). No importa three ni react.
- Activos: `ANIMAL_ASSETS` en `specimens/assets.ts` y `engine/instruments/optical/illustrationsAnimal.ts`.
- Práctica: `src/practices/practice-b10/`.
- Motor: `src/engine/anatomy/` (`kit`, `specimens`, `tracks`, `AnatomyViewer3D`) y `src/engine/optical/{animalController,objects3dAnimal}.ts`.
- Interfaz: `src/app/b10/`. `AnatomyPanelB10` es el visor; `BenchPanelB10`, la mesa de clasificación.

## Estaciones

| Estación | Contenido |
|---|---|
| A | Hipótesis, EPP, residuos y mesa de orientación (clasificar material e instrumento) |
| B | Microscopio y láminas fijas de tejidos |
| C | Estereoscopio con Daphnia y piojo |
| D | Montaje fresco de músculo crudo, solo con su escenario |
| E | Estantes de invertebrados, vertebrados y aves |
| F | Cráneos, bandeja de huellas y cierre |

## Lo que evalúa

- **Rótulos con el modelo a la vista.** `viewVector` decide qué regiones miran a la cámara; lo que está de espaldas se rechaza (`REGION_HIDDEN`) y deja `WRONG_VIEW_LABEL`.
- **Errores.** 98 códigos `TA-NN` y seis incidencias `TA-ASSET-*`, que no descuentan. `b10-errors.test.ts` comprueba que todos se disparan con un gesto o una libreta real.
- **Escenarios.** 35 (`TA-S01..35`); `b10-flow.test.ts` recorre cada uno por la ruta ideal.

## Ciencia que se cuida

- La vaca no tiene incisivos superiores: lleva rodete dentario. Sus caninos inferiores son incisiformes, y también tiene diastema.
- El caballo tiene incisivos superiores, canino solo en algunos y un diastema largo.
- Colmillo no es cualquier diente puntiagudo: solo el cerdo lo lleva rotulado.
- Las esponjas no tienen tejidos verdaderos. Los arácnidos no separan cabeza y tórax. El nematodo no está segmentado.
- Daphnia es un crustáceo y el piojo, un insecto.
- Las estriaciones solo se resuelven a 40X, y los discos intercalares solo en el activo que los resuelve.
- La imagen del microscopio sale invertida, como en el equipo real.

## Límites conocidos

- **Sin subida de GLB/GLTF.** Los modelos son procedurales (ver PTA-2 en `DECISIONES.md`).
- **Ilustraciones didácticas, no microfotografías.** El docente puede cambiarlas por fotos con `photo-slots`. Medusa, estadios de escifozoo y esponja siguen siendo los esquemas más simples.
- **Caja de 12 ranuras** en lugar de la capacidad base 18 de la guía.
- **Parámetros `hypothetical` y dentición `pending`:** falta la revisión docente.

## Migración

`migrations/0020_course_labs_b10.sql` registra el laboratorio. Se aplica en remoto antes de hacer push.
