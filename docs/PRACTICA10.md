# Práctica 10 — Gases ideales y ley de Boyle

Parte A: constante de los gases R con el CO₂ que libera una alícuota de bicarbonato con vinagre, recogido por
desplazamiento de agua en una bureta invertida. Parte B: ley de Boyle con una jeringa sellada y un sensor de presión
absoluta (perfil Vernier GPS-BTA). Laboratorio 3D con la misma base que las Prácticas 2 a 6 (React Three Fiber,
XState v5, Zustand, i18next, Vitest y Playwright). La especificación sugiere PixiJS; aquí se usa la escena 3D
existente y se mantienen sus reglas científicas, de seguridad, de validación y de evaluación.

```text
NaHCO₃(ac) + CH₃COOH(ac) → CH₃COONa(ac) + CO₂(g) + H₂O(l)
P_CO₂ = P_atm − ΔP_hidro − P_H₂O        ΔP_hidro(mmHg) = h(mm)/13,5   (h = nivel interno − externo, CON signo)
R = P_CO₂·V / (n·T)                      P = A·Vⁿ con V_total = V_marca + V_muerto (0,8 mL en el GPS-BTA)
```

## Acceso

Panel de la plataforma (tarjeta «Práctica 10») o enlace `#p10` cuando el curso la tiene abierta. Modos Práctica,
Guiado, Evaluación y Docente, y **Ver demostración** (una réplica de R y la toma de datos de Boyle con los mismos
gestos del estudiante).

| Estación | Contenido |
|---|---|
| A | Balanza analítica con cabina y puertas, nivel de burbuja, vidrio de reloj, espátula, frasco de NaHCO₃ |
| B | Beaker de 150 mL, embudo, balón aforado de 100,00 mL, pipeta volumétrica de 20,00 mL con propipeta, piseta, agua destilada |
| C | Erlenmeyer de 250 mL, tapón con manguera, vinagre, probeta de 25 mL, beaker de desechos |
| D | Soporte con prensa, beaker de 600 mL (baño), bureta de 50 mL, tubo en U, termómetro, barómetro, regla vertical |
| E | Sensor de presión, interfaz, jeringa de 20 mL con válvula |
| F | Lavadero |

## Correcciones de la guía (§2), visibles al docente

- La ecuación incluye H₂O y se comprueba que conserve C, H, O y Na.
- Balón de **100,00 mL** (un perfil de 50,00 mL obliga a recalcular la concentración).
- La corrección hidrostática usa la altura **con signo**: si el nivel interno está más alto, la presión del gas es menor.
- Relación de densidades 13,5 en modo curricular; ρ_Hg/ρ_agua(T) ≈ 13,57 a 25 °C en modo realista.
- El vinagre declara la base del porcentaje (m/v, m/m o v/v) y se verifica el reactivo limitante.
- «Veinier» → **Vernier**. El GPS-BTA mide presión **absoluta**: no se le suma la atmosférica.
- Los 0,8 mL de volumen muerto son del perfil del sensor; otro sensor u otros conectores tienen otro valor.
- Ajuste libre `P = A·Vⁿ` comparado con n = −1 y n = +1, y P frente a 1/V (`P = a/V + b`).
- No todo el CO₂ llega a la bureta: hay gas disuelto, fugas, gas retenido en el reactor, espuma y escape antes de tapar.

## Arquitectura

```text
src/simulation/gas-laws/           ecuaciones: gas ideal (rechaza °C), vapor (tabla 20–26 °C y Antoine), hidrostática,
                                   estequiometría y limitante, ajustes de Boyle y residuos, incertidumbre, Henry, actividades
src/simulation/instruments/        balanza analítica (cabina, nivel, tara, estabilidad) y sensor de presión (perfiles,
                                   retardo de primer orden, rango, absoluto/manométrico)
src/simulation/gas-world/          mundo: líquidos y sólidos por recipiente, reactor, mangueras y uniones, bureta invertida
                                   (nivel y volumen resueltos juntos), lecturas, réplicas; jeringa de Boyle (boyle-rig.ts)
src/practices/practice-10/         definición, parámetros, escenarios y catálogo de errores, libreta, evidencia,
                                   máquina XState, rúbrica, resultados esperados, reanudación segura
src/engine/gas/                    fachada GasLab3D, controlador (vertidos, piseta, espátula, pipeta, inversión de la
                                   bureta, prensa, llave, regla, émbolo), modelos procedurales, efectos, cámara
src/app/p10/                       store, runtime (cinta y registro encadenado por hash), HUD, instrumentos, seguridad,
                                   acciones, libreta (Cuadros 10.2 y 10.3, Boyle, gráficas, CSV/JSON), revisión, demostración
src/locales/es/practice10.json     textos (`p10.*`, `p10fb.*`)
```

