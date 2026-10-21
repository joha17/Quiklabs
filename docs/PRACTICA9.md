# Práctica 9 — Huellas de los iones

Separación de mezclas con precipitados y espectros de emisión a la llama: identificar **Sr²⁺, Fe³⁺ y K⁺** en una
muestra codificada (`M-xx`) cuya composición depende de la semilla y de los escenarios del intento. Un solo color de
llama no basta: el estudiante arma un atlas con controles y blanco, compara soportes dentro de una campana 3D, separa
con sulfato y álcali (centrífuga equilibrada y decantación) y confirma el K⁺ en la fracción final. Misma base que las
demás prácticas (React Three Fiber, XState v5, Zustand, i18next, Vitest y Playwright).

```text
Sr²⁺(aq) + SO₄²⁻(aq) → SrSO₄(s)        Ksp = 3,4·10⁻⁷  [VALIDAR]   (blanco)
Fe³⁺(aq) + 3 OH⁻(aq) → Fe(OH)₃(s)      Ksp = 2,8·10⁻³⁹ [VALIDAR]   (pardo)
H⁺ + OH⁻ → H₂O (instantánea: el ácido de la muestra consume álcali antes de precipitar el hierro)
Avance: dξ = k·máx(0, 1 − Ksp/Q)·(ξ_eq − ξ)·mezcla      Contraste de llama = B/(B + 0,06·luz/100 + 0,003)
```

> **Llama y vidrio de reloj: representación VIRTUAL.** La práctica no da instrucciones de combustible ni de encendido
> real. El aviso está visible siempre (portada, panel de seguridad, campana, vidrio de reloj y Cuadro C).

## Acceso

Panel de la plataforma (tarjeta «Práctica 9») o enlace `#p9` cuando el curso la tiene abierta. Modos Práctica, Guiado,
Evaluación y Docente; perfiles docentes de escenarios; **Ver demostración**.

| Estación | Contenido |
|---|---|
| A | Bandeja de EPP (gafas, bata, guantes de nitrilo); muestra incógnita codificada; probeta de 10 mL; predicciones del Cuadro A |
| B | Campana con extracción, mampara y luz LOCAL (100 / 45 / 20 %); emisor de llama virtual; asa de nicromio y vaso de limpieza; siete controles (Sr, K, Na, Li, Ca, blanco y Na + K); cámara espectral |
| C | Vista frontal de la campana; vidrio de reloj (virtual) y soporte refractario sobre el emisor |
| D | Gradilla con ocho tubos; goteros de sulfato de amonio, amoníaco y agua; piseta; pipeta Pasteur; centrífuga de cuatro posiciones; turbidímetro; balanza de 0,01 g |
| E | Confirmación: misma campana con luz baja y vista espectral |
| F | Residuos líquidos y con sólidos; la libreta abre el Cuadro F |

## Identificador

La especificación pide no asumir `p09`. Estaban ocupados `p01`, `p2`–`p8` y `p10`; se asignó **`p9`**. Migración
`0009_course_labs_p9.sql` (reconstruye `course_labs` con el CHECK ampliado); en la semilla, `p9` se abre el 2026-10-20
en ambos cursos.

## Arquitectura

```text
src/simulation/cation-analysis-world/   especies e inventario en MOLES por compartimento (disuelto, sólido con su
                                        fracción en suspensión, asa, pipeta, extracción, mesada, bandeja); soluciones
                                        electroneutras; precipitación por Ksp; neutralización; sedimentación por gravedad
                                        y centrífuga; espectro de emisión (líneas → CMF → sRGB → categoría y contraste);
                                        campana, llama virtual, soportes, centrífuga, lecturas y 50 errores
src/practices/practice-09/              definición, parámetros, 16 escenarios y 50 errores con contrato, libreta
                                        (Cuadros A–H), evidencia, máquina XState, rúbrica, resultados esperados, reanudación
src/engine/cations/                     fachada CationLab3D, controlador (apoyos, asa, pipeta, gotero, piseta, vertido y
                                        decantación, botones de campana/emisor/centrífuga/balanza/turbidímetro/cámara),
                                        modelos procedurales (campana 3D, llama coloreada por el espectro), cámara
src/app/p9/                             store, runtime, HUD, pantallas, seguridad, acciones, libreta, vista espectral,
                                        revisión y demostración
src/locales/es/practice9.json           textos (`p9.*`, `p9fb.*`)
```

## Modelo (curricular, pendiente de validación)

