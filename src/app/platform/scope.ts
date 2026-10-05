/**
 * Ámbito de almacenamiento local por usuario: los intentos guardados en el navegador llevan el id de quien inició
 * sesión, así dos personas que usan el mismo equipo no ven ni continúan los intentos de la otra.
 * Se mantiene aparte de la sesión para que las prácticas no dependan de la plataforma.
 */
let userId: string | null = null;

export function setStorageScope(id: string | null) {
  userId = id;
}

export function scopedKey(base: string): string {
  return userId ? `${base}:${userId}` : base;
}
