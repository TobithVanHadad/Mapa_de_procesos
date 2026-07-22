# Enterprise Process & Knowledge Map

Base de una plataforma empresarial para documentar, relacionar y visualizar procesos, actividades, personas, sistemas, riesgos y documentos. La estructura está alineada con buenas prácticas de gestión por procesos y control documental; no implica certificación de ninguna organización.

## Estado

Fase 1 completada: arquitectura, modelo PostgreSQL inicial, interfaz reconocible del mapa, contratos de dominio, Docker y pruebas básicas. El mapa mostrado usa datos ficticios. Autenticación, persistencia conectada, edición y carga de archivos se implementarán en fases posteriores y no deben considerarse productivos todavía.

## Requisitos

- Node.js 22.13 o posterior
- npm
- Docker Desktop opcional

## Ejecutar con npm

```bash
cp .env.example .env
npm install
npm run dev
```

En Windows PowerShell puede usarse `Copy-Item .env.example .env` y `npm.cmd` si la política bloquea `npm.ps1`. Abrir `http://localhost:3000`.

### Inicio sencillo en Windows

Hacer doble clic en `scripts/start-local.cmd` y mantener esa ventana abierta. El script inicia directamente la versión más reciente del mapa en `http://localhost:3000`; no requiere ejecutar una compilación previa.

## Ejecutar con Docker

```bash
docker compose up --build
```

Esto inicia la aplicación y PostgreSQL con credenciales exclusivamente locales.

## Desplegar en Railway

El repositorio incluye `Dockerfile`, `railway.toml` y el endpoint de salud
`/api/health`. Railway construye la imagen de producción y usa la variable `PORT`
inyectada por la plataforma.

1. Crear un proyecto desde este repositorio de GitHub.
2. Generar un dominio para el servicio web.
3. Cuando comience la migración de datos, agregar PostgreSQL y referenciar su
   `DATABASE_URL` en el servicio web.

La publicación inicial funciona sin base de datos; los datos visibles siguen siendo
demostrativos hasta conectar la persistencia.

## Verificación

```bash
npm run lint
npm test
npm run build
```

## Documentación

- [Arquitectura y plan](docs/ARCHITECTURE.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Contribución](CONTRIBUTING.md)
- [Cambios](CHANGELOG.md)

## Seguridad

No usar información real en datos de demostración. No subir `.env`, secretos, archivos internos, datos personales ni respaldos. La publicación está bloqueada hasta completar autenticación, autorización de backend, auditoría, almacenamiento privado y pruebas de aislamiento.

## Licencia

La licencia es configurable. El archivo actual conserva todos los derechos hasta que el propietario seleccione una licencia apropiada.
