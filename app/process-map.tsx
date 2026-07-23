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
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
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
  | "control";

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
  reportsTo: string;
  organizationLevel: string;
  duration: string;
  objective: string;
  inputs: string;
  outputs: string;
  systemUrl: string;
  documentType: string;
  revision: string;
  effectiveDate: string;
  controlMethod: string;
  evidence: string;
  description: string;
  attachments: Attachment[];
  viewMode?: ViewMode;
  viewDepartmentColor?: string;
};

type MapNode = Node<MapNodeData>;

type MapEdgeData = {
  [key: string]: unknown;
  relation?: "manual" | "auto" | "department" | "hierarchy" | "blocked";
  blockedRelation?: "auto" | "department";
  parallelIndex?: number;
};

type MapEdge = Edge<MapEdgeData> & {
  pathOptions?: { curvature: number };
};

type MapDocument = {
  version: number;
  processName: string;
  department: string;
  nodes: MapNode[];
  edges: MapEdge[];
};

const TEMPLATE_PDF = "/plantillas/machote-documentacion-procesos-orvel.pdf";
const LOCAL_STORAGE_KEY = "orvel-process-map-v3";
const TUTORIAL_STORAGE_KEY = "orvel-process-tutorial-v2";
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
  if (kind === "type") {
    const duration = .032;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      const envelope = Math.exp(-index / (context.sampleRate * .008));
      samples[index] = (Math.random() * 2 - 1) * envelope;
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const keyThump = context.createOscillator();
    const thumpGain = context.createGain();
    noise.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 2350 + Math.random() * 450;
    filter.Q.value = 1.15;
    noiseGain.gain.setValueAtTime(Math.max(.0015, settings.volume * .075), now);
    noiseGain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    keyThump.type = "triangle";
    keyThump.frequency.setValueAtTime(165 + Math.random() * 35, now);
    thumpGain.gain.setValueAtTime(Math.max(.001, settings.volume * .028), now);
    thumpGain.gain.exponentialRampToValueAtTime(.0001, now + .026);
    noise.connect(filter).connect(noiseGain).connect(context.destination);
    keyThump.connect(thumpGain).connect(context.destination);
    noise.start(now);
    noise.stop(now + duration);
    keyThump.start(now);
    keyThump.stop(now + .03);
    return;
  }

  const sequences: Record<Exclude<typeof kind, "type">, Array<[number, number, number, OscillatorType]>> = {
    create: [[523, 0, .075, "sine"], [659, .065, .09, "sine"], [784, .14, .11, "sine"]],
    connect: [[392, 0, .065, "triangle"], [523, .055, .075, "triangle"], [659, .115, .09, "triangle"]],
    select: [[620, 0, .045, "sine"]],
    restore: [[659, 0, .08, "sine"], [523, .08, .09, "sine"], [784, .17, .13, "sine"]],
  };

  sequences[kind].forEach(([frequency, delay, duration, oscillatorType]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + delay;
    oscillator.type = oscillatorType;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.002, settings.volume * .16), start + .008);
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
};

const mainEdge = {
  type: "default",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#0b9b45" },
  style: { stroke: "#0b9b45", strokeWidth: 2.7 },
};

const subprocessEdge = {
  type: "default",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#174b7a" },
  style: { stroke: "#174b7a", strokeWidth: 2.1 },
};

const supportEdge = {
  type: "default",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#7690a7" },
  style: { stroke: "#7690a7", strokeWidth: 1.15 },
};

const hierarchyEdge = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#8b5cf6" },
  style: { stroke: "#8b5cf6", strokeWidth: 1.8 },
};

const departmentEdge = {
  type: "default",
  style: { stroke: "#0d9488", strokeWidth: 1.05, strokeDasharray: "5 6", opacity: .7 },
};

const hierarchyLevels = ["Dirección", "Gerencia", "Jefatura", "Coordinación", "Especialista", "Administrativo", "Operación"] as const;

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
    reportsTo: "",
    organizationLevel: "",
    duration: "",
    objective: "",
    inputs: "",
    outputs: "",
    systemUrl: "",
    documentType: "",
    revision: "",
    effectiveDate: "",
    controlMethod: "",
    evidence: "",
    description: "",
    attachments: [],
    ...partial,
  };
}

