# Guía rápida de Casa Hebra

Esta guía reúne lo necesario para empezar a usar la tienda sin tocar el código.

## 1. Abrir la página por primera vez

Necesitas Node.js 20.19–20.x, o Node.js 22.12 o una versión más reciente. Abre
una terminal dentro de la carpeta del proyecto y ejecuta:

```bash
npm install
npm run dev
```

Después visita:

- Tienda pública: `http://127.0.0.1:5173`
- Panel administrador: `http://127.0.0.1:5173/admin`

La primera vez que entres al administrador crearás tu correo y contraseña. No
hay una contraseña predeterminada. Usa una contraseña larga y distinta de las
que utilizas en otras cuentas.

## 2. Dejarla lista para recibir consultas

Entra en **Administrador → Configuración** y completa, en este orden:

1. Verifica el WhatsApp ya configurado: `+52 1 981 168 1460`
   (guardado como `+5219811681460`).
2. La ciudad o zona general de recogida.
3. El horario en el que sueles contestar.
4. Tu Instagram, si deseas mostrarlo.

Después abre **Contenido** para personalizar el nombre, lema, portada, historia
y color de la marca.

Puedes cambiar entre tema claro y oscuro desde la cabecera. El mismo control
está disponible en la pantalla de acceso y dentro del panel administrador. La
opción queda guardada en ese navegador y el color de marca se ajusta
automáticamente para mantener legibles los botones y textos. La tienda también
incluye un nuevo diseño con animaciones suaves de hilo, tarjetas y fotografías;
si el dispositivo solicita menos movimiento, la página las reduce
automáticamente sin perder información.

No publiques la dirección de tu casa. El sitio está preparado para mostrar solo
la ciudad y avisar que el punto exacto y el horario se acuerdan en privado.

## 3. Revisar y publicar tus piezas

La tienda ya incluye 20 productos reales distribuidos en cuatro colecciones:
**Llaveros tejidos**, **Mini amigurumis**, **Flores tejidas** y **Sets para
regalar**. Sus fotografías están recortadas, sin fondos domésticos y optimizadas
para el catálogo. El recorrido muestra un solo catálogo y un solo personalizador,
adaptados para teléfono, tableta y computadora, sin repetir bloques.

Los nombres se conservan y los precios entregados ya están cargados en MXN. La
hoja permitió confirmar 15 piezas; **Michi Turquesa, Besito Perruno, Cerdito
Bombón, Tortuguita Rosita y Violeta en Flor** no aparecían y conservan su valor
anterior para que puedas revisarlo. El girasol permite elegir **Mediano · $90**
o **Grande · $105**. Todos los productos empiezan marcados como **sobre encargo**,
para no prometer una unidad disponible sin confirmación.

Desde esa misma sección puedes crear otra pieza, subir hasta cinco fotos a la
vez, indicar unidades disponibles, añadir colores o tamaños y ocultar un producto
sin eliminarlo.

También puedes:

- Ver una vista previa de la tarjeta mientras editas.
- Duplicar una pieza para reutilizar fotos y detalles; la copia queda como
  borrador hasta que la revises.
- Consultar el historial de precio dentro del editor después de realizar un
  cambio real.
- Revisar en el resumen cuáles piezas generan más consultas. Estas métricas se
  calculan a partir de solicitudes guardadas; no rastrean visitas.

Para mejores resultados:

- Usa fotos claras, verticales o cuadradas y con un fondo sencillo.
- Evita que aparezcan fachadas, números de casa, documentos o ubicaciones.
- Explica si cada pieza está disponible o cuánto tarda en elaborarse.
- Revisa el precio y el stock después de cada venta confirmada.

### Si estás actualizando la versión anterior

Cuando la aplicación detecta que todavía utilizas el catálogo que venía con la
versión anterior, lo migra automáticamente a la colección nueva de 20 productos.
Tu cuenta, la configuración y las solicitudes se mantienen.

Si ya habías personalizado productos o categorías, ese catálogo no se reemplaza.
Haz una copia de seguridad de `DATA_DIR` antes de actualizar y revisa el
resultado al volver a abrir la tienda.

En la actualización 2.1, los precios antiguos se actualizan únicamente cuando
siguen intactos; cualquier precio que ya hayas personalizado se conserva. Si el
WhatsApp estaba vacío se completa con el número oficial, pero un número que ya
hubieras guardado no se reemplaza.

## 4. Cómo funciona WhatsApp

El cliente agrega una o varias piezas a su consulta, elige color o tamaño,
acepta el aviso de privacidad y toca el botón de WhatsApp. La página abre el chat
de `+52 1 981 168 1460` con el resumen y el total estimado; el cliente todavía
debe pulsar **Enviar** dentro de WhatsApp.

Para una pieza especial también puede utilizar el personalizador de cinco pasos.
El precio que aparece es una base: si solicita otro tamaño, tono, nombre o
detalle, el mensaje lo indica y tú confirmas el precio final antes de tejer.

La consulta no es un pago ni un pedido confirmado. Después podrás acordar por
WhatsApp disponibilidad, anticipo, punto exacto de recogida y horario.

La dirección de recogida nunca debe publicarse en la página: comparte el punto
exacto únicamente en el chat cuando el pedido y la persona estén confirmados.

## 5. Organizar solicitudes

Cada intención aceptada por la tienda al tocar el botón de WhatsApp aparece en
**Solicitudes**. Esto no garantiza que el cliente haya enviado el mensaje. Desde
ahí puedes marcarla como contactada, confirmada, completada o archivada. Los
registros antiguos se eliminan automáticamente según el plazo configurado por
el servidor.

## 6. Publicarla en internet

La versión pública necesita un alojamiento compatible con Node.js, HTTPS y un
disco persistente para conservar productos, solicitudes y fotos. Sigue la
sección de producción de `README.md`; allí están las variables de seguridad y
los comandos exactos. Mantén una copia de seguridad periódica de `DATA_DIR`.

Antes de anunciarla, haz una prueba completa desde otro teléfono: abre un
producto, envía una consulta, comprueba el mensaje de WhatsApp y entra al panel
para verificar que la solicitud se registró.
