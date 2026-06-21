/**
 * Tiny IndexedDB store that keeps the last recording so an accidental reload or
 * a tab crash (e.g. during a heavy MP4 transcode) doesn't lose the user's work.
 * All operations are best-effort — failures never throw to the caller.
 */

const DB_NAME = "kindlewood-recorder";
const STORE = "recordings";
const KEY = "last";

export type StoredRecording = {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(rec: StoredRecording): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(rec, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // best-effort: persistence is a safety net, not a hard requirement
  }
}

export async function loadRecording(): Promise<StoredRecording | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<StoredRecording | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve((r.result as StoredRecording) ?? null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return rec && rec.blob ? rec : null;
  } catch {
    return null;
  }
}

export async function clearRecording(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // ignore
  }
}
