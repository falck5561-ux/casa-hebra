# Configurar fotos de productos en Supabase Storage

## 1. Crear el bucket
En Supabase > Storage crea un bucket llamado `casa-hebra-products` y márcalo como **Public bucket**.

## 2. Variables del servidor
Copia `server/.env.example` a `server/.env` si todavía no existe y completa:

```env
SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=casa-hebra-products
```

La `SUPABASE_SERVICE_ROLE_KEY` se obtiene en la configuración/API de tu proyecto de Supabase. Es secreta: úsala solamente en el servidor o en las variables privadas de tu hosting. Nunca la nombres con prefijo `VITE_` ni la pegues en código del navegador.

## 3. Producción
Configura esas mismas tres variables privadas en el hosting donde corra el backend y vuelve a desplegarlo. El frontend no necesita una clave de Supabase para subir imágenes: la carga pasa por la API autenticada del admin.

## 4. Uso
En `/admin`, crea o edita un producto y arrastra/selecciona las fotos. La primera queda como portada y puedes usar hasta 5. Con Supabase configurado, las nuevas fotos quedan en la nube. Sin esas variables, desarrollo local conserva el almacenamiento anterior en `DATA_DIR/uploads`.

## Seguridad
- El navegador nunca recibe la service-role key.
- La ruta de subida sigue protegida por la sesión del administrador.
- Se conservan los límites de tipo, tamaño, dimensiones y cantidad.
- Antes de almacenarse se inspecciona el contenido real de la imagen y se eliminan metadatos soportados.
- Al guardar productos solo se admiten URLs del proyecto/bucket Supabase configurado, además de las imágenes locales válidas ya existentes.


## Diagnóstico de errores de conexión (Windows)

Si al subir aparece `CLOUD_CONNECTION_FAILED`, el servidor recibió la imagen pero Node no pudo conectarse a Supabase. El error ahora muestra el código de red (por ejemplo `ENOTFOUND`, `ETIMEDOUT` o `SELF_SIGNED_CERT_IN_CHAIN`).

En PowerShell, prueba lo siguiente (no incluye claves privadas):

```powershell
nslookup lhwgwjteoqhdktijknpe.supabase.co
Test-NetConnection lhwgwjteoqhdktijknpe.supabase.co -Port 443
node -e "fetch('https://lhwgwjteoqhdktijknpe.supabase.co/storage/v1/').then(r=>console.log('HTTP',r.status)).catch(e=>console.log('ERROR',e.cause?.code||e.message))"
```

Un HTTP 401 o 404 en la última prueba también significa que **sí hay conexión**; el objetivo es distinguir un fallo de red. No desactives la verificación TLS. No compartas la clave `sb_secret_` ni el archivo `.env`. Si la clave apareció en una captura, revócala y genera otra en Supabase.

**Nota:** Supabase Storage guarda las imágenes, pero los productos y la cuenta admin de esta versión siguen en `server/data`; para producción ese directorio necesita un disco persistente y respaldos.

### Prueba automática sin revelar credenciales

Desde la raíz del proyecto ejecuta `npm run check:storage -w server`. El diagnóstico muestra DNS y conectividad HTTPS sin imprimir la clave.
