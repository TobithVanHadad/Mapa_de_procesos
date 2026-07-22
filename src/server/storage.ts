import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = process.env.DATA_DIR?.trim() || path.join(tmpdir(), "orvel-process-map");
const uploadsDirectory = path.join(root, "uploads");
const mapFile = path.join(root, "process-map.json");

export type StoredUpload = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
};

async function prepareStorage() {
  await fs.mkdir(uploadsDirectory, { recursive: true });
}

export async function readMapDocument(): Promise<unknown | null> {
  await prepareStorage();
  try {
    return JSON.parse(await fs.readFile(mapFile, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeMapDocument(document: unknown) {
  await prepareStorage();
  const temporaryFile = `${mapFile}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(document, null, 2), "utf8");
  await fs.rename(temporaryFile, mapFile);
}

function detectedFile(bytes: Buffer): { extension: string; type: string } | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { extension: ".pdf", type: "application/pdf" };
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: ".png", type: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return { extension: ".jpg", type: "image/jpeg" };
  }
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) {
    return { extension: ".gif", type: "image/gif" };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: ".webp", type: "image/webp" };
  }
  return null;
}

function safeDisplayName(value: string) {
  return value.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-").slice(0, 120) || "archivo";
}

export async function storeUpload(file: File): Promise<StoredUpload> {
  await prepareStorage();
  const maxMegabytes = Number(process.env.MAX_UPLOAD_MB || 12);
  const maxBytes = Math.max(1, maxMegabytes) * 1024 * 1024;
  if (file.size <= 0 || file.size > maxBytes) {
    throw new Error(`El archivo debe pesar menos de ${maxMegabytes} MB.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectedFile(bytes);
  if (!detected) {
    throw new Error("Sólo se permiten PDF e imágenes PNG, JPG, GIF o WEBP.");
  }

  const id = randomUUID();
  await fs.writeFile(path.join(uploadsDirectory, `${id}${detected.extension}`), bytes, { flag: "wx" });
  return {
    id,
    name: safeDisplayName(file.name),
    type: detected.type,
    size: bytes.length,
    url: `/api/uploads/${id}`,
    uploadedAt: new Date().toISOString(),
  };
}

export async function findUpload(id: string) {
  await prepareStorage();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const filename = (await fs.readdir(uploadsDirectory)).find((entry) => entry.startsWith(`${id}.`));
  if (!filename) return null;
  const extension = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return { path: path.join(uploadsDirectory, filename), type: types[extension] || "application/octet-stream" };
}

export async function deleteUpload(id: string) {
  const upload = await findUpload(id);
  if (!upload) return false;
  await fs.unlink(upload.path);
  return true;
}
