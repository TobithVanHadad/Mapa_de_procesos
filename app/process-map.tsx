"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Image from "next/image";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";

type NodeKind =
  | "process"
  | "activity"
  | "person"
  | "system"
  | "manual"
  | "control"
  | "output";

type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
};

type MapNodeData = {
  [key: string]: unknown;
  name: string;
  kind: NodeKind;
  code: string;
  owner: string;
  department: string;
  role: string;
  email: string;
  phone: string;
  status: string;
  criticality: string;
  duration: string;
  description: string;
  attachments: Attachment[];
};

type MapNode = Node<MapNodeData>;

type MapDocument = {
  version: number;
  processName: string;
  department: string;
  nodes: MapNode[];
  edges: Edge[];
};

const typeMeta: Record<NodeKind, { short: string; label: string; color: string }> = {
  process: { short: "PR", label: "Proceso", color: "#0b9b45" },
  activity: { short: "AC", label: "Actividad", color: "#174b7a" },
  person: { short: "PE", label: "Persona", color: "#8b5cf6" },
  system: { short: "SI", label: "Sistema", color: "#0e86b7" },
  manual: { short: "DO", label: "Documento", color: "#d97706" },
  control: { short: "CO", label: "Control", color: "#dc3d36" },
  output: { short: "SA", label: "Salida", color: "#0d9488" },
};

const statuses = ["Borrador", "Activo", "En curso", "En revisión", "Aprobado", "Pendiente", "Publicado"];
const criticalities = ["Baja", "Media", "Alta", "Crítica"];

const pathEdge = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#0b9b45" },
  style: { stroke: "#0b9b45", strokeWidth: 2.5 },
};

const branchEdge = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#68819a" },
  style: { stroke: "#68819a", strokeWidth: 1.5 },
};

function nodeData(partial: Partial<MapNodeData>): MapNodeData {
  return {
    name: "Nuevo elemento",
    kind: "activity",
    code: "ORV-000",
    owner: "Sin responsable",
    department: "Distribuciones Orvel",
    role: "Sin asignar",
    email: "",
    phone: "",
    status: "Borrador",
    criticality: "Media",
    duration: "",
    description: "",
    attachments: [],
    ...partial,
  };
}

const defaultDocument: MapDocument = {
  version: 1,
  processName: "Desarrollo y aprobación de etiquetas",
  department: "Operación de pedidos y etiquetado",
  nodes: [
    { id: "request", type: "editable", position: { x: 40, y: 335 }, data: nodeData({ name: "Recepción de solicitud", kind: "process", code: "PR-001", owner: "Responsable de proceso", status: "Activo", description: "Recibir y documentar una nueva solicitud de desarrollo de etiqueta." }) },
    { id: "validate", type: "editable", position: { x: 330, y: 245 }, data: nodeData({ name: "Validar información", kind: "activity", code: "LC-001", owner: "Especialista de etiquetado", status: "Activo", duration: "25 min", description: "Verificar que los datos del producto estén completos y sean consistentes." }) },
    { id: "design", type: "editable", position: { x: 650, y: 330 }, data: nodeData({ name: "Desarrollar etiqueta", kind: "activity", code: "LC-003", owner: "Especialista de etiquetado", status: "En curso", duration: "45 min", description: "Diseñar la etiqueta con la información validada y los lineamientos aplicables." }) },
    { id: "review", type: "editable", position: { x: 980, y: 215 }, data: nodeData({ name: "Revisar cumplimiento", kind: "control", code: "LC-004", owner: "Revisor de cumplimiento", status: "En revisión", criticality: "Alta", description: "Comprobar textos, símbolos y requisitos normativos antes de aprobar." }) },
    { id: "approve", type: "editable", position: { x: 1300, y: 310 }, data: nodeData({ name: "Aprobar etiqueta", kind: "activity", code: "LC-005", owner: "Responsable de proceso", status: "Pendiente", description: "Emitir la aprobación formal de la versión revisada." }) },
    { id: "deliver", type: "editable", position: { x: 1610, y: 240 }, data: nodeData({ name: "Entregar a almacén", kind: "output", code: "LC-006", owner: "Especialista de etiquetado", status: "Pendiente", description: "Publicar y entregar los archivos aprobados para su uso operativo." }) },
    { id: "specialist", type: "editable", position: { x: 510, y: 60 }, data: nodeData({ name: "Especialista de etiquetado", kind: "person", code: "PER-001", owner: "Cristóbal", department: "Etiquetado", role: "Labeling Specialist", email: "", status: "Activo" }) },
    { id: "erp", type: "editable", position: { x: 140, y: 610 }, data: nodeData({ name: "ERP", kind: "system", code: "SIS-001", status: "Activo", description: "Sistema fuente de pedidos e información operativa." }) },
    { id: "labelsoftware", type: "editable", position: { x: 690, y: 625 }, data: nodeData({ name: "Software de etiquetado", kind: "system", code: "SIS-002", status: "Activo" }) },
    { id: "manual", type: "editable", position: { x: 1030, y: 545 }, data: nodeData({ name: "Manual de creación", kind: "manual", code: "MAN-014", status: "Publicado", description: "Instrucciones vigentes para desarrollar y liberar etiquetas." }) },
    { id: "owner", type: "editable", position: { x: 1320, y: 65 }, data: nodeData({ name: "Responsable de proceso", kind: "person", code: "PER-002", department: "Operaciones", role: "Process Owner", status: "Activo" }) },
  ],
  edges: [
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
  ],
};

