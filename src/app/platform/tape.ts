/**
 * Cinta del intento: todos los comandos que el runtime aplica al mundo, con el tic en que se aplicaron, y las opciones
 * de creación del mundo. Con ella el docente puede repetir el intento y comprobar que la entrega salió del simulador
 * (ver `practices/grading.ts`).
 *
 * La cinta crece con cada movimiento del puntero, así que vive en IndexedDB por bloques. Lo que todavía no se confirmó
 * en IndexedDB (la «cola») viaja junto con el mundo en el guardado de `localStorage`, que es síncrono: al cerrar la
 * pestaña, el mundo guardado y la cinta siguen coincidiendo.
 */
import { RESUME, type AttemptTape, type GradedLab, type TapeEntry } from '../../practices/tape';
import { scopedKey } from './scope';

const DB_NAME = 'quiklabs-tapes';
const STORE = 'chunks';
const CHUNK = 2000;
/** Sin IndexedDB la cola no puede crecer sin límite dentro de `localStorage`. */
const MAX_TAIL = 6000;

/** Lo que el guardado del intento lleva sobre la cinta. */
export interface TapeSave {
  tapeBase: number;
  tapeTail: TapeEntry[];
  tapeOptions: unknown;
}

interface Meta {
  attemptId: string;
  labId: GradedLab;
  options: unknown;
  count: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('NO_IDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

const get = <T>(store: IDBObjectStore, key: IDBValidKey) => new Promise<T | undefined>((resolve, reject) => {
  const r = store.get(key);
  r.onsuccess = () => resolve(r.result as T | undefined);
  r.onerror = () => reject(r.error);
});

const scope = (labId: GradedLab) => scopedKey(`quiklabs.cinta.${labId}`);

async function writeChunks(labId: GradedLab, meta: Meta, entries: TapeEntry[], from: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const st = tx.objectStore(STORE);
  const s = scope(labId);
  if (from === 0) st.delete(IDBKeyRange.bound([s], [s, []]));
  for (let i = Math.floor(from / CHUNK); i * CHUNK < meta.count; i++) st.put(entries.slice(i * CHUNK, Math.min(meta.count, (i + 1) * CHUNK)), [s, 'chunk', i]);
  st.put(meta, [s, 'meta']);
  await done(tx);
}

async function readTape(labId: GradedLab, attemptId: string): Promise<{ options: unknown; entries: TapeEntry[] } | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const st = tx.objectStore(STORE);
  const s = scope(labId);
  const meta = await get<Meta>(st, [s, 'meta']);
  if (!meta || meta.attemptId !== attemptId) return null;
  const chunks = await Promise.all(Array.from({ length: Math.ceil(meta.count / CHUNK) }, (_, i) => get<TapeEntry[]>(st, [s, 'chunk', i])));
  if (chunks.some((c) => !c)) return null;
  return { options: meta.options, entries: (chunks as TapeEntry[][]).flat().slice(0, meta.count) };
}

export class TapeRecorder {
  entries: TapeEntry[] = [];
  /** No se pudo recuperar el principio de la cinta (otro navegador, datos borrados): no se puede repetir. */
  broken = false;
  /** Entradas ya confirmadas en IndexedDB. */
  private confirmed = 0;
  private writing = false;
  /** Mientras se lee la cinta guardada al reanudar: lo que dice el guardado. */
  private head: TapeSave | null = null;
  readonly ready: Promise<void>;

  private constructor(readonly labId: GradedLab, readonly attemptId: string, public options: unknown, head: TapeSave | null) {
    this.head = head;
    this.ready = head ? this.load(head) : Promise.resolve();
  }

  /** Intento nuevo: `options` son exactamente las que recibió la función que crea el mundo. */
  static start(labId: GradedLab, attemptId: string, options: unknown): TapeRecorder {
    return new TapeRecorder(labId, attemptId, JSON.parse(JSON.stringify(options)), null);
  }

  /**
   * Intento reanudado: la cinta guardada hasta el último guardado (`saved`), una marca de reanudación (la app dejó el
   * mundo en estado seguro) y lo que venga después.
   */
  static resume(labId: GradedLab, attemptId: string, tick: number, saved: Partial<TapeSave>): TapeRecorder {
    const ok = typeof saved.tapeBase === 'number' && Array.isArray(saved.tapeTail) && saved.tapeOptions != null;
    const r = new TapeRecorder(labId, attemptId, saved.tapeOptions ?? null, ok ? (saved as TapeSave) : { tapeBase: -1, tapeTail: [], tapeOptions: null });
    r.entries.push([tick, RESUME]);
    return r;
  }

  private async load(head: TapeSave) {
    try {
      if (head.tapeBase < 0) throw new Error('NO_TAPE');
      const stored = head.tapeBase > 0 ? await readTape(this.labId, this.attemptId) : null;
      if (head.tapeBase > 0 && (!stored || stored.entries.length < head.tapeBase)) throw new Error('TAPE_LOST');
      this.entries = [...(stored?.entries.slice(0, head.tapeBase) ?? []), ...head.tapeTail, ...this.entries];
      this.confirmed = head.tapeBase;
    } catch {
      this.broken = true;
      this.entries = [];
    } finally {
      this.head = null;
    }
  }

  record(tick: number, cmd: unknown) {
    if (this.broken) return;
    this.entries.push([tick, JSON.parse(JSON.stringify(cmd)) as unknown]);
  }

  /** Para el guardado síncrono del intento: base confirmada en IndexedDB y cola pendiente. */
  forSave(): TapeSave | undefined {
    if (this.broken) return undefined;
    if (this.head) return { tapeBase: this.head.tapeBase, tapeTail: [...this.head.tapeTail, ...this.entries], tapeOptions: this.options };
    return { tapeBase: this.confirmed, tapeTail: this.entries.slice(this.confirmed), tapeOptions: this.options };
  }

  /** Lleva a IndexedDB lo pendiente (bloques nuevos o incompletos). Se llama después de cada guardado. */
  flush() {
    if (this.broken || this.head || this.writing) return;
    const count = this.entries.length;
    if (count === this.confirmed) return;
    this.writing = true;
    writeChunks(this.labId, { attemptId: this.attemptId, labId: this.labId, options: this.options, count }, this.entries, this.confirmed)
      .then(() => {
        this.confirmed = Math.max(this.confirmed, count);
      })
      .catch(() => {
        if (this.entries.length - this.confirmed > MAX_TAIL) {
          this.broken = true;
          this.entries = [];
        }
      })
      .finally(() => {
        this.writing = false;
      });
  }

  /** La cinta completa para la entrega (null si no se puede repetir). */
  async toTape(): Promise<AttemptTape | null> {
    await this.ready;
    if (this.broken || this.options === null) return null;
    return { v: 1, labId: this.labId, attemptId: this.attemptId, options: this.options, entries: this.entries };
  }
}
