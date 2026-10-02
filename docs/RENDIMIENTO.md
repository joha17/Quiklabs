# Rendimiento (§3.9, §15)

## Niveles de calidad

Definidos en `src/engine/quality.ts`. Ninguno cambia datos científicos: solo la representación.

| | Alta | Media | Baja |
|---|---|---|---|
| Sombras | Proyectadas, mapa 2048, PCF suave | Proyectadas, mapa 1024, PCF | Sin sombras proyectadas; **sombra de contacto** bajo cada objeto |
| DPR máximo | 2 | 1,5 | 1,25 |
| Antialias (MSAA) | Sí | Sí | No |
| Vidrio | Transparente con barniz + reflejos del entorno | Igual (ocupa pocos píxeles) | Transparente simple |
| Sala | PBR completo, mesada barnizada | Paredes/suelo/techo mates en Lambert, mesada sin barniz | Todo lo no metálico en Lambert, menos detalle (sin frascos de estante) |
| Partículas | 100 % | 60 % | 30 % |
| Segmentos de revolución (lathe) | 48 | 32 | 20 |

- **Selección automática:** se descartan 4 s de calentamiento (compilación de shaders) y se miden 3 s; < 28 fps baja un
  nivel, > 55 fps en Media sube a Alta. Nunca cambia mientras se sostiene un objeto o la física lo está apoyando.
  Manual en «Ajustes → Calidad gráfica».
- *Instancing* para granos, trozos, partículas en suspensión, gotas, cristales, hielo, frascos del estante y cajones.
- Materiales compartidos por nivel de calidad; las texturas (graduaciones, rótulos, pantallas) son `CanvasTexture`
  que solo se redibujan cuando cambia el texto.
- La escena se descarga aparte (carga diferida): portada **0,89 MB** (264 kB gzip); escena 3D **2,88 MB**
  (1,02 MB gzip, incluye el WASM de Rapier).

## Presupuestos verificados (prueba automática)

`src/tests/e2e/lab.spec.ts › capturas por estación y calidad` recorre las 5 estaciones en los 3 niveles, guarda una
captura de cada una (`e2e-shots/estacion-<A–E>-<HIGH|MEDIUM|LOW>.png`) y **falla** si se supera el presupuesto:
≤ 200 llamadas de dibujo y ≤ 500 000 triángulos.

Medición del 1 de octubre de 2026 — Windows 11, **Intel Iris Plus (GPU integrada)**, Microsoft Edge sin ventana con
aceleración por hardware (ANGLE/D3D11), ventana 1440 × 900, DPR 1. Las cifras de llamadas incluyen el pase de sombras.

| Estación | Alta: llamadas / triángulos / fps | Media: llamadas / triángulos / fps | Baja: llamadas / triángulos / fps |
|---|---|---|---|
| A (Parte A) | 165 / 87 780 / 49 | 165 / 66 884 / 57 | 110 / 33 668 / 25\* |
| B (preparación) | 153 / 59 584 / 41 | 153 / 48 224 / 58 | 91 / 22 232 / 58 |
| C (filtración) | 88 / 49 998 / 47 | 88 / 39 822 / 56 | 50 / 16 368 / 60 |
| D (evaporación) | 72 / 47 796 / 26\* | 72 / 37 588 / 59 | 36 / 15 938 / 50 |
| E (cristalización) | 80 / 45 844 / 43 | 84 / 34 756 / 58 | 64 / 20 064 / 60 |

\* Muestras de 1 s tomadas justo después de recrear la escena (cambio de calidad) o de la primera visita a la
estación, cuando todavía se compilan shaders; no se repiten en el uso continuo. El fps está limitado a 60 por el
navegador.

**Resultado:** máximo 165 llamadas (≤ 200) y 87 780 triángulos (≤ 500 000) en todos los casos. Media sostiene
56–59 fps en la GPU integrada; Alta, 41–49 fps (pensada para GPU dedicada).

## Costo de GPU por fotograma (panel del navegador de la aplicación)

Medido en la misma GPU con renderizado sincrónico (render + `readPixels` de 1 píxel, mediana de 9; se resta el costo
de una escena vacía, ~17 ms de sincronización). Ventana 1024 × 768, DPR 1,5.

| Nivel | Resolución del lienzo | Antes de simplificar la sala | Después |
|---|---|---|---|
| Baja | 1280 × 792 | ≈ 13,1 ms | **≈ 6,7 ms** |
| Media | 1536 × 950 | ≈ 15 ms | **≈ 13 ms** |

La sala ocupa casi toda la pantalla y dominaba el sombreado; pasar sus superficies mates a Lambert redujo a la mitad
el costo en Baja (DECISIONES n.º 55). Nota: ese panel limita `requestAnimationFrame` a ~30 fps incluso con la escena
vacía, por eso allí el fps no es representativo y se midió el tiempo de GPU.

## Robustez

- **Pérdida de contexto WebGL:** aviso al estudiante y reconstrucción completa del lienzo desde el estado del dominio
  al restaurarse (prueba e2e con `WEBGL_lose_context`; el estado no cambia).
- **Paso fijo:** dominio a 20 Hz y Rapier a 60 Hz con interpolación; máximo 400 pasos del dominio por fotograma y sin
  «recuperar» el tiempo de una pestaña oculta. El resultado científico no depende de los fps (pruebas 17.1-9 y 17.1-10).
- La aceleración del tiempo se suspende mientras se vierte o se aprieta la piseta.

## Cómo volver a medir

```bash
npm run test:e2e -- -g "capturas por estación"
```

La salida incluye una línea `RENDER_STATS {...}` con llamadas, triángulos, geometrías y fps por estación y nivel.
En la aplicación, `window.__lab.getState().stage.stats` muestra lo mismo en vivo (se actualiza cada segundo).
