/**
 * Fotografías reales del ocular (fase 2 de B01, también B02): el docente las sube por curso y la administración un
 * juego general; los estudiantes del curso ven las del curso y, donde falten, las generales. API real (Hono) sobre
 * SQLite con los datos ficticios y un almacén en memoria en lugar de R2.
 */
import { describe, expect, it } from 'vitest';
import { createApp, COOKIE } from '../../../worker/app';
import type { PhotoStore } from '../../../worker/core/service';
import { freshDb } from '../helpers/sqlite-d1';

const SECRET = 'x'.repeat(48);
const LOGIN = {
  admin: ['admin@quiklabs.example', 'Admin#Quiklabs2026'],
  laura: ['laura.mendez@uni.example', 'Docente2026!'],
  carlos: ['carlos.rojas@uni.example', 'Docente2026!'],
  valeria: ['valeria.solano@estudiante.uni.example', 'Quimica2026!'],
  andres: ['andres.jimenez@estudiante.uni.example', 'Quimica2026!'],
} as const;

/** JPEG mínimo (firma FF D8 FF) en base64. */
const jpeg = (fill = 1, n = 600) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(fill)]).toString('base64');
const photo = (fill = 1) => ({ dataB64: jpeg(fill), contentType: 'image/jpeg', width: 1200, height: 900 });

function memStore() {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const store: PhotoStore = {
    put: async (key, bytes, contentType) => void files.set(key, { bytes, contentType }),
    get: async (key) => {
      const f = files.get(key);
      return f ? { body: f.bytes, contentType: f.contentType } : null;
    },
    delete: async (key) => void files.delete(key),
  };
  return { store, files };
}

function platform(nowIso = '2026-10-28T18:00:00.000Z', withStore = true) {
  const mem = memStore();
  const app = createApp({ db: freshDb(), secret: SECRET, now: () => new Date(nowIso), photos: withStore ? mem.store : undefined });
  const call = async (method: string, path: string, cookie?: string, body?: unknown) => {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = `${COOKIE}=${cookie}`;
    if (method !== 'GET') headers['content-type'] = 'application/json';
    const res = await app.request(`http://localhost/api${path}`, { method, headers, body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined });
    const token = new RegExp(`${COOKIE}=([^;]*)`).exec(res.headers.get('set-cookie') ?? '')?.[1];
    const isJson = res.headers.get('content-type')?.includes('json');
    return { status: res.status, json: (isJson ? await res.json() : null) as Record<string, unknown> & Array<Record<string, unknown>>, res, token };
  };
  const as = async (who: keyof typeof LOGIN) => (await call('POST', '/auth/login', undefined, { email: LOGIN[who][0], password: LOGIN[who][1] })).token!;
  return { call, as, files: mem.files };
}

const COURSE = 'c_bg1_01';

