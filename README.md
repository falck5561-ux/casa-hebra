# Casa Hebra 2.1

Catálogo web de crochet hecho a mano con consulta de varios productos por
WhatsApp y un panel administrador completo. Está pensado para venta local con
recogida mediante cita y para mantener la ubicación exacta fuera del sitio. La
entrega incluye la colección real de Casa Hebra, lista para revisar y publicar.

## Lo que incluye

- Catálogo público responsive con búsqueda, categorías y estados de disponibilidad.
- Colección inicial de 20 productos reales organizada en **Llaveros tejidos**,
  **Mini amigurumis**, **Flores tejidas** y **Sets para regalar**.
- Fotografías de producto recortadas, sin fondos domésticos y optimizadas para
  mostrarse con claridad tanto en teléfono como en computadora.
- Inicio cálido tipo taller artesanal, galería fotográfica real y tarjetas sin
  controles superpuestos.
- Identidad propia de Casa Hebra, navegación con sección activa y un recorrido
  editorial que usa únicamente fotografías reales del catálogo.
- Temas claro y oscuro con contraste accesible, botones siempre legibles,
  animaciones de hilo y producto, preferencia de tema recordada y alternativa
  completa para dispositivos que solicitan menos movimiento.
- Un único personalizador guiado, colocado después del catálogo, para elegir
  pieza base, color, tamaño, detalle y cantidad antes de preparar la consulta.
- Ficha de producto con color, talla, cantidad y detalles de elaboración.
- Bolsa de consulta para enviar uno o varios productos en un solo mensaje de WhatsApp.
- Mensaje prellenado con productos, variantes, total estimado y nota del cliente.
- Panel privado para productos, imágenes, precios, categorías, solicitudes y textos del negocio.
- Vista previa viva al editar, duplicado seguro como borrador, historial de
  precios y métricas agregadas de consultas por producto sin rastreo de visitas.
- Configuración del nombre de la marca, ciudad, WhatsApp, Instagram, horarios y aviso principal.
- Primer acceso seguro: no existe una contraseña predeterminada; la propietaria crea su cuenta.
- Persistencia de datos e imágenes en el servidor, validación, sesiones seguras y limitación de intentos.
- Los precios entregados por la propietaria ya están cargados en MXN y siguen
  siendo editables desde el administrador. La hoja confirmó 15 piezas; las cinco
  que no aparecían conservan su precio anterior para que puedan verificarse.
- Los 20 productos comienzan como piezas **sobre encargo**, sin prometer existencias inmediatas.

## Requisitos

- Node.js 20.19–20.x, o Node.js 22.12 o superior.
- npm 10 o superior.

## Ejecutar en desarrollo

Desde la carpeta principal:

```bash
npm install
npm run dev
```

Después abre:

- Tienda: `http://127.0.0.1:5173`
- Administrador: `http://127.0.0.1:5173/admin`

La primera vez, `/admin` mostrará el asistente para crear la única cuenta
propietaria. Usa una contraseña larga que no utilices en otros servicios. El
desarrollo escucha solo en `127.0.0.1` por defecto. Si decides exponer
manualmente Vite o un proxy a tu red local, configura antes `SETUP_TOKEN` y,
según la topología del proxy, el `PUBLIC_ORIGIN` de desarrollo.

## Configuración inicial recomendada

Dentro de **Administrador → Configuración**:

1. Verifica el WhatsApp ya configurado: `+52 1 981 168 1460`
   (internamente `+5219811681460`). Cámbialo solo si corresponde.
2. Revisa la ciudad pública, el horario, Instagram y la moneda.
3. Conserva un texto de recogida general; no escribas la dirección de tu casa.
4. En **Contenido**, personaliza el nombre, lema, portada, historia y color.
5. En **Productos**, revisa los nombres, descripciones y precios cargados en MXN.
   Ajusta únicamente los que cambien o los cinco que faltaban en la hoja.
6. Abre la tienda en otra pestaña y realiza una consulta de prueba.

El control **Tema oscuro** aparece en la cabecera de la tienda y también en el
acceso y la barra superior del administrador. La primera visita respeta el tema
del dispositivo; después, la página recuerda la opción elegida en ese navegador.

La web abre el chat del número configurado con el mensaje preparado, pero el
cliente debe presionar **Enviar** dentro de WhatsApp. El clic se registra como
una intención de consulta, no como un pedido confirmado.

En el personalizador, el importe mostrado siempre se presenta como **estimado
base** cuando hay colores, tamaño o detalles especiales. El mensaje distingue
la opción original del catálogo de lo solicitado por el cliente; el precio y el
tiempo finales se confirman en la conversación.

## Actualizar desde una entrega anterior

Si abres esta versión sobre una instalación anterior que todavía conserva el
catálogo incluido originalmente, la aplicación lo sustituye automáticamente por
la nueva colección de 20 productos. La cuenta propietaria, la configuración del
negocio y las solicitudes existentes se conservan.

