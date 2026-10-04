/**
 * Descripciones accesibles del estado visible (§14): «vaso con 9,6 mL, 72 °C, suspensión negra».
 * Describen lo que se VE (equivalente a la imagen), nunca la respuesta de clasificación.
 */
import type { Vessel, World } from '../simulation/entities/types';
import type { SubstanceId } from '../simulation/substances/types';
import { liquidVolumeMl, mixMassG, oilVolumeMl } from '../simulation/solutions/mixture';
import { SUBSTANCES } from '../practices/practice-02/substances';
import { t } from './i18n';

export function nameOf(w: World, id: string): string {
  const k = `obj.${id}`;
  const n = t(k);
  if (n !== k) return n;
  const v = w.vessels[id];
  if (v) return t(`type.${v.type}`);
  return id;
}

/** Nombre corto para la etiqueta fija sobre el objeto; el tubo añade su rótulo («Tubo 1 · NaCl»). */
export function nameTag(w: World, id: string): string {
  const k = `tag.${id}`;
  const n = t(k);
  const base = n !== k ? n : nameOf(w, id);
  const label = w.vessels[id]?.type === 'TEST_TUBE' ? w.vessels[id].label : null;
  return label ? `${base} · ${label}` : base;
}

const colorKey = (hex: number): 'yellow' | 'black' | 'white' | 'grey' => {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const l = (r + g + b) / 3;
  if (r > 200 && g > 180 && b < 120) return 'yellow';
  if (l < 70) return 'black';
  if (l > 225) return 'white';
  return 'grey';
};
/** Color con concordancia: «sólido amarillo» / «suspensión amarilla». */
const colorWord = (hex: number, feminine = false): string => t(`${feminine ? 'colorF' : 'color'}.${colorKey(hex)}`);

function probeOrQualitative(w: World, v: Vessel): string {
  if (w.devices.probe.vesselId === v.id) return t('desc.temp', { t: v.temperatureC.toFixed(1) });
  if (v.temperatureC > 60) return ', caliente';
  if (v.temperatureC > 35) return ', tibio';
  if (v.temperatureC < 8) return ', frío';
  return '';
}

export function describeVessel(w: World, v: Vessel, instrumentRes = 0.1): string {
  const name = nameOf(w, v.id);
  if (v.integrity === 0) return `${name}: ${t('desc.broken')}`;
  const parts: string[] = [];
  const m = v.mix;
  const lv = liquidVolumeMl(m, SUBSTANCES);
  if (v.tipped) parts.push(t('desc.tipped'));
  if (v.label) parts.push(t('desc.label', { label: v.label }));
  else if (v.type === 'TEST_TUBE') parts.push(t('desc.noLabel'));
  // Sedimento por color visible
  const solids = Object.entries(m.solid) as Array<[SubstanceId, number]>;
  const sedColors = new Set<string>();
  let susp = 0;
  let suspMain: SubstanceId | null = null;
  let suspMainG = 0;
  for (const [k, g] of solids) {
    if (g < 0.002) continue;
    const s = m.suspended[k] ?? 0;
    if (s > 0.25 && SUBSTANCES[k].particle.kind === 'POWDER') {
      susp += g * s;
      if (g * s > suspMainG) {
        suspMainG = g * s;
        suspMain = k;
      }
    }
    if (s < 0.9) sedColors.add(colorWord(SUBSTANCES[k].colorHex));
  }
  if (lv > 0.005) {
    const res = instrumentRes;
    const shown = Math.round(lv / res) * res;
    parts.unshift(t('desc.liquid', { ml: shown.toFixed(res < 0.1 ? 2 : 1).replace('.', ',') }));
    if (oilVolumeMl(m, SUBSTANCES) > 0.01 && m.waterG > 0.1) parts.push(m.emulsion > 0.15 ? t('desc.drops') : t('desc.twoLayers'));
    else if (susp > 0.003 && suspMain) parts.push(t('desc.cloud', { color: colorWord(SUBSTANCES[suspMain].colorHex, true) }));
    else parts.push(t('desc.clear'));
  } else if (mixMassG(m) < 0.001) parts.unshift(t('desc.empty'));
  if (sedColors.size) parts.push(t('desc.solid', { color: [...sedColors].join(' y ') }));
  if ((m.crystals?.massG ?? 0) > 0.003) parts.push(lv > 0.01 ? t('desc.crystals') : t('desc.deposit'));
  if (m.iceG > 1) parts.push(t('desc.ice'));
  const temp = probeOrQualitative(w, v);
  return `${name}: ${parts.join(', ')}${temp}`;
}

export function describeObject(w: World, id: string): string {
  const v = w.vessels[id];
  if (v) return describeVessel(w, v, v.type === 'GRADUATED_CYLINDER' ? 0.2 : 0.1);
  const p = w.props[id];
  if (!p) return id;
  const name = nameOf(w, id);
  if (p.kind === 'hotplate') return `${name}: ${w.devices.hotplate.powerPct} %, ${t('act.plate').toLowerCase()} ${w.devices.hotplate.plateTempC > 50 ? t('act.plateHot') : t('act.plateCool')}`;
  if (p.kind === 'rod' && w.devices.rod.vesselId) return `${name}: ${t('desc.inVessel', { name: nameOf(w, w.devices.rod.vesselId) })}`;
  if (p.kind === 'probe' && w.devices.probe.vesselId) return `${name}: ${t('desc.inVessel', { name: nameOf(w, w.devices.probe.vesselId) })}`;
  return name;
}
