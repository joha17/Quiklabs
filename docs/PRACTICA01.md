# Práctica 1 — Instrumentación científica y determinación experimental de densidades

Reconocimiento de los instrumentos de medida del laboratorio y densidad por tres caminos: agua a dos temperaturas
(pipeta aforada y masa por diferencia), clavos por desplazamiento en una probeta y un cilindro metálico por su
geometría (pie de rey). Cada resultado va con su incertidumbre. Laboratorio 3D con la misma base que las Prácticas 2 a
10 (React Three Fiber, XState v5, Zustand, i18next, Vitest y Playwright).

```text
ρ = m / V                         V_cilindro = π·d²·h / 4          ΔV = V_final − V_inicial
u(ρ)/ρ = √[(u(m)/m)² + (u(V)/V)²]  u(V)/V = √[(2·u(d)/d)² + (u(h)/h)²]
u = a/√3 (convención rectangular) o u = a (directa), declarada en la libreta
```

## Acceso

Panel de la plataforma (tarjeta «Práctica 1», la primera) o enlace `#p01` cuando el curso la tiene abierta. Modos
Práctica, Guiado, Evaluación y Docente, y **Ver demostración** (las cuatro determinaciones con los mismos gestos que
hará el estudiante; nunca marca etapas a mano).

| Estación | Contenido |
|---|---|
| A | Reconocimiento: balanza analítica, bureta, tubos, vaso, embudo, papel de filtro, espátula y regla (solo se inspeccionan) |
| B | Agua ambiente y fría (baño de hielo), piseta, pipeta volumétrica de 25,00 mL con propipeta, termómetro, dos Erlenmeyer (uno rajado), desechos, balanza granataria |
| C | Cápsula con 6 clavos, navecilla, probeta de 50 mL sobre la bandeja antiderrames |
| D | Vidrio de reloj, cilindro metálico, pie de rey |
| E | Libreta y comparación de resultados (al elegir la estación se abre la libreta en la tabla B) |
| F | Revisión y entrega (solo interfaz, sin objetos ficticios; abre la libreta en Análisis) |

## Arquitectura

```text
src/simulation/density-models/     densidad del agua ρ(T) (0–40 °C; fuera del dominio devuelve NaN), sólidos (cilindro,
                                   desplazamiento, densidad y errores relativos)
src/simulation/metrology/          incertidumbre (convención, resta, densidad, volumen del cilindro), media, desvíos,
                                   cuantización y decimales
src/simulation/density-world/      mundo: agua por recipiente (masa conservada; V = m/ρ(T)), pipeta (aspirar, enrasar,
                                   escurrir, gota externa, burbujas, residuos), probeta con clavos y aire, termómetro,
                                   pie de rey, balanza compartida, derrames, seguridad y lecturas
src/practices/practice-01/         definición, parámetros, 12 escenarios y 64 errores, libreta, evidencia, máquina
                                   XState, rúbrica, resultados esperados, reanudación segura
src/engine/density/                fachada DensityLab3D, controlador (arrastre, vertido con acople, piseta, pipeta,
                                   termómetro, clavos, pie de rey), modelos procedurales, cámara a la altura del ojo
src/app/p01/                       store, runtime (cinta y registro), HUD, instrumentos, seguridad, acciones, libreta
                                   (tablas A–D, análisis, registro), revisión y demostración
src/locales/es/practice01.json     textos (`p01.*`, `p01fb.*`)
```

## Modelo físico

| Proceso | Modelo |
|---|---|
| Agua | Se conserva la masa; el volumen sale de ρ(T). El agua fría se enfría en el baño y se calienta en la mesada |
| Balanza | Calentamiento (deriva de cero los primeros 8 s), nivel (sesgo por grado), tara por sesión, estabilidad tras cada perturbación, platillo mojado bloquea pesar |
| Pipeta | Aspira solo con la punta sumergida (si no, entra aire); el exceso sobre la marca llega a la propipeta y la contamina (incidente); el escurrido deja una película que decae con el tiempo; soplar o secar el orificio cambia el volumen entregado |
| Probeta | Lectura de la base del menisco con paralaje según la altura del ojo; los clavos desplazan su volumen; el aire atrapado suma volumen hasta golpear la probeta; el rebalse cae en la bandeja |
| Termómetro | Respuesta de primer orden; inmersión poco profunda y contacto con la pared sesgan la lectura |
| Pie de rey | Error de cero, oblicuidad, fuerza excesiva y alineación de la altura |

