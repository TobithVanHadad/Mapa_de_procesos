# Despliegue

## Desarrollo local

1. Copiar `.env.example` a `.env` y cambiar los valores locales.
2. Ejecutar `npm install` y `npm run dev`.
3. Abrir `http://localhost:3000`.

En Windows con ejecución de scripts restringida se puede usar `npm.cmd`.

## Docker

Ejecutar `docker compose up --build`. El servicio web queda en el puerto 3000 y PostgreSQL en 5432. Las credenciales del compose son exclusivamente locales y deben reemplazarse en cualquier entorno compartido.

## Producción

La Fase 1 puede publicarse como demostración sin datos reales. El `Dockerfile`
genera el servidor standalone de Next.js y `railway.toml` configura la verificación
de `/api/health`.

### Railway

1. Crear el servicio desde el repositorio de GitHub.
2. Railway detectará y construirá el `Dockerfile`.
3. Generar el dominio público del servicio web.
4. Verificar que `/api/health` responda con `status: ok`.
5. En la fase de persistencia, agregar PostgreSQL y exponer su variable
   `DATABASE_URL` al servicio web.

La migración inicial se conserva en `database/migrations/0001_initial.sql`, pero no
se ejecuta durante este despliegue demostrativo.

Antes de usar la aplicación con información empresarial real deben existir:
autenticación OIDC, autorización en backend, migraciones PostgreSQL verificadas,
almacenamiento privado, protección CSRF, límites de archivos, cabeceras de
seguridad, auditoría, secretos administrados, respaldo y pruebas de aislamiento
entre departamentos.

Nunca se deben copiar `.env`, datos personales, documentos internos ni credenciales al repositorio o a la imagen de contenedor.
