# Arquitectura propuesta

## 1. Resumen de la solución

Enterprise Process & Knowledge Map será un monolito modular web con fronteras de dominio claras. El mapa es una proyección visual de datos estructurados: los nodos y relaciones comparten un núcleo genérico, mientras procesos, actividades, personas y documentos conservan tablas específicas. La primera fase entrega la base visual, contratos, modelo y operación local; no declara terminadas la autenticación ni la persistencia.

La arquitectura evita cargar el grafo completo. Las consultas parten de un contexto (empresa, departamento, proceso o vista guardada), aplican filtros en el servidor y expanden vecinos bajo demanda.

## 2. Arquitectura

```text
Navegador React
  ├─ mapa, paneles, búsqueda y formularios
  └─ caché de consultas y estado efímero de interacción
             │ HTTPS / JSON
Aplicación web TypeScript
  ├─ API/BFF y validación
  ├─ autenticación y autorización
  ├─ módulos de dominio
  ├─ auditoría y notificaciones
  └─ trabajos asíncronos
             │
  ┌──────────┼───────────┐
PostgreSQL  Almacenamiento  Proveedor de identidad
datos       S3 compatible   OIDC / Auth.js
```

Módulos: Identidad, Organización, Grafo, Procesos, Documentos, Aprobaciones, Riesgos/KPI, Colaboración, Búsqueda, Auditoría y Archivos. Un adaptador `GraphRepository` permitirá sustituir consultas de recorridos por Neo4j en el futuro sin cambiar las reglas de negocio.

## 3. Tecnologías seleccionadas

- React 19, TypeScript y superficie compatible con Next.js mediante vinext para esta base local.
- Tailwind CSS para estilos y tokens; React Flow se integra en la fase del mapa editable.
- API modular en TypeScript, validación con Zod y contratos compartidos.
- PostgreSQL 17 como fuente de verdad y ORM tipado equivalente a Prisma/Drizzle.
- Auth.js con proveedor OIDC empresarial para despliegues independientes; SIWC sólo es una opción de hosting privado en Sites.
- S3/Azure Blob/GCS mediante una interfaz de objetos; disco local sólo en desarrollo.
- Node test runner para contratos iniciales; Vitest/Playwright en fases posteriores.
- Docker Compose para aplicación y PostgreSQL local.

La elección de vinext se limita a esta base compatible con Sites. Antes del despliegue final se decidirá entre mantener esa superficie o usar Next.js Node estándar; PostgreSQL, autorización y almacenamiento permanecen independientes.

## 4. Modelo de datos inicial