Referencias de las pruebas (semilla de la demostración): agua 24,91 g / 24,98 g (ρ 0,9964 / 0,9992 g/mL), clavos
Vi = 20,0 mL y Vf = 22,5 mL → 8,0 g/mL (§8.2), cilindro de aluminio 2,699 g/cm³; el agua se conserva con error
< 1e-9 g en todo el recorrido.

## Evaluación

Seguridad 10 %, instrumentos y lectura 15 %, agua 20 %, desplazamiento 15 %, geometría 15 %, propagación de
incertidumbres 15 %, discusión 10 %. Un accidente anula el puntaje de seguridad. Los cálculos se comparan con lo que
corresponde a las lecturas que obtuvo el estudiante (no con valores ideales); las respuestas abiertas quedan para
revisión docente. En el servidor la nota se recalcula (`p01` en `src/practices/grading.ts`) y el docente puede
verificar el intento por repetición.

## Errores simulables

`SIMULATED_ERRORS_P01` (P01-E001–E064) con su consecuencia causal en `src/tests/integration/p01-flow.test.ts`.
Escenarios docentes: balanza desnivelada, deriva de cero, pipeta con película grasa, propipeta que deja entrar aire,
termómetro con sesgo, termómetro lento, baño frío débil, pie de rey con error de cero, cilindro no ideal, aire entre
los clavos, lote de clavos mezclado y puesto sensible a derrames.

## Accesibilidad

Todo se hace también desde el panel de acciones: llevar al platillo, encender, nivelar, tarar y leer; colocar la
propipeta, llevar la pipeta a cada recipiente, aspirar y soltar (botones mantenidos), enrasar, limpiar la punta;
verter con botón mantenido, gota de piseta; introducir el termómetro con profundidad y contacto con la pared;
clavos de a uno; pie de rey con objetivo, orientación, alineación y fuerza. Vista a la altura del ojo (O),
descripciones en palabras (en Evaluación sin valores exactos), subtítulos y navegación por teclado.

## Plataforma

`p01` en `LabId`; la migración `migrations/0006_course_labs_p01.sql` reconstruye `course_labs` con el CHECK que
incluye `p01`. **Antes de desplegar hay que aplicarla en producción**
(`npx wrangler d1 migrations apply DB --remote`).

## Pendiente de revisión científica (§17.8)

La especificación no autoriza por sí sola cambios en producción. Antes de publicar, el equipo debe validar:
procedencia y dominio del polinomio de ρ(T) del agua; densidad de referencia según la aleación real del cilindro y de
los clavos; tolerancias de pipeta, probeta, balanza, pie de rey y termómetro; convención de incertidumbre del manual
docente. Las cifras de las pruebas sirven como referencia de programación, no como certificación metrológica.

## Atribución

Contenido curricular basado en *Práctica 1. Manejo básico del equipo de laboratorio y mediciones* (PDF suministrado
por el usuario, sin autor institucional visible). La secuencia, los textos y los modelos son propios; no se reutilizan
fotografías, dibujos ni cuadros del documento. Referencias citadas en el documento base (no verificadas
externamente): Brown et al. (2014) *Química: La ciencia central*; Chang y Goldsby (2017) *Química*; Petrucci et al.
(2011) *Química general*; Skoog et al. (2015) *Fundamentos de química analítica*.

## Pruebas

- `src/tests/unit/p01-science.test.ts`: ρ(T) y su dominio, sólidos, desplazamiento, incertidumbres y estadística.
- `src/tests/integration/p01-flow.test.ts`: ruta ideal completa, conservación, máquina y evaluación, los 64 errores con
  consecuencia, escenarios y claves de retroalimentación.
- `src/tests/integration/p01-demo.test.ts`: la demostración completa sin navegador (mismo director y controlador):
  sin errores, sin incidentes, lecturas limpias y volúmenes de §8.2.
- `src/tests/integration/replay.test.ts`: repetición determinista de la P01 con reanudación.
- `src/tests/e2e/p01.spec.ts` y `p01-demo.spec.ts`: menú y accesibilidad (axe), balanza, pipeta, vista a la altura
  del ojo y demostración en el navegador.