const defaultDocument: MapDocument = {
  version: 5,
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

const creationOrder: CreationChoice[] = ["activity", "process", "connection", "person", "system", "manual", "control"];

const creationMeta: Record<CreationChoice, { short: string; label: string; description: string; color: string }> = {
  ...typeMeta,
  connection: { short: "CN", label: "Conexión", color: "#48647d", description: "Elige un nodo de origen y después uno de destino." },
};

const tutorialSteps = [
  {
    target: '[data-tour="map"]',
    eyebrow: "1 DE 8 · MAPA GENERAL",
    title: "Haz clic en el mapa",
    body: "Aquí documentas procesos, personas, sistemas, documentos y controles. Pulsa el icono iluminado para continuar.",
  },
  {
    target: '[data-tour="add"]',
    eyebrow: "2 DE 8 · NUEVO ELEMENTO",
    title: "Abre el asistente",
    body: "Haz clic en Agregar elemento. Ahí eliges el tipo de ficha y si nace conectada o independiente.",
  },
  {
    target: '[data-tour="independent"]',
    eyebrow: "3 DE 8 · RAMAS INDEPENDIENTES",
    title: "Prueba la opción independiente",
    body: "Haz clic aquí para ver cómo una ficha puede crearse sin conexión inicial. No se creará ningún nodo durante el tutorial.",
  },
  {
    target: '[data-tour="close-creation"]',
    eyebrow: "4 DE 8 · REGRESA AL MAPA",
    title: "Cierra el asistente",
    body: "Pulsa la X para volver al lienzo y conocer las herramientas de conexión.",
  },
  {
    target: '[data-tour="connect"]',
    eyebrow: "5 DE 8 · CONEXIÓN FÁCIL",
    title: "Activa Conectar nodos",
    body: "Después sólo necesitas hacer clic en una tarjeta de origen y otra de destino, sin apuntar con precisión a los conectores.",
  },
  {
    target: '[data-tour="layout"]',
    eyebrow: "6 DE 8 · ACOMODO SUGERIDO",
    title: "Abre las sugerencias de acomodo",
    body: "El sistema puede ordenar el mapa como camino principal, por departamento o en una cuadrícula compacta.",
  },
  {
    target: '[data-tour="close-layout"]',
    eyebrow: "7 DE 8 · ELIGE CUANDO LO NECESITES",
    title: "Estas opciones no mueven nada solas",
    body: "El acomodo sólo se aplica cuando eliges una propuesta. Por ahora cierra esta ventana para continuar.",
  },
  {
    target: '[data-tour="org"]',
    eyebrow: "8 DE 8 · ORGANIGRAMA",
    title: "Ve a la jerarquía",
    body: "Aquí verás a las personas por nivel, departamento y todos sus jefes. Haz clic para terminar el recorrido.",
  },
];

function Icon({ name }: { name: "map" | "org" | "help" | "pdf" | "share" | "plus" | "close" | "arrow" | "sound" | "mute" | "backup" | "fit" | "panel" | "cut" | "group" | "link" | "layout" | "report" | "undo" }) {
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
  if (name === "cut") return <svg {...common}><circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="m8.7 8.4 10.3 5.2M8.7 15.6 19 10.4" /></svg>;
  if (name === "group") return <svg {...common}><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20v-2a5 5 0 0 1 10 0v2M13 16a4 4 0 0 1 8 1.5V20" /></svg>;
  if (name === "link") return <svg {...common}><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" /></svg>;
  if (name === "layout") return <svg {...common}><rect x="3" y="4" width="7" height="6" rx="1" /><rect x="14" y="4" width="7" height="6" rx="1" /><rect x="3" y="14" width="7" height="6" rx="1" /><rect x="14" y="14" width="7" height="6" rx="1" /></svg>;
  if (name === "report") return <svg {...common}><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v5h5M9 12h7M9 16h7" /></svg>;
  if (name === "undo") return <svg {...common}><path d="m9 7-5 5 5 5" /><path d="M4 12h9a6 6 0 0 1 6 6" /></svg>;
  return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
}

function EditableNode({ id, data, selected }: NodeProps<MapNode>) {
  const { updateNodeData } = useReactFlow<MapNode, MapEdge>();
  const updateNodeInternals = useUpdateNodeInternals();
  const meta = typeMeta[data.kind];
  const accentColor = data.viewDepartmentColor || meta.color;
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
      <Handle className="connection-handle connection-handle-target" type="target" position={Position.Left} title="Conectar hacia esta tarjeta" />
      <div className="node-accent" style={{ background: accentColor }} />
      <div className="node-main">
        {image ? (
          <Image className="node-avatar" src={image.url} alt="" width={37} height={37} unoptimized />
        ) : (
          <span className="node-kind" style={{ background: `${accentColor}18`, color: accentColor }}>{meta.short}</span>
        )}
        <div className="node-editable-copy">
          <input className="nodrag node-code-input" value={data.code} onChange={(event) => update("code", event.target.value)} aria-label="Código del nodo" />
          <textarea className="nodrag node-name-input" rows={nameRows} value={data.name} onChange={(event) => update("name", event.target.value)} aria-label="Nombre del nodo" />
        </div>
      </div>
      {selected && <span className="selected-label">SELECCIONADO</span>}
      <div className="node-footer">
        <span className="node-type-label" style={{ color: accentColor, background: `${accentColor}12` }}>{data.viewMode === "org" ? data.department || "Sin departamento" : meta.label}</span>
        {data.viewMode === "org" ? <span>{data.organizationLevel || data.role || "Puesto por definir"}</span> : data.duration ? <span>{data.duration}</span> : <span>Ficha editable</span>}
      </div>
      <Handle className="connection-handle connection-handle-source" type="source" position={Position.Right} title="Conectar desde esta tarjeta" />
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
    version: 5,
    processName: document.processName || defaultDocument.processName,
    department: document.department || defaultDocument.department,
    nodes: document.nodes.map((node) => {
      const legacyKind = String(node.data.kind);
      const kind = legacyKind === "output" ? "activity" : legacyKind in typeMeta ? legacyKind as NodeKind : "activity";
      return {
        ...node,
        type: "editable",
        selected: false,
        data: nodeData({ ...node.data, kind, viewMode: undefined, viewDepartmentColor: undefined }),
      };
    }),
    edges: (document.edges ?? []).map((edge) => ({
      ...edge,
      selected: false,
      data: {
        relation: edge.data?.relation === "auto" || edge.data?.relation === "department" || edge.data?.relation === "blocked" ? edge.data.relation : "manual",
        ...edge.data,
      },
    })),
  };
}

function edgeStyleFor(source: MapNode | undefined, target: MapNode | undefined) {
  const thinKinds = new Set<NodeKind>(["person", "system", "manual"]);
  if ((source && thinKinds.has(source.data.kind)) || (target && thinKinds.has(target.data.kind))) return supportEdge;
  if (source?.data.kind === "process" || target?.data.kind === "process") return subprocessEdge;
  return mainEdge;
}

function normalizedValue(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("es");
}

function managerIds(value: string) {
  return [...new Set(value.split(/[;,]+/).map((item) => item.trim()).filter(Boolean))];
}

function escapedHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function departmentColor(value: string) {
  const palette = ["#8b5cf6", "#0e86b7", "#0b9b45", "#d97706", "#dc3d36", "#0d9488", "#174b7a"];
  const hash = [...normalizedValue(value || "sin departamento")].reduce((total, letter) => total + letter.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function parallelPathOptions(edges: MapEdge[], source: string, target: string) {
  const parallelIndex = edges.filter((edge) => edge.source === source && edge.target === target).length;
  return { parallelIndex, pathOptions: { curvature: .18 + parallelIndex * .12 } };
}

function MapExperience() {
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(defaultDocument.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<MapEdge>(defaultDocument.edges);
  const [selectedId, setSelectedId] = useState("root");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [groupSelectionMode, setGroupSelectionMode] = useState(false);
  const [groupSelectionCount, setGroupSelectionCount] = useState(0);
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
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layoutUndo, setLayoutUndo] = useState<Record<string, { x: number; y: number }> | null>(null);
  const [tourRect, setTourRect] = useState<{ top: number; left: number; right: number; bottom: number; width: number; height: number; tooltipTop: number; tooltipLeft: number } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const serverDocumentRef = useRef("");
  const currentDocumentRef = useRef("");
  const dirtyRef = useRef(false);
  const { fitView } = useReactFlow<MapNode, MapEdge>();

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
      version: 5,
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
      ...(edge.data?.relation === "department"
        ? departmentEdge
        : edgeStyleFor(
          nodes.find((node) => node.id === edge.source),
          nodes.find((node) => node.id === edge.target),
        )),
    })));
  }, [nodes, setEdges]);

  useEffect(() => {
    const people = nodes.filter((node) => node.data.kind === "person");
    const desired = new Map<string, { source: MapNode; target: MapNode; relation: "auto" | "department"; label: string }>();
    nodes.filter((node) => node.data.kind !== "person").forEach((target) => {
      const participants = target.data.owner
        .split(/[,;/\n]+/)
        .map(normalizedValue)
        .filter(Boolean);
      people.forEach((person) => {
        const identities = [person.data.name, person.data.role, person.data.email].map(normalizedValue).filter(Boolean);
        if (participants.some((participant) => identities.includes(participant))) {
          desired.set(`auto:${person.id}->${target.id}`, { source: person, target, relation: "auto", label: "participa" });
        }
      });
    });
    const departmentGroups = new Map<string, MapNode[]>();
    nodes.forEach((node) => {
      const key = normalizedValue(node.data.department);
      if (!key) return;
      departmentGroups.set(key, [...(departmentGroups.get(key) ?? []), node]);
    });
    departmentGroups.forEach((group) => {
      const ordered = [...group].sort((left, right) => left.id.localeCompare(right.id));
      for (let sourceIndex = 0; sourceIndex < ordered.length; sourceIndex += 1) {
        for (let targetIndex = sourceIndex + 1; targetIndex < ordered.length; targetIndex += 1) {
          const source = ordered[sourceIndex];
          const target = ordered[targetIndex];
          desired.set(`department:${source.id}->${target.id}`, {
            source,
            target,
            relation: "department",
            label: source.data.department.trim(),
          });
        }
      }
    });

    setEdges((current) => {
      const next = current.filter((edge) => {
        if (edge.data?.relation === "auto" || edge.data?.relation === "department") {
          return desired.has(`${edge.data.relation}:${edge.source}->${edge.target}`);
        }
        if (edge.data?.relation === "blocked" && edge.data.blockedRelation) {
          return desired.has(`${edge.data.blockedRelation}:${edge.source}->${edge.target}`);
        }
        return true;
      });
      const existing = new Set(next.flatMap((edge) => {
        if (edge.data?.relation === "auto" || edge.data?.relation === "department") return [`${edge.data.relation}:${edge.source}->${edge.target}`];
        if (edge.data?.relation === "blocked" && edge.data.blockedRelation) return [`${edge.data.blockedRelation}:${edge.source}->${edge.target}`];
        return [];
      }));
      desired.forEach(({ source, target, relation, label }, key) => {
        if (existing.has(key)) return;
        const parallel = parallelPathOptions(next, source.id, target.id);
        next.push({
          id: `${relation}-${source.id}-${target.id}`,
          source: source.id,
          target: target.id,
          label,
          data: { relation, parallelIndex: parallel.parallelIndex },
          pathOptions: parallel.pathOptions,
          ...(relation === "department" ? departmentEdge : edgeStyleFor(source, target)),
        });
      });
      const unchanged = next.length === current.length && next.every((edge, index) => edge === current[index]);
      return unchanged ? current : next;
    });
  }, [nodes, setEdges]);

  const createStyledEdge = useCallback((sourceId: string, targetId: string, label = "se relaciona con") => {
    if (sourceId === targetId) return;
    const source = nodes.find((node) => node.id === sourceId);
    const target = nodes.find((node) => node.id === targetId);
    setEdges((current) => {
      const parallel = parallelPathOptions(current, sourceId, targetId);
      return [...current, {
        id: `e-${sourceId}-${targetId}-${Date.now()}`,
        source: sourceId,
        target: targetId,
        label,
        data: { relation: "manual", parallelIndex: parallel.parallelIndex },
        pathOptions: parallel.pathOptions,
        ...edgeStyleFor(source, target),
      }];
    });
    playInterfaceSound("connect", soundSettings);
  }, [nodes, setEdges, soundSettings]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    createStyledEdge(connection.source, connection.target);
  }, [createStyledEdge]);

  const organizationPeople = useMemo(() => {
    const people = nodes.filter((node) => node.data.kind === "person");
    const departments = [...new Set(people.map((node) => node.data.department.trim() || "Sin departamento"))].sort((left, right) => left.localeCompare(right, "es"));
    const peopleById = new Map(people.map((node) => [node.id, node]));
    const depthOf = (person: MapNode, visited = new Set<string>()): number => {
      const managers = managerIds(person.data.reportsTo).map((id) => peopleById.get(id)).filter((manager): manager is MapNode => Boolean(manager));
      if (!managers.length || visited.has(person.id)) return 0;
      visited.add(person.id);
      return 1 + Math.max(...managers.map((manager) => depthOf(manager, new Set(visited))));
    };
    const ordered: MapNode[] = [];
    let departmentOffset = 120;
    departments.forEach((departmentName) => {
      const departmentPeople = people
        .filter((person) => (person.data.department.trim() || "Sin departamento") === departmentName)
        .map((person) => {
          const explicitLevel = hierarchyLevels.findIndex((level) => normalizedValue(level) === normalizedValue(person.data.organizationLevel));
          return { person, level: explicitLevel >= 0 ? explicitLevel : Math.min(hierarchyLevels.length - 1, depthOf(person)) };
        })
        .sort((left, right) => left.level - right.level || left.person.data.name.localeCompare(right.person.data.name, "es"));
      const counts = new Map<number, number>();
      departmentPeople.forEach(({ level }) => counts.set(level, (counts.get(level) ?? 0) + 1));
      const laneWidth = Math.max(320, Math.max(1, ...counts.values()) * 300);
      const slots = new Map<number, number>();
      departmentPeople.forEach(({ person, level }) => {
          const slot = slots.get(level) ?? 0;
          slots.set(level, slot + 1);
          ordered.push({
            ...person,
            draggable: false,
            position: { x: departmentOffset + slot * 290, y: 145 + level * 185 },
            data: {
              ...person.data,
              organizationLevel: person.data.organizationLevel || hierarchyLevels[level],
              viewMode: "org",
              viewDepartmentColor: departmentColor(departmentName),
            },
          });
        });
      departmentOffset += laneWidth + 70;
    });
    return { people: ordered, departments };
  }, [nodes]);

  const visibleNodes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    const sourceNodes = viewMode === "org" ? organizationPeople.people : nodes;
    return sourceNodes.map((node) => ({
      ...node,
      hidden:
        (viewMode === "map" && hiddenKinds.includes(node.data.kind)) ||
        (normalized.length > 0 && ![node.data.name, node.data.code, node.data.owner, node.data.kind]
          .some((value) => value.toLocaleLowerCase("es").includes(normalized))),
    }));
  }, [hiddenKinds, nodes, organizationPeople.people, query, viewMode]);

  const visibleEdges = useMemo(() => {
    if (viewMode === "map") return edges.filter((edge) => edge.data?.relation !== "blocked");
    return organizationPeople.people.flatMap((person) => {
      return managerIds(person.data.reportsTo).flatMap((managerId) => {
        const manager = organizationPeople.people.find((candidate) => candidate.id === managerId);
        if (!manager) return [];
        return [{
          id: `hierarchy-${manager.id}-${person.id}`,
          source: manager.id,
          target: person.id,
          label: "supervisa",
          data: { relation: "hierarchy" as const },
          ...hierarchyEdge,
        }];
      });
    });
  }, [edges, organizationPeople.people, viewMode]);

  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const people = useMemo(() => nodes.filter((node) => node.data.kind === "person"), [nodes]);
  const reusableData = useMemo(() => {
    const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "es"));
    return {
      departments: unique(nodes.map((node) => node.data.department)),
      roles: unique(nodes.map((node) => node.data.role)),
      owners: unique(nodes.flatMap((node) => node.data.owner.split(/[,;/\n]+/))),
      documentTypes: unique(nodes.map((node) => node.data.documentType)),
      controlMethods: unique(nodes.map((node) => node.data.controlMethod)),
    };
  }, [nodes]);
  const selectedConnections = useMemo(() => selected
    ? edges.filter((edge) => edge.data?.relation !== "blocked" && (edge.source === selected.id || edge.target === selected.id))
    : [],
  [edges, selected]);
  const matchingParticipants = useMemo(() => {
    if (!selected || selected.data.kind === "person") return [];
    const participants = selected.data.owner.split(/[,;/\n]+/).map(normalizedValue).filter(Boolean);
    return people.filter((person) => {
      const identities = [person.data.name, person.data.role, person.data.email].map(normalizedValue).filter(Boolean);
      return participants.some((participant) => identities.includes(participant));
    });
  }, [people, selected]);

  const updateSelected = useCallback((field: keyof MapNodeData, value: string | Attachment[]) => {
    if (!selected) return;
    setNodes((current) => current.map((node) => node.id === selected.id ? { ...node, data: { ...node.data, [field]: value } } : node));
  }, [selected, setNodes]);

  const addParticipant = useCallback((person: MapNode) => {
    if (!selected || selected.data.kind === "person") return;
    const current = selected.data.owner.split(/[,;/\n]+/).map((value) => value.trim()).filter(Boolean);
    if (!current.some((value) => normalizedValue(value) === normalizedValue(person.data.name))) current.push(person.data.name);
    updateSelected("owner", current.join("; "));
    setSaveState(`${person.data.name} participa · conexión automática`);
  }, [selected, updateSelected]);

  const addManager = useCallback((managerId: string) => {
    if (!selected || selected.data.kind !== "person" || !managerId || managerId === selected.id) return;
    const current = managerIds(selected.data.reportsTo);
    if (!current.includes(managerId)) current.push(managerId);
    updateSelected("reportsTo", current.join(";"));
  }, [selected, updateSelected]);

  const removeManager = useCallback((managerId: string) => {
    if (!selected || selected.data.kind !== "person") return;
    updateSelected("reportsTo", managerIds(selected.data.reportsTo).filter((id) => id !== managerId).join(";"));
  }, [selected, updateSelected]);

  const cutConnection = useCallback((edgeId: string) => {
    setEdges((current) => current.flatMap((edge) => {
      if (edge.id !== edgeId) return [edge];
      if (edge.data?.relation !== "auto" && edge.data?.relation !== "department") return [];
      return [{ ...edge, hidden: true, data: { ...edge.data, relation: "blocked" as const, blockedRelation: edge.data.relation } }];
    }));
    setSelectedEdgeId((current) => current === edgeId ? null : current);
    setSaveState("Conexión cortada · las fichas se conservaron");
  }, [setEdges]);

  const addNode = useCallback((choice: Exclude<CreationChoice, "connection">, shouldConnect: boolean) => {
    const number = nodes.length + 1;
    const id = `node-${Date.now()}`;
    const anchor = shouldConnect && selected
      ? selected.position
      : { x: 130 + (number % 4) * 310, y: 170 + Math.floor(number / 4) * 190 };
    const horizontal = choice === "activity" || choice === "control";
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
    };
    const prefixes: Record<NodeKind, string> = { activity: "AC", process: "SP", person: "PE", system: "SI", manual: "DO", control: "CO" };
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
      setEdges((current) => {
        const parallel = parallelPathOptions(current, selected.id, id);
        return [...current, {
          id: `e-${selected.id}-${id}-${Date.now()}`,
          source: selected.id,
          target: id,
          label: choice === "activity" ? "continúa con" : choice === "process" ? "se desglosa en" : "utiliza / participa",
          data: { relation: "manual", parallelIndex: parallel.parallelIndex },
          pathOptions: parallel.pathOptions,
          ...edgeStyleFor(selected, newNode),
        }];
      });
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
      setGroupSelectionMode(false);
      setConnectionMode(true);
      setConnectionSource(null);
      setSaveState("Conexión: elige el origen");
      return;
    }
    addNode(choice, connectNewNode);
  }, [addNode, connectNewNode]);

  const handleNodeClick = useCallback((node: MapNode) => {
    setSelectedId(node.id);
    setSelectedEdgeId(null);
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

  const handleEdgeClick = useCallback((edge: MapEdge) => {
    if (edge.data?.relation === "hierarchy") return;
    setSelectedEdgeId(edge.id);
    setInspectorOpen(false);
    playInterfaceSound("select", soundSettings);
  }, [soundSettings]);

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

  const applySuggestedLayout = useCallback((strategy: "flow" | "department" | "compact") => {
    setLayoutUndo(Object.fromEntries(nodes.map((node) => [node.id, node.position])));
    const positions = new Map<string, { x: number; y: number }>();
    const ordered = [...nodes].sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y);
    if (strategy === "compact") {
      ordered.forEach((node, index) => positions.set(node.id, { x: 120 + (index % 4) * 320, y: 150 + Math.floor(index / 4) * 175 }));
    } else if (strategy === "department") {
      const groups = [...new Set(ordered.map((node) => node.data.department.trim() || "Sin departamento"))].sort((left, right) => left.localeCompare(right, "es"));
      groups.forEach((group, groupIndex) => {
        ordered.filter((node) => (node.data.department.trim() || "Sin departamento") === group).forEach((node, index) => {
          positions.set(node.id, { x: 120 + groupIndex * 340, y: 150 + index * 175 });
        });
      });
    } else {
      const primary = ordered.filter((node) => node.data.kind === "activity" || node.data.kind === "process" || node.data.kind === "control");
      primary.forEach((node, index) => positions.set(node.id, { x: 120 + (index % 4) * 350, y: 260 + Math.floor(index / 4) * 430 }));
      const supportCounts = new Map<string, number>();
      ordered.filter((node) => node.data.kind === "person" || node.data.kind === "system" || node.data.kind === "manual").forEach((node, index) => {
        const related = edges.find((edge) => edge.data?.relation !== "department" && edge.data?.relation !== "blocked" && (edge.source === node.id || edge.target === node.id));
        const anchorId = related ? (related.source === node.id ? related.target : related.source) : "";
        const anchor = positions.get(anchorId);
        if (!anchor) {
          positions.set(node.id, { x: 120 + (index % 4) * 320, y: 700 + Math.floor(index / 4) * 180 });
          return;
        }
        const count = supportCounts.get(anchorId) ?? 0;
        supportCounts.set(anchorId, count + 1);
        const above = node.data.kind === "person";
        positions.set(node.id, { x: anchor.x + (count % 3) * 95 - 90, y: anchor.y + (above ? -190 : 190 + Math.floor(count / 3) * 120) });
      });
    }
    setNodes((current) => current.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })));
    setLayoutOpen(false);
    setSaveState(`Acomodo sugerido aplicado · ${strategy === "flow" ? "camino principal" : strategy === "department" ? "por departamento" : "compacto"}`);
    window.setTimeout(() => void fitView({ padding: .24, maxZoom: 1 }), 100);
  }, [edges, fitView, nodes, setNodes]);

  const undoSuggestedLayout = useCallback(() => {
    if (!layoutUndo) return;
    setNodes((current) => current.map((node) => ({ ...node, position: layoutUndo[node.id] ?? node.position })));
    setLayoutUndo(null);
    setSaveState("Acomodo anterior restaurado");
    window.setTimeout(() => void fitView({ padding: .24, maxZoom: 1 }), 100);
  }, [fitView, layoutUndo, setNodes]);

  const generateReport = useCallback(() => {
    const activeEdges = edges.filter((edge) => edge.data?.relation !== "blocked");
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const sections = (Object.keys(typeMeta) as NodeKind[]).map((kind) => {
      const items = nodes.filter((node) => node.data.kind === kind);
      if (!items.length) return "";
      return `<section><h2>${escapedHtml(typeMeta[kind].label)} <small>${items.length}</small></h2>${items.map((node) => {
        const managers = managerIds(node.data.reportsTo).map((id) => nodeById.get(id)?.data.name).filter(Boolean).join(", ");
        const connections = activeEdges.filter((edge) => edge.source === node.id || edge.target === node.id).map((edge) => {
          const other = nodeById.get(edge.source === node.id ? edge.target : edge.source);
          return `${other?.data.name || "Elemento"} (${String(edge.label || "relación")})`;
        }).join("; ");
        const fields = [
          ["Código", node.data.code],
          ["Departamento", node.data.department],
          ["Responsables / participantes", node.data.owner],
          ["Puesto", node.data.role],
          ["Nivel", node.data.organizationLevel],
          ["Reporta a", managers],
          ["Correo", node.data.email],
          ["Teléfono", node.data.phone],
          ["Objetivo", node.data.objective],
          ["Entradas", node.data.inputs],
          ["Resultados", node.data.outputs],
          ["Duración / frecuencia", node.data.duration],
          ["Tipo documental", node.data.documentType],
          ["Revisión", node.data.revision],
          ["Fecha de vigencia", node.data.effectiveDate],
          ["Enlace del sistema", node.data.systemUrl],
          ["Método de control", node.data.controlMethod],
          ["Evidencia", node.data.evidence],
          ["Descripción", node.data.description],
          ["Conexiones", connections],
          ["Archivos", node.data.attachments.map((attachment) => attachment.name).join(", ")],
        ].filter(([, value]) => Boolean(value));
        return `<article><h3>${escapedHtml(node.data.name)}</h3><div class="grid">${fields.map(([label, value]) => `<div><b>${escapedHtml(label)}</b><span>${escapedHtml(value)}</span></div>`).join("")}</div></article>`;
      }).join("")}</section>`;
    }).join("");
    const report = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte · ${escapedHtml(processName)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#09233f;font-family:Arial,sans-serif;font-size:11px}header{padding:22px;border-radius:14px;background:#103f6e;color:#fff}header small{color:#8ee2aa;font-weight:700}h1{margin:6px 0 4px;font-size:25px}header p{margin:0;color:#dbe9f5}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.summary div{padding:12px;border:1px solid #cedbea;border-radius:9px}.summary b,.summary span{display:block}.summary b{font-size:20px}.summary span{margin-top:3px;color:#5d7289}section{margin:20px 0}h2{padding-bottom:7px;border-bottom:2px solid #0b9b45;font-size:16px}h2 small{color:#5d7289}article{margin:10px 0;padding:12px;border:1px solid #cedbea;border-radius:9px;break-inside:avoid}h3{margin:0 0 9px;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px}.grid div{min-width:0}.grid b,.grid span{display:block}.grid b{color:#536a80;font-size:8px;text-transform:uppercase}.grid span{margin-top:3px;white-space:pre-wrap}.print{position:fixed;right:18px;bottom:18px;padding:10px 15px;border:0;border-radius:9px;background:#0b9b45;color:white;font-weight:700;cursor:pointer}@media print{.print{display:none}}@media(max-width:700px){.summary,.grid{grid-template-columns:1fr 1fr}}</style></head><body><button class="print" onclick="window.print()">Imprimir / guardar PDF</button><header><small>DISTRIBUCIONES ORVEL · REPORTE INTEGRAL</small><h1>${escapedHtml(processName)}</h1><p>${escapedHtml(department)} · Generado ${escapedHtml(new Date().toLocaleString("es-MX"))}</p></header><div class="summary"><div><b>${nodes.length}</b><span>Elementos</span></div><div><b>${activeEdges.length}</b><span>Conexiones</span></div><div><b>${people.length}</b><span>Personas / puestos</span></div><div><b>${reusableData.departments.length}</b><span>Departamentos</span></div></div>${sections}</body></html>`;
    const blob = new Blob([report], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `reporte-mapa-procesos-${new Date().toISOString().slice(0, 10)}.html`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaveState("Reporte integral descargado");
  }, [department, edges, nodes, people.length, processName, reusableData.departments.length]);

  const openTutorial = useCallback(() => {
    setViewMode("map");
    setCreationOpen(false);
    setLayoutOpen(false);
    setConnectionMode(false);
    setTutorialStep(0);
    setTutorialOpen(true);
  }, []);

  const closeTutorial = useCallback(() => {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "seen");
    setTutorialOpen(false);
    setTourRect(null);
    setCreationOpen(false);
    setLayoutOpen(false);
    setConnectionMode(false);
  }, []);

  useEffect(() => {
    if (!tutorialOpen) return;
    let target: HTMLElement | null = null;
    let retryTimer = 0;
    const updateTarget = () => {
      target?.removeEventListener("click", handleTargetClick, true);
      target = window.document.querySelector<HTMLElement>(tutorialSteps[tutorialStep].target);
      if (!target) {
        retryTimer = window.setTimeout(updateTarget, 100);
        return;
      }
      const rect = target.getBoundingClientRect();
      const margin = 7;
      const top = Math.max(0, rect.top - margin);
      const left = Math.max(0, rect.left - margin);
      const right = Math.min(window.innerWidth, rect.right + margin);
      const bottom = Math.min(window.innerHeight, rect.bottom + margin);
      const tooltipWidth = Math.min(330, window.innerWidth - 24);
      const tooltipLeft = Math.min(Math.max(12, left), window.innerWidth - tooltipWidth - 12);
      const tooltipTop = bottom + 14 + 210 < window.innerHeight ? bottom + 14 : Math.max(12, top - 210);
      setTourRect({ top, left, right, bottom, width: right - left, height: bottom - top, tooltipTop, tooltipLeft });
      target.addEventListener("click", handleTargetClick, true);
    };
    const handleTargetClick = () => {
      if (tutorialStep === tutorialSteps.length - 1) closeTutorial();
      else setTutorialStep((current) => current + 1);
    };
    retryTimer = window.setTimeout(updateTarget, 80);
    window.addEventListener("resize", updateTarget);
    return () => {
      window.clearTimeout(retryTimer);
      window.removeEventListener("resize", updateTarget);
      target?.removeEventListener("click", handleTargetClick, true);
    };
  }, [closeTutorial, creationOpen, layoutOpen, tutorialOpen, tutorialStep, viewMode]);

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
          <button data-tour="map" className={viewMode === "map" ? "active" : ""} title="Mapa de procesos" aria-label="Mapa de procesos" onClick={() => { setViewMode("map"); setGroupSelectionMode(false); setSelectedEdgeId(null); }}><Icon name="map" /></button>
          <button data-tour="org" className={viewMode === "org" ? "active" : ""} title="Organigrama" aria-label="Organigrama" onClick={() => { setViewMode("org"); setGroupSelectionMode(false); setConnectionMode(false); setSelectedEdgeId(null); }}><Icon name="org" /></button>
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
            <button data-tour="add" className="navy-button add-button" onClick={() => setCreationOpen(true)}><Icon name="plus" />Nuevo elemento</button>
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
          <section className={`graph-panel ${connectionMode ? "is-connecting" : ""}`} aria-label={viewMode === "map" ? "Mapa general del proceso" : "Organigrama"}>
            <div className="graph-heading">
              <div><span className="map-symbol"><Icon name={viewMode === "map" ? "map" : "org"} /></span>{viewMode === "map" ? "MAPA GENERAL" : "ORGANIGRAMA"}</div>
              <input value={processName} onChange={(event) => setProcessName(event.target.value)} aria-label="Nombre del proceso" />
              <input value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Área del proceso" />
              <span>{viewMode === "map" ? `${nodes.length} nodos · ${edges.filter((edge) => edge.data?.relation !== "blocked").length} conexiones` : `${nodes.filter((node) => node.data.kind === "person").length} personas / puestos`}</span>
            </div>
            {viewMode === "map" && (
              <div className="type-filters" aria-label="Filtros por tipo de nodo">
                {(Object.entries(typeMeta) as [NodeKind, (typeof typeMeta)[NodeKind]][]).map(([kind, meta]) => (
                  <button key={kind} className={hiddenKinds.includes(kind) ? "muted" : ""} onClick={() => toggleKind(kind)}><i style={{ background: meta.color }} />{meta.label}</button>
                ))}
              </div>
            )}
            {viewMode === "org" && organizationPeople.departments.length > 0 && (
              <div className="department-legend" aria-label="Departamentos del organigrama">
                {organizationPeople.departments.map((departmentName) => (
                  <span key={departmentName}><i style={{ background: departmentColor(departmentName) }} />{departmentName}<b>{people.filter((person) => (person.data.department.trim() || "Sin departamento") === departmentName).length}</b></span>
                ))}
              </div>
            )}
            {viewMode === "org" && <div className="hierarchy-level-guide" aria-label="Niveles de jerarquía">{hierarchyLevels.map((level, index) => <span key={level}><b>{index + 1}</b>{level}</span>)}</div>}
            <ReactFlow<MapNode, MapEdge>
              nodes={visibleNodes}
              edges={visibleEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => handleNodeClick(node)}
              onEdgeClick={(_, edge) => handleEdgeClick(edge)}
              onPaneClick={() => setSelectedEdgeId(null)}
              onSelectionChange={({ nodes: selection }) => setGroupSelectionCount(selection.length)}
              fitView
              fitViewOptions={{ padding: 0.24, minZoom: 0.52, maxZoom: 1 }}
              minZoom={0.25}
              maxZoom={1.7}
              nodesDraggable={viewMode === "map"}
              nodesConnectable={viewMode === "map"}
              elementsSelectable
              selectionOnDrag={groupSelectionMode && viewMode === "map"}
              selectionMode={SelectionMode.Partial}
              panOnDrag={groupSelectionMode ? [1, 2] : true}
              multiSelectionKeyCode={["Control", "Shift"]}
              deleteKeyCode={null}
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
            {groupSelectionMode && viewMode === "map" && (
              <div className="group-selection-banner"><Icon name="group" /><span><b>{groupSelectionCount || "—"}</b> seleccionados · arrastra un recuadro y después mueve el grupo</span><button onClick={() => setGroupSelectionMode(false)}>Terminar</button></div>
            )}
            {selectedEdge && selectedEdge.data?.relation !== "blocked" && (
              <div className="edge-selection-banner"><Icon name="cut" /><span>Conexión seleccionada: <b>{String(selectedEdge.label || "sin etiqueta")}</b></span><button onClick={() => cutConnection(selectedEdge.id)}>Cortar conexión</button></div>
            )}
            <div className="map-actions" aria-label="Acciones del mapa">
              <button onClick={fitMap} title="Ajustar mapa completo"><Icon name="fit" /><span>Ajustar</span></button>
              {viewMode === "map" && <button data-tour="connect" className={connectionMode ? "is-active" : ""} onClick={() => { setConnectionMode(true); setConnectionSource(null); setGroupSelectionMode(false); setSelectedEdgeId(null); setSaveState("Conexión: elige el nodo de origen"); }} title="Conectar nodos haciendo clic"><Icon name="link" /><span>Conectar nodos</span></button>}
              {viewMode === "map" && <button data-tour="layout" onClick={() => setLayoutOpen(true)} title="Sugerencias de acomodo"><Icon name="layout" /><span>Sugerir acomodo</span></button>}
              {viewMode === "map" && layoutUndo && <button onClick={undoSuggestedLayout} title="Deshacer el último acomodo"><Icon name="undo" /><span>Deshacer acomodo</span></button>}
              {viewMode === "map" && <button className={groupSelectionMode ? "is-active" : ""} onClick={() => { setGroupSelectionMode((current) => !current); setConnectionMode(false); setConnectionSource(null); setSelectedEdgeId(null); }} title="Seleccionar y mover un grupo"><Icon name="group" /><span>Seleccionar grupo</span></button>}
              {!inspectorOpen && selected && <button onClick={() => setInspectorOpen(true)} title="Abrir ficha"><Icon name="panel" /><span>Abrir ficha</span></button>}
              <button onClick={generateReport} title="Descargar reporte integral"><Icon name="report" /><span>Generar reporte</span></button>
              {viewMode === "map" && <button className="map-primary-add" onClick={() => setCreationOpen(true)}><Icon name="plus" /><span>Agregar elemento</span></button>}
            </div>
            <div className="map-hint">{viewMode === "map" ? <><span>Edita dentro de cada tarjeta</span><span>Selecciona una línea para cortarla</span><span>Personas y sistemas usan líneas delgadas</span></> : <><span>La jerarquía sale del campo “Reporta a”</span><span>Los colores identifican departamentos</span></>}</div>
          </section>

          {selected && inspectorOpen && (
            <aside className="node-inspector">
              <div className="inspector-titlebar">
                <div><small>FICHA DE {typeMeta[selected.data.kind].label.toLocaleUpperCase("es")}</small><h2>{selected.data.name}</h2></div>
                <div className="inspector-title-actions"><span className="kind-badge" style={{ color: typeMeta[selected.data.kind].color, background: `${typeMeta[selected.data.kind].color}14` }}>{typeMeta[selected.data.kind].label}</span><button onClick={() => setInspectorOpen(false)} title="Cerrar ficha" aria-label="Cerrar ficha"><Icon name="close" /></button></div>
              </div>
              <div className="inspector-form">
                <label className="field field-wide"><span>Nombre</span><input value={selected.data.name} onChange={(event) => updateSelected("name", event.target.value)} /></label>
                <label className="field"><span>Código</span><input value={selected.data.code} onChange={(event) => updateSelected("code", event.target.value)} /></label>
                <label className="field"><span>Tipo de nodo</span><select value={selected.data.kind} onChange={(event) => updateSelected("kind", event.target.value as NodeKind)}>{(Object.entries(typeMeta) as [NodeKind, (typeof typeMeta)[NodeKind]][]).map(([kind, meta]) => <option key={kind} value={kind}>{meta.label}</option>)}</select></label>
                {selected.data.kind === "person" && <>
                  <label className="field"><span>Puesto / función</span><input list="role-suggestions" value={selected.data.role} onChange={(event) => updateSelected("role", event.target.value)} placeholder="Ej. Comprador, contador…" /></label>
                  <label className="field"><span>Departamento</span><input list="department-suggestions" value={selected.data.department} onChange={(event) => updateSelected("department", event.target.value)} placeholder="Compras, Contabilidad…" /></label>
                  <div className="field field-wide manager-field"><span>Reporta a uno o varios jefes</span><select value="" onChange={(event) => addManager(event.target.value)}><option value="">+ Agregar jefe directo</option>{people.filter((person) => person.id !== selected.id && !managerIds(selected.data.reportsTo).includes(person.id)).map((person) => <option key={person.id} value={person.id}>{person.data.name} · {person.data.role || "puesto por definir"}</option>)}</select>{managerIds(selected.data.reportsTo).length > 0 ? <div className="manager-chips">{managerIds(selected.data.reportsTo).map((managerId) => { const manager = people.find((person) => person.id === managerId); return manager ? <button key={managerId} onClick={() => removeManager(managerId)} title="Quitar jefe">{manager.data.name}<span>×</span></button> : null; })}</div> : <small>Sin jefe asignado: aparecerá en el nivel superior.</small>}</div>
                  <label className="field field-wide"><span>Nivel jerárquico</span><select value={selected.data.organizationLevel} onChange={(event) => updateSelected("organizationLevel", event.target.value)}><option value="">Detectar por jerarquía</option>{hierarchyLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
                  <label className="field"><span>Correo</span><input type="email" value={selected.data.email} onChange={(event) => updateSelected("email", event.target.value)} /></label>
                  <label className="field"><span>Teléfono</span><input value={selected.data.phone} onChange={(event) => updateSelected("phone", event.target.value)} /></label>
                  <label className="field field-wide"><span>Responsabilidades del puesto</span><textarea value={selected.data.description} onChange={(event) => updateSelected("description", event.target.value)} rows={5} placeholder="Responsabilidades, alcance y facultades de esta persona o puesto…" /></label>
                </>}
                {(selected.data.kind === "activity" || selected.data.kind === "process") && <>
                  <label className="field"><span>Responsables / participantes</span><input list="person-suggestions" value={selected.data.owner} onChange={(event) => updateSelected("owner", event.target.value)} placeholder="Puedes separar varias personas con ;" /></label>
                  <label className="field"><span>Departamento</span><input list="department-suggestions" value={selected.data.department} onChange={(event) => updateSelected("department", event.target.value)} /></label>
                  <label className="field field-wide"><span>Duración / frecuencia</span><input value={selected.data.duration} onChange={(event) => updateSelected("duration", event.target.value)} placeholder="Ej. 45 min, mensual o bajo demanda" /></label>
                  <label className="field field-wide"><span>Objetivo</span><textarea value={selected.data.objective} onChange={(event) => updateSelected("objective", event.target.value)} rows={3} placeholder="¿Qué resultado debe lograr?" /></label>
                  <label className="field"><span>Entradas necesarias</span><textarea value={selected.data.inputs} onChange={(event) => updateSelected("inputs", event.target.value)} rows={3} /></label>
                  <label className="field"><span>Resultados obtenidos</span><textarea value={selected.data.outputs} onChange={(event) => updateSelected("outputs", event.target.value)} rows={3} /></label>
                  <label className="field field-wide"><span>{selected.data.kind === "process" ? "Alcance del subproceso" : "Descripción e instrucciones"}</span><textarea value={selected.data.description} onChange={(event) => updateSelected("description", event.target.value)} rows={5} placeholder="Explica qué se hace, criterios y excepciones…" /></label>
                </>}
                {selected.data.kind === "system" && <>
                  <label className="field"><span>Responsable funcional</span><input list="person-suggestions" value={selected.data.owner} onChange={(event) => updateSelected("owner", event.target.value)} /></label>
                  <label className="field"><span>Departamento usuario</span><input list="department-suggestions" value={selected.data.department} onChange={(event) => updateSelected("department", event.target.value)} /></label>
                  <label className="field field-wide"><span>Enlace / ubicación del sistema</span><input type="url" value={selected.data.systemUrl} onChange={(event) => updateSelected("systemUrl", event.target.value)} placeholder="https://… o ruta interna" /></label>
                  <label className="field field-wide"><span>Uso dentro del proceso</span><textarea value={selected.data.objective} onChange={(event) => updateSelected("objective", event.target.value)} rows={3} /></label>
                  <label className="field field-wide"><span>Acceso, módulos y observaciones</span><textarea value={selected.data.description} onChange={(event) => updateSelected("description", event.target.value)} rows={5} /></label>
                </>}
                {selected.data.kind === "manual" && <>
                  <label className="field"><span>Tipo de documento</span><input list="document-type-suggestions" value={selected.data.documentType} onChange={(event) => updateSelected("documentType", event.target.value)} placeholder="Procedimiento, formato, política…" /></label>
                  <label className="field"><span>Revisión / versión</span><input value={selected.data.revision} onChange={(event) => updateSelected("revision", event.target.value)} /></label>
                  <label className="field"><span>Responsable del documento</span><input list="person-suggestions" value={selected.data.owner} onChange={(event) => updateSelected("owner", event.target.value)} /></label>
                  <label className="field"><span>Departamento aplicable</span><input list="department-suggestions" value={selected.data.department} onChange={(event) => updateSelected("department", event.target.value)} /></label>
                  <label className="field field-wide"><span>Fecha de vigencia</span><input type="date" value={selected.data.effectiveDate} onChange={(event) => updateSelected("effectiveDate", event.target.value)} /></label>
                  <label className="field field-wide"><span>Propósito y aplicación</span><textarea value={selected.data.objective} onChange={(event) => updateSelected("objective", event.target.value)} rows={3} /></label>
                  <label className="field field-wide"><span>Notas de control documental</span><textarea value={selected.data.description} onChange={(event) => updateSelected("description", event.target.value)} rows={5} /></label>
                </>}
                {selected.data.kind === "control" && <>
                  <label className="field"><span>Responsable del control</span><input list="person-suggestions" value={selected.data.owner} onChange={(event) => updateSelected("owner", event.target.value)} /></label>
                  <label className="field"><span>Departamento</span><input list="department-suggestions" value={selected.data.department} onChange={(event) => updateSelected("department", event.target.value)} /></label>
                  <label className="field field-wide"><span>Método / criterio de control</span><input list="control-method-suggestions" value={selected.data.controlMethod} onChange={(event) => updateSelected("controlMethod", event.target.value)} placeholder="Aprobación, revisión, conciliación…" /></label>
                  <label className="field"><span>Frecuencia</span><input value={selected.data.duration} onChange={(event) => updateSelected("duration", event.target.value)} placeholder="Por operación, semanal…" /></label>
                  <label className="field"><span>Evidencia generada</span><input value={selected.data.evidence} onChange={(event) => updateSelected("evidence", event.target.value)} placeholder="Registro, firma, reporte…" /></label>
                  <label className="field field-wide"><span>Objetivo del control</span><textarea value={selected.data.objective} onChange={(event) => updateSelected("objective", event.target.value)} rows={3} /></label>
                  <label className="field field-wide"><span>Criterios, excepciones y escalamiento</span><textarea value={selected.data.description} onChange={(event) => updateSelected("description", event.target.value)} rows={5} /></label>
                </>}
              </div>

              <datalist id="department-suggestions">{reusableData.departments.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="role-suggestions">{reusableData.roles.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="person-suggestions">{[...new Set([...people.map((person) => person.data.name), ...reusableData.owners])].map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="document-type-suggestions">{reusableData.documentTypes.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="control-method-suggestions">{reusableData.controlMethods.map((value) => <option key={value} value={value} />)}</datalist>

              {selected.data.kind !== "person" && (people.length > 0 || reusableData.departments.length > 0) && (
                <section className="reuse-section">
                  <div className="section-heading"><div><small>REUTILIZAR INFORMACIÓN</small><strong>Sugerencias de datos ya registrados</strong></div>{selectedConnections.some((edge) => edge.data?.relation === "auto") && <span className="auto-link-status">{selectedConnections.filter((edge) => edge.data?.relation === "auto").length} conexión{selectedConnections.filter((edge) => edge.data?.relation === "auto").length === 1 ? "" : "es"} automática{selectedConnections.filter((edge) => edge.data?.relation === "auto").length === 1 ? "" : "s"}</span>}</div>
                  {people.length > 0 && <div className="suggestion-row"><span>Personas</span><div>{people.slice(0, 8).map((person) => <button key={person.id} className={matchingParticipants.some((match) => match.id === person.id) ? "is-used" : ""} onClick={() => addParticipant(person)}>{person.data.name}<small>{person.data.role || person.data.department || "Persona registrada"}</small></button>)}</div></div>}
                  {reusableData.departments.length > 0 && <div className="suggestion-row compact"><span>Departamentos</span><div>{reusableData.departments.slice(0, 8).map((departmentName) => <button key={departmentName} className={normalizedValue(selected.data.department) === normalizedValue(departmentName) ? "is-used" : ""} onClick={() => updateSelected("department", departmentName)}>{departmentName}</button>)}</div></div>}
                </section>
              )}

              <section className="attachments-section">
                <div className="section-heading">
                  <div><small>ARCHIVOS</small><strong>{selected.data.kind === "person" ? "Fotografía y documentos de la persona" : selected.data.kind === "manual" ? "Documento vigente y anexos" : "PDF e imágenes de apoyo"}</strong></div>
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

              <section className="connection-manager">
                <div className="section-heading"><div><small>CONEXIONES</small><strong>Relaciones de esta ficha</strong></div><span>{selectedConnections.length}</span></div>
                {selectedConnections.length > 0 ? <div className="connection-list">{selectedConnections.map((edge) => {
                  const otherId = edge.source === selected.id ? edge.target : edge.source;
                  const other = nodes.find((node) => node.id === otherId);
                  return <article key={edge.id}><i style={{ background: edge.data?.relation === "department" ? "#0d9488" : other ? typeMeta[other.data.kind].color : "#7690a7" }} /><div><strong>{other?.data.name || "Elemento relacionado"}</strong><small>{edge.source === selected.id ? "Hacia" : "Desde"} · {String(edge.label || "se relaciona con")} {edge.data?.relation === "auto" ? "· participación automática" : edge.data?.relation === "department" ? "· mismo departamento" : ""}</small></div><button onClick={() => cutConnection(edge.id)}><Icon name="cut" />Cortar</button></article>;
                })}</div> : <p className="empty-files">Esta ficha puede permanecer sin conexiones y conservar toda su información.</p>}
              </section>

              <div className="connection-strip">
                <div><b>{edges.filter((edge) => edge.data?.relation !== "blocked" && edge.source === selected.id).length}</b><span>Salientes</span></div>
                <div><b>{edges.filter((edge) => edge.data?.relation !== "blocked" && edge.target === selected.id).length}</b><span>Entrantes</span></div>
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
            <button data-tour="close-creation" className="modal-close" onClick={() => setCreationOpen(false)} aria-label="Cerrar"><Icon name="close" /></button>
            <small>CONSTRUIR EL MAPA</small>
            <h2 id="creation-title">¿Qué quieres agregar?</h2>
            <p>{connectNewNode ? <>Se conectará con <strong>{selected?.data.name ?? "el nodo seleccionado"}</strong>.</> : <>Se creará como una rama independiente, sin conexión inicial.</>} Puedes moverlo, editarlo y conectarlo después.</p>
            <div className="connection-choice" role="group" aria-label="Conexión del nuevo elemento">
              <button className={connectNewNode ? "active" : ""} onClick={() => setConnectNewNode(true)}>Conectar con el seleccionado</button>
              <button data-tour="independent" className={!connectNewNode ? "active" : ""} onClick={() => setConnectNewNode(false)}>Crear independiente</button>
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

      {layoutOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLayoutOpen(false); }}>
          <section className="layout-modal" role="dialog" aria-modal="true" aria-labelledby="layout-title">
            <button data-tour="close-layout" className="modal-close" onClick={() => setLayoutOpen(false)} aria-label="Cerrar sugerencias"><Icon name="close" /></button>
            <small>ACOMODO ASISTIDO</small>
            <h2 id="layout-title">¿Cómo quieres ordenar el mapa?</h2>
            <p>El sistema propone el acomodo y conserva una opción para deshacerlo. Las fichas y conexiones no cambian.</p>
            <div className="layout-options">
              <button onClick={() => applySuggestedLayout("flow")}><span><Icon name="link" /></span><div><strong>Camino principal</strong><small>Procesos al centro; personas arriba y sistemas o documentos abajo.</small></div></button>
              <button onClick={() => applySuggestedLayout("department")}><span><Icon name="org" /></span><div><strong>Por departamento</strong><small>Forma columnas usando Compras, Contabilidad, Almacén y las demás áreas.</small></div></button>
              <button onClick={() => applySuggestedLayout("compact")}><span><Icon name="layout" /></span><div><strong>Cuadrícula compacta</strong><small>Reduce espacios vacíos para revisar o presentar mapas grandes.</small></div></button>
            </div>
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

      {tutorialOpen && tourRect && (
        <div className="guided-tour-layer" aria-live="polite">
          <i className="tour-shade tour-shade-top" style={{ height: tourRect.top }} />
          <i className="tour-shade tour-shade-left" style={{ top: tourRect.top, width: tourRect.left, height: tourRect.height }} />
          <i className="tour-shade tour-shade-right" style={{ top: tourRect.top, left: tourRect.right, height: tourRect.height }} />
          <i className="tour-shade tour-shade-bottom" style={{ top: tourRect.bottom }} />
          <i className="tour-spotlight" style={{ top: tourRect.top, left: tourRect.left, width: tourRect.width, height: tourRect.height }} />
          <section className="tour-tooltip" role="dialog" aria-modal="false" aria-labelledby="tutorial-title" style={{ top: tourRect.tooltipTop, left: tourRect.tooltipLeft }}>
            <div className="tour-step"><span>{tutorialStep + 1}</span><small>{tutorialSteps[tutorialStep].eyebrow}</small></div>
            <h2 id="tutorial-title">{tutorialSteps[tutorialStep].title}</h2>
            <p>{tutorialSteps[tutorialStep].body}</p>
            <div className="tour-prompt"><i />Haz clic en la zona iluminada</div>
            <button onClick={closeTutorial}>Saltar todo</button>
          </section>
        </div>
      )}
    </main>
  );
}

export default function ProcessMap() {
  return <ReactFlowProvider><MapExperience /></ReactFlowProvider>;
}
