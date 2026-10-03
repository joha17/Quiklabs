# Decisiones de implementación

Registro de ambigüedades resueltas eligiendo la opción más simple y segura (§0.2).

| # | Situación | Decisión |
|---|---|---|
| 1 | Versiones de la pila | Se usaron las versiones estables disponibles: React 19, XState 5, Zustand 5, Vite 8, Vitest 5, TypeScript 6 (en v2 además PixiJS 8; en v3, la pila 3D de la fila 40). |
| 2 | Proyección «isométrica ≈30°» | Proyección **dimétrica frontal** con elevación de 30° (profundidad ×0,5, altura ×0,87). Mantiene la mesada horizontal en pantalla, facilita el desplazamiento entre estaciones y la lectura de meniscos. «Vista a nivel» elimina el paralaje. |
| 3 | Estaciones | Una sola mesada continua (A–E de izquierda a derecha); cambiar de estación mueve la cámara, el estado de los objetos se conserva. |
| 4 | Una sola plantilla | Se mantiene 1 plantilla (inventario §6), ubicada entre B y C; puede moverse si está fría (si está caliente, quemadura). |
| 5 | Volumen del vaso de 50 mL | Graduado hasta 50 mL (útil ≤ 45 mL); capacidad hasta el borde ~80 mL para el rebose. |
| 6 | Tubos sin gradilla al inicio | Los tubos empiezan en una **bandeja**; colocarlos en la gradilla es parte de la técnica (§5.1-1). |
| 7 | Agua de los tubos | Se mide con la probeta (resolución 0,2 mL) llenada con la piseta. |
| 8 | Cristal semilla | Frasco de KNO₃ puro en la estación E (punta de espátula). |
| 9 | Baño | Cristalizador + jarra de agua + cubeta y pala de hielo. Nivel máximo seguro 4,6 cm (más ⇒ entra agua al vaso, D6). |
| 10 | Pinza | Se activa como «modo pinza» de la mano (botón del HUD o clic en la pinza). |
| 11 | Paralaje | Si la vista no está a nivel, la lectura accesible del menisco se desplaza +0,2 mL (una división) y las marcas se ven desplazadas. |
| 12 | Aceleración del tiempo | ×1/×2/×5/×10 (predeterminado ×2). Se suspende automáticamente mientras se vierte o se aprieta la piseta para no perder precisión. No afecta al determinismo (paso fijo). |
| 13 | Bloqueos críticos | Se muestran como banda roja persistente con la explicación y la acción de recuperación (no como diálogo modal), para poder actuar sobre la mesada (p. ej., retirar el vaso de la placa). |
| 14 | Evaporar un filtrado con carbón | Por seguridad (§10 prevalece), si el depósito contiene ≥ 5 mg de carbón y queda casi seco, la placa se corta; se termina de secar fuera de la placa. Con buena filtración (< 5 mg) se ven puntos negros sin bloqueo. |
| 15 | Combustible en la placa | Papel de filtro, papel de pesada y papel absorbente no pueden colocarse sobre la placa encendida o > 60 °C. |
| 16 | Impurezas del reactivo | KNO₃ técnico 98,5 % (configurable) para que las purezas de §9 surjan del balance y no de cifras fijas. |
| 17 | Carbón recuperable | Factor 0,975 sobre el carbón del papel (retención en fibras). |
| 18 | Olor | Solo «Abanicar» da el dato (evento con la percepción). «Acercar a la nariz» genera alerta y no registra dato. El campo de olor de la libreta se habilita al abanicar el tubo con ese rótulo. |
| 19 | «Usar observación actual» | Inserta en «Evidencia» una descripción objetiva del tubo (volumen, aspecto, temperatura cualitativa) con marca de tiempo; nunca la clasificación. |
| 20 | Retroalimentación de la libreta | Práctica: botón «Revisar» marca los campos a revisar. Guiado: además, una pista tras dos revisiones. Evaluación: sin indicaciones hasta la entrega. |
| 21 | Respuestas abiertas | Se puntúan con heurísticas (longitud y términos clave) y se marcan «para revisión docente». |
| 22 | Persistencia | `localStorage`. Al recargar se reanuda en pausa, sin vertidos ni agitación activos. |
| 23 | Física de objetos | Propia (muelle con velocidad máxima, encaje suave, apilado por soportes, búsqueda de hueco libre). Matter.js no fue necesario. Los objetos se levantan por encima de lo que tienen debajo al transportarlos; al inclinar, el pico se mantiene sobre la boca del receptor. |
| 24 | Vuelco | Soltar un recipiente con contenido inclinado > 50° lo vuelca y derrama. |
| 25 | Rotura | Caída fuera de la mesada (90 %), choque fuerte, choque térmico, varilla con agitación muy brusca. El vidrio roto se barre con escobilla; tocarlo con la mano es un bloqueo crítico. |
| 26 | Repuestos | Probeta, vaso, tubo, papel de filtro, embudo, cápsula y varilla se reponen desde el panel «Material» o con «Pedir uno nuevo» al seleccionar el objeto roto (la varilla exige barrer antes los restos). El repuesto aparece en el frente de la estación y queda registrado (`sparesRequested`). Resultados y evaluación usan el **papel** del recipiente (probeta, cápsula, vaso de la mezcla; `practices/practice-02/roles.ts`), no su id, así que el trabajo hecho con un repuesto cuenta igual. Los reactivos consumidos no se reponen (nuevo intento). |
| 27 | Pruebas e2e en Windows | Playwright usa Microsoft Edge instalado (`channel: 'msedge'`) para no descargar navegadores. |
| 28 | Asa de pruebas | `window.__lab` expone el store para que Playwright lea posiciones/estado; las manipulaciones se hacen con ratón/teclado reales. |
| 29 | Escala de la mesada | 7 px/cm con zoom 1; zoom 0,6–6. |
| 31 | Animaciones de acción | Cada acción tiene una animación visual (`engine/effects/animator.ts`): la espátula entra al frasco, se inclina sobre el recipiente y caen los granos; el gotero se aprieta y la gota cae; la pala vierte cubitos; la mano abanica los vapores; el tubo «sube a la cara» al oler directo; la varilla raspa; los objetos se asientan al colocarlos. El comando del dominio se aplica en el instante físico (p. ej., cuando caen los granos); la animación nunca cambia masas. Con «reducir movimiento» las animaciones duran ≤ 0,15 s. |
| 32 | Efectos continuos | Burbujas de nucleación/ebullición, estelas de disolución sobre sólidos solubles, remolinos al agitar, gotas reales del embudo, salpicaduras del chorro, destellos al crecer cristales, vapor y condensación en el vidrio de reloj, etiquetas flotantes con la cantidad («+0,10 g», «+1 gota»). |
| 33 | Fondo | Sala dibujada por código: zócalo de azulejos, canaleta con enchufes y llaves de gas, estante de reactivos, vitrinas con material de vidrio, carteles de EPP/comburente/prohibido comer, reloj, campana de extracción en D–E, lavaojos, fregadero con grifo de cuello de cisne, mesada de resina epoxi moteada y muebles con cajones. |
| 30 | Exportación | JSON (registro, libreta, informe). PDF no incluido (el navegador puede imprimir la revisión). |

