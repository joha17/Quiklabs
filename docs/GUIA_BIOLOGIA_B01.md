# Biología · Práctica 1 — Del preparado a la observación

**Microscopía y estereoscopía experimental** · Laboratorio virtual Quiklabs · identificador `b01`

| | |
|---|---|
| Área | Biología General I |
| Duración estimada | 70–100 min |
| Modos | Práctica, Guiado, Evaluación y Depuración docente |
| Basado en | Guía «Práctica 1. Uso del equipo óptico» de Biología General |
| Imágenes del ocular | Ilustraciones didácticas generadas por el sistema, **no son microfotografías** |
| Estado científico | Modelo curricular; los parámetros ópticos están **por calibrar** (ver [Limitaciones](#limitaciones-y-validación-pendiente)) |

> Documentación técnica (arquitectura, módulos y pruebas): [BIOLOGIA_B01.md](BIOLOGIA_B01.md).

---

## 1. Propósito

El estudiante practica, de principio a fin y con consecuencias realistas, el uso del equipo óptico básico de un
laboratorio de biología:

1. Prepara un **montaje húmedo** de una hoja de *Elodea* (gota de agua destilada y cubreobjetos sin burbujas).
2. Opera el **microscopio compuesto** de 4X a 40X: pinza, platina X/Y, macrométrico, micrométrico, revólver, luz,
   diafragma y condensador, y vigila en todo momento la separación entre el objetivo y la preparación.
3. Toma de una caja una **lámina fija** asignada, la observa y la devuelve a su ranura.
4. Observa una **hoja vegetal** y un **insecto conservado** con el **estereoscopio**: luz incidente, zoom, enfoque y
   ajuste binocular.
5. Registra sus observaciones en la **libreta**, calcula aumentos y campos visuales y deja el puesto en orden.

## 2. Objetivos de aprendizaje

Al terminar, el estudiante es capaz de:

- Nombrar las partes del microscopio compuesto y del estereoscopio y explicar la función de cada una.
- Preparar un montaje fresco útil: fragmento del tamaño adecuado, líquido suficiente y cubreobjetos bajado inclinado
  y despacio.
- Enfocar de forma segura: localizar con 4X, mirar de lado antes de acercar, usar el macrométrico solo con aumento bajo
  y afinar con el micrométrico.
- Ajustar la iluminación (intensidad, diafragma y condensador) a cada objetivo.
- Calcular el aumento total (ocular × objetivo) y estimar el campo visual (FN / objetivo).
- Distinguir para qué sirve cada instrumento: tejido translúcido al compuesto, objeto opaco y tridimensional al
  estereoscopio.
- Manipular vidrio y material biológico con seguridad y cerrar el puesto correctamente.

## 3. Fundamento

```text
Aumento total      M = M_ocular × M_objetivo           10X × 4 / 10 / 40  →  40X / 100X / 400X
Campo visual       FOV ≈ FN / M_objetivo (mm)          FN = 18 mm (HIPOTÉTICO) → 4,50 / 1,80 / 0,45 mm
Resolución         d ≈ 0,61 λ / NA                     λ = 550 nm, NA = 0,65 → ≈ 516 nm (teórico)
```

- Al **subir el aumento** el campo se reduce: hay que **centrar** la estructura antes de girar el revólver.
- La **distancia de trabajo** se acorta con el aumento (17 / 7 / 0,6 mm en el modelo): con 40X el objetivo queda casi
  sobre el cubreobjetos y el macrométrico puede provocar un choque.
- La imagen del compuesto está **invertida**: mover la platina a la derecha desplaza la imagen a la izquierda.
- El **diafragma** regula el contraste; demasiado cerrado se pierde detalle y demasiado abierto se lava la imagen.
- El **estereoscopio** da poco aumento y mucho campo, con visión en relieve y luz incidente para objetos opacos.

## 4. El laboratorio virtual

La mesada tiene seis estaciones. Se cambia entre ellas con las teclas **1–6** o con los botones **A–F**.

| Estación | Material |
|---|---|
| **A · Seguridad** | Bandeja de EPP, contenedor de vidrio roto, residuos biológicos |
| **B · Montaje** | Área de montaje, placa con *Elodea*, 2 portaobjetos, caja de cubreobjetos, gotero de agua destilada, gotero de lugol (no asignado), pinza fina, bisturí, papel absorbente, papel de lente, toalla |
| **C · Microscopio** | Microscopio compuesto binocular: oculares 10X con distancia interpupilar y anillo de dioptrías, revólver 4X / 10X / 40X, platina mecánica con pinza de palanca y mandos coaxiales X/Y, macrométrico y micrométrico a ambos lados, condensador con palanca del diafragma y perilla de altura, rueda de intensidad e interruptor |
| **D · Láminas fijas** | Caja de 12 ranuras: epidermis de cebolla teñida (**asignada**), tallo de maíz en corte transversal y raíz de *Ranunculus* en corte transversal |
| **E · Estereoscopio** | Perillas de zoom 0,7–4,5X, oculares 10X con dioptrías, perillas de enfoque (suben y bajan el cuerpo óptico), carro de la columna (altura del cabezal), diales de luz incidente y transmitida, interruptor; bandeja con hoja vegetal e insecto |
| **F · Libreta y cierre** | Bandeja de limpieza, libreta y botón «Cerrar el puesto» |

### Equipo de protección

Para entrar se exigen **bata, calzado cerrado, cabello recogido y manos limpias**. Los **guantes son opcionales**,
porque el protocolo solo usa agua destilada. Riesgos que se presentan:

- **Vidrio:** portaobjetos y cubreobjetos se rompen; los fragmentos van al contenedor de vidrio roto.
- **Material biológico:** los restos de muestras van a residuos biológicos.
- **Líquidos y electricidad:** un derrame en la platina se seca antes de encender.

## 5. Controles

Los equipos se manejan **como los reales: tomando cada pieza en su lugar**. Al pasar el puntero por una pieza aparece
su nombre y el gesto; con clic sostenido se toma y, arrastrando, gira o se desliza sobre su eje. No hay botones de
«enfocar» o «cambiar objetivo»: se gira la perilla o el revólver.

| Acción | Ratón | Teclado |
|---|---|---|
| Elegir un objeto | Clic | Flechas |
| Tomar / llevar / soltar | Clic y arrastrar sobre el área de montaje, la platina, la caja o la base del estereoscopio | Intro |
| Usar la herramienta en la mano | Clic | **P** (Mayús + P: con fuerza o de golpe) |
| Inclinar el cubreobjetos | — | **Q / E** |
| Girar un mando (macro, micro, mandos X/Y, rueda de luz, condensador, zoom, enfoque, dioptrías) | Tomar la perilla y arrastrar; o la rueda del ratón sobre ella | Clic en el mando y **Q / E** (Mayús: paso grande) |
| Cambiar de objetivo | Tomar el anillo moleteado del revólver y girarlo hasta el clic (si se suelta cerca, encaja solo) | Clic en el revólver y **Q / E** |
| Abrir / cerrar la pinza o el diafragma | Arrastrar la palanca (la pinza queda abierta si se empuja hasta el fondo; si no, el resorte la cierra) | Panel accesible |
| Distancia interpupilar | Arrastrar un tubo ocular hacia afuera o adentro | Panel accesible |
| Altura del cabezal del estéreo | Arrastrar el carro de la columna arriba o abajo | Clic en el carro y **Q / E** |
| Encender | Clic en el interruptor | Panel accesible |
| Mirar por el ocular | Clic en un ocular | **O** |
| Registrar lo que se ve | Botón «📷 Registrar» | **C** |
| Mirar de lado la separación | Botón 👁 | **L** |
| Estaciones A–F | Botones A–F | **1–6** |
| Orbitar / vista inicial | Botones de cámara | **J / L / I / K** · **0** |

Todos los gestos tienen equivalente en el **panel de acciones** de la parte inferior, que funciona con teclado y lector
de pantalla. Los mandos de los instrumentos están plegados bajo **«Mandos accesibles»** (se despliegan con un clic y la
preferencia se recuerda); envían exactamente los mismos comandos que el gesto sobre la pieza.

## 6. Procedimiento

### A · Seguridad y partes

1. Verifica el EPP en el diálogo de entrada.
2. Inspecciona el contenedor de vidrio roto y el de residuos biológicos.
3. Selecciona con 🔍 las partes del microscopio y del estereoscopio para ubicarlas (sirven para los cuadros 1 y 2).

### B · Montaje húmedo

1. Lleva el **portaobjetos** al área de montaje e inspecciónalo; si tiene residuo, límpialo con papel de lente.
2. Con la **pinza**, toma una hoja de *Elodea* y déjala **en el centro**. Una hoja pequeña se monta entera; córtala
   con el bisturí solo si no cabe bajo el cubreobjetos, y con presión suave.
3. Limpia la pinza.
4. Deja **una gota de agua destilada** sobre la hoja: ni seco ni en exceso. No uses lugol.
5. Toma un **cubreobjetos** con la pinza, **inclínalo (unos 45°)** con Q/E y **bájalo lento** con P. Si queda aire
   sobre el tejido, levántalo y vuelve a bajarlo.
6. Si sobra líquido, sécalo **solo por el borde** con papel absorbente.

### C · Observación al microscopio

1. Enciende el microscopio con su **interruptor** (lado izquierdo de la base) y comprueba que el **4X** está en el eje;
   si no, gira el anillo del revólver hasta el clic.
2. **Empuja la palanca de la pinza** hasta abrirla, coloca el portaobjetos contra el tope con la muestra hacia arriba y
   suelta la palanca para que la sujete.
3. **Mira de lado (L)** y, con el **macrométrico**, acerca la platina sin que el objetivo toque la preparación.
4. **Haz clic en un ocular** para mirar y enfoca **alejando** con el macrométrico; afina con el **micrométrico** (la
   rueda pequeña, por fuera de la grande). Si ves dos círculos, desliza los tubos oculares hasta ver uno solo.
5. Ajusta la **rueda de intensidad**, la **palanca del diafragma** y la **perilla del condensador** hasta que el tejido
   se vea con buen contraste.
6. Centra con los **mandos X/Y** (bajo la platina, a la derecha) una zona con tejido y sin burbujas, mantén la vista
   quieta un momento y **registra (C)**.
7. Gira el revólver a **10X** hasta que **enclave**, reenfoca **solo con el micrométrico** y registra otra vez.
8. Opcional: **40X**, abriendo un poco más el diafragma y **sin tocar el macrométrico**.
9. En la libreta, importa las capturas y escribe el aumento total de cada una.

### D · Lámina fija

1. Aleja la platina, vuelve a **4X**, abre la pinza y retira el montaje fresco.
2. Abre la caja, **lee la etiqueta** y toma la lámina asignada (epidermis de cebolla teñida).
3. Llévala directamente a la platina: **no lleva gota ni cubreobjetos**, porque es permanente.
4. Enfoca, observa y registra.
5. Retírala y **devuélvela a su misma ranura**. Cierra la caja.

### E · Estereoscopio

1. Enciende el estereoscopio con su interruptor y sube el **dial de luz incidente** (derecha de la base).
2. Coloca la **hoja vegetal** en el centro de la platina.
3. Enfoca con las **perillas de enfoque** (el cuerpo óptico sube o baja) y **zoom bajo**; sube el zoom con las perillas
   del cuerpo solo después de localizar y centrar la zona. Registra.
4. Repite con el **insecto**, tomándolo con la pinza **sin apretar**. Si brilla, baja la luz incidente.
5. Con par estereoscópico, ajusta la **distancia interpupilar** y las **dioptrías**.
6. Devuelve las muestras a su bandeja.

### F · Libreta y cierre

1. Deja el microscopio **estacionado**: 4X en el eje, platina baja y luz apagada.
2. Apaga el estereoscopio, cierra la caja y devuelve todo el material.
3. Completa la libreta y pulsa **«Cerrar el puesto»**. Después, **entrega**.

## 7. Libreta

| Cuadro | Contenido |
|---|---|
| 1 · Componentes del microscopio | Qué hiciste con cada parte y para qué sirve (✓ si la manipulaste) |
| 2 · Componentes del estereoscopio | Ídem para el estereoscopio |
| 3 · Preparación fresca | Tipo de corte, líquido usado, colocación del cubreobjetos e incidentes |
| 4 · Microscopía | Capturas importadas: muestra, objetivo, ocular, **aumento total**, región y estructuras visibles |
| 5 · Láminas fijas | Etiqueta, ranura, descripción y devolución |
| 6 · Estereoscopía | Capturas de la hoja y del insecto: luz, zoom, aumento y rasgos |
| 7 · Comparación | Campo visual, profundidad de campo y finalidad de cada instrumento |
| 8 · Cálculos y cierre | Aumentos y campos (FN / objetivo), error propio, consecuencia, corrección e inventario final |

**Preguntas de análisis**

1. Calcula los aumentos con 4X, 10X y 40X y explica por qué el campo se reduce.
2. ¿Por qué la imagen se mueve al girar los mandos X/Y y qué riesgo tiene empezar con un aumento alto?
3. Compara lo que viste de la hoja y del insecto con el estereoscopio con lo que ofrece el compuesto.
4. ¿Cómo influyeron la posición, el foco, el diafragma y la luz en una de tus capturas?
5. Explica un error propio, su consecuencia en la preparación o en la imagen y cómo lo corregiste.
6. ¿Qué estructuras de tus capturas puedes identificar y en qué te basas?
7. Relaciona los cuidados mecánicos (separación, pinza, revólver) con los daños posibles y con dejar el puesto en orden.

**Estructuras observables** (cada una aparece solo si está en el campo y al aumento suficiente):

- *Elodea:* lámina foliar, nervadura central, margen, pared celular, cloroplastos.
- Cebolla: células epidérmicas, pared celular, núcleo.
- Tallo de maíz: haces vasculares, xilema, floema, epidermis.
- Raíz: corteza, epidermis, xilema, floema.
- Hoja al estereoscopio: venación, tricomas, margen.
- Insecto: antenas, ojos compuestos, cabeza, tórax, abdomen, élitros o alas, patas.

## 8. Evaluación

La práctica avanza **solo con evidencia** de lo que el estudiante hizo. Una captura cuenta como **válida** si tiene:

- objetivo enclavado;
- luz dentro de la banda adecuada;
- nitidez ≥ 0,6;
- tejido en el campo y sin burbuja en el centro;
- montaje útil.

| Componente | Peso | Qué se evalúa |
|---|---|---|
| Seguridad | 15 % | EPP; inspección de contenedores; sin choques ni aproximaciones peligrosas; vidrio y derrames; cierre del puesto |
| Preparación fresca | 20 % | Montaje útil; fragmento; líquido; cubreobjetos; limpieza |
| Microscopio | 25 % | 4X y otro aumento registrados; pinza; enfoque; bajo aumento primero; iluminación; platina X/Y |
| Láminas fijas | 10 % | Lámina asignada observada; manejo; devolución a su ranura |
| Estereoscopio | 10 % | Hoja e insecto observados; técnica (luz, zoom, enfoque); devolución de muestras |
| Libreta y análisis | 20 % | Cálculos; registros importados; estructuras sustentadas; partes y funciones; preguntas; reflexión |

- Un **choque objetivo–preparación** anula el componente de seguridad.
- Las respuestas abiertas y la reflexión quedan para la revisión del docente.

## 9. Errores que detecta el laboratorio (78)

Cada error tiene una consecuencia visible en el laboratorio (burbujas, campo oscuro, vidrio roto, imagen borrosa…) y
una retroalimentación que explica la causa y cómo corregirla.

| Grupo | Errores |
|---|---|
| **Montaje** (E01–E14) | Portaobjetos con residuo · fragmento que no cabe · fragmento en el borde · corte profundo · corte innecesario · sin líquido · exceso de agua · gota lejos de la hoja · cubreobjetos plano · cubreobjetos de golpe · presión que agrieta · papel sobre la muestra · pinza sin limpiar entre muestras · reactivo no asignado |
| **Colocación** (E15–E17) | Pinza cerrada · lámina sin sujetar · lámina invertida o fuera del asiento |
| **Enfoque y seguridad** (E18–E25) | Empezar con 40X · revólver sin enclavar · acercar sin mirar de lado · **choque** · macrométrico a 40X · micrométrico sin localizar · topes del macro y del micro |
| **Iluminación** (E26–E31) | Lámpara apagada · poca luz · campo lavado · diafragma muy cerrado o muy abierto · condensador bajo |
| **Platina y registro** (E32–E37) | Cambiar de aumento sin centrar · campo vacío · sentido invertido de la platina · captura sin afinar · captura desenfocada · registrar una burbuja |
| **Retirar y láminas fijas** (E38–E47) | Retirar con la pinza cerrada o el objetivo cerca · lámina no asignada · caja cerrada · agua o cubreobjetos sobre la lámina fija · ranura equivocada · lámina sin guardar · caja abierta mucho tiempo · vista que no corresponde |
| **Estereoscopio** (E48–E59) | Sin muestra · muestra descentrada · solo luz transmitida en opaco · reflejos · luz apagada · zoom alto antes de localizar · cabezal movido sin reenfocar · tope de la perilla · dioptrías · interpupilar · insecto apretado · retirar antes de registrar |
| **Libreta** (E60–E63) | Aumento sumado en lugar de multiplicado · estructura no sustentada por la captura · espécimen equivocado · captura de otro intento |
| **Cierre** (E64–E68) | Material sin devolver · lente limpiado con toalla · microscopio sin estacionar en 4X · equipo encendido · operar sin verificar el EPP |
| **Manejo de las piezas** (E69–E74, E77–E79, E83) | Acercar la platina con el macro mirando por el ocular · macro a 40X hasta la zona de choque · revólver soltado entre posiciones · revólver girado tirando de un objetivo · pinza soltada sobre una lámina fuera de su asiento · carro X/Y forzado contra su tope · buscar el foco con la distancia interpupilar · usar el anillo de dioptrías como micrométrico · objetivo mayor sin distancia de trabajo · subir el zoom sin recentrar |

## 10. Escenarios docentes (22)

El docente puede activar escenarios que cambian el estado inicial, sueltos o en perfiles:

| Perfil | Escenarios |
|---|---|
| **Montaje** | S01 portaobjetos con residuo · S02 hoja grande (hay que cortar) · S03 gotero con poco volumen · S04 montaje empezado sin agua · S05 cubreobjetos tomado casi plano |
| **Microscopio** | S06 luz inicial muy baja · S07 condensador fuera de ajuste · S08 platina descentrada · S09 pinza cerrada · S10 40X en el eje al inicio · S19 empieza con la vista de costado (hallar los mandos) · S20 revólver entre dos posiciones · S21 lámina torcida bajo la pinza cerrada |
| **Láminas** | S11 láminas parecidas en la caja · S12 lámina con dos planos focales · S17 láminas con etiqueta en clave |
| **Estereoscopio** | S13 insecto brillante · S14 estereoscopio desenfocado · S15 visión binocular con par L/R · S16 vista 2D asistida declarada · S22 zoom alto y perilla de enfoque en su tope |
| **Otros** | S18 reanudación a mitad del montaje |

La **semilla** reproduce exactamente el mismo intento (burbujas y asignación incluidas).

## 11. Modos

| Modo | Comportamiento |
|---|---|
| **Práctica** | Retroalimentación causal después de cada acción |
| **Guiado** | Pasos de cada estación a la vista y pistas; avanza solo con evidencia |
| **Evaluación** | Sin pistas ni valores internos; las alertas de seguridad se mantienen; se califica al entregar |
| **Depuración docente** | Muestra platina, separación, error de foco, nitidez, montaje, regiones visibles y conservación del líquido |

Hay además una **demostración automática** de 14 pasos que recorre toda la práctica con una mano virtual que toma y
gira las mismas piezas que el estudiante (el revólver hasta su clic, la palanca de la pinza, las perillas). Comete a
propósito un error al bajar el cubreobjetos (de golpe y casi plano, con burbujas) y muestra cómo corregirlo.

## 12. Accesibilidad

- Todo se puede hacer desde el panel de acciones, con teclado y lector de pantalla (mandos de los equipos bajo
  «Mandos accesibles»).
- El ocular tiene una descripción textual del estado operativo (objetivo, luz, enfoque, muestra) que no delata qué
  estructuras se ven.
- La portada, el laboratorio y la libreta se verificaron con axe-core sin violaciones graves (WCAG 2 A/AA).

## 13. Limitaciones y validación pendiente

- Las imágenes del ocular son **ilustraciones didácticas**, no microfotografías. Una versión futura permitirá que el
  docente o la administración publiquen fotografías reales.
- Los equipos 3D reproducen la disposición y las proporciones de un microscopio binocular y un estereoscopio de zoom
  de laboratorio a partir de vistas de referencia, **sin medidas de ficha** y sin marcas comerciales.
- Hay que validar con la ficha del equipo real:
  - número de campo, aperturas numéricas y distancias de trabajo;
  - pasos de los mandos, curva de nitidez y bandas de luz;
  - volumen de gota y modelo de burbujas.

  Mientras tanto son valores `pending` / `hypothetical` en `src/practices/practice-b01/params.ts`.
- La nitidez es una curva **visual**, no la profundidad de campo real. La iluminación es un modelo simplificado, no
  fotométrico.
- Sirve como prototipo docente. Una **evaluación institucional con validez óptica** requiere primero esa revisión
  científica.
