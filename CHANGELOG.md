# Changelog

## [0.3.1] - 2026-07-22

### Fixed

- Escritura compartida en el volumen `/data` de Railway con ajuste seguro de permisos al iniciar el contenedor.
- Sincronización automática cada tres segundos para reflejar en otros dispositivos los cambios ya guardados.
- Verificación de persistencia dentro del endpoint de salud para impedir despliegues que sólo puedan guardar localmente.

## [0.3.0] - 2026-07-22

### Added

- Machote vacío y universal para documentar procesos de cualquier área.
- Tutorial guiado de primer acceso con avance paso a paso y opción para saltarlo.
- Asistente para crear rama principal, subproceso, conexión, persona, sistema, documento, control o salida.
- Vista de organigrama y navegación lateral reducida a mapa y organigrama.
- Conexiones automáticas delgadas para personas, sistemas y documentos.
- PDF rellenable de nueve páginas con matriz de aplicabilidad y referencias normativas oficiales.
- Despliegue continuo de esta versión desde la rama `main` hacia Railway.

### Changed

- El mapa deja de tratar los nodos como un flujo en vivo: se retiraron estado y criticidad.
- La ficha general ahora documenta objetivo, entradas, salidas, instrucciones, responsables y archivos.

## [0.2.0] - 2026-07-22

### Added

- Identidad visual azul y verde de Distribuciones Orvel.
- Edición directa de nombre y código desde cada nodo.
- Ficha general completamente editable para procesos, personas y sistemas.
- Carga compartida de documentos PDF e imágenes con validación de contenido.
- Guardado automático del mapa mediante API y soporte de volumen persistente en Railway.

## [0.1.0] - 2026-07-16

### Added

- Arquitectura y alcance del MVP documentados.
- Mapa empresarial tipo camino con nodos arrastrables y conexiones editables.
- Búsqueda, filtros por tipo, creación de nodos y panel contextual.
- Contratos iniciales de permisos, RACI, relaciones y aprobación.
- Base Docker para aplicación y PostgreSQL local.
- Documentación de instalación y despliegue seguro.
- Build standalone de Next.js, endpoint de salud y configuración de Railway.
