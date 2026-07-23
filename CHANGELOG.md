# Changelog

## [0.6.0] - 2026-07-23

### Added

- Ligaduras automáticas, delgadas y diferenciadas entre todos los elementos que comparten departamento.
- Modo `Conectar nodos` para crear relaciones haciendo clic en dos tarjetas, además de conectores visuales más grandes.
- Asignación de varios jefes directos por persona y nivel jerárquico `Administrativo`.
- Organigrama alineado por niveles explícitos para mantener Dirección, Gerencia y los demás rangos a la misma altura.
- Tres sugerencias de acomodo: camino principal, por departamento y cuadrícula compacta, con opción para deshacer.
- Reporte integral descargable en HTML con formato de impresión y guardado como PDF.
- Tutorial de ocho pasos sobre la interfaz real, con zonas iluminadas y avance mediante clic.

### Changed

- El sonido de escritura ahora se sintetiza como un interruptor mecánico con golpe y ruido filtrado, sin tono de videojuego.
- El reporte y el organigrama incluyen relaciones automáticas, departamentos y múltiples jefaturas.

## [0.5.0] - 2026-07-23

### Added

- Corte individual de conexiones sin eliminar nodos, fichas ni archivos.
- Conexiones paralelas entre los mismos elementos y relaciones automáticas cuando una persona o puesto se reutiliza como participante.
- Selección por recuadro para mover varios nodos como grupo.
- Campos especializados para ramas, subprocesos, personas, sistemas, documentos y controles.
- Sugerencias reutilizables de personas, puestos, responsables y departamentos ya registrados.
- Jerarquía de personas mediante el campo `Reporta a` y organigrama agrupado visualmente por departamento.

### Changed

- La categoría `Salida` se retiró; los nodos existentes de ese tipo se migran a rama principal conservando toda su información.
- Los controles flotantes permanecen contraídos y muestran su etiqueta al pasar el cursor.
- El organigrama ya no depende de conexiones manuales del mapa de procesos.

## [0.4.0] - 2026-07-22

### Added

- Sonidos sintetizados para crear, conectar, seleccionar, restaurar y escribir, con controles de volumen y silencio guardados por dispositivo.
- Creación de ramas y elementos independientes que pueden conectarse posteriormente.
- Copia automática diaria del mapa en el dispositivo, con descarga, restauración y eliminación automática después de tres días.
- Controles para ajustar el mapa completo y mostrar u ocultar la ficha editable.

### Changed

- Las tarjetas crecen para mostrar nombres largos completos sin cortar el texto.
- El nodo seleccionado ahora tiene borde, halo y etiqueta de selección más visibles.
- El botón para agregar elementos tiene mayor contraste y permanece accesible sobre el mapa.
- La distribución se adapta a pantallas pequeñas y permite plegar la ficha para aprovechar el lienzo.

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