> Las filas 2, 11, 23, 29 y 33 describen la versión 2.5D (v2). Quedan reemplazadas por las decisiones de la migración 3D (v3) que siguen.

## Migración a 3D (especificación v3)

| # | Situación | Decisión |
|---|---|---|
| 40 | Pila 3D | Three.js 0.186 + React Three Fiber 9 + drei 10 + Rapier (`@react-three/rapier` 2). PixiJS se **eliminó**. El modo ligero 2.5D es opcional (PUEDE) y no se conservó: duplicaría las vistas y las pruebas. La fachada `Lab3D` (`engine/Lab3D.ts`) cumple el papel de `LabRenderer`: la interfaz React solo conoce esa fachada, y `simulation/` no depende de ninguna implementación. |
| 41 | Regla de arquitectura | ESLint prohíbe en `simulation/` los imports de `three`, `@react-three/*`, `@dimforge/*`, React y del motor o la UI. |
| 42 | Unidades | 1 unidad de escena = 1 cm. Mesada: (x a lo largo, y en profundidad, z hacia arriba) → escena (X = x, Y = z, Z = −y); gravedad −981 cm/s². Todo en `engine/units.ts`. |
| 43 | Vidrio sin `transmission` | En Three.js, los objetos transmisivos solo «ven» objetos opacos: el líquido translúcido dentro del vaso desaparecía. El vidrio es `MeshPhysicalMaterial` transparente con barniz (clearcoat) y reflejos del entorno (`RoomEnvironment`). En Baja, vidrio transparente simple. Media conserva el barniz porque el vidrio ocupa pocos píxeles y su costo medido es despreciable. |
| 44 | Sin postproceso | Alta usa mapeo tonal ACES, MSAA y sombras PCF suaves; no se añadió una cadena de postproceso (bloom/SSAO): no aporta información científica y encarece cada fotograma en GPU integradas, el equipo objetivo de la asignatura. |
| 45 | Líquidos | Volumen = la misma cavidad *lathe* del recipiente, recortada por un **plano de recorte en coordenadas del mundo** (`clippingPlanes`), siempre horizontal aunque el recipiente rote. Con el recipiente vertical se añade la tapa de superficie y el menisco. El nivel sale de `liquidLevel()` (integración por rebanadas del perfil), la misma función que usa el vertido. |
| 46 | Volumen ↔ altura | `practices/practice-02/instruments.ts` define los perfiles (cm) de §3.5; `volumeToHeight`/`heightFromVolume` integran el perfil. Las marcas de graduación se dibujan con esa función: la marca de 10 mL de la probeta encierra exactamente 10,0 mL (prueba unitaria). |
| 47 | Embudo | Origen = vértice del cono; apoya en la mesada sobre la espiga (z = 4 cm). Su capacidad en el dominio (26 mL) es el volumen hasta el **borde del papel** (3,35 cm sobre el vértice), no hasta el borde del vidrio (44 mL): la ciencia (v2) no cambia y la vista dibuja el papel a esa altura. |
| 48 | Física (Rapier) | Los cuerpos son **cinemáticos** (siguen la pose del dominio) mientras están en reposo, en un soporte o sostenidos. Al soltarlos sobre la mesada pasan a **dinámicos temporales**: caen, se apoyan o vuelcan, y al quedarse quietos escriben su pose final (`setPose`, posición + cuaternión) y vuelven a cinemáticos. Golpes > 250 cm/s se envían al dominio (`drop`), que decide la rotura. La física nunca decide masas ni caudales. |
| 49 | Prueba 17.1-10 | En el navegador, con escena, física y un arrastre real, se registra cada comando con su tick; en Node se reproduce sobre el mismo estado inicial **sin escena y sin ninguna pose** (`setPose`). Cantidades por recipiente, temperaturas y libro de balance coinciden exactamente (`src/tests/e2e/lab.spec.ts`). |
| 50 | Apoyo sobre equipos | La búsqueda de hueco libre usa la misma huella rectangular que los colisionadores (`PROP_FOOTPRINT`). Si aun así un objeto queda quieto encima de algo que no es un soporte, se baja a un hueco libre de la mesada: nada queda suspendido. |
| 51 | Cámara | `OrbitControls` (drei) limitado: ángulo polar 0,2–1,52 rad, distancia 10–320 cm, objetivo dentro de la mesada. Vistas por estación con transición suave (instantánea con «reducir movimiento»). «Nivel del ojo» coloca la cámara a la altura del menisco. Doble clic acerca al objeto. Si la escena se recrea (calidad, contexto restaurado), se conserva la vista. |
| 52 | Paralaje real | La lectura accesible del menisco depende de la altura de la cámara respecto del menisco: pendiente > 0,08 ⇒ ±0,2 mL (una división). Con «Nivel del ojo» la lectura es exacta. |
| 53 | Selección | *Raycast* sobre volúmenes invisibles simples (un cilindro por objeto, partes como la perilla o el botón TARA), nunca sobre la malla detallada. Si el puntero toca un objeto, la órbita de cámara no recibe el gesto. |
| 54 | Calidad automática | Se descartan 4 s de calentamiento (compilación de shaders) y se miden 3 s. < 28 fps ⇒ baja un nivel; > 55 fps en Media ⇒ Alta. Nunca se cambia mientras se sostiene un objeto o la física lo está apoyando. Ajuste manual en «Ajustes». |
| 55 | Sala en GPU integradas | La sala ocupa casi toda la pantalla. En Media, paredes/suelo/techo mates usan Lambert y la mesada pierde el barniz; en Baja todo lo no metálico usa Lambert. Reduce ~50 % el tiempo de GPU (ver RENDIMIENTO.md). |
| 56 | Sombra de contacto | En Baja (sin sombras proyectadas) cada objeto lleva un disco difuso bajo su base. |
| 57 | Pérdida de contexto WebGL | Se avisa al estudiante; al restaurarse, el lienzo se recrea por completo a partir del estado del dominio (que nunca se pierde). Probado con `WEBGL_lose_context`. |
| 58 | Carga diferida | La escena (R3F, drei, Rapier con su WASM, ~2,9 MB) se descarga al entrar al laboratorio; la portada pesa ~0,9 MB. |
| 59 | Pruebas e2e con GPU | Playwright lanza Edge con `--enable-gpu --ignore-gpu-blocklist` y un solo *worker*, para medir el rendimiento real y no el rasterizador por software. |
| 61 | Herramientas con imán | Para agilizar el ejercicio, espátula, pala, gotero y piseta actúan **sin soltar el clic**: si la punta queda 0,2 s a menos de 1,5 cm de la boca de un recipiente sobre el que la herramienta puede hacer algo, se acopla con una aproximación suave y hace la acción natural (cargar, depositar, aspirar) y vuelve a seguir al puntero. Gotero y piseta cargados se quedan alineados con la boca (clic derecho / `P` = gota o agua) hasta alejarse 3 cm. Solo atraen los recipientes válidos (espátula vacía → frascos; cargada → tubos/vasos/papel), así que cruzar por encima de otros frascos no hace nada, y la acción no se repite sobre el mismo recipiente hasta salir de él. El dominio recibe los mismos comandos que antes (`scoop`, `tapTool`, `aspirate`, `dispenseDrops`); soltar sobre el recipiente sigue funcionando. |
| 62 | Acople piseta ↔ recipiente | La boquilla de la piseta está a 5,5 cm de su cuerpo, así que apuntarla es incómodo. La piseta se acopla también cuando su **cuerpo** queda a menos de 3 cm del recipiente (por cualquier lado): se desplaza por encima del recipiente y baja al lado con la boquilla sobre la boca. Soltarla cerca la deja en reposo acoplada. En sentido inverso, soltar una probeta o un vaso a menos de 4 cm del punto bajo la boquilla de una piseta en la mesada lo encaja ahí (si el sitio está libre); mientras se arrastra, la piseta se resalta. Pulsar la piseta en reposo sin mover = apretar; arrastrarla = separarla. Mover el recipiente deja la piseta en la mesada (no la arrastra). |
| 63 | Acople para verter | Cada transferencia de la práctica tiene acople y animación. Un recipiente con contenido que se detiene 0,35 s con su cuerpo a menos de 2,5 cm de un receptor válido (tabla `POUR_TARGETS`) se acopla: el pico queda sobre el centro de la boca y la pose se recalcula con la inclinación para que el pico no se mueva (sin atravesar el receptor ni la mesada). Clic derecho / `P` / «Verter (mantener)» inclinan a 40°/s (máx. 125°); al soltar se endereza a 120°/s. Rueda y Q/E ajustan (hacia el receptor = verter). Soltar el clic izquierdo lo endereza y lo apoya al lado. Las zonas de apoyo (placa, baño, gradilla, balanza) tienen prioridad; un recipiente vacío no se acopla. El caudal sigue saliendo de la geometría (nivel frente al pico). |
| 64 | Resto de interacciones | Varilla y sonda entran solas al acercarlas a la boca (la varilla sigue en la mano para agitar; la sonda queda colocada); al sacar la varilla no vuelve a entrar en el mismo vaso hasta alejarla. La espátula sucia se limpia sola sobre el papel absorbente. Soltar un vaso a menos de 6 cm del sitio bajo la espiga del embudo montado lo coloca sobre la placa base con la espiga tocando la pared interna. La placa base del soporte es una plataforma (1,2 cm), no un obstáculo. El papel absorbente se lleva al charco y se frota; el vidrio de reloj, la varilla y la sonda se deslizan a su sitio; lo que se apoya inclinado se endereza mientras baja. |
| 65 | Apretar la piseta | Apretar la piseta (mantenerla pulsada, botón «Apretar», `P`, clic derecho) nunca moja la mesada: si la boquilla no está sobre un recipiente, se acopla sola al recipiente válido más cercano a menos de 8 cm (probeta, vaso, tubo, cápsula o embudo) y entonces echa el agua; si no hay ninguno, no aprieta y lo avisa. |
| 66 | Color del agua | El agua se dibuja azul claro (no casi incolora) con un poco de luz propia y un menisco azul oscuro: dentro de la probeta estrecha, sobre la mesada oscura, el agua transparente no se distinguía y parecía que la probeta no se llenaba. Las suspensiones y disoluciones coloreadas se mezclan a partir de ese tono. |
| 67 | Lavado del residuo | Solo cuenta como lavado (`washMl`) el agua de la piseta que llega al embudo o al vaso de la mezcla después de que la **mezcla** empezó a pasar por el filtro (`mixtureFunnelPourMl` > 0,5 mL). Antes, el agua de humedecer el papel ya iniciaba el contador y empujaba el lavado fuera del rango 1,6–2,8 mL. |
| 68 | Receptor bajo el embudo | El vaso que recibe el goteo del embudo no es destino de vertido (su boca queda bajo el cono): acercar la mezcla por cualquier lado acopla con el embudo, nunca con el vaso del filtrado (que se saltaría el filtro). Al levantar ese vaso de debajo del embudo no se acopla para verter en él hasta alejarlo. |
| 69 | Nombres y descripciones | La varilla se llama «Varilla de vidrio (agitador)» en la lista de material, igual que el repuesto y las pistas. La descripción de una suspensión lleva el color del sólido suspendido («suspensión negra», «suspensión amarilla») en lugar de «oscura» para todo. |
| 60 | Desplazamiento por borde | Arrastrar un objeto a menos de 40 px del borde desplaza la cámara lateralmente (como en v2). |

