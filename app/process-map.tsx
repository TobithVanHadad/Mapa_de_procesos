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
  useUpdateNodeInternals,
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

type ViewMode = "map" | "org";
type CreationChoice = NodeKind | "connection";

type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
  static?: boolean;
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
  duration: string;
  objective: string;
  inputs: string;
  outputs: string;
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

const TEMPLATE_PDF = "/plantillas/machote-documentacion-procesos-orvel.pdf";
const LOCAL_STORAGE_KEY = "orvel-process-map-v3";
const TUTORIAL_STORAGE_KEY = "orvel-process-tutorial-v1";
const SOUND_STORAGE_KEY = "orvel-process-sound-v1";
const BACKUP_DATABASE = "orvel-process-local-backups";
const BACKUP_STORE = "daily-backups";

type SoundSettings = {
  enabled: boolean;
  typing: boolean;
  volume: number;
};

type LocalBackup = {
  id: string;
  createdAt: string;
  document: MapDocument;
};

const defaultSoundSettings: SoundSettings = { enabled: true, typing: true, volume: 0.22 };
let sharedAudioContext: AudioContext | null = null;
let lastTypingSound = 0;

function readSoundSettings(): SoundSettings {
  try {
    const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
    return stored ? { ...defaultSoundSettings, ...JSON.parse(stored) as Partial<SoundSettings> } : defaultSoundSettings;
  } catch {
    return defaultSoundSettings;
  }
}

function playInterfaceSound(kind: "create" | "connect" | "select" | "type" | "restore", settings: SoundSettings) {
  if (!settings.enabled || (kind === "type" && !settings.typing) || typeof window === "undefined") return;
  if (kind === "type" && performance.now() - lastTypingSound < 55) return;
  if (kind === "type") lastTypingSound = performance.now();

  const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;
  sharedAudioContext ??= new AudioContextConstructor();
  if (sharedAudioContext.state === "suspended") void sharedAudioContext.resume();

  const context = sharedAudioContext;
  const now = context.currentTime + 0.01;
  const sequences: Record<typeof kind, Array<[number, number, number, OscillatorType]>> = {
    create: [[523, 0, .075, "sine"], [659, .065, .09, "sine"], [784, .14, .11, "sine"]],
    connect: [[392, 0, .065, "triangle"], [523, .055, .075, "triangle"], [659, .115, .09, "triangle"]],
    select: [[620, 0, .045, "sine"]],
    type: [[980 + Math.random() * 160, 0, .025, "square"]],
    restore: [[659, 0, .08, "sine"], [523, .08, .09, "sine"], [784, .17, .13, "sine"]],
  };

  sequences[kind].forEach(([frequency, delay, duration, oscillatorType]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + delay;
    oscillator.type = oscillatorType;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.002, settings.volume * (kind === "type" ? .07 : .16)), start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .015);
  });
}

function openBackupDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(BACKUP_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BACKUP_STORE)) request.result.createObjectStore(BACKUP_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readBackupRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listLocalBackups(): Promise<LocalBackup[]> {
  const database = await openBackupDatabase();
  try {
    const items = await readBackupRequest(database.transaction(BACKUP_STORE, "readonly").objectStore(BACKUP_STORE).getAll()) as LocalBackup[];
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const ordered = items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const retained = ordered.filter((backup) => new Date(backup.createdAt).getTime() >= cutoff).slice(0, 3);
    const retainedIds = new Set(retained.map((backup) => backup.id));
    const expired = ordered.filter((backup) => !retainedIds.has(backup.id));
    if (expired.length) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(BACKUP_STORE, "readwrite");
        expired.forEach((backup) => transaction.objectStore(BACKUP_STORE).delete(backup.id));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
    return retained;
  } finally {
    database.close();
  }
}

async function keepDailyBackup(document: MapDocument): Promise<LocalBackup[]> {
  const database = await openBackupDatabase();
  const now = new Date();
  const id = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  try {
    const existing = await readBackupRequest(database.transaction(BACKUP_STORE, "readonly").objectStore(BACKUP_STORE).get(id));
    if (!existing) {
      const backup: LocalBackup = { id, createdAt: new Date().toISOString(), document };
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(BACKUP_STORE, "readwrite");
        transaction.objectStore(BACKUP_STORE).add(backup);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
    const items = await readBackupRequest(database.transaction(BACKUP_STORE, "readonly").objectStore(BACKUP_STORE).getAll()) as LocalBackup[];
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const ordered = items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const retained = ordered.filter((backup) => new Date(backup.createdAt).getTime() >= cutoff).slice(0, 3);
    const retainedIds = new Set(retained.map((backup) => backup.id));
    const expired = ordered.filter((backup) => !retainedIds.has(backup.id));
    if (expired.length) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(BACKUP_STORE, "readwrite");
        expired.forEach((backup) => transaction.objectStore(BACKUP_STORE).delete(backup.id));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
    return retained;
  } finally {
    database.close();
  }
}

const typeMeta: Record<NodeKind, { short: string; label: string; color: string; description: string }> = {
  process: { short: "SP", label: "Subproceso", color: "#0b9b45", description: "Una agrupación de actividades que forma parte del proceso general." },
  activity: { short: "RP", label: "Rama principal", color: "#174b7a", description: "El siguiente paso de la secuencia principal del proceso." },
  person: { short: "PE", label: "Persona o puesto", color: "#8b5cf6", description: "Responsable o participante; se conecta con una línea delgada." },
  system: { short: "SI", label: "Sistema o programa", color: "#0e86b7", description: "Herramienta utilizada; se conecta con una línea delgada." },
  manual: { short: "DO", label: "Documento", color: "#d97706", description: "Manual, formato, política, evidencia o archivo de consulta." },
  control: { short: "CO", label: "Control o decisión", color: "#dc3d36", description: "Validación, autorización o punto de decisión del proceso." },
  output: { short: "SA", label: "Salida", color: "#0d9488", description: "Resultado, entregable o cierre del proceso." },
};

const mainEdge = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#0b9b45" },
  style: { stroke: "#0b9b45", strokeWidth: 2.7 },
};

const subprocessEdge = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#174b7a" },
  style: { stroke: "#174b7a", strokeWidth: 2.1 },
};

