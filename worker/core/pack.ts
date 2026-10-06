/**
 * JSON comprimido (gzip) en base64 para enviar y guardar el estado entregado y la cinta del intento. Usa
 * `CompressionStream`, disponible en los navegadores, en Cloudflare Workers y en Node.
 */
const B64_CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += B64_CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, maxBytes = Infinity): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const reader = source.pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>).getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > maxBytes) {
      await reader.cancel();
      throw new Error('TOO_LARGE');
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function packJson(value: unknown): Promise<string> {
  return toBase64(await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream('gzip')));
}

/** `maxBytes` limita el tamaño descomprimido (protege al servidor de una «bomba» gzip). */
export async function unpackJson<T>(b64: string, maxBytes = Infinity): Promise<T> {
  const raw = await pipe(fromBase64(b64), new DecompressionStream('gzip'), maxBytes);
  return JSON.parse(new TextDecoder().decode(raw)) as T;
}