Entidades de identidad: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`. Organización: `Department`, `Position`, `Person`. Núcleo del grafo: `NodeType`, `Node`, `RelationshipType`, `Relationship`, `SavedView`. Procesos: `Process`, `Activity`, `RaciAssignment`, `SipocEntry`. Documentación: `Document`, `DocumentVersion`, `Manual`, `ManualStep`, `Attachment`, `Approval`. Gobierno: `Risk`, `Control`, `Kpi`, `AuditLog`, `Comment`, `Notification`. Catálogos extensibles: `Skill`, `Training`, `AccessRequirement`, `Software`, `Platform`, `Standard`, `Regulation`.

Decisiones de modelado:

- `Node` contiene identidad, tipo, estado y metadatos visuales comunes; las fichas especializadas usan relaciones uno-a-uno.
- La posición pertenece a una vista (`SavedViewNode`), no al nodo, para soportar múltiples mapas.
- `Relationship` tiene una clave única lógica sobre origen, tipo, destino, dirección y estado vigente para evitar duplicados.
- Documentos aprobados usan versiones inmutables; obsolescencia y archivo reemplazan el borrado físico.
- `AuditLog` es append-only y guarda actor, alcance, campo, valores anterior/nuevo, motivo y correlación.
- Datos flexibles sólo se usan para preferencias visuales o instantáneas de auditoría, nunca como sustituto de las entidades estructuradas.

## 5. Estructura del repositorio

```text
app/                 rutas y experiencia web
src/domain/          reglas puras del negocio
src/modules/         módulos de aplicación (siguiente fase)
db/                  acceso y esquema de la base
prisma/              contrato PostgreSQL inicial
tests/               pruebas automatizadas
docs/                arquitectura, MVP y despliegue
public/              recursos públicos no sensibles
.openai/              configuración opcional de Sites
Dockerfile
docker-compose.yml
```

## 6. Flujo de autenticación

1. El usuario solicita una ruta protegida.
2. El middleware valida una sesión segura emitida por Auth.js/OIDC.
3. El backend resuelve `User`, estado, roles y membresías; nunca confía en roles del cliente.
4. Se crea un contexto mínimo de autorización para la petición.
5. Cada comando y consulta valida permiso y alcance antes de acceder al repositorio.
6. Acciones sensibles requieren sesión reciente y generan auditoría.

No se implementarán contraseñas propias. Cookies `HttpOnly`, `Secure`, `SameSite=Lax`, rotación de sesión y protección CSRF se configuran según el proveedor.

## 7. Estrategia de permisos

RBAC define capacidades (`CREATE`, `READ`, `UPDATE`, `DELETE`, `APPROVE`, `AUDIT`, `ADMIN`) por recurso. ABAC limita esas capacidades por `GLOBAL`, `DEPARTMENT`, `PROCESS` o `DOCUMENT`. La decisión efectiva es la intersección de rol, pertenencia, estado del recurso y reglas del flujo. Las verificaciones viven en servicios del backend y las ocultaciones del frontend sólo mejoran la experiencia.

Los documentos publicados no se eliminan. `DELETE` crea una baja lógica; el borrado físico requiere permiso administrativo especial, doble confirmación y auditoría.

## 8. Estrategia de archivos

`StorageProvider` expondrá `put`, `getSignedUrl`, `deleteQuarantined` y `stat`. En local escribirá en `uploads/`; en producción usará almacenamiento de objetos privado. PostgreSQL guarda nombre seguro, hash, MIME detectado, tamaño, propietario y estado de análisis. Las descargas usan URL firmada de corta duración. Se aplican límite de tamaño, allowlist de formatos, nombre aleatorio, antivirus y cuarentena. Los bytes no se guardan en PostgreSQL.

## 9. Estrategia de despliegue

- Local: `npm install && npm run dev` o `docker compose up --build`.
- Integración: GitHub Actions ejecuta lint, pruebas, compilación, revisión de migraciones y escaneo de dependencias.
- Producción: aplicación en Vercel/Render/Azure/AWS; PostgreSQL administrado; almacenamiento privado; secretos en el proveedor.
- Migraciones se ejecutan como paso controlado previo a la aplicación, con respaldo y plan de reversión.
- La primera publicación permanece bloqueada hasta completar autenticación, autorización, encabezados de seguridad y pruebas de acceso.

## 10. Plan del MVP

Incluye acceso, usuarios/roles, departamentos, CRUD controlado de nodos, mapa editable, conexiones por arrastre, posiciones por vista, actividad resumida, manual estructurado, adjuntos, búsqueda/filtros, auditoría, datos ficticios y Docker. Quedan fuera inicialmente BPMN completo, Neo4j, edición colaborativa en tiempo real, analítica avanzada y capacitación completa.

## 11. Fases de implementación

1. Fundamentos: arquitectura, repositorio, interfaz reconocible, contratos, Docker y pruebas mínimas.
2. Identidad y organización: PostgreSQL, migraciones, Auth.js/OIDC, usuarios, roles, departamentos y auditoría.
3. Grafo vertical: React Flow, CRUD, conexiones por arrastre, deduplicación, posiciones y expansión paginada.
4. Actividades y manuales: formularios estructurados, RACI, adjuntos, versiones e historial.
5. Gobierno documental: revisión, aprobación, publicación, obsolescencia, comentarios y notificaciones.
6. Búsqueda e impacto: índices, filtros del servidor, vecinos, dependencias y vistas guardadas.
7. Endurecimiento: accesibilidad, i18n, rendimiento, seguridad, pruebas E2E y observabilidad.
8. Despliegue privado: CI/CD, secretos, almacenamiento, respaldos y verificación de acceso.

## 12. Riesgos y decisiones pendientes

- Volumen y complejidad del grafo: medir consultas PostgreSQL antes de introducir Neo4j.
- Motor visual: validar React Flow con miles de elementos y clustering antes de cerrar la elección.
- Proveedor de identidad: depende del directorio corporativo y requisitos de SSO/MFA.
- Infraestructura final: Sites ofrece una ruta privada, pero PostgreSQL empresarial favorece un runtime Node administrado.
- Archivos: proveedor, retención, antivirus, residencia y límites deben aprobarse con seguridad.
- Cumplimiento: ISO/BPMN se presenta como alineación con buenas prácticas, nunca como certificación.
- Licencia: el archivo actual conserva todos los derechos hasta que el propietario elija una licencia.
- Búsqueda: PostgreSQL FTS cubre el MVP; un motor dedicado se evalúa con datos reales de volumen, no antes.
