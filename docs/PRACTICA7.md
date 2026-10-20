# Práctica 7 — Enlaces y propiedades

¿Se puede deducir cómo está organizada una sustancia a partir de lo que ocurre al tocarla con electrodos y al
mezclarla con disolventes? El estudiante formula hipótesis, compara disolventes hasta el equilibrio, mide la conducción
de sólidos con un detector de dos puntas y la conductividad de disoluciones con un conductímetro calibrado, e
identifica dos incógnitas con pruebas independientes. Laboratorio 3D con la misma base que las demás prácticas (React
Three Fiber, XState v5, Zustand, i18next, Vitest y Playwright).

```text
κ_ideal = Σ λ°_j·c_j        κ(c) = κ_ideal·f(I)  (f = 1 − 0,23·√I, MODELO CURRICULAR)        κ(T) = κ(25 °C)·[1 + 0,02·(T − 25)]
1 S/m = 10 mS/cm = 10 000 µS/cm        1 mol/L = 1000 mol/m³        κ = K_celda·G
HA ⇌ H₃O⁺ + A⁻:  x = (√(Ka² + 4·Ka·C) − Ka)/2        m*_disuelto = min(m_total, c_sat·V)        I = V/(R_lim + R_c1 + R_muestra + R_c2)
```

## Acceso

Panel de la plataforma (tarjeta «Práctica 7») o enlace `#p7` cuando el curso la tiene abierta. Modos Práctica,
Guiado, Evaluación y Docente (depuración), y **Ver demostración** («Una sustancia soluble no siempre conduce», §16).

| Estación | Contenido |
|---|---|
| A | Tablero de EPP (bata, gafas, calzado y guantes según la ficha de compatibilidad), hipótesis en la libreta |
| B | Agua de referencia, n-heptano, etanol, isopropanol, glicerina, aceite mineral, acetona; frascos de NaCl, sacarosa, KCl, CuSO₄·5H₂O, NaHCO₃, parafina, naftaleno, NaOH (restringido) y un frasco con rótulo dañado; probeta de 10 mL, gradilla con 8 tubos, dos goteros, espátula, agitador, piseta y tres residuos (acuosos, orgánicos, sólidos) |
| C | Detector de sólidos (1,0 V, 100 Ω, panel de control), dos puntas y muestras sobre baldosas: cobre, grafito (placa), NaCl, aluminio, parafina, sacarosa, hierro, bronce; balanza granataria y vidrios de reloj |
| D | Conductímetro con sonda, patrones de 1413 µS/cm y 12,88 mS/cm, un vial sin rótulo, ácido acético 0,10 mol/L, dos matraces aforados de 100 mL y cinco vasos |
| E | Dos incógnitas (frasco o botella con código; pieza sólida si corresponde), gradilla y dos vasos |
| F | Solo interfaz: la libreta abre la matriz de interpretación |

## Identificador

La especificación pide no tomar `p07` automáticamente. Se consultó el repositorio: estaban ocupados `p01`, `p2`–`p6` y
`p10`; se asignó **`p7`** (libre y coincidente con el documento temático). Migración `0007_course_labs_p7.sql`.

## Arquitectura

```text
src/simulation/solution-properties/   fichas de sustancias (materials), pares soluto–disolvente, solubilidad y cinética,
                                      conductividad, electrolito débil, inventarios e iones derivados (conservation)
src/simulation/bonding-world/         mundo: recipientes con fase polar, apolar y sólido; gotero, espátula, película de
                                      la sonda, derrames y residuos; detector de dos puntas; conductímetro; lecturas
src/practices/practice-07/            definición, parámetros, 16 escenarios y 60 errores, libreta (Cuadros A–F),
                                      evidencia, máquina XState, rúbrica, resultados esperados, reanudación segura
src/engine/bonding/                   fachada BondingLab3D, controlador (vertido, gotero, espátula, agitador, sonda,
                                      puntas), modelos procedurales, cámara a la altura del ojo
src/app/p7/                           store, runtime, HUD, instrumentos, seguridad, acciones, libreta, revisión, demostración
src/locales/es/practice7.json         textos (`p7.*`, `p7fb.*`)
```

## Modelo

| Proceso | Modelo |
|---|---|
| Inventario | Masa por componente (g) en cada compartimento; los iones se derivan de lo disuelto (no se duplica masa). Conservación ≤ 1e-9 g en todos los recorridos |
| Mezcla | Cada líquido va a la fase polar o apolar según su tipo; un par sin ficha validada **no se simula** (se avisa). Agua–heptano y agua–aceite forman dos fases; agitarlas deja una emulsión pasajera |
| Disolución | Hacia `m* = min(m_total, c_sat·V)` con `k_d` del par; agitar multiplica hasta ×6 la velocidad, nunca `c_sat`. Lo que excede la solubilidad queda como sedimento |
| Trasvases | Se trasladan paquetes separados por compartimento (lo disuelto sigue disuelto); el vertido toma primero la fase de arriba; la alícuota de una mezcla no homogénea no representa al total |
| Detector | Resistividad efectiva del material con su recorrido (grafito: ×2000 a través de las capas), resistencia de contacto (óxido del aluminio), película superficial (sal húmeda); rangos 2 mA y 20 mA; estabilización del contacto |
| Conductímetro | κ de la fase donde está la celda, factor real de la celda (sin calibrar ≈ +3 %), calibración con el valor elegido en el equipo, compensación de temperatura con la temperatura de la sonda (rezagada), rango, estabilidad por banda, película arrastrada |