## Resumen por hitos

- **H0** Vite + TS estricto + ESLint (con regla de arquitectura) + Vitest + Playwright. `npm test` y `npm run build` pasan.
- **H1** Núcleo científico completo; 9 pruebas de §17.1 en verde; `simulation/` no importa Pixi/React (regla ESLint).
- **H2** Escenario 2.5D, arrastre con muelle, rotación/vertido por geometría, encaje, agitación por gestos.
- **H3** Parte A con 6 tubos, máquina de estados del tubo, Cuadro 2.1 y errores A1–A7 (pruebas de integración).
- **H4–H5** Parte B completa; ruta ideal dentro de §9 con 3 semillas; filtro roto, exceso de agua, nucleación, derrames, mezcla seca.
- **H6** Evaluación por evidencia (5 componentes), Cuadro 2.2, actividades, modo docente, persistencia.
- **H7** Accesibilidad (teclado, descripciones, subtítulos, escala, movimiento reducido), sonido sintetizado, axe-core sin errores graves.

### Hitos de la versión 3D (v3)

- **H0–H1** Sin cambios en el núcleo científico; ESLint amplía la regla de arquitectura a Three/R3F/Rapier. 48 pruebas Vitest en verde.
- **H2** Escena R3F: sala, mesada, luces con sombra que sigue a la estación, `RoomEnvironment`, cristalería *lathe* desde `instruments.ts`, volumen↔altura, líquido recortado con plano horizontal del mundo, graduaciones en `CanvasTexture`.
- **H3** Rapier (cinemático/dinámico temporal), arrastre por plano de la mesada con muelle, encaje, vuelco, vertido con chorro e impacto, rotura por golpe; pruebas e2e de gradilla, vertido, objetos sin atravesarse ni suspendidos.
- **H4–H7** Partes A y B, libreta, evaluación y persistencia reutilizados sin cambios científicos; prueba 17.1-10 (balance idéntico con y sin escena).
- **H8** Calidad Alta/Media/Baja con selección automática, presupuestos verificados por estación y calidad, pérdida de contexto, carga diferida, cámara accesible (botones y teclas), documentación (RENDIMIENTO.md).
