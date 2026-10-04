/**
 * Nombres y descripciones accesibles de la Práctica 3 (§24): narración del estado («llama azul estable, 10 cm,
 * dos conos»), posición de válvulas en palabras, temperatura en categorías y fase del asa.
 * No revela la identidad de la incógnita ni completa observaciones.
 */
import type { FlameWorld } from '../../simulation/flame-world/types';
import { gasFlows, isLit, localContact, loopResidueMg } from '../../simulation/flame-world/world';
import { CTX3 } from '../../practices/practice-03';
import { t } from '../i18n';

export function p3NameOf(w: FlameWorld, id: string): string {
  if (id === 'hose') return t('p3.obj.hose');
  const o = w.objects[id];
  if (!o) return id;
  if (o.kind === 'tube') return t('p3.obj.tube', { label: w.solutions[id]?.label ?? id });
  if (o.kind === 'loop') {
    const l = w.loops[id];
    const sol = l?.assignedSolutionId ? w.solutions[l.assignedSolutionId] : null;
    return sol ? t('p3.obj.loopFor', { label: sol.label }) + (l?.spare ? ' (2)' : '') : t('p3.obj.loopShared');
  }
  if (o.kind === 'atomizer') return t('p3.obj.atomizer', { label: w.solutions[w.atomizers[id]?.solutionId]?.label ?? '' });
  return t(`p3.obj.${o.kind}`);
}

/** Texto corto de la etiqueta flotante. */
export function p3NameTag(w: FlameWorld, id: string): string {
  const o = w.objects[id];
  if (!o) return p3NameOf(w, id);
  if (o.kind === 'tube') return w.solutions[id]?.label ?? id;
  if (o.kind === 'loop') {
    const l = w.loops[id];
    return l?.assignedSolutionId ? (w.solutions[l.assignedSolutionId]?.label ?? '').replace('Incógnita N.º ', 'Inc. ') : 'Asa';
  }
  if (o.kind === 'atomizer') return (w.solutions[w.atomizers[id]?.solutionId]?.label ?? '');
  return p3NameOf(w, id);
}

/** Posición física de una válvula en palabras (§13.2: en evaluación no se muestra el porcentaje). */
export function valveWords(v: number): string {
  if (v <= 0.02) return t('p3.valve.closed');
  if (v < 0.2) return t('p3.valve.almostClosed');
  if (v < 0.4) return t('p3.valve.quarter');
  if (v < 0.65) return t('p3.valve.half');
  if (v < 0.9) return t('p3.valve.mostly');
  return t('p3.valve.open');
}

export function tempWords(c: number): string {
  if (c < 40) return t('p3.temp.cool');
  if (c < 60) return t('p3.temp.warm');
  if (c < 200) return t('p3.temp.hot');
  return t('p3.temp.veryHot');
}

/** §24 — narración accesible del estado de la llama. */
export function describeFlame(w: FlameWorld): string {
  const b = w.burner;
  const f = b.flame;
  if (b.flameState === 'FLASHBACK') return t('p3.flame.flashback');
  if (!isLit(w)) {
    const fl = gasFlows(w);
    if (fl.burner + fl.leak > 0.005) return t('p3.flame.gasNoFlame');
    return t('p3.flame.off');
  }
  const color = t(`p3.flame.state.${b.flameState}`);
  const cones = f.blueness > 0.85 ? t('p3.flame.twoCones') : f.blueness > 0.3 ? t('p3.flame.coneForming') : t('p3.flame.noCones');
  const stab = f.stability > 0.75 ? t('p3.flame.stable') : t('p3.flame.unstable');
  return t('p3.flame.lit', { color, h: f.heightCm.toFixed(0), cones, stab });
}

export function describeObject(w: FlameWorld, id: string): string {
  const b = w.burner;
  if (id === 'hose') {
    const parts = [b.hoseConnected ? t('p3.desc.hoseConnected') : t('p3.desc.hoseLoose')];
    if (w.hose.crackFound) parts.push(t('p3.desc.hoseCrack'));
    if (w.hose.temperatureC > 50) parts.push(t('p3.desc.hoseHot'));
    return parts.join(' · ');
  }
  const o = w.objects[id];
  if (!o) return '';
  switch (o.kind) {
    case 'burner':
      return `${describeFlame(w)} · ${t('p3.desc.valves', { needle: valveWords(b.needleGasValve), air: valveWords(b.airCollar) })} · ${tempWords(b.bodyTemperatureC)}`;
    case 'gasTap':
      return t('p3.desc.tap', { v: valveWords(b.tableGasValve) }) + (b.supplyOn ? '' : ` · ${t('p3.desc.supplyCut')}`);
    case 'capsule': {
      const c = w.capsule;
      const soot = c.sootCoverage > 0.35 ? t('p3.desc.sootBlack') : c.sootCoverage > 0.05 ? t('p3.desc.sootGray') : t('p3.desc.sootNone');
      return `${tempWords(o.temperatureC)} · ${soot}${c.clampedBy ? ` · ${t('p3.desc.inTongs')}` : ''}`;
    }
    case 'loop': {
      const l = w.loops[id];
      if (!l) return '';
      const inFlame = localContact(w, CTX3, o.pose) > 0.2;
      return [t(`p3.phase.${l.phase}`), tempWords(l.temperatureC), inFlame ? t('p3.desc.inFlame') : '', loopResidueMg(l) > 2e-4 && l.phase.startsWith('COOL') ? t('p3.desc.residue') : ''].filter(Boolean).join(' · ');
    }
    case 'tube': {
      const s = w.solutions[id];
      if (!s) return '';
      return s.spilled ? t('p3.desc.spilled') : t('p3.desc.solution', { ml: s.volumeMl.toFixed(1).replace('.', ',') });
    }
    case 'glass':
      return w.glass.alignment > 0.6 ? t('p3.desc.glassAligned') : o.support === 'hand' ? t('p3.desc.glassHeld') : t('p3.desc.glassIdle');
    case 'lighter':
      return w.lighter.sparking ? t('p3.desc.sparking') : '';
    case 'hclVial':
      return w.hcl.open ? t('p3.desc.hclOpen') : t('p3.desc.hclClosed');
    case 'extractor':
      return w.room.extractionOn ? t('p3.desc.extractionOn') : t('p3.desc.extractionOff');
    case 'coDetector':
      return t('p3.desc.detector', { co: Math.round(w.room.coPpm), gas: Math.round(w.room.gasAccumMl) });
    default:
      return '';
  }
}