describe('fotos del ocular', () => {
  it('el docente sube una foto por muestra y objetivo; el estudiante del curso la ve y descarga el archivo', async () => {
    const p = platform();
    const laura = await p.as('laura');
    const up = await p.call('PUT', `/teacher/courses/${COURSE}/photos/b01/elodea/40`, laura, photo());
    expect(up.status).toBe(200);
    expect(up.json).toMatchObject({ assetId: 'elodea', objective: 40, source: 'course', width: 1200, height: 900 });
    expect(p.files.size).toBe(1);

    const valeria = await p.as('valeria');
    const list = await p.call('GET', '/photos/b01', valeria);
    expect(list.status).toBe(200);
    expect(list.json).toHaveLength(1);
    const file = await p.call('GET', String(list.json[0].url).replace('/api', ''), valeria);
    expect(file.status).toBe(200);
    expect(file.res.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await file.res.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it('las fotos del curso tienen prioridad y las generales cubren lo que falta', async () => {
    const p = platform();
    const admin = await p.as('admin');
    expect((await p.call('PUT', '/admin/photos/b01/elodea/40', admin, photo(2))).status).toBe(200);
    expect((await p.call('PUT', '/admin/photos/b01/onion/10', admin, photo(3))).status).toBe(200);
    const laura = await p.as('laura');
    await p.call('PUT', `/teacher/courses/${COURSE}/photos/b01/elodea/40`, laura, photo(4));
    const list = (await p.call('GET', '/photos/b01', await p.as('valeria'))).json;
    const by = Object.fromEntries(list.map((x) => [`${x.assetId}:${x.objective}`, x.source]));
    expect(by).toEqual({ 'elodea:40': 'course', 'onion:10': 'general' });
    // El panel del docente las muestra por separado.
    const panel = (await p.call('GET', `/teacher/courses/${COURSE}/photos/b01`, laura)).json as unknown as { course: unknown[]; general: unknown[] };
    expect(panel.course).toHaveLength(1);
    expect(panel.general).toHaveLength(2);
  });

  it('subir otra foto al mismo espacio la reemplaza y borra el archivo anterior; borrar la quita', async () => {
    const p = platform();
    const laura = await p.as('laura');
    const a = (await p.call('PUT', `/teacher/courses/${COURSE}/photos/b02/tomato/10`, laura, photo(5))).json;
    const b = (await p.call('PUT', `/teacher/courses/${COURSE}/photos/b02/tomato/10`, laura, photo(6))).json;
    expect(a.id).not.toBe(b.id);
    expect(p.files.size).toBe(1);
    expect((await p.call('GET', `/photos/file/${a.id}`, laura)).status).toBe(404);
    expect((await p.call('DELETE', `/teacher/courses/${COURSE}/photos/b02/tomato/10`, laura)).status).toBe(200);
    expect(p.files.size).toBe(0);
    expect((await p.call('GET', `/teacher/courses/${COURSE}/photos/b02`, laura)).json).toMatchObject({ course: [] });
  });

  it('nadie fuera del curso ve ni sube sus fotos', async () => {
    const p = platform();
    const laura = await p.as('laura');
    const up = (await p.call('PUT', `/teacher/courses/${COURSE}/photos/b01/onion/4`, laura, photo())).json;
    const carlos = await p.as('carlos');
    expect((await p.call('PUT', `/teacher/courses/${COURSE}/photos/b01/onion/4`, carlos, photo())).json.error).toBe('NOT_YOUR_COURSE');
    expect((await p.call('GET', `/photos/b01?course=${COURSE}`, carlos)).status).toBe(403);
    const andres = await p.as('andres');
    expect((await p.call('GET', `/photos/file/${up.id}`, andres)).status).toBe(403);
    expect((await p.call('GET', '/photos/b01', andres)).json.error).toBe('LAB_NOT_ASSIGNED');
    expect((await p.call('PUT', '/admin/photos/b01/onion/4', laura, photo())).status).toBe(403);
    expect((await p.call('GET', `/photos/file/${up.id}`)).status).toBe(401);
  });

  it('valida el espacio, el formato y el tamaño', async () => {
    const p = platform();
    const laura = await p.as('laura');
    const put = (path: string, b: unknown) => p.call('PUT', `/teacher/courses/${COURSE}/photos/${path}`, laura, b);
    expect((await put('p3/elodea/40', photo())).json.error).toBe('NO_PHOTOS_FOR_LAB');
    expect((await put('b01/tomato/40', photo())).json.error).toBe('INVALID_PHOTO_SLOT');
    expect((await put('b01/elodea/20', photo())).json.error).toBe('INVALID_PHOTO_SLOT');
    expect((await put('b01/elodea/40', { ...photo(), contentType: 'image/gif' })).json.error).toBe('INVALID_PHOTO');
    // Dice ser PNG pero el contenido es JPEG.
    expect((await put('b01/elodea/40', { ...photo(), contentType: 'image/png' })).json.error).toBe('INVALID_PHOTO');
    expect((await put('b01/elodea/40', { ...photo(), width: 10 })).json.error).toBe('INVALID_PHOTO');
    expect((await put('b01/elodea/40', { ...photo(), dataB64: jpeg(1, 1_600_000) })).status).toBe(413);
    expect(p.files.size).toBe(0);
  });

  it('sin almacén configurado las fotos responden 503 y el resto de la plataforma sigue', async () => {
    const p = platform(undefined, false);
    const laura = await p.as('laura');
    expect((await p.call('PUT', `/teacher/courses/${COURSE}/photos/b01/elodea/40`, laura, photo())).json.error).toBe('PHOTOS_NOT_CONFIGURED');
    expect((await p.call('GET', '/photos/b01', laura)).status).toBe(200);
  });
});
