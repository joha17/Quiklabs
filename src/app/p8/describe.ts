/**
 * Nombres y descripciones accesibles de la Práctica 8 (§15): lo OBSERVABLE de cada objeto (volumen en palabras,
 * capas, sólido, turbidez, tapa, temperatura al tacto, estado de los equipos). Nunca revela composición, conversión ni
 * pureza no medidas; en Evaluación tampoco da valores exactos (§15).
 */
import type { P08World } from '../../simulation/organic-world/types';
import { phasesOf, pressureKPa, vesselMl } from '../../simulation/organic-world/world';
import { liquidMl, massG } from '../../simulation/organic-chemistry/species';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const has = (k: string) => t(k) !== k;

export function p08NameOf(w: P08World, id: string): string {
  if (has(`p8.obj.${id}`)) return t(`p8.obj.${id}`);
  const o = w.objects[id];
  return o ? t(`p8.kind.${o.kind}`) : id;
}

export function p08NameTag(w: P08World, id: string): string {
  if (has(`p8.tag.${id}`)) return t(`p8.tag.${id}`);
  return p08NameOf(w, id);
}

/** Volumen en palabras: aproximado en práctica; en evaluación solo «poco / mitad / casi lleno». */
export function volumeWords(ml: number, capacity: number, mode: string): string {
  if (ml < 0.02) return t('p8.desc.empty');
  if (mode === 'EVALUATION') return ml / capacity < 0.25 ? t('p8.desc.little') : ml / capacity < 0.75 ? t('p8.desc.half') : t('p8.desc.full');
  return t('p8.desc.ml', { ml: fmt(ml, ml < 10 ? 1 : 0) });
}

export function describeObject(w: P08World, id: string, mode: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const v = w.vessels[id];
  if (v) {
    const parts: string[] = [];
    if (v.capped) parts.push(t('p8.desc.capped'));
    const ml = vesselMl(v);
    if (ml >= 0.02 || massG(v.solid) < 0.001) parts.push(volumeWords(ml, v.capacityMl, mode));
    const ph = phasesOf(v);
    if (ph.twoPhases && liquidMl(ph.top) > 0.05) parts.push(t(ph.bottomIsOrganic ? 'p8.desc.twoPhasesOrgBottom' : 'p8.desc.twoPhases'));
    if (massG(v.solid) > 0.003) parts.push(t(o.kind === 'jar' || o.kind === 'watchGlass' ? 'p8.desc.solidContent' : 'p8.desc.crystals'));
    if (v.emulsion01 > 0.3) parts.push(t('p8.desc.emulsion'));
    if (v.tempC > 45) parts.push(t('p8.desc.hot'));
    else if (v.tempC < 10) parts.push(t('p8.desc.cold'));
    if (v.stir01 > 0) parts.push(t('p8.desc.stirring'));
    if (v.stoppered) parts.push(t('p8.desc.stoppered'));
    if ((v.valve01 ?? 0) > 0.05) parts.push(t('p8.desc.valveOpen'));
    if (id === 'sf' && pressureKPa(w) > 2) parts.push(t('p8.desc.pressure'));
    if (massG(v.ext) > 0.005) parts.push(t('p8.desc.wetOutside'));
    return parts.join(' · ');
  }
  switch (o.kind) {
    case 'balance': {
      const b = w.balance;
      if (!b.powered) return t('p8.desc.off');
      return [b.stable ? t('p8.desc.stable') : t('p8.desc.unstable'), b.panIds.length ? t('p8.desc.onPan', { o: b.panIds.map((x) => p08NameOf(w, x)).join(', ') }) : t('p8.desc.panEmpty')].join(' · ');
    }
    case 'plate': {
      const pl = w.plate;
      return [pl.on ? t('p8.desc.plateOn', { c: Math.round(pl.setpointC) }) : t('p8.desc.off'), pl.stir01 > 0 ? t('p8.desc.stirLevel', { s: Math.round(pl.stir01 * 100) }) : ''].filter(Boolean).join(' · ');
    }
    case 'bath':
      return w.plate.bathTempC > 45 ? t('p8.desc.bathHot') : t('p8.desc.bathWarm');
    case 'condenser':
      return [o.support === 'rf' ? t('p8.desc.onFlask') : t('p8.desc.onBench'), w.reflux.waterOn ? t('p8.desc.waterOn') : t('p8.desc.waterOff')].join(' · ');
    case 'thermometer':
      return [w.thermometer.inLiquid ? t('p8.desc.inLiquid', { o: p08NameOf(w, o.support) }) : t('p8.desc.inAir'), mode === 'EVALUATION' ? '' : t('p8.desc.shows', { c: fmt(w.thermometer.shownC) })].filter(Boolean).join(' · ');
    case 'buchner':
      return [w.filtration.paperId ? t('p8.desc.paperIn', { o: p08NameOf(w, w.filtration.paperId) }) : t('p8.desc.noPaper'), w.filtration.sealed ? t('p8.desc.sealed') : t('p8.desc.notSealed')].join(' · ');
    case 'vacuumPump':
      return w.filtration.vacuum ? t('p8.desc.vacuumOn') : t('p8.desc.off');
    case 'oven':
      return w.oven.on ? t('p8.desc.ovenOn', { c: w.params.ovenTempC }) : t('p8.desc.off');
    case 'fractionModule': {
      const fr = w.fractions;
      return [t('p8.desc.cut', { lo: Math.round(fr.cutLoC), hi: Math.round(fr.cutHiC) }), fr.running ? t('p8.desc.running', { p: Math.round(fr.progress01 * 100) }) : ''].filter(Boolean).join(' · ');
    }
    case 'analyzer':
    case 'mpApparatus':
      return w.analyzer.readyAt !== null ? t('p8.desc.analyzing') : massG(w.analyzer.sample) > 0 ? t('p8.desc.sampleLoaded') : t('p8.desc.noSample');
    case 'dropper': {
      const d = w.droppers[id];
      const ml = liquidMl(d.content);
      return [volumeWords(ml, 2, mode), w.vessels[o.support] ? t('p8.desc.tipIn', { o: p08NameOf(w, o.support) }) : ''].filter(Boolean).join(' · ');
    }
    case 'spatula':
      return [massG(w.spatula.load) > 0.001 ? t('p8.desc.loaded') : t('p8.desc.emptyTool'), massG(w.spatula.residue) > 1e-5 ? t('p8.desc.residue') : '', w.vessels[o.support] ? t('p8.desc.tipIn', { o: p08NameOf(w, o.support) }) : ''].filter(Boolean).join(' · ');
    case 'burner':
      return t('p8.desc.burner');
    default:
      return '';
  }
}
