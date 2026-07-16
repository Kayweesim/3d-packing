/**
 * exportFolder.ts — "choose a folder once, save exports into it" via the
 * File System Access API (Chrome/Edge 86+; both are Chromium so one code path
 * covers them). The picked FileSystemDirectoryHandle is persisted in
 * IndexedDB (handles are structured-cloneable but NOT JSON-serializable, so
 * localStorage can't hold them) and restored on the next session; the browser
 * then requires a one-time permission re-confirmation inside a user gesture,
 * which `ensureWritePermission` performs from the Export button's click.
 *
 * Exports: isFolderPickerSupported, pickExportFolder, restoreExportFolder,
 * clearExportFolder, ensureWritePermission, writeToFolder.
 * Unsupported browsers (Firefox/Safari) simply fall back to the normal
 * browser-download path in excelExport.ts.
 */

// The File System Access API isn't fully covered by TypeScript's DOM lib:
// showDirectoryPicker and the permission methods are missing. Declare just
// what we use.
type PermissionMode = 'read' | 'readwrite'

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string
      mode?: PermissionMode
    }) => Promise<FileSystemDirectoryHandle>
  }
  interface FileSystemDirectoryHandle {
    queryPermission?: (desc?: { mode?: PermissionMode }) => Promise<PermissionState>
    requestPermission?: (desc?: { mode?: PermissionMode }) => Promise<PermissionState>
  }
}

const DB_NAME = 'container-packing'
const STORE = 'handles'
const KEY = 'exportFolder'

/** True when the browser can show a native folder picker (Chrome/Edge). */
export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Run one get/put/delete against the handle store, closing the db after. */
async function withStore<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/**
 * Show the native folder picker and persist the chosen handle for future
 * sessions. Returns null when the user cancels the dialog.
 */
export async function pickExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker!({ id: 'load-plan-export', mode: 'readwrite' })
    await withStore('readwrite', (s) => s.put(handle, KEY))
    return handle
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null // user cancelled
    throw err
  }
}

/** Restore the previously picked folder handle, or null if none was saved. */
export async function restoreExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFolderPickerSupported()) return null
  try {
    const handle = await withStore<FileSystemDirectoryHandle | undefined>(
      'readonly', (s) => s.get(KEY),
    )
    return handle ?? null
  } catch {
    return null // corrupt/blocked IndexedDB → behave as "no folder chosen"
  }
}

/** Forget the saved folder (exports revert to browser downloads). */
export async function clearExportFolder(): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete(KEY))
  } catch { /* nothing to clear */ }
}

/**
 * Make sure we may write into the folder. A handle restored from IndexedDB
 * comes back in the 'prompt' state after a browser restart; requestPermission
 * must run inside a user gesture (the Export button click qualifies).
 */
export async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const desc = { mode: 'readwrite' as const }
  if (await handle.queryPermission?.(desc) === 'granted') return true
  return await handle.requestPermission?.(desc) === 'granted'
}

/** Write `data` as `filename` inside the picked folder (overwrites). */
export async function writeToFolder(
  handle: FileSystemDirectoryHandle,
  filename: string,
  data: ArrayBuffer,
): Promise<void> {
  const file = await handle.getFileHandle(filename, { create: true })
  const writable = await file.createWritable()
  await writable.write(data)
  await writable.close()
}