## Modelo físico

| Proceso | Modelo |
|---|---|
| Reacción | Velocidad proporcional al producto de concentraciones y a la agitación; el limitante se agota; la espuma crece con agitación violenta y puede llevar líquido a la manguera |
| Reactor | Espacio de cabeza con gas ideal; el exceso de presión empuja gas por la manguera (restricción por dobleces y punta obstruida); con el tapón quitado el CO₂ escapa; > 10 kPa sobre la atmosférica el tapón salta (bloqueo de seguridad) |
| Uniones | Cada unión floja desvía 12 % del flujo (1 − 0,88ⁿ); la prueba de hermeticidad las detecta |
| Bureta | `P = P_atm − ρg(z_in − z_out)`; nivel y volumen del gas se resuelven juntos; el gas toma la temperatura del baño con retardo; si se llena, el exceso burbujea por la boca |
| Disolución | Ley de Henry en el baño y en el reactor (solo modo realista; baño saturado opcional) |
| Jeringa | Mano como resorte implícito (40 000 N/m, 60 N máx.), fricción estática y dinámica del sello, calentamiento adiabático con hA = 0,0092 W/K (realista), elasticidad del sistema, fugas por sello dañado o Luer flojo |
| Sensor | Retardo de primer orden, resolución, desplazamiento de cero, sobrecarga fuera de 0–210 kPa, no mide con líquido |

Referencias de las pruebas: modo curricular R ≈ −1 %; modo realista R ≈ −12 % (CO₂ disuelto). Boyle con 10,0 mL +
0,8 mL a 101,325 kPa: P(5,0 mL) = 188,6 kPa y n ≈ −0,999; sin el volumen muerto n ≈ −0,92 y residuos curvados.
Los elementos C, H, O y Na se conservan exactamente en todo el recorrido.

## Evaluación

Seguridad y montaje 15 %, preparación gravimétrica y volumétrica 20 %, reacción y recolección 15 %, correcciones y
cálculo de R 20 %, recolección de Boyle 15 %, ajuste e interpretación 10 %, actividades 5 %. Un accidente anula el
puntaje de seguridad. Los cálculos se comparan con lo que corresponde a las lecturas que obtuvo el estudiante y la
revisión explica el sesgo de cada réplica con lo que registró el motor (escape, fuga, disolución, aire inicial, tapado
tardío, perspectiva, lectura antes del equilibrio). En el servidor la nota se recalcula como en las demás prácticas
(`p10` en `src/practices/grading.ts`) y el docente puede verificar el intento por repetición.

## Errores simulables

`SIMULATED_ERRORS_P10` (62 códigos) y la prueba de `src/tests/integration/p10-flow.test.ts`. Escenarios docentes:
balanza desnivelada, vidrio de reloj húmedo, termómetro descalibrado, manguera doblada, bureta con fisura, burbuja en
la pipeta, sello del émbolo dañado, conector Luer flojo y sensor con desplazamiento de cero.

## Accesibilidad

Todo se hace también desde el panel de acciones: vertidos mantenidos, gotas, espátula, puertas, tara y lectura de la
balanza, pipeteo, inversión de la bureta en el baño, prensa, llave, regla, termómetro, barómetro, émbolo (botones
mantenidos y control deslizante), conexión y «Keep» con el volumen total. Vista a la altura del ojo (O), descripciones
en palabras (en Evaluación sin valores exactos), subtítulos y gráficas con tabla.

## Plataforma

`p10` en `LabId`; la migración `migrations/0005_course_labs_p10.sql` reconstruye `course_labs` con el CHECK que
incluye `p10`. **Antes de desplegar hay que aplicarla en producción**
(`npx wrangler d1 migrations apply DB --remote`).

## Pruebas

- `src/tests/unit/p10-science.test.ts`: §35.1–35.6 (estequiometría y alícuota, presión con signo y vapor, caso de
  referencia R ≈ 0,082057 con V ≈ 30,185 mL, sensor, Boyle y ajustes, actividades).
- `src/tests/integration/p10-flow.test.ts`: ruta completa con dos réplicas, conservación, máquina y evaluación,
  errores con consecuencia causal y catálogo de errores; guardado y determinismo.
- `src/tests/integration/replay.test.ts`: repetición determinista de la P10 con reanudación a mitad.
- `src/tests/e2e/p10.spec.ts`: menú y accesibilidad (axe), balanza, bureta invertida y sujeta, punto de Boyle estable.
