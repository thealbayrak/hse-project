import type { CreateIncidentInput } from "@/lib/types";

/**
 * IndexedDB queue for field reports written while the site has no signal.
 * Photos and voice notes are stored as Blobs next to the form fields, so a
 * queued report is sent exactly as the worker filled it in.
 */

const DB_NAME = "sitesafety-offline";
const DB_VERSION = 1;
const STORE = "report-queue";

export interface QueuedReport {
  id: string;
  queuedAt: string;
  fields: Omit<CreateIncidentInput, "photoFiles" | "audioFile" | "mediaUrls">;
  photos: { name: string; type: string; blob: Blob }[];
  audio: { type: string; blob: Blob } | null;
  attempts: number;
}

export function offlineQueueSupported() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await requestToPromise(run(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
    return result;
  } finally {
    db.close();
  }
}

export function toQueuedReport(input: CreateIncidentInput, id = crypto.randomUUID()): QueuedReport {
  const { photoFiles, audioFile } = input;
  return {
    id,
    queuedAt: new Date().toISOString(),
    fields: {
      type: input.type,
      typeNote: input.typeNote ?? null,
      siteId: input.siteId,
      organizationId: input.organizationId ?? null,
      locationId: input.locationId,
      locationIds: input.locationIds ?? [],
      locationNote: input.locationNote ?? null,
      category: input.category,
      categories: input.categories ?? [],
      severity: input.severity,
      hurt: input.hurt ?? null,
      dangerPresent: input.dangerPresent ?? null,
      subcontractor: input.subcontractor ?? null,
      reporterProfileId: input.reporterProfileId ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      reportKey: input.reportKey ?? null,
      device: input.device ?? null,
      description: input.description,
      anonymous: input.anonymous,
      reporterName: input.reporterName,
      originalLanguage: input.originalLanguage ?? null,
      originalText: input.originalText ?? null,
      summarySv: input.summarySv ?? null,
      aiConfidence: input.aiConfidence ?? null,
    },
    photos: (photoFiles ?? []).map((file) => ({ name: file.name, type: file.type, blob: file })),
    audio: audioFile && audioFile.size > 0 ? { type: audioFile.type, blob: audioFile } : null,
    attempts: 0,
  };
}

export function toCreateIncidentInput(report: QueuedReport): CreateIncidentInput {
  return {
    ...report.fields,
    mediaUrls: [],
    photoFiles: report.photos.map(
      (photo) => new File([photo.blob], photo.name || "photo.jpg", { type: photo.type || "image/jpeg" })
    ),
    audioFile: report.audio ? new Blob([report.audio.blob], { type: report.audio.type }) : null,
  };
}

export async function enqueueReport(input: CreateIncidentInput): Promise<QueuedReport> {
  const report = toQueuedReport(input);
  await withStore("readwrite", (store) => store.put(report));
  return report;
}

export async function listQueuedReports(): Promise<QueuedReport[]> {
  if (!offlineQueueSupported()) return [];
  const all = await withStore<QueuedReport[]>("readonly", (store) => store.getAll() as IDBRequest<QueuedReport[]>);
  return [...all].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function countQueuedReports(): Promise<number> {
  if (!offlineQueueSupported()) return 0;
  return withStore("readonly", (store) => store.count());
}

export async function removeQueuedReport(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function markAttempt(report: QueuedReport): Promise<void> {
  await withStore("readwrite", (store) => store.put({ ...report, attempts: report.attempts + 1 }));
}

/** True for the errors a flaky site connection produces (fetch failures, aborted uploads). */
export function isNetworkError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === "TypeError" && (message.includes("fetch") || message.includes("network")) ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("network request failed") ||
    message.includes("socket") ||
    message.includes("timeout") ||
    message.includes("econnre")
  );
}