| Proceso | Modelo |
|---|---|
| Inventario | Moles por especie en cada compartimento. Se conservan los ELEMENTOS (Sr Fe K Na Li Ca S N Cl O H) y la CARGA total: deriva 0 en la ruta ideal y en la demostración |
| Reactivos | (NH₄)₂SO₄ y NH₄OH se modelan como NH₄⁺ + SO₄²⁻ y NH₄⁺ + OH⁻ (sin Na ni K que interfieran con la llama) |
| Precipitación | Ksp curriculares; desplazamiento de equilibrio resuelto (bisección para Fe(OH)₃) y aproximado con velocidad k = 0,5 s⁻¹; sin agitar, factor 0,2 |
| Sólidos | Fracción en suspensión por sólido; sedimentación 1/900 s⁻¹ por gravedad y 0,12 s⁻¹ × fracción de rpm en la centrífuga (S13 × 0,25). Arrastre al decantar 0,2 % (suave), 4 % (> 105°) o 35 % (> 120°) |
| Emisión | Catálogo didáctico de líneas (Na 589/589,6; K 766,5/769,9/404,4/404,7; Li 670,8/610,4; Sr 460,7 + bandas SrOH; Ca bandas CaOH; Fe débil) → funciones CMF (Wyman 2013) → XYZ → sRGB → tono y saturación. El contraste baja con la luz local: el K violeta solo se ve con poca luz y el Na lo enmascara |
| Soportes | Asa (carga 0,01 mL, τ 1,5 s, residuo 4 % de las sales); vidrio de reloj virtual (τ 12 s; tensión > 25 s → fisura y fragmentos en la bandeja, E17); refractario (τ 8 s). Lo vaporizado va a la extracción |
| Campana | Extracción válida / baja (S15) / apagada; mampara ≤ 40 cm; sin ambas la llama no enciende (bloqueo). La luz local oscurece solo el interior; HUD, señalización y consola no cambian |
| Centrífuga | Cuatro posiciones (pares opuestos 0–2 y 1–3); desbalance máximo 0,3 g; tapa; rampa 800 rpm/s; nada entra ni sale del rotor girando |

## Errores, escenarios y rúbrica

- 50 errores `E01`–`E50` (`error-scenarios.ts`) con disparador, efecto, clave de evidencia y `p9fb.Enn`. Los de
  técnica cambian el mundo o bloquean el gesto; los de libreta (E07, E08, E11, E16, E19, E23, E30, E45–E50) nunca
  cambian la composición. Cada uno tiene una fixture con su consecuencia (`p09-errors.test.ts`).
- 16 escenarios `P09-S01`…`S16` (composición de la muestra, contaminante de Na, asa sucia, residuo en el vidrio, gotero
  obstruido, álcali contaminado, rótulos cruzados, contrapeso mal preparado, sedimentación lenta, sala iluminada,
  extracción baja, cerca del límite) con exclusiones entre los que fijan la muestra.
- Rúbrica 15/10/20/20/15/10/10 (seguridad, diseño, espectros, precipitación, fraccionamiento, identificación, libreta).
  La identificación se compara con lo que las pruebas de ESE intento permitían inferir y con la composición real: una
  conclusión fija («los tres presentes») se penaliza en los escenarios que no los tienen. Un incidente consumado anula
  la seguridad.

## Demostración

Diez secuencias (§15) con la mano virtual sobre el controlador real: hipótesis; control limpio de Sr; contaminación
(K solo frente a Na + K); campana (flujo, mampara, luz local baja, ganancia ×4); asa frente a vidrio de reloj virtual;
sulfato gota a gota; contrapeso en la balanza, centrífuga y decantación suave; álcali; confirmación del K⁺ en el
sobrenadante final; libreta y diagrama. Termina sin errores de técnica ni alertas, y su cinta se reproduce igual por el
dominio puro (`p09-demo.test.ts`, `p09-demo.spec.ts`).

## Accesibilidad

Todo gesto tiene equivalente en el panel de acciones (apoyos con nombre, asa, pipeta mantenida, goteros con número de
gotas, decantación suave mantenida, campana con regulador segmentado 100/45/20 %, emisor, cámara espectral con
ganancia, centrífuga con posición del rotor y tiempo, turbidímetro) y teclado (flechas, Intro, P/U/A, Q/E, X/Y/T/N/R/Z,
1–6, J/L/I/K, O). El color nunca es la única evidencia: cada observación lleva su etiqueta textual y la vista espectral
tiene una tabla de líneas. En Evaluación no se nombra el catión: solo la observación. axe-core sin violaciones graves.

## Pendiente de revisión científica

Ksp y su dependencia de la temperatura y la actividad, velocidad de precipitación, sedimentación, eficiencias de
emisión, umbral de contraste y de detección, y los tres niveles de luz local: valores didácticos `[VALIDAR]`. La
especificación bloquea la publicación hasta validar fuentes y casos numéricos; no autoriza el uso en producción sin esa
revisión.
