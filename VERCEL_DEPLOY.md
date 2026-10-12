# Casa Hebra en Vercel Services

El repositorio despliega dos servicios dentro de un solo proyecto Vercel:

- `client`: Vite/React, público en `/` y `/admin`.
- `server`: Express, público únicamente mediante `/api/*`.

El build del cliente crea dos entradas HTML físicas:

- `dist/index.html`
- `dist/admin/index.html`

Así `/admin` no depende de un fallback SPA de Vercel. React sigue decidiendo qué interfaz mostrar según `window.location.pathname`.

## Variables de producción

Configurar en Vercel, no en GitHub:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=casa-hebra-products`
- `SUPABASE_DATABASE_ENABLED=true`
- `SUPABASE_DATABASE_TABLE=casa_hebra_store`
- `NODE_ENV=production`
- `PUBLIC_ORIGIN=https://casa-hebra.vercel.app`

`SUPABASE_SERVICE_ROLE_KEY` debe permanecer secreta.
