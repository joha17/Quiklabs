/**
 * Resultados esperados de B03 calculados con las lecturas PROPIAS del intento (§13.2): qué lectura importó el
 * estudiante, de qué instrumento y recipiente, qué tubos son trazables, qué capturas de Elodea valen y con qué medio.
 * Nunca se compara contra un resultado «ideal» del material: el valor de referencia sale de los datos registrados.
 */
import type { InstrumentReading, PermWorld } from '../../simulation/perm-world/types';
import { R_KPA_L } from '../../simulation/membrane-transport/model';
import { observation, validObservations } from '../practice-b01/expected-results';
import { parseNum, type B03Notebook } from './notebook';

export { observation, validObservations };

export const reading = (w: PermWorld, id: string | null | undefined): InstrumentReading | null => (id ? w.perm.readings[id] ?? null : null);

/** Tubo con ese rótulo, con muestra del lado correcto de la diálisis tomada tras la incubación, reactivo y lectura. */
export function tubeTraceable(w: PermWorld, label: string): boolean {
  const entry = Object.entries(w.perm.tubes).find(([, t]) => t.label === label);
  if (!entry) return false;
  const t = entry[1];
  const side = label.startsWith('A-') ? 'A' : 'B';
  const fromOk = t.sources.length > 0 && t.sources.every((s) => s === `c2:${side}*`);
  const reagentOk = label.endsWith('Biuret') ? t.gotBiuret && !t.gotSilver : t.gotSilver && !t.gotBiuret;
  return fromOk && reagentOk && t.readAt !== null;
}

/** Control leído con su reactivo (blanco con cualquiera de los dos). */
export function controlRead(w: PermWorld, label: 'blank' | 'pos-protein' | 'pos-chloride'): boolean {
  const entry = Object.entries(w.perm.tubes).find(([, t]) => t.label === label);
  if (!entry) return false;
  const t = entry[1];
  const reagent = label === 'pos-protein' ? t.gotBiuret : label === 'pos-chloride' ? t.gotSilver : t.gotBiuret || t.gotSilver;
  return t.sampleMl > 0 && reagent && t.readAt !== null;
}

export const ASSAY_LABELS = ['A-Biuret', 'A-Ag', 'B-Biuret', 'B-Ag'] as const;

/** Capturas válidas de Elodea por medio (acreditan a ≥ 10X) y medios cuyo recurso falta (diferidos sin descuento). */
export function elodeaByMedium(w: PermWorld) {
  const out: Record<string, string[]> = {};
  for (const o of validObservations(w)) {
    const c = w.perm.elodeaCaptures[o.id];
    if (!c || (o.objectiveX ?? 0) < 10) continue;
    (out[c.medium] ??= []).push(o.id);
  }
  return out;
}
export const MEDIA = ['water', 'nacl-0.9', 'nacl-5'] as const;

/** Medios ya acreditados o diferidos por una foto pendiente (PERMRES). */
export function mediaDone(w: PermWorld): string[] {
  const by = elodeaByMedium(w);
  const deferred = w.perm.incidents.length > 0 || w.cell.incidents.length > 0;
  return MEDIA.filter((m) => (by[m]?.length ?? 0) > 0 || (deferred && Object.values(w.perm.elodeaCaptures).some((c) => c.medium === m)));
}

/** Volúmenes de la ósmosis importados por el estudiante (con las lecturas del propio intento). */
export function osmosisReadings(w: PermWorld, nb: B03Notebook) {
  const o = nb.osmosis;
  const r = { a0: reading(w, o.vA0), b0: reading(w, o.vB0), af: reading(w, o.vAf), bf: reading(w, o.vBf) };
  const valid = (x: InstrumentReading | null, side: 'A' | 'B') => !!x && x.instrument === 'scale' && x.targetId === `c3:${side}`;
  const ok = valid(r.a0, 'A') && valid(r.b0, 'B') && valid(r.af, 'A') && valid(r.bf, 'B') && r.af!.t > r.a0!.t && r.bf!.t > r.b0!.t;
  return { ...r, ok };
}

/** ΔV, duración y flujo que corresponden a las lecturas importadas (la referencia para corregir el cálculo). */
export function osmosisExpected(w: PermWorld, nb: B03Notebook) {
  const r = osmosisReadings(w, nb);
  if (!r.ok) return null;
  const dVA = r.af!.value - r.a0!.value;
  const dVB = r.bf!.value - r.b0!.value;
  const durS = Math.max(r.af!.t, r.bf!.t) - Math.min(r.a0!.t, r.b0!.t);
  return { dVA, dVB, durS, durMin: durS / 60, fluxMlS: Math.abs(dVB) / Math.max(1, durS), fluxMlMin: (Math.abs(dVB) / Math.max(1, durS)) * 60 };
}

/** π = R·T·ΔC con la T leída (K) y la ΔC que declara el estudiante; también la versión errónea con °C (PERM63). */
export function piExpected(w: PermWorld, nb: B03Notebook) {
  const t = reading(w, nb.osmosis.tempReadingId);
  const dc = parseNum(nb.osmosis.deltaOsm);
  if (!t || t.instrument !== 'thermo' || !Number.isFinite(dc)) return null;
  return { kelvin: R_KPA_L * (t.value + 273.15) * dc, celsius: R_KPA_L * t.value * dc };
}

/** ¿Hubo fuga registrada en la cámara de difusión? */
export const diffusionLeaked = (w: PermWorld) => w.perm.cells.c1.leakOutMl + w.perm.cells.c1.leakCrossMl > 0.2 || !!w.evidence['err:PERM02'] || w.perm.cells.c1.crossContaminated;
