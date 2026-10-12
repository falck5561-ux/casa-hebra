# Casa Hebra: base de datos de producción

Las imágenes siguen en `casa-hebra-products` (Supabase Storage). Esta versión también puede guardar el estado persistente de Casa Hebra en Supabase Database, evitando depender de `server/data` en producción.

## 1. Crear la tabla
En Supabase abre **SQL Editor**, crea una consulta nueva, pega todo el contenido de `SUPABASE_DATABASE.sql` y ejecútalo.

## 2. Migrar tus datos locales actuales
Mantén en `server/.env` tu `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Deja temporalmente:

```env
SUPABASE_DATABASE_ENABLED=false
SUPABASE_DATABASE_TABLE=casa_hebra_store
```

Desde la raíz ejecuta:

```powershell
npm run migrate:database -w server
```

Debe indicar `Migración completada` y mostrar los conteos. La migración copia productos, categorías, solicitudes, configuración y el administrador. No borra `server/data`.

## 3. Activar Supabase Database
Después de migrar cambia:

```env
SUPABASE_DATABASE_ENABLED=true
SUPABASE_DATABASE_TABLE=casa_hebra_store
```

Reinicia `npm run dev` y verifica `/admin` y la tienda. Crea o edita un producto y reinicia el servidor: el cambio debe permanecer.

## 4. Producción
En el hosting del backend configura como variables secretas:

- `NODE_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=casa-hebra-products`
- `SUPABASE_DATABASE_ENABLED=true`
- `SUPABASE_DATABASE_TABLE=casa_hebra_store`
- `PUBLIC_ORIGIN=https://TU-DOMINIO`
- `SETUP_TOKEN` con un secreto aleatorio fuerte
- `TRUST_PROXY=true` solo si el proveedor usa un proxy confiable

Nunca subas `server/.env` a GitHub.

## Seguridad
La tabla tiene RLS activado y no crea políticas públicas. El navegador no recibe la Secret Key. Solo el backend accede a la fila persistente.