Referencias de las pruebas (§8): 0,5844 g NaCl en 100,0 mL → 0,1000 mol/L; κ límite de NaCl 0,0100 M = 1,2645 mS/cm;
dilución 10,0 → 100,0 mL → 0,01000 M; ácido acético 0,1000 M con Ka 1,8e-5 → x ≈ 0,001333 M, κ ideal ≈ 0,520 mS/cm. En
la demostración: blanco 1,6 µS/cm, sacarosa 2 µS/cm, NaCl ≈ 18 mS/cm, ácido acético 533 µS/cm, cobre y grafito
9,9 mA, sal seca 0 mA.

## Evaluación

Seguridad 10 %, solubilidad/miscibilidad 20 %, conducción en material puro 15 %, conductividad de disoluciones 20 %,
incógnitas 15 %, cálculos y registros 10 %, interpretación 10 %. Todo se mide con las lecturas propias del intento; las
respuestas abiertas quedan `ok: null` (revisión docente) y la nota se muestra como provisional mientras haya ítems
pendientes. Una prevención bloqueada no cuenta como accidente. «Indeterminado» bien justificado vale más que una
categoría acertada sin pruebas. En el servidor la nota se recalcula (`p7` en `src/practices/grading.ts`) y el docente
puede verificar el intento por repetición.

## Errores simulables

`SIMULATED_ERRORS_P07` (L01–L60) con el contrato de §9.7 (grupo, clave de evidencia, retroalimentación, severidad,
si es preventivo y qué ítems afecta) y una prueba causal por código en `src/tests/integration/p07-flow.test.ts`. Los
`err:*` cambian el mundo o bloquean la acción; los `nb:*` solo cambian el resultado académico. Escenarios docentes
S01–S16 (sonda sin enjuagar, balanza con sesgo, sal húmeda, aluminio oxidado, ácido débil, grafito orientado,
solubilidad excedida, incógnitas enmascaradas, rango insuficiente, traza salina en la sacarosa, dos fases, disolvente
comercial sin ficha, temperatura de la sonda, aleación sin composición aprobada); los incompatibles se descartan.

## Accesibilidad

Todo se hace también desde el panel de acciones con los MISMOS comandos: destapar, verter (normal y despacio),
gotero (aspirar/entregar), espátula, agitar, etiquetar tubos, vaciar en residuos; detector (encender, rango, cables,
puntas al panel de control o a una muestra, de canto/acostada, mojar/secar); conductímetro (rango, compensación,
patrón, calibrar, sumergir a una profundidad, enjuagar). El indicador del detector se describe en texto («señal
estable/baja/fuera de rango»). Las incógnitas solo muestran su código en la escena, en el DOM y en las descripciones.

## Plataforma

`p7` en `LabId`; la migración `migrations/0007_course_labs_p7.sql` reconstruye `course_labs` con el CHECK que incluye
`p7`. **Antes de desplegar hay que aplicarla en producción** (`npx wrangler d1 migrations apply DB --remote`).

## Pendiente de revisión científica y jurídica (§7, §17.8)

La especificación no autoriza por sí sola cambios en producción. Antes de publicar se deben cotejar con fuentes
verificables (CRC, NIST, IUPAC, fichas técnicas): λ° de los iones, Ka, curvas de solubilidad y miscibilidad a 25 °C
(los pares etanol, isopropanol, acetona y ácido acético con heptano quedaron sin ficha a propósito), resistividades
y anisotropía del grafito, umbral y tensión del detector, rangos y factor de celda del conductímetro, el modelo de
concentración finita f(I) y el coeficiente térmico. Revisar también los permisos de uso del material de partida.

## Atribución

Concepto temático: *Práctica 7. Enlace químico* (PDF aportado). La pregunta, la secuencia, los cuadros, las
preguntas, los modelos y los objetos 3D son propios; no se reproducen figuras, tablas ni redacción del documento.
Bibliografía citada en el documento base (no verificada externamente): Brown et al. (2014) *Química: la ciencia
central*; Petrucci et al. (2011) *Química general*; Rayner-Canham (2000) *Química inorgánica descriptiva*; Corrales
(2003) *Manual de experimentos de laboratorio para Química I y II*; García et al. (2010) *Manual de prácticas de
laboratorio de Química General II*.

## Pruebas

- `src/tests/unit/p07-science.test.ts`: los 15 casos de §17.1 (conversiones, NaCl, dilución, ácido acético y
  electroneutralidad, sacarosa sin iones, saturación, fases, sonda sin inmersión, detector sin dos contactos, enjuague,
  determinismo, fichas y pares sin ficha bloqueados).
- `src/tests/integration/p07-flow.test.ts`: ruta ideal A→F con cuatro semillas, rutas científicas (sal seca frente a
  solución, grafito frente a metal, ácido débil, sacarosa, aceite/agua, saturación, contaminación de la sonda), libreta
  incorrecta sin efecto físico, prevención que no anula la seguridad, reanudación segura, 16 escenarios y L01–L60.
- `src/tests/integration/p07-demo.test.ts`: la demostración completa sin navegador con el mismo director y controlador.
- `src/tests/integration/replay.test.ts`: repetición exacta con reanudación en A, C y D y recálculo de la nota.
- `src/tests/e2e/p07.spec.ts` y `p07-demo.spec.ts`: menú y axe, EPP con guantes, detector y conductímetro desde el
  panel, vista a la altura del ojo y la demostración en el navegador.
