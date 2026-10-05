/**
 * Nombres y descripciones accesibles de la Práctica 4 (§26): «precipitado blanco suspendido; sedimento
 * aumentando», posición de válvulas en palabras, temperatura en categorías, estado de la reacción y del metal.
 * En evaluación no se muestra el volumen exacto (solo graduaciones, §16.1). No completa observaciones.
 */
import type { P4World } from '../../simulation/reaction-world/types';
import { liquidMl, metalCuMg, avgOxide, vesselAppearance, speciesMol } from '../../simulation/reaction-world/world';
import { contextFor } from '../../practices/practice-04';
import { DROPPER_BOTTLES, REAGENTS } from '../../practices/practice-04/definition';
import { colorWord } from '../../practices/practice-04/expected-results';
import { describeFlame, valveWords } from '../p3/describe';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

function reagentLabel(id: string | null, w: P4World): string {
  if (!id) return '';
  if (id === 'naohX') return `NaOH ${fmt(w.params.naohSingle ?? 0.1, 2)} M`;
  if (id === 'pheno') return t('p4.reagent.pheno');
  const r = REAGENTS[id];
  return r ? `${r.formula}${r.conc && r.conc !== 'indicador' ? ` ${r.conc}` : ''}` : id;
}

export function p4NameOf(w: P4World, id: string): string {
  if (id === 'hose') return t('p3.obj.hose');
  const g = w.gas.objects[id];
  if (g) return t(`p3.obj.${g.kind}`);
  const o = w.objects[id];
  if (!o) return id;
  const v = w.vessels[id];
  switch (o.kind) {
    case 'bottle':
      return t('p4.obj.bottle', { r: reagentLabel(v?.reagent ?? null, w) });
    case 'dropperBottle':
      return t('p4.obj.dropperBottle', { r: reagentLabel(v?.reagent ?? null, w) });
    case 'dropper': {
      const home = Object.entries(DROPPER_BOTTLES).find(([, d]) => d.dropper === id);
      return t('p4.obj.dropper', { r: reagentLabel(home ? w.vessels[home[0]]?.reagent ?? null : null, w) });
    }
    case 'tube':
      return t('p4.obj.tube', { n: id.replace('tube', '') }) + (v?.label ? ` · ${t(`p4.label.${v.label}`)}` : '');
    case 'cylinder':
      return t(v?.kind === 'CYL25' ? 'p4.obj.cyl25' : 'p4.obj.cyl10');
    case 'waste':
      return t(`p4.obj.${id}`);
    case 'mgRibbon':
      return t('p4.obj.mgRibbon') + (id !== 'mg1' ? ` (${id.replace('mg', '')})` : '');
    default:
      return t(`p4.obj.${o.kind}`);
  }
}

/** Texto corto de la etiqueta flotante. */
export function p4NameTag(w: P4World, id: string): string {
  const o = w.objects[id];
  const v = w.vessels[id];
  if (o?.kind === 'tube') return `${t('p4.tag.tube')} ${id.replace('tube', '')}${v?.label ? ` · ${t(`p4.label.${v.label}`)}` : ''}`;
  if (o?.kind === 'bottle' || o?.kind === 'dropperBottle') return reagentLabel(v?.reagent ?? null, w);
  if (o?.kind === 'dropper') return t('p4.tag.dropper');
  if (o && t(`p4.tag.${o.kind}`) !== `p4.tag.${o.kind}`) return t(`p4.tag.${o.kind}`);
  return p4NameOf(w, id);
}

export function tempWords4(c: number): string {
  if (c < 40) return t('p3.temp.cool');
  if (c < 60) return t('p3.temp.warm');
  if (c < 200) return t('p3.temp.hot');
  return t('p3.temp.veryHot');
}

/** Volumen: aproximado en práctica/guiado; en evaluación solo en palabras (se lee en las graduaciones). */
export function volumeWords(ml: number, mode: string): string {
  if (ml < 0.01) return t('p4.desc.empty');
  if (mode === 'EVALUATION') return ml < 0.4 ? t('p4.desc.film') : t('p4.desc.hasLiquid');
  if (ml < 0.4) return t('p4.desc.film');
  return t('p4.desc.ml', { ml: fmt(ml, ml < 10 ? 2 : 1) });
}

/** §26 — apariencia en palabras: color, turbidez, sedimento, burbujas. */
export function appearanceWords(w: P4World, id: string): string {
  const ctx = contextFor(w);
  const a = vesselAppearance(w, ctx, id);
  if (!a) return '';
  const parts: string[] = [];
  if (a.liquidMl > 0.05) {
    parts.push(t(`p4.color.${colorWord(a.bulkRgb, a.pinkBulk)}`));
    if (a.plumeFrac > 0.02) {
      const pc = colorWord(a.plumeRgb, Math.max(0, 1 - a.plumeRgb[1] / Math.max(0.05, a.plumeRgb[0])));
      if (pc !== colorWord(a.bulkRgb, a.pinkBulk)) parts.push(t('p4.desc.swirl', { c: t(`p4.color.${pc}`) }));
    }
  }
  if (a.turbidity > 0.05) parts.push(t('p4.desc.suspension', { c: t(`p4.solid.${solidWord(a.suspendedRgb)}`), level: t(a.turbidity > 0.6 ? 'p4.desc.dense' : a.turbidity > 0.2 ? 'p4.desc.moderate' : 'p4.desc.slight') }));
  if (a.localizedCloud > 0.15) parts.push(t('p4.desc.localCloud'));
  if (a.sedimentMl > 0.003) parts.push(t('p4.desc.sediment', { c: t(`p4.solid.${solidWord(a.sedimentRgb)}`) }));
  if (a.bubbling) parts.push(t('p4.desc.bubbles'));
  return parts.join(' · ');
}

