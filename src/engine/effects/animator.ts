/**
 * Animaciones de acciones (visuales). Desplazan/giran objetos SOLO en el dibujo (offsets),
 * y ejecutan el comando del dominio en el instante físico correcto (p. ej., cuando el polvo cae).
 * Nunca modifican masa ni composición por sí mismas (§3.3).
 */
export interface VisualOffset {
  dx: number;
  dy: number;
  dz: number;
  rot: number;
  /** Compresión (piseta, perilla del gotero): 1 = normal. */
  squeeze: number;
}

export interface FloatLabel {
  text: string;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  color: number;
}

interface Track {
  id: string;
  t: number;
  dur: number;
  pose: (t: number) => Partial<VisualOffset>;
  events: Array<{ at: number; fn: () => void; done: boolean }>;
  onEnd?: () => void;
}

export const ZERO: VisualOffset = { dx: 0, dy: 0, dz: 0, rot: 0, squeeze: 1 };

export interface Ghost {
  kind: 'hand' | 'face';
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
}

export class Animator {
  private tracks: Track[] = [];
  labels: FloatLabel[] = [];
  ghosts: Ghost[] = [];
  reduced = false;

  ghost(kind: Ghost['kind'], x: number, y: number, z: number, life: number) {
    this.ghosts.push({ kind, x, y, z, age: 0, life: this.reduced ? Math.min(life, 0.4) : life });
  }

  idle(): boolean {
    return this.tracks.length === 0;
  }

  busy(id: string): boolean {
    return this.tracks.some((t) => t.id === id);
  }

  play(id: string, dur: number, pose: Track['pose'], events: Array<{ at: number; fn: () => void }> = [], onEnd?: () => void) {
    // Movimiento reducido: la acción ocurre igual, con duración mínima.
    const d = this.reduced ? Math.min(dur, 0.15) : dur;
    this.tracks.push({ id, t: 0, dur: d, pose, events: events.map((e) => ({ ...e, at: e.at * (d / dur), done: false })), onEnd });
  }

  label(text: string, x: number, y: number, z: number, color = 0xffffff) {
    this.labels.push({ text, x, y, z, age: 0, life: 1.6, color });
    if (this.labels.length > 12) this.labels.shift();
  }

  offset(id: string): VisualOffset | null {
    const tr = this.tracks.find((t) => t.id === id);
    if (!tr) return null;
    const u = Math.min(1, tr.t / tr.dur);
    return { ...ZERO, ...tr.pose(u) };
  }

  update(dt: number) {
    for (const tr of this.tracks) {
      tr.t += dt;
      const u = tr.t / tr.dur;
      for (const e of tr.events) {
        if (!e.done && u >= e.at) {
          e.done = true;
          e.fn();
        }
      }
    }
    const ended = this.tracks.filter((t) => t.t >= t.dur);
    this.tracks = this.tracks.filter((t) => t.t < t.dur);
    for (const t of ended) {
      for (const e of t.events) if (!e.done) e.fn();
      t.onEnd?.();
    }
    for (const l of this.labels) l.age += dt;
    this.labels = this.labels.filter((l) => l.age < l.life);
    for (const gh of this.ghosts) gh.age += dt;
    this.ghosts = this.ghosts.filter((gh) => gh.age < gh.life);
  }
}

/** Curvas de ayuda. */
export const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
export const bell = (u: number, a: number, b: number) => (u <= a ? ease(u / a) : u >= b ? ease((1 - u) / (1 - b)) : 1);
