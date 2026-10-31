# B08 · Energía luminosa y pigmentos: del cromatograma al intercambio de gases

Octava práctica de Biología, sobre las mismas físicas, mesada y motor óptico de B01–B07. Es estrictamente virtual: los solventes solo se dosifican de forma digital dentro de la campana, no hay llama y no se sopla CO₂ con pajilla. Los valores son perfiles sintéticos rotulados, no constantes fisiológicas.

## Arquitectura

Inyección en capas: `dispatchPhoto → dispatchDiv → dispatchCell → dispatchB01`.

- Ciencia pura: `src/simulation/photosynthesis/` (cinética, gas y capilar, carbonato y BTB, balance de pigmentos, cromatografía).
- Dominio: `src/simulation/photo-world/` (`world.ts`, `commands.ts`, `types.ts`, `geometry.ts`).
- Práctica: `src/practices/practice-b08/` (definición, parámetros, evidencia, máquina, rúbrica, libreta, escenarios, reanudación).
- Motor: `src/engine/optical/photoController.ts`, `objects3dPhoto.ts`.
- Interfaz: `src/app/b08/`. `BenchPanelB08` agrupa tubo y capilar, indicador, campana, y papel con regla.

## Estaciones y flujo

Orden A → D → E → B → C → F. `INTRO → PPE_CHECK → LAB.{HYPOTHESIS, GAS, BTB, EXTRACT, CHROM, CLEANUP, COMPLETE} → SUBMISSION → REVIEW`, por evidencia.

| Estación | Contenido |
|---|---|
| A | Pregunta, EPP y residuos |
| D | Ramas de Elodea, tubos, capilar, baño, pantalla y lámpara |
| E | Tres tubos BTB, dispensador virtual de CO₂ y lámpara; microscopio opcional (S22–S24) |
| B | Campana, frascos, balanza, mortero, tubo de extracción y vial |
| C | Papel y regla, tubo de desarrollo |
| F | Libreta, residuo orgánico y cierre |

## Modelo

- Fotosíntesis y respiración por tubo con conservación de carbono y O₂ a 1e-9; a oscuras o sin carbono, la fotoproducción es exactamente 0.
- El menisco se lee con el ojo a su altura: la lectura sale de la división que se ve desde allí (paralaje). La temperatura lo mueve sin fotosíntesis cuando falta el baño.
- BTB: color según pH derivado de DIC y alcalinidad; el control sin planta no tiene término biológico.
- Pigmentos: balance por compartimento (hoja, fase acuosa, extracto, papel, residuo, degradado, perdido).
- Rf siempre desde el origen; S15 da banda compuesta y S16, una quinta banda: ninguna se considera error.
- Casos de §8 verificados en `src/tests/unit/b08-science.test.ts`.

## Errores, escenarios y rúbrica

- 76 errores `FOT-NN` (59 del mundo, 17 de la libreta) y 5 incidencias sin descuento. Prueba de cada uno en `b08-errors.test.ts`.
- 28 escenarios S01–S28. S26 y S27 retiran un módulo y reparten los pesos antes de empezar. S21 deja la bruta en µmol en revisión.
- Pesos: seguridad 15, diseño 15, luz/oscuridad 20, DIC–BTB 15, pigmentos 20, cálculos y conclusiones 15. Los cálculos se comparan con las lecturas propias.

## Límites conocidos

- Los gestos finos (tapón, nivel, solventes, regla) se hacen en la mesa de trabajo, no con la mano 3D; llevar ramas, tubos, frascos y lámparas sí es físico.
- La demostración solapa la serie BTB con el par luz/oscuridad para no esperar dos veces; el estudiante puede hacerlo en cualquier orden.
- Cinética, Rf, masas de pigmento y viraje del BTB son didácticos y deben validarse (anexo B de la guía) antes de usar la práctica en evaluación formal.
- El perfil `realistic` de gas (corrección por vapor de agua) solo existe como parámetro y como error de la libreta (FOT-25); no hay interfaz docente para elegirlo.