export function solidWord(rgb: [number, number, number]): string {
  const [r, g, b] = rgb;
  if (r > 0.85 && g > 0.85 && b > 0.85) return 'blanco';
  if (r > 0.5 && g < 0.4 && b < 0.3) return r > 0.6 && g > 0.28 ? 'cobrizo' : 'marron';
  if (b > r && b > 0.6) return 'azul';
  if (g > r && g > b) return 'verdoso';
  if (r < 0.8 && Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05) return 'gris';
  return 'marron';
}

export function describeObject(w: P4World, id: string, mode: string): string {
  if (id === 'hose') {
    const parts = [w.gas.burner.hoseConnected ? t('p3.desc.hoseConnected') : t('p3.desc.hoseLoose')];
    if (w.gas.hose.crackFound) parts.push(t('p3.desc.hoseCrack'));
    return parts.join(' · ');
  }
  const b = w.gas.burner;
  if (id === 'burner') return `${describeFlame(w.gas)} · ${t('p3.desc.valves', { needle: valveWords(b.needleGasValve), air: valveWords(b.airCollar) })} · ${tempWords4(b.bodyTemperatureC)}`;
  if (id === 'gas_tap') return t('p3.desc.tap', { v: valveWords(b.tableGasValve) }) + (b.supplyOn ? '' : ` · ${t('p3.desc.supplyCut')}`);
  if (id === 'lighter') return w.gas.lighter.sparking ? t('p3.desc.sparking') : '';
  if (id === 'extractor') return w.gas.room.extractionOn ? t('p3.desc.extractionOn') : t('p3.desc.extractionOff');
  if (id === 'co_detector') return t('p3.desc.detector', { co: Math.round(w.gas.room.coPpm), gas: Math.round(w.gas.room.gasAccumMl) });
  const o = w.objects[id];
  if (!o) return '';
  const v = w.vessels[id];
  if (v) {
    if (v.broken) return t('p4.desc.broken');
    if (o.support.startsWith('disposed:')) return t('p4.desc.disposed', { to: t(`p4.obj.${o.support.slice(9)}`) });
    const parts = [volumeWords(liquidMl(v), mode)];
    const app = appearanceWords(w, id);
    if (app) parts.push(app);
    if (v.kind !== 'BOTTLE' && v.kind !== 'DROPPER_BOTTLE' && v.kind !== 'WASTE' && v.kind !== 'WASH_BOTTLE' && v.kind !== 'DROPPER') {
      parts.push(tempWords4(Math.max(v.temperatureC, v.kind === 'CAPSULE' ? Math.min(v.residueTempC, 400) : 0)));
      if (v.additions.length > 1 || v.rx !== 'UNMIXED') parts.push(t(`p4.rx.${v.rx}`));
    }
    if (v.contaminated && v.kind !== 'TUBE') parts.push(t('p4.desc.contaminated'));
    if (o.kind === 'dropperBottle' && w.evidence[`open:${id}`]) parts.push(t('p4.desc.open'));
    if (v.phChecked !== null) parts.push(t('p4.desc.phPaper', { ph: v.phChecked }));
    if (id === 'capsule' && speciesMol(v, 'MgO(s)') + speciesMol(v, 'Mg(OH)2(s)') > 1e-6 && liquidMl(v) < 0.1) parts.push(t('p4.desc.whiteResidue'));
    return parts.filter(Boolean).join(' · ');
  }
  const m = w.metals[id];
  if (m) {
    const ox = avgOxide(m);
    const cu = metalCuMg(m);
    const parts = [m.sandStrokes > 0 ? t('p4.desc.sanded') : ox > 0.4 ? t('p4.desc.rusty') : t('p4.desc.shiny')];
    if (cu > 0.3) parts.push(cu > 8 ? t('p4.desc.copperCoat') : t('p4.desc.copperSpots'));
    parts.push(t(`p4.metal.${m.state}`));
    return parts.join(' · ');
  }
  const r = w.ribbons[id];
  if (r) return `${t(`p4.mg.${r.phase}`)}${r.burnFrac > 0.02 && r.burnFrac < 0.98 ? ` · ${Math.round(r.burnFrac * 100)} %` : ''}`;
  switch (o.kind) {
    case 'probe':
      return w.probe.vesselId ? t('p4.desc.probeIn', { c: fmt(w.probe.readingC), v: p4NameOf(w, w.probe.vesselId) }) + (w.probe.touchingBottom ? ` · ${t('p4.desc.probeBottom')}` : '') : t('p4.desc.probeAir', { c: fmt(w.probe.readingC) });
    case 'rod':
      return w.rod.broken ? t('p4.desc.broken') : w.rod.vesselId ? t('p4.desc.rodIn', { v: p4NameOf(w, w.rod.vesselId) }) : '';
    case 'tubeTongs':
    case 'crucibleTongs': {
      const h = w.tongs[id]?.holding;
      return h ? t('p4.desc.tongsHold', { o: p4NameOf(w, h) }) : t('p4.desc.tongsEmpty');
    }
    case 'shield':
      return o.support === 'stand' ? t('p4.desc.shieldPlaced', { p: Math.round(w.shield.alignment * 100) }) : t('p4.desc.shieldIdle');
    case 'towel':
      return t('p4.desc.towel', { n: w.spills.filter((s) => !s.cleaned).length });
    default:
      return '';
  }
}
