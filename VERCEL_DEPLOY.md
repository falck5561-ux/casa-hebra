# Casa Hebra en Vercel

Esta version esta preparada para un solo proyecto de Vercel:

- `client/`: Vite/React, compilado a `client/dist`.
- `api/[...path].js`: Express ejecutado como Vercel Function.
- `/api/*`: reescrito a la funcion Express.
- `/admin` y las rutas de la tienda: fallback SPA a `index.html`.
- Supabase Database: persistencia de catalogo, solicitudes, configuracion y administrador.
- Supabase Storage: fotografias.

## Variables obligatorias en Vercel

Configuralas en Project Settings > Environment Variables para Production, Preview y Development si deseas probar todos los entornos:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=casa-hebra-products`
- `SUPABASE_DATABASE_ENABLED=true`
- `SUPABASE_DATABASE_TABLE=casa_hebra_store`
- `INQUIRY_RETENTION_DAYS=180`
- `MAX_INQUIRIES=1000`
- `TRUST_PROXY=true`

No subas `server/.env` a GitHub.

`PUBLIC_ORIGIN` es opcional en Vercel. Si luego agregas un dominio propio, puedes establecerlo a su origen HTTPS, por ejemplo `https://casahebra.mx`.

`SETUP_TOKEN` solo es necesario si la base de datos no tiene administrador. Si ya migraste tu administrador, no hace falta para el arranque.

## Importar

Importa el repositorio desde la raiz. Vercel leera `vercel.json`; no importes `client` y `server` como proyectos separados.

## Prueba posterior

1. Abre `/api/health`.
2. Abre `/` y confirma catalogo e imagenes.
3. Abre `/admin` e inicia sesion.
4. Edita un producto.
5. Sube una imagen y confirma que aparece en Supabase Storage.
