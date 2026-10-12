# Casa Hebra en Vercel Services

Este repositorio usa un solo proyecto de Vercel con dos services:

- `client`: Vite/React, publico en `/*`.
- `server`: Express, publico solamente mediante `/api/*`.
- No hay bindings internos: el navegador llama a `/api/...` en el mismo dominio.

## Variables en Vercel

Agrega en Project Settings > Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=casa-hebra-products`
- `SUPABASE_DATABASE_ENABLED=true`
- `SUPABASE_DATABASE_TABLE=casa_hebra_store`
- `INQUIRY_RETENTION_DAYS=180`
- `MAX_INQUIRIES=1000`
- `TRUST_PROXY=true`

`PUBLIC_ORIGIN` es opcional en Vercel: el backend usa automaticamente la URL que Vercel inyecta. Cuando conectes un dominio propio, se recomienda fijarlo explicitamente a `https://tu-dominio`.

No subas `server/.env` a GitHub.