const supportEdge = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#7690a7" },
  style: { stroke: "#7690a7", strokeWidth: 1.15 },
};

const staticTemplateAttachment: Attachment = {
  id: "orvel-process-template",
  name: "Machote universal de documentación de procesos.pdf",
  type: "application/pdf",
  size: 0,
  url: TEMPLATE_PDF,
  uploadedAt: "2026-07-22T00:00:00.000Z",
  static: true,
};

function nodeData(partial: Partial<MapNodeData>): MapNodeData {
  return {
    name: "Nombre del elemento",
    kind: "activity",
    code: "ORV-001",
    owner: "",
    department: "",
    role: "",
    email: "",
    phone: "",
    duration: "",
    objective: "",
    inputs: "",
    outputs: "",
    description: "",
    attachments: [],
    ...partial,
  };
}

const defaultDocument: MapDocument = {
  version: 3,
  processName: "Nuevo mapa de proceso",
  department: "Área / departamento",
  nodes: [
    {
      id: "root",
      type: "editable",
      position: { x: 420, y: 260 },
      data: nodeData({
        name: "Escribe aquí el nombre del proceso",
        kind: "activity",
        code: "PR-001",
        description: "Selecciona esta tarjeta y completa su ficha general. Después usa + Agregar para construir la rama principal, subprocesos, responsables, sistemas y documentos.",
        attachments: [staticTemplateAttachment],
      }),
    },
  ],
  edges: [],
};

const creationOrder: CreationChoice[] = ["activity", "process", "connection", "person", "system", "manual", "control", "output"];

const creationMeta: Record<CreationChoice, { short: string; label: string; description: string; color: string }> = {
  ...typeMeta,
  connection: { short: "CN", label: "Conexión", color: "#48647d", description: "Elige un nodo de origen y después uno de destino." },
};

const tutorialSteps = [
  {
    eyebrow: "1 DE 5 · EMPIEZA EN BLANCO",
    title: "Este mapa sirve para cualquier área",
    body: "Edita el nombre del mapa y la primera tarjeta. Puede documentar etiquetado, almacén, contabilidad, compras o cualquier otro proceso.",
  },
  {
    eyebrow: "2 DE 5 · AGREGA ESTRUCTURA",
    title: "Elige qué tipo de nodo necesitas",
    body: "Usa + Agregar y decide si el nuevo elemento se conecta con el seleccionado o nace como una rama independiente.",
  },
  {
    eyebrow: "3 DE 5 · CONEXIONES INTELIGENTES",
    title: "El programa distingue proceso y soporte",
    body: "Las ramas principales se muestran gruesas. Personas, sistemas y documentos se conectan automáticamente con líneas más delgadas.",
  },
  {
    eyebrow: "4 DE 5 · DOCUMENTA Y COMPARTE",
    title: "Todo se edita y se guarda automáticamente",
    body: "Completa la ficha, adjunta PDF o imágenes y descarga el machote universal. El botón de ayuda abre este tutorial cuando lo necesites.",
  },
  {
    eyebrow: "5 DE 5 · SONIDO Y RESPALDO LOCAL",
    title: "Personaliza la experiencia y conserva copias",
    body: "Configura sonidos y volumen desde la bocina. Cada dispositivo guarda automáticamente una copia diaria del mapa y conserva sólo las últimas tres.",
  },
];

function Icon({ name }: { name: "map" | "org" | "help" | "pdf" | "share" | "plus" | "close" | "arrow" | "sound" | "mute" | "backup" | "fit" | "panel" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "map") return <svg {...common}><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2Z" /><path d="M8 4v13M16 7v13" /></svg>;
  if (name === "org") return <svg {...common}><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-4h12v4" /></svg>;
  if (name === "help") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.9.5-1.3 1-1.3 2" /><path d="M12 17h.01" /></svg>;
  if (name === "pdf") return <svg {...common}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5M9.5 13h5M9.5 17h4" /></svg>;
  if (name === "share") return <svg {...common}><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "close") return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  if (name === "sound") return <svg {...common}><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="M15 9a4 4 0 0 1 0 6M17.7 6.3a8 8 0 0 1 0 11.4" /></svg>;
  if (name === "mute") return <svg {...common}><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="m16 10 5 5m0-5-5 5" /></svg>;
  if (name === "backup") return <svg {...common}><path d="M4 7h12l4 4v8H4z" /><path d="M7 7V4h9v3M8 14h8M8 17h5" /></svg>;
  if (name === "fit") return <svg {...common}><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><path d="m3 8 5-5m8 0 5 5M3 16l5 5m8 0 5-5" /></svg>;
  if (name === "panel") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>;
  return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
}

