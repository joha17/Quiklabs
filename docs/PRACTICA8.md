# Práctica 8 — Síntesis orgánica comparativa

Preparación, separación y análisis de ésteres por una de tres rutas, en una única práctica: **ISO** (acetato de
isoamilo por Fischer, predeterminada), **ASA** (ácido acetilsalicílico por acetilación con ácido fosfórico) y **MS**
(salicilato de metilo por Fischer). La masa máxima la decide el reactivo limitante con lo que el estudiante REALMENTE
dispensa; el rendimiento, lo que logra recuperar; la pureza, solo un ensayo. Laboratorio 3D con la misma base que las
demás prácticas (React Three Fiber, XState v5, Zustand, i18next, Vitest y Playwright).

```text
ISO   C5H12O + C2H4O2 ⇌ C7H14O2 + H2O        (H2SO4, reflujo)
ASA   C7H6O3 + C4H6O3 → C9H8O4 + C2H4O2      (H3PO4 = ácido FOSFÓRICO; hidrólisis lateral AA + H2O → 2 AcOH)
MS    C7H6O3 + CH4O ⇌ C8H8O3 + H2O           (H2SO4, reflujo)
ξ_max = min_i(n_i,0/ν_i)    m_teórica = M_P·ν_P·ξ_max    rendimiento aparente = 100·m_aislada/m_teórica (sin recortar)
r_Fischer = k_f·c_ácido·c_alcohol − (k_f/K_eq)·c_éster·c_agua    k(T) = k_ref·exp[−Ea/R·(1/T − 1/T_ref)]
```

## Acceso

Panel de la plataforma (tarjeta «Práctica 8») o enlace `#p8` cuando el curso la tiene abierta. La **ruta se elige en
la portada y queda fija en el intento** (cambiarla crea un intento nuevo). Modos Práctica, Guiado, Evaluación y Docente,
y **Ver demostración** de la ruta elegida.

| Estación | Contenido |
|---|---|
| A | Bandeja de EPP (gafas, bata, guantes de nitrilo, cabello recogido); predicción en el Cuadro A |
| B | Frascos de la ruta (y distractores reales: ácido acético 30 %, metanol 70 %, alcohol isoamílico en MS, H₂SO₄ en ASA, desecante usado), balanza granataria de 0,001 g (simulada), vidrio de reloj, espátula, probetas de 10 y 25 mL, gotero, piseta, vaso de plástico, cuatro residuos |
| C | Placa calefactora con baño de agua y agitador magnético, aro de corcho con el balón, termómetro digital, condensador (ISO/MS), mechero que no debe usarse |
| D | Baño de hielo; ISO/MS: soporte con embudo de separación de 125 mL, vaso, Erlenmeyer de secado, bicarbonato 5 %, Na₂SO₄ anhidro, módulo de fracciones y vial; ASA: vaso con agua helada, kitasato con Büchner, papeles fino y grueso, bomba de vacío, estufa |
| E | Analizador de pureza y densidad; ASA: aparato de punto de fusión |
| F | Solo interfaz: la libreta abre el Cuadro C |

## Identificador

La guía de origen se titula «Práctica 8»; la especificación pide confirmar el `LabId`. Estaban ocupados `p01`,
`p2`–`p7` y `p10`; se asignó **`p8`**. Migración `0008_course_labs_p8.sql` (reconstruye `course_labs` con el CHECK
ampliado). Las tres rutas son configuración de UNA práctica, no tres `LabId`.

## Arquitectura

```text
src/simulation/organic-chemistry/   especies (fórmulas, masas de PubChem, densidades, ebullición, K_D curriculares),
                                    estequiometría (matrices enteras, limitante, rendimientos), cinética (Fischer,
                                    acetilación, hidrólisis), separación (reparto, solubilidad del ASA, fracciones)
src/simulation/organic-world/       mundo en MOLES por compartimento: líquido, sólido, película exterior, gas del embudo,
                                    herramientas, muestra del analizador, mesada, campana; reacciones en cualquier
                                    recipiente; calor; embudo; filtración; secado; fracciones; lecturas; 60 errores
src/practices/practice-08/          definición por ruta, parámetros, rutas, 16 escenarios y 60 errores con contrato,
                                    libreta (Cuadros A/B/C, 10 actividades), evidencia, máquina XState, rúbrica,
                                    resultados esperados, reanudación segura
src/engine/organic/                 fachada OrganicLab3D, controlador (apoyos, vertido, gotero, espátula, piseta, embudo,
                                    botones de los equipos), modelos procedurales, cámara a la altura del ojo
src/app/p8/                         store, runtime, HUD, pantallas, seguridad, acciones, libreta, revisión, demostración
src/locales/es/practice8.json       textos (`p8.*`, `p8fb.*`)
```

## Modelo (curricular, `scientificModel: 'curricular-calibrated'`)

