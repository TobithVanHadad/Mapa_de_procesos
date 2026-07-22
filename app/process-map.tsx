"use client";

import { useCallback, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";

type MapNodeData = {
  label: React.ReactNode;
  name: string;
  kind: string;
  code?: string;
  owner?: string;
  description?: string;
  status?: string;
};

type MapNode = Node<MapNodeData>;

const typeMeta: Record<string, { icon: string; label: string; color: string }> = {
  process: { icon: "◆", label: "Proceso", color: "#8cff67" },
  activity: { icon: "✓", label: "Actividad", color: "#d5ff3f" },
  person: { icon: "●", label: "Persona", color: "#ff9ccc" },
  system: { icon: "⌘", label: "Sistema", color: "#79ddff" },
  manual: { icon: "▤", label: "Manual", color: "#c4a7ff" },
  control: { icon: "◇", label: "Control", color: "#ffca68" },
  output: { icon: "→", label: "Salida", color: "#83f1c4" },
};

function Card({ kind, title, code, meta }: { kind: string; title: string; code?: string; meta?: string }) {
  const type = typeMeta[kind];
  return (
    <div className="node-card-content">
      <span className="node-symbol" style={{ background: type.color }}>{type.icon}</span>
      <span className="node-copy">
        <small>{code ?? type.label}</small>
        <strong>{title}</strong>
      </span>
      {meta && <span className="node-meta">{meta}</span>}
    </div>
  );
}

const initialNodes: MapNode[] = [
  { id: "request", position: { x: 40, y: 335 }, sourcePosition: Position.Right, targetPosition: Position.Left, className: "flow-node process", data: { label: <Card kind="process" title="Recepción" code="Inicio" />, name: "Recepción de solicitud", kind: "process", code: "PR-001", owner: "Process Owner", status: "Activo", description: "Recibir y registrar una nueva solicitud de desarrollo de etiqueta." } },
  { id: "validate", position: { x: 330, y: 245 }, sourcePosition: Position.Right, targetPosition: Position.Left, className: "flow-node activity", data: { label: <Card kind="activity" title="Validar información" code="LC-001" meta="25 min" />, name: "Validar información", kind: "activity", code: "LC-001", owner: "Labeling Specialist", status: "Activo", description: "Verificar que los datos de producto estén completos y sean consistentes." } },
  { id: "design", position: { x: 650, y: 330 }, sourcePosition: Position.Right, targetPosition: Position.Left, className: "flow-node activity featured", data: { label: <Card kind="activity" title="Desarrollar etiqueta" code="LC-003" meta="45 min" />, name: "Desarrollar etiqueta", kind: "activity", code: "LC-003", owner: "Labeling Specialist", status: "En curso", description: "Diseñar la etiqueta con la información validada y los lineamientos aplicables." } },
  { id: "review", position: { x: 980, y: 215 }, sourcePosition: Position.Right, targetPosition: Position.Left, className: "flow-node control", data: { label: <Card kind="control" title="Revisar cumplimiento" code="LC-004" meta="1 pendiente" />, name: "Revisión de cumplimiento", kind: "control", code: "LC-004", owner: "Reviewer", status: "En revisión", description: "Comprobar textos, símbolos y requisitos normativos antes de aprobar." } },
  { id: "approve", position: { x: 1300, y: 310 }, sourcePosition: Position.Right, targetPosition: Position.Left, className: "flow-node activity", data: { label: <Card kind="activity" title="Aprobar etiqueta" code="LC-005" meta="Aprobador" />, name: "Aprobación", kind: "activity", code: "LC-005", owner: "Process Owner", status: "Pendiente", description: "Emitir la aprobación formal de la versión revisada." } },
  { id: "deliver", position: { x: 1610, y: 240 }, sourcePosition: Position.Right, targetPosition: Position.Left, className: "flow-node output", data: { label: <Card kind="output" title="Entregar a almacén" code="Resultado" />, name: "Entrega a almacén", kind: "output", code: "LC-006", owner: "Labeling Specialist", status: "Pendiente", description: "Publicar y entregar los archivos aprobados para su uso operativo." } },
  { id: "specialist", position: { x: 510, y: 60 }, sourcePosition: Position.Bottom, targetPosition: Position.Bottom, className: "flow-node compact person", data: { label: <Card kind="person" title="Labeling Specialist" />, name: "Labeling Specialist", kind: "person", owner: "Labeling & Compliance", status: "Activo" } },
  { id: "erp", position: { x: 140, y: 610 }, sourcePosition: Position.Top, targetPosition: Position.Top, className: "flow-node compact system", data: { label: <Card kind="system" title="ERP" />, name: "ERP", kind: "system", status: "Disponible" } },
  { id: "labelsoftware", position: { x: 690, y: 625 }, sourcePosition: Position.Top, targetPosition: Position.Top, className: "flow-node compact system", data: { label: <Card kind="system" title="Software de etiquetado" />, name: "Software de etiquetado", kind: "system", status: "Disponible" } },
  { id: "manual", position: { x: 1030, y: 545 }, sourcePosition: Position.Top, targetPosition: Position.Top, className: "flow-node compact manual", data: { label: <Card kind="manual" title="Manual de creación" code="MAN-014" />, name: "Manual de creación", kind: "manual", code: "MAN-014", status: "Publicado" } },
  { id: "owner", position: { x: 1320, y: 65 }, sourcePosition: Position.Bottom, targetPosition: Position.Bottom, className: "flow-node compact person", data: { label: <Card kind="person" title="Process Owner" />, name: "Process Owner", kind: "person", owner: "Labeling & Compliance", status: "Activo" } },
];

const pathEdge = { type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#d5ff3f" }, style: { stroke: "#d5ff3f", strokeWidth: 2.4 } };
const branchEdge = { type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#71818f" }, style: { stroke: "#71818f", strokeWidth: 1.4 } };

const initialEdges: Edge[] = [
  { id: "e-request-validate", source: "request", target: "validate", label: "inicia", ...pathEdge },
  { id: "e-validate-design", source: "validate", target: "design", label: "entrega información", ...pathEdge },
  { id: "e-design-review", source: "design", target: "review", label: "continúa con", ...pathEdge },
  { id: "e-review-approve", source: "review", target: "approve", label: "solicita aprobación", ...pathEdge },
  { id: "e-approve-deliver", source: "approve", target: "deliver", label: "libera", ...pathEdge },
  { id: "e-specialist-validate", source: "specialist", target: "validate", label: "realiza", ...branchEdge },
  { id: "e-specialist-design", source: "specialist", target: "design", label: "realiza", ...branchEdge },
  { id: "e-erp-request", source: "erp", target: "request", label: "recibe de", ...branchEdge },
  { id: "e-design-software", source: "design", target: "labelsoftware", label: "usa", ...branchEdge },
  { id: "e-design-manual", source: "design", target: "manual", label: "consulta", ...branchEdge },
  { id: "e-owner-approve", source: "owner", target: "approve", label: "aprueba", ...branchEdge },
];

function MapExperience() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedId, setSelectedId] = useState("design");
  const [query, setQuery] = useState("");
  const [hiddenKinds, setHiddenKinds] = useState<string[]>([]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, label: "nueva relación", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#9fd8cc", strokeWidth: 2 } }, current));
  }, [setEdges]);

  const visibleNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return nodes.map((node) => ({
      ...node,
      hidden:
        hiddenKinds.includes(node.data.kind) ||
        (normalized.length > 0 &&
          !node.data.name.toLowerCase().includes(normalized) &&
          !node.data.kind.toLowerCase().includes(normalized)),
    }));
  }, [hiddenKinds, nodes, query]);

  const toggleKind = useCallback((kind: string) => {
    setHiddenKinds((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);
  }, []);

  const addNode = useCallback(() => {
    const number = nodes.length + 1;
    const id = `new-${Date.now()}`;
    const newNode: MapNode = {
      id,
      position: { x: 1480 + (number % 3) * 80, y: 500 + (number % 2) * 90 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: "flow-node activity",
      data: {
        label: <Card kind="activity" title="Nueva actividad" code={`LC-${String(number).padStart(3, "0")}`} meta="Sin asignar" />,
        name: "Nueva actividad",
        kind: "activity",
        code: `LC-${String(number).padStart(3, "0")}`,
        owner: "Sin responsable",
        status: "Borrador",
        description: "Actividad nueva lista para documentarse y conectarse con el proceso.",
      },
    };
    setNodes((current) => [...current, newNode]);
    setSelectedId(id);
  }, [nodes.length, setNodes]);

  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const selectedType = typeMeta[selected.data.kind];

  return (
    <main className="map-app">
      <aside className="rail" aria-label="Navegación principal">
        <div className="logo">EK</div>
        <nav>
          <button title="Inicio">⌂</button>
          <button className="active" title="Mapa empresarial">⌘</button>
          <button title="Procesos">↗</button>
          <button title="Documentos">▤</button>
          <button title="Personas">●</button>
        </nav>
        <button className="rail-avatar" title="Usuario administrador">UA</button>
      </aside>

      <section className="map-workspace">
        <header className="map-header">
          <div>
            <div className="breadcrumb">ORGANIZACIÓN / LABELING &amp; COMPLIANCE</div>
            <h1>Camino del proceso</h1>
          </div>
          <label className="map-search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nodo, persona o sistema" aria-label="Buscar en el mapa" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="header-buttons">
            <button className="ghost-button">Compartir</button>
            <button className="lime-button" onClick={addNode}>＋ Nuevo nodo</button>
          </div>
        </header>

        <div className="map-body">
          <section className="graph-panel" aria-label="Mapa interactivo del proceso">
            <div className="graph-heading">
              <div><span className="live-dot" />PROCESO ACTIVO</div>
              <strong>Desarrollo y aprobación de etiquetas</strong>
              <span>6 etapas · 11 conexiones · Actualizado hoy</span>
            </div>
            <div className="type-filters" aria-label="Filtros por tipo de nodo">
              {Object.entries(typeMeta).slice(0, 6).map(([kind, meta]) => (
                <button key={kind} className={hiddenKinds.includes(kind) ? "muted" : ""} onClick={() => toggleKind(kind)}>
                  <i style={{ background: meta.color }} />{meta.label}
                </button>
              ))}
            </div>
            <ReactFlow
              nodes={visibleNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              fitView
              fitViewOptions={{ padding: 0.2, minZoom: 0.55, maxZoom: 1 }}
              minZoom={0.25}
              maxZoom={1.6}
              nodesDraggable
              nodesConnectable
              elementsSelectable
              proOptions={{ hideAttribution: true }}
              colorMode="dark"
            >
              <Background color="#34414b" gap={24} size={1.1} variant={BackgroundVariant.Dots} />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap position="bottom-right" nodeColor={(node) => typeMeta[node.data?.kind as string]?.color ?? "#7d8b94"} maskColor="rgba(7, 12, 16, .78)" />
            </ReactFlow>
            <div className="map-hint"><span>Arrastra para ordenar</span><span>Une los puntos para conectar</span><span>Rueda para zoom</span></div>
          </section>

          <aside className="node-inspector">
            <div className="inspector-top">
              <span className="inspector-icon" style={{ background: selectedType.color }}>{selectedType.icon}</span>
              <div><small>{selectedType.label.toUpperCase()}</small><h2>{selected.data.name}</h2><p>{selected.data.code ?? "Nodo relacionado"}</p></div>
              <button aria-label="Más opciones">•••</button>
            </div>
            <div className="inspector-status"><span><i />{selected.data.status ?? "Activo"}</span><span>Criticidad media</span></div>
            <p className="inspector-description">{selected.data.description ?? `Este nodo representa ${selected.data.name} dentro del proceso y muestra todas sus dependencias.`}</p>
            <div className="inspector-section"><small>RESPONSABLE</small><div className="person-row"><span>LS</span><div><strong>{selected.data.owner ?? "Labeling Specialist"}</strong><p>Labeling &amp; Compliance</p></div></div></div>
            <div className="inspector-section"><small>CONEXIONES</small><div className="connection-summary"><div><b>{edges.filter((edge) => edge.source === selected.id).length}</b><span>Salientes</span></div><div><b>{edges.filter((edge) => edge.target === selected.id).length}</b><span>Entrantes</span></div><div><b>{edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).length}</b><span>Total</span></div></div></div>
            <div className="legend"><small>LEYENDA</small>{Object.entries(typeMeta).slice(0, 6).map(([key, value]) => <span key={key}><i style={{ background: value.color }} />{value.label}</span>)}</div>
            <button className="open-record">Abrir ficha completa <span>→</span></button>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default function ProcessMap() {
  return <ReactFlowProvider><MapExperience /></ReactFlowProvider>;
}