Si ya personalizaste el catálogo —por ejemplo, añadiste, eliminaste o editaste
productos o categorías— la migración no lo reemplaza. Revisa la tienda después
de actualizar y conserva una copia de seguridad de `DATA_DIR` antes de cualquier
cambio importante.

La actualización 2.0 añade historial privado de cambios de precio. La migración
crea esa colección vacía sin modificar tus productos, tu cuenta ni las
solicitudes que ya existían.

La actualización 2.1 usa el esquema de datos 4. Solo cambia un precio anterior
si todavía coincide exactamente con el valor incluido por Casa Hebra 2.0; un
precio editado por la propietaria se conserva. También completa el WhatsApp
oficial si estaba vacío, sin reemplazar un número personalizado. El girasol
permite elegir **Mediano · $90** o **Grande · $105**, y cada opción calcula su
total correcto.

## Ejecutar como versión de producción

```bash
npm run build
npm start
```

Usa `npm run dev` para probar localmente en `http://127.0.0.1:5173`. `npm start`
es el comando de producción y no arrancará sin un `PUBLIC_ORIGIN` válido.
Publícalo mediante un alojamiento o proxy que proporcione HTTPS.
Copia `server/.env.example` a `server/.env` para configurar el origen público,
puerto, carpeta de datos y límites de retención.

`npm start` fuerza el modo producción en Windows, macOS y Linux. Antes del
primer arranque en producción, usa HTTPS y configura tanto `PUBLIC_ORIGIN` como
un `SETUP_TOKEN` aleatorio de al menos 16 caracteres (se recomiendan 24 bytes
aleatorios). `PUBLIC_ORIGIN` seguirá siendo obligatorio en cada arranque;
`SETUP_TOKEN` deja de ser necesario cuando ya existe la propietaria. Puedes
generarlo con:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

El token solo protege la creación inicial y nunca se guarda en los datos.
Quítalo del entorno después de crear la cuenta propietaria; el endpoint queda
bloqueado. Asigna `DATA_DIR` a un disco persistente. La implementación de archivos JSON está
pensada para una sola instancia de Node; no uses varias réplicas escribiendo a
la vez. Conserva copias de seguridad periódicas de la carpeta indicada por
`DATA_DIR`.

## Comandos

```bash
npm run dev       # cliente y servidor con recarga durante desarrollo
npm run build     # genera el cliente optimizado
npm start         # sirve API y cliente de producción
npm run start:prod # equivalente explícito de producción
npm run check     # validaciones del servidor y compilación del cliente
npm test          # pruebas del servidor
npm run test:pure # pruebas que no necesitan dependencias instaladas
npm run test:integration # pruebas HTTP completas después de npm install
```

## Estructura

```text
casa-hebra/
├── client/        tienda pública y administrador en React
├── server/        API, autenticación, archivos y persistencia
├── GUIA_RAPIDA.md instrucciones de uso para la propietaria
├── package.json   comandos para todo el proyecto
└── README.md
```

## Fotografías y privacidad

Las 20 fotografías incluidas ya fueron limpiadas de fondos domésticos y
optimizadas para el catálogo. El administrador admite JPEG, PNG y WebP para
futuras fotos. Antes de subir nuevas imágenes tomadas en casa, evita que muestren
números, fachadas, documentos o referencias que permitan ubicarla. El backend no
acepta SVG subidos por usuarios y genera nombres aleatorios para los archivos.

Las solicitudes se eliminan automáticamente después de un máximo de 180 días y
existe un tope global de 1.000 registros. El plazo solo se puede reducir y el
tope se puede ajustar hasta 5.000. La tienda muestra el plazo efectivo y el
servidor exige aceptación expresa antes de guardar cada solicitud. Los filtros de
texto bloquean patrones evidentes de direcciones, coordenadas y enlaces de mapas,
pero no sustituyen una revisión humana: publica únicamente ciudad o zona general.

La frase pública sugerida es:

> Recogida local en Campeche, Campeche, únicamente con cita. La ubicación y el
> horario exactos se comparten por WhatsApp después de confirmar el pedido.

## Fotos en la nube con Supabase Storage

Casa Hebra now supports persistent product photos in Supabase Storage. The admin UI is unchanged: drag or select up to 5 JPG, PNG or WebP photos (6 MB each), choose a cover and save the product.

### Production setup

1. In Supabase Dashboard open **Storage** and create a bucket named `casa-hebra-products`.
2. Mark the bucket **Public** so storefront visitors can load product photos.
3. In your production server environment configure:
   - `SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=...` (server secret; never put it in `VITE_*` variables or the browser)
   - `SUPABASE_STORAGE_BUCKET=casa-hebra-products`
4. Restart/redeploy the server.

When all three values are configured, `/api/admin/uploads` stores new photos in Supabase automatically. If they are absent (for example during local development), the app keeps using the existing local `DATA_DIR/uploads` storage. Existing bundled/local product photos continue to work, so migration can be gradual.

The server validates image contents and strips supported metadata before upload. Product validation only accepts cloud URLs belonging to the configured Supabase project and bucket.
