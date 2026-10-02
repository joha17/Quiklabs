/** Tipos genéricos de evaluación por evidencia (§12). */
export interface ScoreItem {
  key: string;
  /** true = cumplido, false = no cumplido, null = no evaluable automáticamente (revisión docente). */
  ok: boolean | null;
  points: number;
  max: number;
  /** Clave i18n de la retroalimentación (consecuencia observada primero). */
  feedbackKey?: string;
  params?: Record<string, string | number>;
}

export interface ScoreComponent {
  id: string;
  weight: number;
  items: ScoreItem[];
  score: number;
}

export interface Evaluation {
  components: ScoreComponent[];
  total: number;
  needsTeacherReview: string[];
}

export function finalizeComponent(id: string, weight: number, items: ScoreItem[]): ScoreComponent {
  const max = items.reduce((s, i) => s + i.max, 0);
  const pts = items.reduce((s, i) => s + i.points, 0);
  return { id, weight, items, score: max > 0 ? pts / max : 0 };
}

export function item(key: string, ok: boolean | null, max: number, feedbackKey?: string, params?: ScoreItem['params'], partial?: number): ScoreItem {
  const points = ok === true ? max : ok === null ? max * (partial ?? 0.5) : max * (partial ?? 0);
  return { key, ok, points, max, feedbackKey: ok === true ? undefined : feedbackKey, params };
}
