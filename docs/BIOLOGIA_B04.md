# Biología B04 — Detectives moleculares (biomoléculas y enzimas)

Cuarta práctica de **Biología General**. El estudiante prepara él mismo los lotes compartidos (P1: suspensión de
almidón calentada en plancha con agitador magnético; P2: extracto de hígado; P3: solución de amilasa), identifica
almidón, proteínas, lípidos y azúcares reductores con blanco y patrón, observa ADN con la reacción de Feulgen en el mismo
microscopio de B01–B03, mide la catalasa por el gas recogido y sigue la hidrólisis del almidón por la amilasa con Lugol
y Benedict por separado. Los colores salen de las especies presentes en cada tubo (complejo yodo–amilosa, complejo de
Biuret, Cu₂O, gotas de lípido), nunca del nombre de la muestra.

**Reutiliza B01, B02 y B03**: sala, microscopio de cuatro objetivos y sus gestos, observación y captura, cristalería con
vertido y pipeta, runtime, cinta reproducible, calificación en el servidor, fotos del docente y demostración. B04 agrega
la química de los ensayos, las cinéticas enzimáticas, los baños, la plancha con agitador y su propia libreta, rúbrica y
errores.

```text
Lugol:     índice = f(almidón disperso, I₂ libre); con grumos y mezcla pobre (homog < 0,7) el color queda localizado
Biuret:    violeta solo con OH⁻ y Cu(II) disponibles, tras delayS; exceso de Cu → Cu(OH)₂ (interferencia)
Benedict:  2 Cu(II) + reductor → Cu₂O, k ≈ 0 por debajo de benedictMinK; color por mmol de Cu₂O / V
Emulsión:  el lípido pasa a la fase etanólica (etanol ≥ ethanolMinFrac); al diluir forma gotas que se separan con el tiempo
Enzimas:   v = Vmax·[S]/(Km+[S])·f(T,pH);  dE/dt = −k_d(T,pH)·E  (E = E₀·e^(−k·t))
Catalasa:  2 H₂O₂ → 2 H₂O + O₂;  V_gas = nRT/P (1 mmol a 298,15 K → 24,47 mL)
Térmica:   dT/dt = UA·(T_ext − T)/C, integración exacta en el paso
ADH (opc): etanol + NAD⁺ → acetaldehído + NADH, con competencia del metanol (módulo cerrado, solo simulación)
```

> **Modelo didáctico.** Umbrales de color, constantes cinéticas, tiempos de desarrollo y respuestas de Feulgen son
> valores de software (`params.ts`, estado `pending`), no medidas de un reactivo o tejido real. Las imágenes del ocular
> son ilustraciones con manifiesto o fotos aprobadas por el docente.

## Acceso e identificador

Panel de la plataforma (tarjeta 14, área **Biología**) o enlace `#b04`. Migración `0014_course_labs_b04.sql`:
reconstruye `course_labs` y `lab_photos` para admitir `'b04'` en sus `CHECK`. En la semilla, el curso **Biología
General I** (`c_bg1_01`) tiene `b04` abierta desde el 2026-11-10. Intentos `b04-<semilla>-<marca>`; la calificación del
servidor reproduce la cinta con `dispatchBio`.

| Estación | Contenido |
|---|---|
| A | Preparaciones: balanza, espátula, botes de almidón y amilasa, tabla con hígado, dos planchas con agitador y barras magnéticas, vasos P1–P3, probetas de 100 y 10 mL, termómetro, agua y lotes (clara, leche, gelatina, papa, aceite, glucosa, patrón y desconocidos) |
| B | Gradillas A y B, goteros de Lugol, NaOH y CuSO₄, pipetas graduada y aforada, vaso de enjuague, etanol 95 %, residuos químicos (Cu · I · etanol) |
| C | Baño María 1, Benedict, pinza para tubos, gradilla C, tampones de pH y tiras |
| D | Frascos de Feulgen (fijador, HCl, lavado, Schiff), caja de láminas y microscopio compuesto de B01 |
| E | Gradilla de enzimas, baño María 2, H₂O₂, HCl y NaOH para pH, fotómetro, colector de gas y cronómetro; reactivos cerrados del módulo ADH |
| F | Mechero, residuos biológicos, vidrio roto y comunes; libreta y cierre |

