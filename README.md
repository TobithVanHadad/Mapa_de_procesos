# Enterprise Process & Knowledge Map

Aplicación empresarial para documentar, relacionar y visualizar procesos, actividades, personas, sistemas, controles y documentos. La estructura está alineada con buenas prácticas de gestión por procesos y control documental; no implica certificación de ninguna organización.

## Estado

El mapa inicia como un machote vacío y sirve para cualquier área. Incluye edición directa, ficha general, archivos PDF e imágenes, tutorial de primer acceso, creación guiada de nodos, conexiones inteligentes, vista de organigrama y guardado automático compartido.

Las tarjetas muestran nombres largos completos y pueden crearse como ramas independientes para conectarlas después. La interfaz incluye selección reforzada, ficha plegable, ajuste automático del lienzo, sonidos opcionales y copias locales diarias conservadas únicamente durante tres días en cada dispositivo.

Las conexiones pueden cortarse sin eliminar fichas y se admiten varias relaciones entre los mismos elementos. Cada tipo de nodo muestra sólo los campos aplicables; las personas y departamentos ya registrados aparecen como sugerencias reutilizables. Al repetir una persona o puesto como participante, el mapa genera su conexión de apoyo automáticamente. El organigrama usa el campo `Reporta a`, acomoda la jerarquía y distingue cada familia departamental por color.

El PDF rellenable incluido en `output/pdf` está diseñado como base de documentación de procesos y toma como referencia ISO 9001:2015 + Amd 1:2024, ISO 10013:2021, ISO 31000:2018 e ISO 19011:2026, con módulos de aplicabilidad para seguridad, ambiente, información y requisitos sectoriales.

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

La aplicación permite edición compartida y adjuntos PDF/imagen. Para conservar los
cambios entre reinicios y despliegues, agregar un volumen de Railway montado en
`/data` y configurar `DATA_DIR=/data` en el servicio web. Sin volumen, Railway usa
almacenamiento temporal y la información puede perderse durante un redeploy.

Las sesiones abiertas consultan el documento compartido cada tres segundos y al
recuperar el foco de la ventana. El indicador `Datos sincronizados` confirma que el
cambio llegó al almacenamiento del servidor; `Guardado local` indica que todavía
no ha podido compartirse y la aplicación reintentará automáticamente.

Además del guardado compartido, cada navegador conserva en IndexedDB una copia del
mapa por día durante un máximo de tres días. Estas copias son propias del dispositivo,
pueden descargarse o restaurarse desde la aplicación y no sustituyen el volumen
persistente de Railway. Los archivos adjuntos permanecen en el almacenamiento del
servidor; la copia local conserva sus referencias dentro del mapa.

La migración PostgreSQL se mantiene para la siguiente fase de identidad, permisos,
auditoría y consultas estructuradas. Mientras no se implemente autenticación, cualquier
persona con el enlace puede consultar y editar el mapa compartido.

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
- [Machote PDF rellenable](output/pdf/machote-documentacion-procesos-orvel.pdf)
- [Cambios](CHANGELOG.md)

## Seguridad

No usar información real en datos de demostración. No subir `.env`, secretos, archivos internos, datos personales ni respaldos. La publicación está bloqueada hasta completar autenticación, autorización de backend, auditoría, almacenamiento privado y pruebas de aislamiento.

## Licencia

La licencia es configurable. El archivo actual conserva todos los derechos hasta que el propietario seleccione una licencia apropiada.