function EditableNode({ id, data, selected }: NodeProps<MapNode>) {
  const { updateNodeData } = useReactFlow<MapNode, Edge>();
  const meta = typeMeta[data.kind];
  const image = data.attachments.find((attachment) => attachment.type.startsWith("image/"));

  const update = (field: keyof MapNodeData, value: string) => {
    updateNodeData(id, { [field]: value } as Partial<MapNodeData>);
  };

  return (
    <article className={`orvel-node orvel-node-${data.kind} ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-accent" style={{ background: meta.color }} />
      <div className="node-main">
        {image ? (
          <Image className="node-avatar" src={image.url} alt="" width={37} height={37} unoptimized />
        ) : (
          <span className="node-kind" style={{ background: `${meta.color}18`, color: meta.color }}>{meta.short}</span>
        )}
        <div className="node-editable-copy">
          <input
            className="nodrag node-code-input"
            value={data.code}
            onChange={(event) => update("code", event.target.value)}
            aria-label="Código del nodo"
          />
          <input
            className="nodrag node-name-input"
            value={data.name}
            onChange={(event) => update("name", event.target.value)}
            aria-label="Nombre del nodo"
          />
        </div>
      </div>
      <div className="node-footer">
        <select
          className="nodrag"
          value={data.status}
          onChange={(event) => update("status", event.target.value)}
          aria-label="Estado del nodo"
        >
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
        <span>{data.duration || meta.label}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

const nodeTypes = { editable: EditableNode } satisfies NodeTypes;

function readLocalDocument(): MapDocument | null {
  try {
    const value = window.localStorage.getItem("orvel-process-map-v1");
    return value ? JSON.parse(value) as MapDocument : null;
  } catch {
    return null;
  }
}

function MapExperience() {
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(defaultDocument.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultDocument.edges);
  const [selectedId, setSelectedId] = useState("design");
  const [query, setQuery] = useState("");
  const [hiddenKinds, setHiddenKinds] = useState<NodeKind[]>([]);
  const [processName, setProcessName] = useState(defaultDocument.processName);
  const [department, setDepartment] = useState(defaultDocument.department);
  const [saveState, setSaveState] = useState("Conectando…");
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDocument() {
      try {
        const response = await fetch("/api/map", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo cargar el mapa");
        const payload = await response.json() as { document: MapDocument | null };
        const document = payload.document ?? readLocalDocument();
        if (!cancelled && document?.nodes?.length) {
          setNodes(document.nodes.map((node) => ({ ...node, type: "editable" })));
          setEdges(document.edges ?? []);
          setProcessName(document.processName || defaultDocument.processName);
          setDepartment(document.department || defaultDocument.department);
        }
        if (!cancelled) setSaveState(payload.document ? "Datos sincronizados" : "Listo para guardar");
      } catch {
        const local = readLocalDocument();
        if (!cancelled && local?.nodes?.length) {
          setNodes(local.nodes.map((node) => ({ ...node, type: "editable" })));
          setEdges(local.edges ?? []);
          setProcessName(local.processName || defaultDocument.processName);
          setDepartment(local.department || defaultDocument.department);
        }
        if (!cancelled) setSaveState("Guardado local");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void loadDocument();
    return () => { cancelled = true; };
  }, [setEdges, setNodes]);

  useEffect(() => {
    if (!loaded) return;

    const timer = window.setTimeout(async () => {
      const document: MapDocument = {
        version: 1,
        processName,
        department,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: "editable",
          position: node.position,
          data: node.data,
        })),
        edges,
      };

      window.localStorage.setItem("orvel-process-map-v1", JSON.stringify(document));
      setSaveState("Guardando…");

      try {
        const response = await fetch("/api/map", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(document),
        });
        if (!response.ok) throw new Error("No se pudo guardar");
        setSaveState("Datos sincronizados");
      } catch {
        setSaveState("Guardado local");
      }
    }, 850);

    return () => window.clearTimeout(timer);
  }, [department, edges, loaded, nodes, processName]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({
      ...connection,
      label: "relaciona",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#0b9b45" },
      style: { stroke: "#0b9b45", strokeWidth: 2 },
    }, current));
  }, [setEdges]);

  const visibleNodes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return nodes.map((node) => ({
      ...node,
      hidden:
        hiddenKinds.includes(node.data.kind) ||
        (normalized.length > 0 && ![node.data.name, node.data.code, node.data.owner, node.data.kind]
          .some((value) => value.toLocaleLowerCase("es").includes(normalized))),
    }));
  }, [hiddenKinds, nodes, query]);

  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];

  const updateSelected = useCallback((field: keyof MapNodeData, value: string | Attachment[]) => {
    if (!selected) return;
    setNodes((current) => current.map((node) => node.id === selected.id
      ? { ...node, data: { ...node.data, [field]: value } }
      : node));
  }, [selected, setNodes]);

  const addNode = useCallback(() => {
    const number = nodes.length + 1;
    const id = `node-${Date.now()}`;
    const newNode: MapNode = {
      id,
      type: "editable",
      position: { x: 1360 + (number % 3) * 95, y: 520 + (number % 2) * 110 },
      data: nodeData({
        name: "Nueva actividad",
        code: `ORV-${String(number).padStart(3, "0")}`,
        description: "Describe aquí el objetivo y alcance de esta actividad.",
      }),
    };
    setNodes((current) => [...current, newNode]);
    setSelectedId(id);
  }, [nodes.length, setNodes]);

  const deleteSelected = useCallback(() => {
    if (!selected || nodes.length === 1) return;
    const next = nodes.find((node) => node.id !== selected.id);
    setNodes((current) => current.filter((node) => node.id !== selected.id));
    setEdges((current) => current.filter((edge) => edge.source !== selected.id && edge.target !== selected.id));
    if (next) setSelectedId(next.id);
  }, [nodes, selected, setEdges, setNodes]);

  const toggleKind = useCallback((kind: NodeKind) => {
    setHiddenKinds((current) => current.includes(kind)
      ? current.filter((item) => item !== kind)
      : [...current, kind]);
  }, []);

  const uploadFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selected || !event.target.files?.length) return;
    setUploading(true);

    try {
      for (const file of Array.from(event.target.files)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/uploads", { method: "POST", body: formData });
        const payload = await response.json() as { attachment?: Attachment; error?: string };
        if (!response.ok || !payload.attachment) throw new Error(payload.error || "No se pudo subir el archivo");
        setNodes((current) => current.map((node) => node.id === selected.id
          ? { ...node, data: { ...node.data, attachments: [...node.data.attachments, payload.attachment as Attachment] } }
          : node));
      }
      setSaveState("Archivo agregado");
    } catch (error) {
      setSaveState(error instanceof Error ? error.message : "Error al subir archivo");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }, [selected, setNodes]);

  const removeAttachment = useCallback((attachmentId: string) => {
    if (!selected) return;
    updateSelected("attachments", selected.data.attachments.filter((attachment) => attachment.id !== attachmentId));
    void fetch(`/api/uploads/${attachmentId}`, { method: "DELETE" });
  }, [selected, updateSelected]);

  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setSaveState("Enlace copiado");
    } catch {
      setSaveState("Copia la dirección del navegador");
    }
  }, []);

  return (
    <main className="map-app">
      <aside className="rail" aria-label="Navegación principal">
        <div className="logo">DO</div>
        <nav>
          <button title="Inicio">IN</button>
          <button className="active" title="Mapa de procesos">MP</button>
          <button title="Documentos">DC</button>
          <button title="Personas">PE</button>
        </nav>
        <button className="rail-avatar" title="Sesión activa">CG</button>
      </aside>

      <section className="map-workspace">
        <header className="map-header">
          <div className="brand-block">
            <div className="breadcrumb">DISTRIBUCIONES ORVEL / MAPA OPERATIVO</div>
            <h1>Mapa de Proceso Distribuciones Orvel</h1>
          </div>
          <label className="map-search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nodo, persona, código…" aria-label="Buscar en el mapa" />
          </label>
          <span className={`sync-pill ${saveState === "Datos sincronizados" ? "is-synced" : ""}`}><i />{saveState}</span>
          <div className="header-buttons">
            <button className="ghost-button" onClick={share}>Compartir</button>
            <button className="navy-button" onClick={addNode}>+ Nuevo nodo</button>
          </div>
        </header>

        <div className="map-body">
          <section className="graph-panel" aria-label="Mapa interactivo del proceso">
            <div className="graph-heading">
              <div><span className="live-dot" />PROCESO ACTIVO</div>
              <input value={processName} onChange={(event) => setProcessName(event.target.value)} aria-label="Nombre del proceso" />
              <input value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Área del proceso" />
              <span>{nodes.length} nodos · {edges.length} conexiones</span>
            </div>
            <div className="type-filters" aria-label="Filtros por tipo de nodo">
              {(Object.entries(typeMeta) as [NodeKind, (typeof typeMeta)[NodeKind]][]).map(([kind, meta]) => (
                <button key={kind} className={hiddenKinds.includes(kind) ? "muted" : ""} onClick={() => toggleKind(kind)}>
                  <i style={{ background: meta.color }} />{meta.label}
                </button>
              ))}
            </div>
            <ReactFlow<MapNode, Edge>
              nodes={visibleNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              fitView
              fitViewOptions={{ padding: 0.2, minZoom: 0.52, maxZoom: 1 }}
              minZoom={0.25}
              maxZoom={1.7}
              nodesDraggable
              nodesConnectable
              elementsSelectable
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#b7c8da" gap={24} size={1.15} variant={BackgroundVariant.Dots} />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap position="bottom-right" nodeColor={(node) => typeMeta[node.data?.kind as NodeKind]?.color ?? "#68819a"} maskColor="rgba(232, 239, 246, .76)" />
            </ReactFlow>
            <div className="map-hint"><span>Edita dentro de cada tarjeta</span><span>Arrastra para ordenar</span><span>Une los puntos para conectar</span></div>
          </section>

          {selected && (
            <aside className="node-inspector">
              <div className="inspector-titlebar">
                <div>
                  <small>FICHA GENERAL EDITABLE</small>
                  <h2>{selected.data.name}</h2>
                </div>
                <span className="kind-badge" style={{ color: typeMeta[selected.data.kind].color, background: `${typeMeta[selected.data.kind].color}14` }}>
                  {typeMeta[selected.data.kind].label}
                </span>
              </div>

              <div className="inspector-form">
                <label className="field field-wide"><span>Nombre</span><input value={selected.data.name} onChange={(event) => updateSelected("name", event.target.value)} /></label>
                <label className="field"><span>Código</span><input value={selected.data.code} onChange={(event) => updateSelected("code", event.target.value)} /></label>
                <label className="field"><span>Tipo</span><select value={selected.data.kind} onChange={(event) => updateSelected("kind", event.target.value as NodeKind)}>{(Object.entries(typeMeta) as [NodeKind, (typeof typeMeta)[NodeKind]][]).map(([kind, meta]) => <option key={kind} value={kind}>{meta.label}</option>)}</select></label>
                <label className="field"><span>Estado</span><select value={selected.data.status} onChange={(event) => updateSelected("status", event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                <label className="field"><span>Criticidad</span><select value={selected.data.criticality} onChange={(event) => updateSelected("criticality", event.target.value)}>{criticalities.map((criticality) => <option key={criticality}>{criticality}</option>)}</select></label>
                <label className="field"><span>Responsable</span><input value={selected.data.owner} onChange={(event) => updateSelected("owner", event.target.value)} /></label>
                <label className="field"><span>Puesto / función</span><input value={selected.data.role} onChange={(event) => updateSelected("role", event.target.value)} /></label>
                <label className="field field-wide"><span>Área</span><input value={selected.data.department} onChange={(event) => updateSelected("department", event.target.value)} /></label>
                <label className="field"><span>Correo</span><input type="email" value={selected.data.email} onChange={(event) => updateSelected("email", event.target.value)} /></label>
                <label className="field"><span>Teléfono</span><input value={selected.data.phone} onChange={(event) => updateSelected("phone", event.target.value)} /></label>
                <label className="field field-wide"><span>Duración / frecuencia</span><input value={selected.data.duration} onChange={(event) => updateSelected("duration", event.target.value)} placeholder="Ej. 45 min o semanal" /></label>
                <label className="field field-wide"><span>Descripción y datos generales</span><textarea value={selected.data.description} onChange={(event) => updateSelected("description", event.target.value)} rows={5} placeholder="Objetivo, alcance, entradas, salidas y observaciones…" /></label>
              </div>

              <section className="attachments-section">
                <div className="section-heading">
                  <div><small>ARCHIVOS</small><strong>PDF, documentos e imágenes</strong></div>
                  <button onClick={() => uploadRef.current?.click()} disabled={uploading}>{uploading ? "Subiendo…" : "+ Agregar"}</button>
                </div>
                <input ref={uploadRef} hidden type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" onChange={uploadFiles} />
                {selected.data.attachments.length ? (
                  <div className="attachment-list">
                    {selected.data.attachments.map((attachment) => (
                      <div className="attachment" key={attachment.id}>
                        {attachment.type.startsWith("image/") ? <Image src={attachment.url} alt="" width={38} height={38} unoptimized /> : <span className="pdf-icon">PDF</span>}
                        <a href={attachment.url} target="_blank" rel="noreferrer"><strong>{attachment.name}</strong><small>{Math.max(1, Math.round(attachment.size / 1024))} KB</small></a>
                        <button aria-label={`Quitar ${attachment.name}`} onClick={() => removeAttachment(attachment.id)}>×</button>
                      </div>
                    ))}
                  </div>
                ) : <p className="empty-files">Todavía no hay archivos. Las imágenes de personas también aparecerán en su tarjeta del mapa.</p>}
              </section>

              <div className="connection-strip">
                <div><b>{edges.filter((edge) => edge.source === selected.id).length}</b><span>Salientes</span></div>
                <div><b>{edges.filter((edge) => edge.target === selected.id).length}</b><span>Entrantes</span></div>
                <div><b>{selected.data.attachments.length}</b><span>Archivos</span></div>
              </div>
              <button className="delete-node" onClick={deleteSelected} disabled={nodes.length === 1}>Eliminar nodo</button>
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}

export default function ProcessMap() {
  return <ReactFlowProvider><MapExperience /></ReactFlowProvider>;
}