EPP: bata, calzado cerrado, cabello recogido, manos limpias, **guantes y gafas obligatorios** (NaOH, HCl, Schiff,
H₂O₂, baños calientes).

## Arquitectura

```text
src/simulation/biochem/model.ts          química y cinéticas puras (pH, Lugol, Biuret, Benedict, emulsión, MM, ADH, gas)
src/simulation/bio-world/                mundo B04: envuelve dispatchCell (B02 → B01) y agrega recipientes con especies,
                                         vertido, pipeta, goteros, tubos rotulados ENSAYO/LOTE, baños, plancha, balanza,
                                         preparaciones de Feulgen, catalasa con colector y libros conservados
src/practices/practice-b04/              definición, parámetros, 25 escenarios, 86 errores (EMU01–EMU86 → E01…, vía
                                         CODE_MAP_B04), libreta (cuadros A–H + preguntas), evidencia, XState, rúbrica, reanudación
src/engine/optical/bioController.ts      gestos de B04 sobre el CellController
src/engine/optical/objects3dBio.ts       mesada: gradillas, tubos, goteros, baños, plancha, balanza, colector
src/app/b04/                             store, simulación, paneles (acciones, depuración, libreta), revisión, demo
src/locales/es/practiceB04.json          textos (`b04.*`, `b04fb.*`)
```

## Decisiones científicas (correcciones de la guía)

- **Feulgen detecta ADN**, no «ácidos nucleicos»; la cebolla también tiene núcleos positivos (C-BIO4-01). Control sin
  hidrólisis, sub- y sobrehidrólisis son estados del frotis, con ilustraciones distintas.
- **Catalasa**: blanco sin fuente enzimática y tres condiciones como mínimo (hígado crudo, hervido, papa) (C-BIO4-02).
- **Amilasa**: el cuadro se llama así (C-BIO4-03); la desaparición del almidón (Lugol) y la aparición de reductores
  (Benedict) se leen en alícuotas separadas, con un control de almidón sin enzima.
- **Rótulos ENSAYO/LOTE** únicos, no números de tubo fijos (C-BIO4-04).
- **ADH** es un módulo opcional y cerrado: Fehling y yodoformo no se interpretan como prueba directa ni como cantidad de
  etanol (C-BIO4-05/06/07); el metanol no se manipula.
- **Benedict depende del lote**, no del nombre comercial (C-BIO4-08).

## Pruebas

| Archivo | Qué comprueba |
|---|---|
| `b04-flow.test.ts` | Ruta ideal sin errores, todas las etapas, conservación y nota > 0,85 |
| `b04-science.test.ts` | Referencias del modelo (gas ideal, MM, desnaturalización, Lugol, Biuret, Benedict, emulsión) |
| `b04-locale.test.ts` | Textos de cada código, etapa, escenario, ítem, activo de Feulgen y cada clave literal del código |
| `b04-demo.test.ts` | Demostración sin navegador con el `BioController`: sin errores, todas las etapas, tubos leídos y desechados, balance y cinta reproducible |
| `replay.test.ts` | Repetición determinista y calificación en el servidor (semillas 4404 y 59, con reanudación) |
| `e2e/b04.spec.ts` | Escena 3D real: EPP con gafas obligatorias, vertido a la probeta, rótulo de tubo, axe-core |

## Parámetros pendientes de calibración

Umbrales y LOD de cada ensayo, tiempos de desarrollo de Biuret y de Benedict, Vmax/Km/estabilidad térmica de catalasa y
amilasa, coeficientes térmicos de baños y plancha, tiempos de hidrólisis de Feulgen y la cinética de ADH son
**didácticos** (`params.ts`, estado `pending`).