function EditableNode({ id, data, selected }: NodeProps<MapNode>) {
  const { updateNodeData } = useReactFlow<MapNode, Edge>();
  const updateNodeInternals = useUpdateNodeInternals();
  const meta = typeMeta[data.kind];
  const image = data.attachments.find((attachment) => attachment.type.startsWith("image/"));
  const nameRows = Math.max(1, data.name.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil((line.length || 1) / 25)), 0));

  useEffect(() => {
    updateNodeInternals(id);
  }, [data.name, id, updateNodeInternals]);

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
          <input className="nodrag node-code-input" value={data.code} onChange={(event) => update("code", event.target.value)} aria-label="Código del nodo" />
          <textarea className="nodrag node-name-input" rows={nameRows} value={data.name} onChange={(event) => update("name", event.target.value)} aria-label="Nombre del nodo" />
        </div>
      </div>
      {selected && <span className="selected-label">SELECCIONADO</span>}
      <div className="node-footer">
        <span className="node-type-label" style={{ color: meta.color, background: `${meta.color}12` }}>{meta.label}</span>
        {data.duration ? <span>{data.duration}</span> : <span>Ficha editable</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

const nodeTypes = { editable: EditableNode } satisfies NodeTypes;

function cloneDefaultDocument(): MapDocument {
  return JSON.parse(JSON.stringify(defaultDocument)) as MapDocument;
}

function readLocalDocument(): MapDocument | null {
  try {
    const value = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return value ? JSON.parse(value) as MapDocument : null;
  } catch {
    return null;
  }
}

function isLegacyDemo(document: MapDocument | null): boolean {
  return Boolean(document && document.version < 3 && document.processName === "Desarrollo y aprobación de etiquetas");
}

function normalizeDocument(document: MapDocument): MapDocument {
  return {
    version: 3,
    processName: document.processName || defaultDocument.processName,
    department: document.department || defaultDocument.department,
    nodes: document.nodes.map((node) => ({
      ...node,
      type: "editable",
      data: nodeData(node.data),
    })),
    edges: document.edges ?? [],
  };
}

function edgeStyleFor(source: MapNode | undefined, target: MapNode | undefined) {
  const thinKinds = new Set<NodeKind>(["person", "system", "manual"]);
  if ((source && thinKinds.has(source.data.kind)) || (target && thinKinds.has(target.data.kind))) return supportEdge;
  if (source?.data.kind === "process" || target?.data.kind === "process") return subprocessEdge;
  return mainEdge;
}

function MapExperience() {
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(defaultDocument.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultDocument.edges);
  const [selectedId, setSelectedId] = useState("root");
  const [query, setQuery] = useState("");
  const [hiddenKinds, setHiddenKinds] = useState<NodeKind[]>([]);
  const [processName, setProcessName] = useState(defaultDocument.processName);
  const [department, setDepartment] = useState(defaultDocument.department);
  const [saveState, setSaveState] = useState("Conectando…");
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [creationOpen, setCreationOpen] = useState(false);
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [saveRetry, setSaveRetry] = useState(0);
  const [connectNewNode, setConnectNewNode] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [soundPanelOpen, setSoundPanelOpen] = useState(false);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(defaultSoundSettings);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null);
  const serverDocumentRef = useRef("");
  const currentDocumentRef = useRef("");
  const dirtyRef = useRef(false);
  const { fitView } = useReactFlow<MapNode, Edge>();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSoundSettings(readSoundSettings());
      if (window.innerWidth < 1080) setInspectorOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(soundSettings));
  }, [soundSettings]);

  useEffect(() => {
    const handleTypingSound = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
      if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete") playInterfaceSound("type", soundSettings);
    };
    window.addEventListener("keydown", handleTypingSound);
    return () => window.removeEventListener("keydown", handleTypingSound);
  }, [soundSettings]);

  useEffect(() => {
    let cancelled = false;

    async function loadDocument() {
      try {
        const response = await fetch("/api/map", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo cargar el mapa");
        const payload = await response.json() as { document: MapDocument | null };
        const stored = payload.document ?? readLocalDocument();
        const document = isLegacyDemo(stored) ? cloneDefaultDocument() : stored;
        if (!cancelled && document?.nodes?.length) {
          const normalized = normalizeDocument(document);
          const signature = JSON.stringify(normalized);
          serverDocumentRef.current = payload.document ? signature : "";
          currentDocumentRef.current = signature;
          dirtyRef.current = !payload.document;
          setNodes(normalized.nodes);
          setEdges(normalized.edges);
          setProcessName(normalized.processName);
          setDepartment(normalized.department);
          setSelectedId(normalized.nodes[0].id);
          void keepDailyBackup(normalized).then(setBackups).catch(() => undefined);
        }
        if (!cancelled) setSaveState(payload.document && !isLegacyDemo(payload.document) ? "Datos sincronizados" : "Plantilla lista");
      } catch {
        const local = readLocalDocument();
        if (!cancelled && local?.nodes?.length) {
          const normalized = normalizeDocument(local);
          currentDocumentRef.current = JSON.stringify(normalized);
          dirtyRef.current = true;
          setNodes(normalized.nodes);
          setEdges(normalized.edges);
          setProcessName(normalized.processName);
          setDepartment(normalized.department);
          setSelectedId(normalized.nodes[0].id);
          void keepDailyBackup(normalized).then(setBackups).catch(() => undefined);
        }
        if (!cancelled) setSaveState("Guardado local");
      } finally {
        if (!cancelled) {
          setLoaded(true);
          if (!window.localStorage.getItem(TUTORIAL_STORAGE_KEY)) setTutorialOpen(true);
        }
      }
    }

    void loadDocument();
    return () => { cancelled = true; };
  }, [setEdges, setNodes]);

  useEffect(() => {
    if (!loaded) return;
    const document: MapDocument = {
      version: 3,
      processName,
      department,
      nodes: nodes.map((node) => ({ id: node.id, type: "editable", position: node.position, data: node.data })),
      edges,
    };
    const serialized = JSON.stringify(document);
    currentDocumentRef.current = serialized;
    if (serialized === serverDocumentRef.current) {
      dirtyRef.current = false;
      return;
    }

    dirtyRef.current = true;
    const timer = window.setTimeout(async () => {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(document));
      setSaveState("Guardando…");
      try {
        const response = await fetch("/api/map", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(document),
        });
        if (!response.ok) throw new Error("No se pudo guardar");
        serverDocumentRef.current = serialized;
        dirtyRef.current = currentDocumentRef.current !== serialized;
        setSaveState("Datos sincronizados");
        void keepDailyBackup(document).then(setBackups).catch(() => undefined);
      } catch {
        setSaveState("Guardado local");
        window.setTimeout(() => setSaveRetry((current) => current + 1), 4000);
      }
    }, 850);
    return () => window.clearTimeout(timer);
  }, [department, edges, loaded, nodes, processName, saveRetry]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;

    const pullSharedChanges = async () => {
      if (dirtyRef.current) return;
      try {
        const response = await fetch("/api/map", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { document: MapDocument | null };
        if (cancelled || !payload.document?.nodes?.length || dirtyRef.current) return;

        const normalized = normalizeDocument(payload.document);
        const signature = JSON.stringify(normalized);
        if (signature === serverDocumentRef.current) return;

        serverDocumentRef.current = signature;
        currentDocumentRef.current = signature;
        dirtyRef.current = false;
        setNodes(normalized.nodes);
        setEdges(normalized.edges);
        setProcessName(normalized.processName);
        setDepartment(normalized.department);
        setSelectedId((current) => normalized.nodes.some((node) => node.id === current) ? current : normalized.nodes[0].id);
        window.localStorage.setItem(LOCAL_STORAGE_KEY, signature);
        setSaveState("Datos sincronizados");
      } catch {
        // El respaldo local permanece disponible mientras regresa la conexión.
      }
    };

    const interval = window.setInterval(() => void pullSharedChanges(), 3000);
    const onFocus = () => void pullSharedChanges();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loaded, setEdges, setNodes]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fitView({ padding: 0.25, minZoom: 0.42, maxZoom: 1 }), 80);
    return () => window.clearTimeout(timer);
  }, [fitView, viewMode]);

  useEffect(() => {
    setEdges((current) => current.map((edge) => ({
      ...edge,
      ...edgeStyleFor(
        nodes.find((node) => node.id === edge.source),
        nodes.find((node) => node.id === edge.target),
      ),
    })));
  }, [nodes, setEdges]);

  const createStyledEdge = useCallback((sourceId: string, targetId: string, label = "se relaciona con") => {
    if (sourceId === targetId) return;
    const source = nodes.find((node) => node.id === sourceId);
    const target = nodes.find((node) => node.id === targetId);
    setEdges((current) => addEdge({
      id: `e-${sourceId}-${targetId}-${Date.now()}`,
      source: sourceId,
      target: targetId,
      label,
      ...edgeStyleFor(source, target),
    }, current));
    playInterfaceSound("connect", soundSettings);
  }, [nodes, setEdges, soundSettings]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    createStyledEdge(connection.source, connection.target);
  }, [createStyledEdge]);

  const visibleNodes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return nodes.map((node) => ({
      ...node,
      hidden:
        (viewMode === "org" && node.data.kind !== "person") ||
        hiddenKinds.includes(node.data.kind) ||
        (normalized.length > 0 && ![node.data.name, node.data.code, node.data.owner, node.data.kind]
          .some((value) => value.toLocaleLowerCase("es").includes(normalized))),
    }));
  }, [hiddenKinds, nodes, query, viewMode]);

  const visibleEdges = useMemo(() => viewMode === "map"
    ? edges
    : edges.filter((edge) => nodes.find((node) => node.id === edge.source)?.data.kind === "person" && nodes.find((node) => node.id === edge.target)?.data.kind === "person"),
  [edges, nodes, viewMode]);

  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];

  const updateSelected = useCallback((field: keyof MapNodeData, value: string | Attachment[]) => {
    if (!selected) return;
    setNodes((current) => current.map((node) => node.id === selected.id ? { ...node, data: { ...node.data, [field]: value } } : node));
  }, [selected, setNodes]);

  const addNode = useCallback((choice: Exclude<CreationChoice, "connection">, shouldConnect: boolean) => {
    const number = nodes.length + 1;
    const id = `node-${Date.now()}`;
    const anchor = shouldConnect && selected
      ? selected.position
      : { x: 130 + (number % 4) * 310, y: 170 + Math.floor(number / 4) * 190 };
    const horizontal = choice === "activity" || choice === "output" || choice === "control";
    const above = choice === "person";
    const below = choice === "system" || choice === "manual" || choice === "process";
    const position = horizontal
      ? { x: anchor.x + 320, y: anchor.y + ((number % 3) - 1) * 32 }
      : { x: anchor.x + ((number % 3) - 1) * 95, y: anchor.y + (above ? -210 : below ? 210 : 0) };
    const labels: Record<NodeKind, string> = {
      activity: "Nueva etapa principal",
      process: "Nuevo subproceso",
      person: "Persona o puesto",
      system: "Sistema o programa",
      manual: "Documento o formato",
      control: "Control o decisión",
      output: "Salida del proceso",
    };
    const prefixes: Record<NodeKind, string> = { activity: "AC", process: "SP", person: "PE", system: "SI", manual: "DO", control: "CO", output: "SA" };
    const newNode: MapNode = {
      id,
      type: "editable",
      position,
      data: nodeData({
        name: labels[choice],
        kind: choice,
        code: `${prefixes[choice]}-${String(number).padStart(3, "0")}`,
        description: `Completa la ficha de ${labels[choice].toLocaleLowerCase("es")}.`,
      }),
    };
    setNodes((current) => [...current, newNode]);
    if (selected && shouldConnect) {
      setEdges((current) => addEdge({
        id: `e-${selected.id}-${id}-${Date.now()}`,
        source: selected.id,
        target: id,
        label: choice === "activity" ? "continúa con" : choice === "process" ? "se desglosa en" : "utiliza / participa",
        ...edgeStyleFor(selected, newNode),
      }, current));
    }
    setSelectedId(id);
    setConnectionMode(false);
    setCreationOpen(false);
    setInspectorOpen(true);
    playInterfaceSound("create", soundSettings);
    window.setTimeout(() => void fitView({ padding: 0.25, maxZoom: 1 }), 80);
  }, [fitView, nodes.length, selected, setEdges, setNodes, soundSettings]);

  const chooseCreation = useCallback((choice: CreationChoice) => {
    if (choice === "connection") {
      setCreationOpen(false);
      setConnectionMode(true);
      setConnectionSource(null);
      setSaveState("Conexión: elige el origen");
      return;
    }
    addNode(choice, connectNewNode);
  }, [addNode, connectNewNode]);

  const handleNodeClick = useCallback((node: MapNode) => {
    setSelectedId(node.id);
    setInspectorOpen(true);
    playInterfaceSound("select", soundSettings);
    if (connectionMode) {
      if (!connectionSource) {
        setConnectionSource(node.id);
        setSaveState("Conexión: elige el destino");
      } else if (connectionSource !== node.id) {
        createStyledEdge(connectionSource, node.id);
        setConnectionMode(false);
        setConnectionSource(null);
        setSaveState("Conexión creada");
      }
    }
  }, [connectionMode, connectionSource, createStyledEdge, soundSettings]);

  const deleteSelected = useCallback(() => {
    if (!selected || nodes.length === 1) return;
    const next = nodes.find((node) => node.id !== selected.id);
    setNodes((current) => current.filter((node) => node.id !== selected.id));
    setEdges((current) => current.filter((edge) => edge.source !== selected.id && edge.target !== selected.id));
    if (next) setSelectedId(next.id);
  }, [nodes, selected, setEdges, setNodes]);

  const toggleKind = useCallback((kind: NodeKind) => {
    setHiddenKinds((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);
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

  const removeAttachment = useCallback((attachment: Attachment) => {
    if (!selected) return;
    updateSelected("attachments", selected.data.attachments.filter((item) => item.id !== attachment.id));
    if (!attachment.static) void fetch(`/api/uploads/${attachment.id}`, { method: "DELETE" });
  }, [selected, updateSelected]);

  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setSaveState("Enlace copiado");
    } catch {
      setSaveState("Copia la dirección del navegador");
    }
  }, []);

  const openBackups = useCallback(() => {
    setBackupOpen(true);
    void listLocalBackups().then(setBackups).catch(() => setBackups([]));
  }, []);

  const restoreBackup = useCallback((backup: LocalBackup) => {
    if (!window.confirm(`Se restaurará la copia local del ${new Date(backup.createdAt).toLocaleString("es-MX")}. ¿Continuar?`)) return;
    const normalized = normalizeDocument(backup.document);
    const signature = JSON.stringify(normalized);
    serverDocumentRef.current = "";
    currentDocumentRef.current = signature;
    dirtyRef.current = true;
    setNodes(normalized.nodes);
    setEdges(normalized.edges);
    setProcessName(normalized.processName);
    setDepartment(normalized.department);
    setSelectedId(normalized.nodes[0].id);
    setInspectorOpen(true);
    setBackupOpen(false);
    setSaveState("Restaurando copia local…");
    playInterfaceSound("restore", soundSettings);
    window.setTimeout(() => void fitView({ padding: .28, maxZoom: 1 }), 100);
  }, [fitView, setEdges, setNodes, soundSettings]);

  const downloadBackup = useCallback((backup: LocalBackup) => {
    const blob = new Blob([JSON.stringify(backup.document, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `mapa-procesos-orvel-${backup.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const fitMap = useCallback(() => {
    void fitView({ padding: .28, minZoom: .32, maxZoom: 1 });
  }, [fitView]);

  const openTutorial = useCallback(() => {
    setTutorialStep(0);
    setTutorialOpen(true);
  }, []);

  const closeTutorial = useCallback(() => {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "seen");
    setTutorialOpen(false);
  }, []);

  const resetBlank = useCallback(() => {
    if (!window.confirm("Esto reemplazará el mapa actual por un machote vacío. ¿Continuar?")) return;
    const blank = cloneDefaultDocument();
    setNodes(blank.nodes);
    setEdges(blank.edges);
    setProcessName(blank.processName);
    setDepartment(blank.department);
    setSelectedId("root");
    setConnectionMode(false);
    setConnectionSource(null);
    setCreationOpen(false);
    setSaveState("Machote vacío cargado");
    playInterfaceSound("restore", soundSettings);
    window.setTimeout(() => void fitView({ padding: 0.3, maxZoom: 1 }), 80);
  }, [fitView, setEdges, setNodes, soundSettings]);

  return (
    <main className="map-app">
      <aside className="rail" aria-label="Vistas principales">
        <div className="logo">DO</div>
        <nav>
          <button className={viewMode === "map" ? "active" : ""} title="Mapa de procesos" aria-label="Mapa de procesos" onClick={() => setViewMode("map")}><Icon name="map" /></button>
          <button className={viewMode === "org" ? "active" : ""} title="Organigrama" aria-label="Organigrama" onClick={() => setViewMode("org")}><Icon name="org" /></button>
        </nav>
        <button className="rail-avatar" title="Sesión activa">CG</button>
      </aside>

      <section className="map-workspace">
        <header className="map-header">
          <div className="brand-block">
            <div className="breadcrumb">DISTRIBUCIONES ORVEL / {viewMode === "map" ? "MAPA GENERAL" : "ORGANIGRAMA"}</div>
            <h1>Mapa de Proceso Distribuciones Orvel</h1>
          </div>
          <label className="map-search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nodo, persona o código…" aria-label="Buscar en el mapa" />
          </label>
          <span className={`sync-pill ${saveState === "Datos sincronizados" ? "is-synced" : ""}`}><i />{saveState}</span>
          <div className="header-buttons">
            <a className="icon-action secondary-tool" href={TEMPLATE_PDF} download title="Descargar machote PDF" aria-label="Descargar machote PDF"><Icon name="pdf" /></a>
            <button className="icon-action secondary-tool" onClick={openTutorial} title="Abrir tutorial" aria-label="Abrir tutorial"><Icon name="help" /></button>
            <button className="icon-action secondary-tool" onClick={share} title="Copiar enlace" aria-label="Copiar enlace"><Icon name="share" /></button>
            <button className={`icon-action essential-tool ${soundSettings.enabled ? "is-active" : ""}`} onClick={() => setSoundPanelOpen((current) => !current)} title="Configurar sonidos" aria-label="Configurar sonidos"><Icon name={soundSettings.enabled ? "sound" : "mute"} /></button>
            <button className="icon-action essential-tool" onClick={openBackups} title="Copias locales" aria-label="Abrir copias locales"><Icon name="backup" /></button>
            <button className="navy-button add-button" onClick={() => setCreationOpen(true)}><Icon name="plus" />Nuevo elemento</button>
            {soundPanelOpen && (
              <div className="sound-popover">
                <div><strong>Sonidos estéticos</strong><small>Se guardan en este dispositivo</small></div>
                <label className="switch-row"><span>Sonidos de interfaz</span><input type="checkbox" checked={soundSettings.enabled} onChange={(event) => setSoundSettings((current) => ({ ...current, enabled: event.target.checked }))} /></label>
                <label className="switch-row"><span>Tecleo mecánico</span><input type="checkbox" checked={soundSettings.typing} disabled={!soundSettings.enabled} onChange={(event) => setSoundSettings((current) => ({ ...current, typing: event.target.checked }))} /></label>
                <label className="volume-row"><span>Volumen</span><input type="range" min="0.08" max="0.5" step="0.02" value={soundSettings.volume} disabled={!soundSettings.enabled} onChange={(event) => setSoundSettings((current) => ({ ...current, volume: Number(event.target.value) }))} /></label>
              </div>
            )}
          </div>
        </header>

        <div className={`map-body ${inspectorOpen ? "" : "inspector-hidden"}`}>
          <section className="graph-panel" aria-label={viewMode === "map" ? "Mapa general del proceso" : "Organigrama"}>
            <div className="graph-heading">
              <div><span className="map-symbol"><Icon name={viewMode === "map" ? "map" : "org"} /></span>{viewMode === "map" ? "MAPA GENERAL" : "ORGANIGRAMA"}</div>
              <input value={processName} onChange={(event) => setProcessName(event.target.value)} aria-label="Nombre del proceso" />
              <input value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Área del proceso" />
              <span>{viewMode === "map" ? `${nodes.length} nodos · ${edges.length} conexiones` : `${nodes.filter((node) => node.data.kind === "person").length} personas / puestos`}</span>
            </div>
            {viewMode === "map" && (
              <div className="type-filters" aria-label="Filtros por tipo de nodo">
                {(Object.entries(typeMeta) as [NodeKind, (typeof typeMeta)[NodeKind]][]).map(([kind, meta]) => (
                  <button key={kind} className={hiddenKinds.includes(kind) ? "muted" : ""} onClick={() => toggleKind(kind)}><i style={{ background: meta.color }} />{meta.label}</button>
                ))}
              </div>
            )}
            <ReactFlow<MapNode, Edge>
              nodes={visibleNodes}
              edges={visibleEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => handleNodeClick(node)}
              fitView
              fitViewOptions={{ padding: 0.24, minZoom: 0.52, maxZoom: 1 }}
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
            {viewMode === "org" && !nodes.some((node) => node.data.kind === "person") && (
              <div className="empty-org"><Icon name="org" /><strong>El organigrama todavía está vacío</strong><span>Agrega nodos de persona o puesto y conéctalos para construirlo.</span><button onClick={() => setCreationOpen(true)}>Agregar persona</button></div>
            )}
            {connectionMode && (
              <div className="connection-banner"><span>{connectionSource ? "2" : "1"}</span>{connectionSource ? "Conexión: elige el destino" : "Conexión: elige el origen"}<button onClick={() => { setConnectionMode(false); setConnectionSource(null); setSaveState("Conexión cancelada"); }}>Cancelar</button></div>
            )}
            <div className="map-actions" aria-label="Acciones del mapa">
              <button onClick={fitMap} title="Ajustar mapa completo"><Icon name="fit" /><span>Ajustar</span></button>
              {!inspectorOpen && selected && <button onClick={() => setInspectorOpen(true)} title="Abrir ficha"><Icon name="panel" /><span>Abrir ficha</span></button>}
              <button className="map-primary-add" onClick={() => setCreationOpen(true)}><Icon name="plus" /><span>Agregar elemento</span></button>
            </div>
            <div className="map-hint"><span>Edita dentro de cada tarjeta</span><span>Arrastra para ordenar</span><span>Personas y sistemas usan líneas delgadas</span></div>
          </section>

          {selected && inspectorOpen && (
            <aside className="node-inspector">
              <div className="inspector-titlebar">
                <div><small>FICHA GENERAL EDITABLE</small><h2>{selected.data.name}</h2></div>
                <div className="inspector-title-actions"><span className="kind-badge" style={{ color: typeMeta[selected.data.kind].color, background: `${typeMeta[selected.data.kind].color}14` }}>{typeMeta[selected.data.kind].label}</span><button onClick={() => setInspectorOpen(false)} title="Cerrar ficha" aria-label="Cerrar ficha"><Icon name="close" /></button></div>
              </div>
              <div className="inspector-form">
                <label className="field field-wide"><span>Nombre</span><input value={selected.data.name} onChange={(event) => updateSelected("name", event.target.value)} /></label>
                <label className="field"><span>Código</span><input value={selected.data.code} onChange={(event) => updateSelected("code", event.target.value)} /></label>
                <label className="field"><span>Tipo de nodo</span><select value={selected.data.kind} onChange={(event) => updateSelected("kind", event.target.value as NodeKind)}>{(Object.entries(typeMeta) as [NodeKind, (typeof typeMeta)[NodeKind]][]).map(([kind, meta]) => <option key={kind} value={kind}>{meta.label}</option>)}</select></label>
                <label className="field"><span>Responsable</span><input value={selected.data.owner} onChange={(event) => updateSelected("owner", event.target.value)} placeholder="Nombre o puesto" /></label>
                <label className="field"><span>Puesto / función</span><input value={selected.data.role} onChange={(event) => updateSelected("role", event.target.value)} /></label>
                <label className="field field-wide"><span>Área</span><input value={selected.data.department} onChange={(event) => updateSelected("department", event.target.value)} /></label>
                <label className="field"><span>Correo</span><input type="email" value={selected.data.email} onChange={(event) => updateSelected("email", event.target.value)} /></label>
                <label className="field"><span>Teléfono</span><input value={selected.data.phone} onChange={(event) => updateSelected("phone", event.target.value)} /></label>
                <label className="field field-wide"><span>Duración / frecuencia, si aplica</span><input value={selected.data.duration} onChange={(event) => updateSelected("duration", event.target.value)} placeholder="Ej. 45 min, mensual o bajo demanda" /></label>
                <label className="field field-wide"><span>Objetivo</span><textarea value={selected.data.objective} onChange={(event) => updateSelected("objective", event.target.value)} rows={3} placeholder="¿Qué resultado debe lograr este elemento?" /></label>
                <label className="field"><span>Entradas</span><textarea value={selected.data.inputs} onChange={(event) => updateSelected("inputs", event.target.value)} rows={3} /></label>
                <label className="field"><span>Salidas</span><textarea value={selected.data.outputs} onChange={(event) => updateSelected("outputs", event.target.value)} rows={3} /></label>
                <label className="field field-wide"><span>Descripción e instrucciones</span><textarea value={selected.data.description} onChange={(event) => updateSelected("description", event.target.value)} rows={5} placeholder="Explica qué se hace, criterios, excepciones y observaciones…" /></label>
              </div>

              <section className="attachments-section">
                <div className="section-heading">
                  <div><small>ARCHIVOS</small><strong>PDF e imágenes de apoyo</strong></div>
                  <button onClick={() => uploadRef.current?.click()} disabled={uploading}>{uploading ? "Subiendo…" : "+ Agregar"}</button>
                </div>
                <input ref={uploadRef} hidden type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" onChange={uploadFiles} />
                {selected.data.attachments.length ? (
                  <div className="attachment-list">
                    {selected.data.attachments.map((attachment) => (
                      <div className="attachment" key={attachment.id}>
                        {attachment.type.startsWith("image/") ? <Image src={attachment.url} alt="" width={38} height={38} unoptimized /> : <span className="pdf-icon">PDF</span>}
                        <a href={attachment.url} target="_blank" rel="noreferrer"><strong>{attachment.name}</strong><small>{attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : "Machote precargado"}</small></a>
                        <button aria-label={`Quitar ${attachment.name}`} onClick={() => removeAttachment(attachment)}>×</button>
                      </div>
                    ))}
                  </div>
                ) : <p className="empty-files">Agrega procedimientos, formatos, evidencias o imágenes. Las fotos de personas también aparecen en su tarjeta.</p>}
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

      {creationOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreationOpen(false); }}>
          <section className="creation-modal" role="dialog" aria-modal="true" aria-labelledby="creation-title">
            <button className="modal-close" onClick={() => setCreationOpen(false)} aria-label="Cerrar"><Icon name="close" /></button>
            <small>CONSTRUIR EL MAPA</small>
            <h2 id="creation-title">¿Qué quieres agregar?</h2>
            <p>{connectNewNode ? <>Se conectará con <strong>{selected?.data.name ?? "el nodo seleccionado"}</strong>.</> : <>Se creará como una rama independiente, sin conexión inicial.</>} Puedes moverlo, editarlo y conectarlo después.</p>
            <div className="connection-choice" role="group" aria-label="Conexión del nuevo elemento">
              <button className={connectNewNode ? "active" : ""} onClick={() => setConnectNewNode(true)}>Conectar con el seleccionado</button>
              <button className={!connectNewNode ? "active" : ""} onClick={() => setConnectNewNode(false)}>Crear independiente</button>
            </div>
            <div className="creation-grid">
              {creationOrder.map((choice) => {
                const meta = creationMeta[choice];
                return <button key={choice} onClick={() => chooseCreation(choice)}><span style={{ color: meta.color, background: `${meta.color}14` }}>{meta.short}</span><div><strong>{meta.label}</strong><small>{meta.description}</small></div><Icon name="arrow" /></button>;
              })}
            </div>
            <button className="blank-reset" onClick={resetBlank}>Empezar un mapa nuevo en blanco</button>
          </section>
        </div>
      )}

      {backupOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBackupOpen(false); }}>
          <section className="backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-title">
            <button className="modal-close" onClick={() => setBackupOpen(false)} aria-label="Cerrar copias"><Icon name="close" /></button>
            <small>COPIAS EN ESTE DISPOSITIVO</small>
            <h2 id="backup-title">Respaldo diario local</h2>
            <p>Se conserva una copia por día durante un máximo de tres días. No consume almacenamiento adicional en Railway.</p>
            <div className="backup-list">
              {backups.length ? backups.map((backup) => (
                <article key={backup.id}>
                  <span><Icon name="backup" /></span>
                  <div><strong>{new Date(backup.createdAt).toLocaleDateString("es-MX", { dateStyle: "long" })}</strong><small>{backup.document.nodes.length} nodos · {backup.document.edges.length} conexiones</small></div>
                  <button onClick={() => downloadBackup(backup)}>Descargar</button>
                  <button className="restore-button" onClick={() => restoreBackup(backup)}>Restaurar</button>
                </article>
              )) : <div className="backup-empty">La primera copia aparecerá automáticamente al abrir o guardar el mapa hoy.</div>}
            </div>
          </section>
        </div>
      )}

      {tutorialOpen && (
        <div className="modal-backdrop tutorial-backdrop">
          <section className="tutorial-modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
            <button className="modal-close" onClick={closeTutorial} aria-label="Cerrar tutorial"><Icon name="close" /></button>
            <div className="tutorial-visual"><span><Icon name={tutorialStep === 0 ? "map" : tutorialStep === tutorialSteps.length - 1 ? "backup" : tutorialStep === 3 ? "pdf" : "org"} /></span><div className="tutorial-lines"><i /><i /><i /></div></div>
            <div className="tutorial-copy">
              <small>{tutorialSteps[tutorialStep].eyebrow}</small>
              <h2 id="tutorial-title">{tutorialSteps[tutorialStep].title}</h2>
              <p>{tutorialSteps[tutorialStep].body}</p>
              <div className="tutorial-dots">{tutorialSteps.map((_, index) => <i key={index} className={index === tutorialStep ? "active" : ""} />)}</div>
              <div className="tutorial-actions">
                <button className="ghost-button" onClick={closeTutorial}>Saltar todo</button>
                <button className="navy-button" onClick={() => tutorialStep === tutorialSteps.length - 1 ? closeTutorial() : setTutorialStep((current) => current + 1)}>{tutorialStep === tutorialSteps.length - 1 ? "Empezar" : "Siguiente"}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function ProcessMap() {
  return <ReactFlowProvider><MapExperience /></ReactFlowProvider>;
}
