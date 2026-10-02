# Accesibilidad

## Entrada

- **Ratón, táctil y teclado.** Toda manipulación tiene alternativa de teclado:
  - `Tab` enfoca la mesada (rol `application` con instrucciones); flechas eligen el objeto más cercano en esa dirección.
  - `Intro` toma/suelta; flechas mueven lo que se sostiene (`Mayús` = 5 cm); `Q`/`E` inclinan; `A` agita (mantener);
    `P` o `Espacio` acción principal (apretar piseta, soltar gota); `Esc` cancela y devuelve el objeto.
  - El panel de acciones repite todo con botones (tomar con teclado, soltar, inclinar, agitar, rotular, abanicar, tarar,
    potencia, altura del aro, raspar, retirar sonda/varilla, limpiar, barrer…). Los botones «mantener» responden a
    puntero y a teclado (`Espacio`/`Intro` sostenidos).
- **Multitáctil:** el dedo que sostiene un objeto no se interrumpe al pulsar los botones ⟲ ⟳ con otro dedo.
- **Cámara 3D por teclado** (con la mesada enfocada): `1`–`5` van a las estaciones A–E; `J`/`L` orbitan; `I`/`K` inclinan
  la vista; `+`/`−` acercan/alejan; `0` restablece la vista de la estación. Las mismas acciones están en el **panel de
  cámara** (botones con nombre accesible: «Orbitar a la izquierda», «Mirar más desde arriba», «Restablecer la vista…»)
  y en los botones A–E del HUD. Las flechas siguen eligiendo objetos (no mueven la cámara), y al elegir un objeto fuera
  de la vista la cámara se desplaza hasta él.
- **Lista de objetos en el DOM:** el panel «Material» enumera todos los objetos del laboratorio; cada uno es un botón
  que lo selecciona y lleva la cámara hasta él. El lienzo 3D nunca es la única vía para encontrar algo.
- La órbita con el ratón solo se activa sobre el fondo: tocar un objeto lo manipula, nunca gira la escena por sorpresa.

## Percepción

- No se depende solo del color: rótulos con texto, textura de partículas (trozos, polvo, cristales), contornos y estados
  descritos en texto.
- **Descripciones accesibles** del objeto seleccionado (región `aria-live`): «Vaso de precipitados 1: 9,6 mL de líquido,
  suspensión oscura, 72,3 °C». La temperatura numérica solo aparece si la sonda está dentro (como en el laboratorio).
- Lecturas de instrumentos en texto: balanza (0,01 g), sonda (0,1 °C), menisco de la probeta (0,2 mL, con aviso de paralaje).
  El paralaje depende de la altura real de la cámara; el botón **«👁 Nivel del ojo»** alinea la cámara con el menisco y
  da la lectura exacta, sin necesidad de orbitar con precisión.
- Contraste AA en la interfaz (tokens de color en `app/styles.css`, modo claro y oscuro automáticos).
- **Subtítulos de sonidos** (activables) para vidrio, vertido, goteo, alerta, rotura, hielo, piseta.
- Avisos: `role="status"` para información y `role="alert"` para seguridad.

## Movimiento y escala

- «Reducir movimiento» (también respeta `prefers-reduced-motion`): transiciones de cámara instantáneas, vapor y chorros
  estáticos, sin ondulación de la superficie del líquido, sin pérdida de información científica.
- Calidad gráfica **Baja** para equipos modestos (sin sombras proyectadas, menos partículas): la información científica
  es la misma en los tres niveles.
- Si se pierde el contexto gráfico (WebGL), un aviso lo explica y la escena se reconstruye sola desde el estado.
- Escala de interfaz 100 %, 125 %, 150 %.
- En pantallas pequeñas los paneles (material, libreta) se superponen como cajones; la mesada sigue visible y se puede
  desplazar/ampliar.

## Diálogos

- Diálogos modales con foco inicial, ciclo de `Tab` dentro del diálogo, `Esc` para cerrar (excepto el de equipo de
  protección, que requiere confirmar) y retorno del foco al cerrar.
- Enlace «Ir a las acciones del objeto» al inicio para saltar a la barra de acciones.

## Verificación

- Prueba e2e con **axe-core** en la pantalla inicial y en el laboratorio: sin violaciones *critical* ni *serious*
  (el lienzo se excluye y se compensa con la región de descripciones y el panel de acciones).