| Proceso | Modelo |
|---|---|
| Inventario | Moles por especie en cada compartimento; masa = Σ n·M. La conservación se verifica por ÁTOMOS (C, H, O, Na, P, S) con error relativo ≤ 1e-9 en todos los recorridos, también con derrames, vapores, residuos y la muestra del analizador |
| Reacciones | Fischer reversible (K_eq 4 en ISO, 3 en MS), acetilación del ASA, hidrólisis del anhídrido con agua, neutralización con bicarbonato (CO₂ al espacio de cabeza del embudo tapado o a la campana). El catalizador multiplica la velocidad (≥ 1 % molar = efecto completo), nunca K_eq ni la masa teórica |
| Calor | Baño (estado propio) que sube hacia la consigna limitado por la potencia; el líquido se relaja hacia el baño, el hielo, la estufa o el aire; la agitación mejora el contacto; tope en la ebullición del componente volátil mayoritario |
| Volátiles | Sin condensador se pierden hacia la campana; con agua y uniones selladas, casi nada (S07: fuga) |
| Fases | Dos fases solo si hay un orgánico poco soluble y agua en exceso respecto de la saturación y de los codisolventes (metanol, ácido acético); reparto por K_D; la más densa queda abajo (salicilato de metilo abajo, acetato de isoamilo arriba) |
| Embudo | La llave descarga primero la fase de abajo hacia el recipiente bajo el vástago; con emulsión sale mezclado; presión por CO₂ con gas ideal en el espacio de cabeza |
| Cristalización | Solubilidad curricular del ASA en medio acuoso S(T) (tabla), aproximación exponencial al equilibrio; en medio orgánico se disuelve |
| Filtración | El papel retiene cristales salvo finos (poro grueso, S09); la torta retiene líquido (más sin sellar); el vacío arrastra parte del retenido |
| Secado | Na₂SO₄ anhidro con capacidad finita (0,25 g de agua por g); estufa y aire evaporan agua, ácido acético y metanol de la torta |
| Fracciones | Módulo curricular: cada especie destila en una ventana gaussiana (σ = 4 °C; 8 °C en S15) alrededor de su ebullición; el agua no secada co-destila con el éster |
| Lecturas | Balanza (tara, estabilidad, capacidad, película exterior, objeto caliente, cero desplazado S01), probetas con paralaje según la altura real del ojo, termómetro dentro o fuera del líquido y con sesgo (S02), analizador de pureza con incertidumbre y desplazamiento (S16), densidad, intervalo de fusión (baja y se ensancha con impurezas; no da un porcentaje) |

Referencias de las pruebas (§8.1): 1,00000 g de ácido salicílico → 1,304373 g de ASA; 1,00000 g de alcohol isoamílico
→ 1,476801 g de acetato de isoamilo; 1,00000 g de ácido salicílico → 1,101578 g de salicilato de metilo (tolerancia
2·10⁻⁵ g, con las masas molares de la tabla §3.2).

Rutas ideales por comandos (semilla 8008): ISO ≈ 57 % aparente, pureza 99,3 %; ASA ≈ 96 %, pureza 97,9 %, fusión
133–135 °C; MS ≈ 60 %, pureza 99,9 %. Son resultados del modelo curricular, no rendimientos esperados de laboratorio.

## Errores, escenarios y rúbrica

- 60 errores `ORG01`–`ORG60` (`error-scenarios.ts`) con contrato `code, group, routes, triggerCommandOrState,
  effectOnWorld, evidenceKey, feedbackKey, testFixture`. `err:*` cambian el mundo o bloquean el gesto; `nb:*`
  (ORG19, 34, 47, 51–60) son cálculos de la libreta y nunca cambian la composición. Cada uno tiene una fixture con su
  consecuencia causal (`p08-errors.test.ts`, 60/60).
- 16 escenarios SC01–SC16 que solo cambian el estado inicial, filtrados por ruta y por incompatibilidad.
- Rúbrica 15/15/15/20/15/15/5 recalculada en el servidor; los cálculos se corrigen contra las lecturas propias; las
  respuestas abiertas quedan `ok: null`; un accidente consumado (balón volcado) anula la seguridad sin destruir el resto;
  `pureza: null` no es 0 %.

## Accesibilidad

Todo gesto tiene equivalente en el panel de acciones (apoyos con nombre, vertido mantenido con dos velocidades, gotero,
espátula, piseta, tapón, agitar, ventear, llave hacia un receptor elegido, botones de cada equipo) y teclado: flechas,
Intro, P/Espacio, U, A, Q/E, T/X (embudo), G (pinza), R/Z/V/Y (lecturas), 1–6 estaciones, J/L/I/K cámara, O altura del
ojo. Descripciones accesibles sin valores internos en Evaluación; banda roja persistente para los bloqueos críticos;
movimiento reducido. axe-core sin violaciones graves en la portada, el laboratorio y la libreta (e2e).

## Pendiente de revisión científica

Constantes cinéticas, K_eq, K_D, solubilidad del ASA en el medio, capacidad del desecante, retención de la torta,
ventanas de destilación, modelo del intervalo de fusión y del analizador: valores didácticos `[PENDIENTE]`. La
especificación no autoriza cambios en producción sin esa revisión.
