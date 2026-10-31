# B09 · Arquitectura vegetal: raíces, tallos, hojas y tejidos de sostén

Novena práctica de Biología, sobre las mismas físicas, mesada y motor óptico de B01–B08. Es estrictamente virtual: el ácido de la reacción de Wiesner solo se dosifica dentro de la zona ventilada y las imágenes del ocular son ilustraciones didácticas, no microfotografías.

## Arquitectura

Inyección en capas: `dispatchPlant → dispatchDiv → dispatchCell → dispatchB01`, y `stepPlantWorld → stepDivWorld`.

- Dominio: `src/simulation/plant-world/` (`model.ts` puro, `world.ts`, `commands.ts`, `types.ts`, `geometry.ts`).
- Activos: `specimens/assets.ts` (`plantManifest`, `PLANT_ASSETS`) y `engine/instruments/optical/illustrationsPlant.ts`.
- Práctica: `src/practices/practice-b09/`.
- Motor: `src/engine/optical/plantController.ts`, `objects3dPlant.ts`.
- Interfaz: `src/app/b09/`. `BenchPanelB09` agrupa plántulas (girar y rotular) y corte (sujetar, plano, grosor, región, presión y lavado).

## Estaciones y flujo

`INTRO → PPE_CHECK → LAB.{HYPOTHESIS, EXTERNAL, SECTIONING, SLIDES, FOLIAR, ANALYSIS, CLEANUP, COMPLETE} → SUBMISSION → REVIEW`, por evidencia. Las etapas logradas quedan fijadas, de modo que las rutas B a E admiten cualquier orden.

| Estación | Contenido |
|---|---|
| A | Hipótesis, EPP e inspección de microscopio y caja |
| B | Plántulas de fríjol y maíz con zonas rotulables, hojas, estereoscopio y rama leñosa |
| C | Apio, pera y hoja: corte a mano y montaje en fresco |
| D | Microscopio y láminas fijas de raíz, tallo, leño y hoja |
| E | Floroglucinol y ácido en la zona ventilada |
| F | Medidas, matriz organismo-sistema, residuos y cierre |

## Modelo

- R1–R7 puros en `model.ts`: aumento total, campo visual con FN 18 mm, longitud e incertidumbre, fracción de área y conservación de líquido y tejido (1e-9).
- `sectionQuality` es un índice didáctico: grosor, presión, sujeción, plano y región bajan la integridad o el área útil por causas separadas.
- Los manifiestos deciden qué se puede rotular: lo que un activo no resuelve (por ejemplo, células acompañantes, banda de Caspary) queda `unavailable`, y el cambium del activo base queda `inferred`.
- La pared lignificada solo aparece tras la reacción de Wiesner desarrollada; el corte sin teñir es el control.

## Errores, escenarios y rúbrica

- 72 errores `TV-NN` (53 del mundo, 17 de la libreta y 2 que la guía lista como errores, pero se tratan como incidencias) y 5 incidencias más sin descuento. `b09-errors.test.ts` falla si un error del mundo no tiene un gesto real que lo dispare.
- 26 escenarios docentes. Los que parten de un error a propósito (S11, S19, S20) se prueban aparte.
- Pesos: seguridad 15, corte y montaje en fresco 20, óptica 20, raíz y tallo 15, hoja 15, análisis 15. La ruta ideal obtiene 98,4 %; lo que falta son las respuestas abiertas, que revisa el docente.

## Límites conocidos

- Todas las imágenes del ocular son ilustraciones esquemáticas, y lo avisan en pantalla. Hay que sustituirlas por material docente validado si se quiere evaluar reconocimiento real de tejidos.
- Grosores, integridad, tiempo de desarrollo de Wiesner y escalas son hipotéticos (TV-DEC-06): calibrarlos antes de usar la práctica en evaluación formal.
- Los gestos finos (rotular, cortar, sujetar) se hacen en la mesa de trabajo, no con la mano 3D; llevar láminas, gotas y herramientas sí es físico.
- En la demostración, el tiempo se acelera en el desarrollo de Wiesner y la mesa de trabajo puede tapar parte de la plántula izquierda.
