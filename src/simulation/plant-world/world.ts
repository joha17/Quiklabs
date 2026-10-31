/**
 * Mundo B09: arquitectura vegetal (§5, §6). `dispatchPlant` resuelve los gestos propios (giro y rótulo externo, sujeción,
 * corte por plano, lavado, traslado del microscopio, áreas) y filtra los de B06 con las reglas de esta práctica (Wiesner con
 * protección y en la zona ventilada, láminas fijas intocables, rótulos que el manifiesto no valida); el resto es `dispatchDiv`,
 * con los catálogos anteriores traducidos a TV-NN por `params.codeMap`. `stepPlantWorld` avanza 0,05 s. Determinista.
 */
import { clamp, stableHash } from '../core/math';
import { incident } from '../cell-world/world';
import type { CellWorldExtras } from '../cell-world/world';
import { conservedDiv, createDivWorld, dispatchDiv, divOutstanding, divSummary, stepDivWorld, type DivWorldExtras } from '../div-world/world';
import type { DivCommand } from '../div-world/commands';
import { emitB, errB, flagB } from '../optical-world/events';
import type { OpticalWorldSpec } from '../optical-world/world';
import { isPrep, microscopeView, outstanding } from '../optical-world/world';
import { liquidMl } from '../specimens/mount-world';
import { assetById, circleHitsPolygon, type StructureId } from '../specimens/assets';
import { hasStain, wiesnerDeveloped } from '../specimens/stain-model';
import type { PlantCommand, PlantDispatchResult, PlantOnlyCommand } from './commands';
import { PLANT_ONLY_TYPES } from './commands';
import { EXTERNAL_REGIONS, SOURCE_REGION, areaFraction, sectionQuality } from './model';
import type { CutPlane, PlantParams, PlantState, PlantWorld, SectionRecord } from './types';

export const SC_B09 = {
  STEM_EU: 'TV-S01', STEM_MONO: 'TV-S02', ROOT_EU: 'TV-S03', ROOT_MONO: 'TV-S04', ROOT_TIP: 'TV-S05', CELERY_THIN: 'TV-S06', CELERY_THICK: 'TV-S07', PEAR_SCLEREIDS: 'TV-S08',
  NO_LIGNIN: 'TV-S09', LIGNIN_DOC: 'TV-S10', BAD_DOSE: 'TV-S11', LEAF_EU: 'TV-S12', LEAF_MONO: 'TV-S13', STOMATA: 'TV-S14', NO_STOMATA: 'TV-S15', RINGS: 'TV-S16', TROPICAL: 'TV-S17',
  MISLABELED: 'TV-S18', DIAPHRAGM: 'TV-S19', BAD_COVER: 'TV-S20', NO_SCALE: 'TV-S21', MOSAIC: 'TV-S22', UNKNOWNS: 'TV-S23', MACRO: 'TV-S24', TEACHER: 'TV-S25', CONTINGENCY: 'TV-S26',
} as const;

const ok = (extra: Partial<PlantDispatchResult> = {}): PlantDispatchResult => ({ ok: true, ...extra });
const no = (code: string): PlantDispatchResult => ({ ok: false, code });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const pp = (w: PlantWorld): PlantParams => w.params.plant!;

export const isFixed = (w: PlantWorld, id: string) => w.slides[id]?.kind === 'fixed';
export const sectionOf = (w: PlantWorld, slideId: string | undefined | null) => (slideId ? w.plant.sections.find((s) => s.slideId === slideId) ?? null : null);

// ─────────────────────────── Despacho ───────────────────────────

export function dispatchPlant(w: PlantWorld, cmd: PlantCommand): PlantDispatchResult {
  if (PLANT_ONLY_TYPES.has(cmd.type)) {
    if (w.safety.stoppedByTeacher) return no('TEACHER_STOP');
    return plantOnly(w, cmd as PlantOnlyCommand);
  }
  const c = cmd as DivCommand;
  // Reactivo corrosivo sin protección (TV-64): bloqueo crítico, no se transfiere volumen.
  if (c.type === 'squeezeDropper' && c.dispenserId === 'hcl' && !w.ppe) {
    errB(w, 'TV-64', 'ACID_WITHOUT_PPE', 'CRITICAL');
    return no('PPE');
  }
  if (!w.ppe) return dispatchDiv(w, c);
  switch (c.type) {
    case 'squeezeDropper':
      return squeeze(w, c);
    case 'dispose': {
      // Vidrio roto en residuo común (TV-67): queda el incidente; hay que recuperarlo y llevarlo al contenedor de vidrio.
      if (c.containerId === 'trashBin' && w.mounts[c.objectId]?.broken) errB(w, 'TV-67', 'GLASS_IN_TRASH', 'ALERT', { obj: c.objectId });
      return dispatchDiv(w, c);
    }
    case 'placeSpecimen':
      return place(w, c);
    case 'lowerCover':
      return lowerCover(w, c);
    case 'pressCover':
      return pressCover(w, c);
    case 'addImmersionOil': {
      // Sin objetivo de inmersión no hay aceite que corresponda (TV-51): queda en la lámina y hay que limpiarlo.
      errB(w, 'TV-51', 'OIL_WITHOUT_OBJECTIVE', 'WARN', { obj: c.slideId });
      return dispatchDiv(w, c);
    }
    case 'selectObjective': {
      // Aumento sin recurso (TV-40): incidencia sin descuento; no se finge el detalle.
      if (c.objectiveX === 100) {
        flagB(w, 'asset:missingMagnification');
        incident(w, 'objective:100');
      }
      return dispatchDiv(w, c);
    }
    case 'captureObservation':
      return capture(w, c);
    case 'markRegion':
      return mark(w, c);
    case 'measure':
      return measure(w, c);
    case 'closeBench':
      return closeBench(w);
    default:
      return dispatchDiv(w, c);
  }
}

function plantOnly(w: PlantWorld, cmd: PlantOnlyCommand): PlantDispatchResult {
  if (cmd.type === 'cutSection' && !w.ppe) {
    // Bisturí sin protección (TV-63): el gesto no empieza.
    errB(w, 'TV-63', 'BLADE_WITHOUT_PPE', 'CRITICAL');
    return no('PPE');
  }
  if (!w.ppe) {
    errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
    return no('PPE');
  }
  switch (cmd.type) {
    case 'rotatePlant': {
      w.plant.rotated[cmd.specimen] = r6((w.plant.rotated[cmd.specimen] ?? 0) + Math.abs(cmd.deg));
      if (w.plant.rotated[cmd.specimen] >= 180) flagB(w, `rotated:${cmd.specimen}`);
      return ok({ value: w.plant.rotated[cmd.specimen] });
    }
    case 'labelExternal':
      return labelExternal(w, cmd);
    case 'holdSource': {
      if (!cmd.hold) {
        w.plant.holding = null;
        return ok();
      }
      if (!w.cell.sources[cmd.sourceId]) return no('BAD_SOURCE');
      if (w.forceps.holding || w.cell.held.fc) return no('TOOL_BUSY');
      w.plant.holding = cmd.sourceId;
      flagB(w, 'sourceHeld');
      return ok();
    }
    case 'cutSection':
      return cutSection(w, cmd);
    case 'rinseSection':
      return rinse(w, cmd.slideId, cmd.volumeMl);
    case 'moveMicroscope': {
      if (cmd.grip === 'eyepiece') {
        // Sujetar por los oculares (TV-70): el equipo no se mueve; queda el aviso.
        errB(w, 'TV-70', 'MICROSCOPE_BAD_GRIP', 'ALERT');
        w.safety.block = { code: 'TRANSPORT', since: w.timeS };
        return no('TRANSPORT_GRIP');
      }
      if (w.safety.block?.code === 'TRANSPORT') w.safety.block = null;
      flagB(w, 'microscopeMovedSafe');
      return ok();
    }
    case 'traceArea': {
      const o = w.observations[cmd.observationId];
      if (!o?.isObservationValid) return no('NOT_OBSERVED');
      if (cmd.totalPx2 <= 0 || cmd.regionPx2 < 0 || cmd.regionPx2 > cmd.totalPx2) return no('BAD_AREA');
      const id = `ar${++w.plant.areaSeq}`;
      const fraction = areaFraction(cmd.regionPx2, cmd.totalPx2);
      w.plant.areas.push({ id, observationId: cmd.observationId, regionPx2: r6(cmd.regionPx2), totalPx2: r6(cmd.totalPx2), fraction });
      emitB(w, 'AREA_TRACED', 'INFO', { obj: cmd.observationId, pct: Math.round(fraction * 1000) / 10 });
      return ok({ id, value: fraction });
    }
    case 'reportAssetProblem':
      incident(w, `${cmd.problem}:${cmd.assetId}`);
      return ok();
  }
}

// ─────────────────────────── Morfología externa ───────────────────────────

/** Rótulo sobre una zona real de la plántula: el modelo decide; confundir no cambia la planta, deja el rótulo marcado. */
function labelExternal(w: PlantWorld, cmd: Extract<PlantOnlyCommand, { type: 'labelExternal' }>): PlantDispatchResult {
  const regions = EXTERNAL_REGIONS[cmd.specimen];
  const truth = regions?.[cmd.regionId];
  if (!truth) return no('BAD_REGION');
  const good = truth === cmd.part;
  if (!good) {
    if (cmd.part === 'apicalBud') errB(w, 'TV-02', 'BUD_OFF_ORGAN', 'WARN', { obj: cmd.regionId });
    else if ((cmd.part === 'node' && truth === 'internode') || (cmd.part === 'internode' && truth === 'node')) errB(w, 'TV-03', 'NODE_INTERNODE', 'WARN', { obj: cmd.regionId });
    else if (cmd.part === 'petiole' && !Object.values(regions).includes('petiole')) errB(w, 'TV-04', 'PETIOLE_ABSENT', 'WARN', { obj: cmd.regionId });
  }
  const prev = w.plant.labels.findIndex((l) => l.specimen === cmd.specimen && l.regionId === cmd.regionId);
  const label = { specimen: cmd.specimen, regionId: cmd.regionId, part: cmd.part, ok: good };
  if (prev >= 0) w.plant.labels[prev] = label;
  else w.plant.labels.push(label);
  emitB(w, 'EXTERNAL_LABELED', good ? 'INFO' : 'WARN', { obj: `${cmd.specimen}:${cmd.regionId}` });
  return ok({ value: good ? 1 : 0 });
}

// ─────────────────────────── Corte ───────────────────────────

function cutSection(w: PlantWorld, cmd: Extract<PlantOnlyCommand, { type: 'cutSection' }>): PlantDispatchResult {
  const src = w.cell.sources[cmd.sourceId];
  const rule = SOURCE_REGION[cmd.sourceId];
  if (!src || !rule) return no('BAD_SOURCE');
  // La hoja cruza la mano que sujeta (TV-65): la herramienta se detiene y no hay corte.
  if (cmd.handInPath) {
    errB(w, 'TV-65', 'BLADE_TOWARD_HAND', 'CRITICAL', { obj: cmd.sourceId });
    w.safety.block = { code: 'BLADE_HAND', since: w.timeS };
    return no('BLADE_HAND');
  }
  if (w.safety.block?.code === 'BLADE_HAND') w.safety.block = null;
  if (w.cell.board) return no('BOARD_BUSY');
  const p = pp(w);
  const held = w.plant.holding === cmd.sourceId;
  const thicknessMm = cmd.thicknessUm / 1000;
  const r = dispatchDiv(w, { type: 'cutSource', sourceId: cmd.sourceId, toolId: 'sc', thicknessMm, lengthCm: cmd.lengthCm });
  if (!r.ok) return r;
  w.plant.holding = null;
  // Sin sujetar, el tejido gira y el plano resultante se desvía (TV-14).
  const actualPlane: SectionRecord['actualPlane'] = held ? cmd.plane : 'oblique';
  const planeOk = held && rule.planes.includes(cmd.plane);
  const regionOk = cmd.region === rule.region;
  if (!held) errB(w, 'TV-14', 'SPECIMEN_NOT_HELD', 'ALERT', { obj: cmd.sourceId });
  if (!rule.planes.includes(cmd.plane)) errB(w, 'TV-09', 'WRONG_PLANE', 'WARN', { obj: cmd.sourceId });
  if (!regionOk) errB(w, 'TV-12', 'WRONG_CUT_REGION', 'WARN', { obj: cmd.sourceId });
  if (cmd.thicknessUm > p.sectionUsableMaxUm) errB(w, 'TV-10', 'SECTION_THICK', 'WARN', { obj: cmd.sourceId, um: cmd.thicknessUm });
  if (cmd.thicknessUm < p.sectionFragileMinUm) errB(w, 'TV-11', 'SECTION_FRAGILE', 'WARN', { obj: cmd.sourceId, um: cmd.thicknessUm });
  const crushed = cmd.pressure01 > p.crushPressure01;
  if (crushed) errB(w, 'TV-13', 'SECTION_CRUSHED', 'WARN', { obj: cmd.sourceId });
  const { integrity01, viableAreaFraction } = sectionQuality(p, { thicknessUm: cmd.thicknessUm, pressure01: cmd.pressure01, held, planeOk, regionOk });
  const f = w.cell.board!;
  // Desgarro de la sección: es lo que el montaje hereda y lo que las capturas no pueden ocultar.
  f.tear01 = r6(1 - integrity01);
  // Parte del gesto queda como resto (no vuelve a la fuente ni aparece en otra escena).
  const lost = r6(Math.min(src.massMg, f.massMg * p.cutLossFraction));
  src.massMg = r6(src.massMg - lost);
  w.cell.biomass.wasteMg = r6(w.cell.biomass.wasteMg + lost);
  const id = `sec${w.plant.sections.length + 1}`;
  w.plant.sections.push({ id, sourceId: cmd.sourceId, plane: cmd.plane, actualPlane, region: cmd.region, regionOk, thicknessUm: r6(cmd.thicknessUm), integrity01, viableAreaFraction, crushed, held, slideId: null, lostMg: lost });
  w.plant.pendingSection = id;
  if (integrity01 >= p.minSectionIntegrity && planeOk && regionOk && cmd.thicknessUm <= p.sectionUsableMaxUm) flagB(w, 'cut:viable');
  emitB(w, 'SECTION_CUT', integrity01 >= p.minSectionIntegrity ? 'INFO' : 'WARN', { obj: cmd.sourceId, um: cmd.thicknessUm, pct: Math.round(integrity01 * 100) });
  return ok({ id, value: integrity01 });
}

function place(w: PlantWorld, cmd: Extract<DivCommand, { type: 'placeSpecimen' }>): PlantDispatchResult {
  const held = w.cell.held[cmd.toolId];
  const section = w.plant.pendingSection ? w.plant.sections.find((s) => s.id === w.plant.pendingSection) : null;
  const slide = w.slides[cmd.targetId];
  // Otra sección encima de la que ya está (TV-18): dos capas que restan luz y resolución.
  const m = slide && isPrep(w.objects[cmd.targetId]?.support) ? w.mounts[cmd.targetId] : null;
  if (held && m?.cell?.zones.length && !m.coverId && !isFixed(w, cmd.targetId)) {
    const z = m.cell.zones[0];
    z.thicknessMm = r6(z.thicknessMm + held.thicknessMm);
    z.massMg = r6(z.massMg + held.massMg);
    if (held.kind !== z.kind) {
      m.cell.mixed = true;
      errB(w, 'TV-15', 'SECTIONS_MIXED', 'WARN', { obj: cmd.targetId });
    }
    w.cell.held[cmd.toolId] = null;
    if (cmd.toolId === 'fc') {
      w.forceps.holding = null;
      w.forceps.dirty01 = 0.6;
    }
    errB(w, 'TV-18', 'DOUBLE_LAYER', 'WARN', { obj: cmd.targetId });
    if (section) section.slideId = cmd.targetId;
    w.plant.pendingSection = null;
    return ok();
  }
  const r = dispatchDiv(w, cmd);
  if (r.ok && held && !w.cell.held[cmd.toolId] && section) {
    // El montaje puede haberse creado con este mismo gesto: se lee de nuevo.
    const zones = slide && !isFixed(w, cmd.targetId) ? w.mounts[cmd.targetId]?.cell?.zones : null;
    if (zones?.length) {
      section.slideId = cmd.targetId;
      zones[zones.length - 1].plane = section.plane === 'epidermal' ? 'epidermal' : 'transverse';
    }
    w.plant.pendingSection = null;
  }
  return r;
}

/** Cubreobjetos: en el escenario de ángulo malo (S20) el primero baja forzado; bajar de golpe sobre tinción deja burbujas (TV-28). */
function lowerCover(w: PlantWorld, cmd: Extract<DivCommand, { type: 'lowerCover' }>): PlantDispatchResult {
  if (w.plant.coverJam && w.covers[cmd.coverId]?.state === 'held') {
    w.covers[cmd.coverId].tiltDeg = 8;
    w.plant.coverJam = false;
  }
  const tilt = w.covers[cmd.coverId]?.tiltDeg ?? 45;
  const r = dispatchDiv(w, cmd);
  const m = w.mounts[cmd.slideId];
  if (r.ok && m?.cell && (tilt < 12 || cmd.speedCmS > w.params.mount.coverMaxSpeedCmS) && (hasStain(m.cell, 'phloroglucinol') || hasStain(m.cell, 'hcl'))) errB(w, 'TV-28', 'STAIN_BUBBLES', 'WARN', { obj: cmd.slideId });
  return r;
}

/** Presión excesiva sin llegar a romper: la sección se deforma y baja el campo íntegro (TV-20). */
function pressCover(w: PlantWorld, cmd: Extract<DivCommand, { type: 'pressCover' }>): PlantDispatchResult {
  const r = dispatchDiv(w, cmd);
  const m = w.mounts[cmd.slideId];
  if (r.ok && m && !m.broken && cmd.force01 > pp(w).coverDeformForce01) {
    m.damage01 = clamp(m.damage01 + 0.5, 0, 1);
    const s = sectionOf(w, cmd.slideId);
    if (s) s.viableAreaFraction = r6(s.viableAreaFraction * 0.5);
    errB(w, 'TV-20', 'COVER_PRESSED', 'WARN', { obj: cmd.slideId });
  }
  return r;
}

// ─────────────────────────── Reactivos ───────────────────────────

function squeeze(w: PlantWorld, cmd: Extract<DivCommand, { type: 'squeezeDropper' }>): PlantDispatchResult {
  const { dispenserId, targetId } = cmd;
  const reagent = w.dispensers[dispenserId]?.reagent;
  const wiesner = reagent === 'hcl' || reagent === 'phloroglucinol';
  // Sobre una lámina permanente: rechazado, el activo no cambia (TV-21, R12).
  if (wiesner && isFixed(w, targetId)) {
    errB(w, 'TV-21', 'FIXED_STAIN_ATTEMPT', 'WARN', { obj: targetId });
    return no('FIXED_SLIDE');
  }
  if (!wiesner) return dispatchDiv(w, cmd);
  const inZone = w.objects[targetId]?.support === 'prep2';
  if (reagent === 'hcl' && w.slides[targetId] && !inZone) {
    // Ácido fuera de la zona ventilada: bloqueo crítico, no se transfiere volumen (§11).
    errB(w, 'TV-64', 'ACID_OUTSIDE_ZONE', 'CRITICAL', { obj: targetId });
    return no('ACID_ZONE');
  }
  const m = w.slides[targetId] ? w.mounts[targetId] : null;
  const hasTissue = !!m?.cell?.zones.length;
  if (reagent === 'hcl' && w.slides[targetId] && inZone && !hasTissue) {
    // Ácido en un portaobjetos sin la muestra: se consume sin teñir nada (TV-24) y pasa a residuos.
    const r = dispatchDiv(w, cmd);
    if (r.ok) {
      errB(w, 'TV-24', 'ACID_WRONG_TARGET', 'WARN', { obj: targetId });
      // El montaje puede haberse creado con esta misma gota.
      const after = w.mounts[targetId];
      if (after) {
        const led = w.cell.stainLedger.hcl;
        const v = after.cell?.stainMl.hcl ?? 0;
        if (after.cell) after.cell.stainMl.hcl = 0;
        after.reagentMl = r6(after.reagentMl - v);
        led.wasteMl = r6(led.wasteMl + v);
        w.fluids.wasteMl = r6(w.fluids.wasteMl + v);
      }
    }
    return r;
  }
  const r = dispatchDiv(w, cmd);
  if (!r.ok) return r;
  const after = w.slides[targetId] ? w.mounts[targetId] : null;
  if (after && liquidMl(after) > w.params.mount.excessMl) {
    // Exceso de reactivo: desplaza la sección y escurre (TV-23).
    errB(w, 'TV-23', 'STAIN_OVERFLOW', 'WARN', { obj: targetId });
    after.damage01 = clamp(after.damage01 + 0.2, 0, 1);
    for (const z of after.cell?.zones ?? []) z.centerCm = [r6(z.centerCm[0] + 0.3), z.centerCm[1]];
    after.centerCm = after.cell?.zones[0] ? [...after.cell.zones[0].centerCm] : after.centerCm;
  }
  return r;
}

/** Lavado con piseta: arrastra el reactivo a residuos; en exceso se lleva parte de la sección (TV-29). */
function rinse(w: PlantWorld, slideId: string, volumeMl: number): PlantDispatchResult {
  const m = w.mounts[slideId];
  const d = w.dispensers.dw;
  if (isFixed(w, slideId)) {
    errB(w, 'TV-21', 'FIXED_STAIN_ATTEMPT', 'WARN', { obj: slideId });
    return no('FIXED_SLIDE');
  }
  if (!m?.cell?.zones.length || m.coverId) return no('BAD_TARGET');
  const vol = r6(clamp(volumeMl, 0, 2));
  if (!d || d.ml < vol || vol <= 0) return no('EMPTY');
  d.ml = r6(d.ml - vol);
  // El agua de lavado cruza la preparación y se va a residuos junto con el líquido que ya tenía.
  w.fluids.wasteMl = r6(w.fluids.wasteMl + vol);
  const had = liquidMl(m);
  if (had > 0) {
    const led = w.cell.stainLedger;
    for (const k of ['phloroglucinol', 'hcl'] as const) {
      const v = m.cell.stainMl[k] ?? 0;
      if (v <= 0) continue;
      m.cell.stainMl[k] = 0;
      m.reagentMl = r6(m.reagentMl - v);
      led[k].wasteMl = r6(led[k].wasteMl + v);
      w.fluids.wasteMl = r6(w.fluids.wasteMl + v);
    }
  }
  flagB(w, 'rinsed');
  if (vol > pp(w).rinseMaxMl) {
    const z = m.cell.zones[0];
    const lost = r6(z.massMg * 0.5);
    z.massMg = r6(z.massMg - lost);
    z.areaMm2 = r6(z.areaMm2 * 0.5);
    w.cell.biomass.wasteMg = r6(w.cell.biomass.wasteMg + lost);
    const s = sectionOf(w, slideId);
    if (s) s.viableAreaFraction = r6(s.viableAreaFraction * 0.5);
    errB(w, 'TV-29', 'WASHED_OFF', 'WARN', { obj: slideId });
  }
  emitB(w, 'SECTION_RINSED', 'INFO', { obj: slideId, ml: vol });
  return ok({ value: vol });
}

// ─────────────────────────── Observación ───────────────────────────

function capture(w: PlantWorld, cmd: Extract<DivCommand, { type: 'captureObservation' }>): PlantDispatchResult {
  const v = cmd.instrument === 'compound' ? microscopeView(w) : null;
  const r = dispatchDiv(w, cmd);
  if (!r.ok || !r.id) return r;
  const o = w.observations[r.id];
  if (o.instrument !== 'compound' || !v) return r;
  const slide = o.slideId ?? '';
  const extra: string[] = [];
  const m = w.mounts[slide];
  const s = sectionOf(w, slide);
  if (s && !m?.cell?.zones[0]?.premade) {
    if (s.actualPlane === 'oblique' || !SOURCE_REGION[s.sourceId]?.planes.includes(s.plane)) extra.push('WRONG_PLANE');
    if (!s.regionOk) extra.push('WRONG_REGION');
  }
  if (m?.cell) {
    const flo = hasStain(m.cell, 'phloroglucinol');
    const acid = hasStain(m.cell, 'hcl');
    // Reactivo omitido o a medias (TV-22): sin la serie teñida autorizada no hay evidencia de lignina.
    if (flo !== acid) errB(w, 'TV-22', 'STAIN_MISSING', 'WARN', { obj: slide });
    if (flo && acid && !wiesnerDeveloped(m.cell, pp(w))) {
      // Fuera de la ventana del recurso calibrado (TV-25): la foto teñida no corresponde; se marca sin verificar.
      errB(w, 'TV-25', 'STAIN_MISMATCH', 'WARN', { obj: slide });
      extra.push('UNVERIFIED_PHOTO');
    }
  }
  // Lámina con etiqueta que no coincide con la imagen (S18): manda la imagen; incidencia sin descuento.
  if (w.plant.mislabeled === slide) incident(w, `label:${o.assetId}`);
  if (extra.length) {
    for (const x of extra) if (!o.issues.includes(x)) o.issues.push(x);
    if (extra.some((x) => x !== 'UNVERIFIED_PHOTO') && o.isObservationValid) {
      o.isObservationValid = false;
      o.visibleRegionIds = [];
    }
    o.captureHash = stableHash({ a: w.assignment.assignmentHash, o: { ...o, captureHash: '' } });
  }
  if (o.isObservationValid) {
    flagB(w, `plantCapture:${o.assetId}:${o.objectiveX ?? 0}`);
    if (m?.cell?.zones.length && !m.cell.zones[0].premade) flagB(w, 'microscopy:freshObserved');
    if (o.assetId === 'celeryWiesner' || o.assetId === 'pearWiesner') flagB(w, 'stain:documented');
  }
  return r;
}

/** Estructuras anotadas bajo un punto de la captura, de la más específica a la más general. */
function underPoint(o: { assetId: string; normalizedViewport: [number, number, number, number] }, u: number, v: number): StructureId[] {
  const asset = assetById(o.assetId);
  if (!asset) return [];
  const [cx, cy, vw, vh] = o.normalizedViewport;
  const x = cx + (clamp(u, 0, 1) - 0.5) * vw;
  const y = cy + (clamp(v, 0, 1) - 0.5) * vh;
  return asset.annotations.filter((a) => circleHitsPolygon(x, y, 0.004, a.polygonNormalized)).map((a) => a.structureId).reverse();
}

/** Marca: el manifiesto decide (B06); aquí se registra qué había de verdad bajo el punto y los excesos típicos del atlas. */
function mark(w: PlantWorld, cmd: Extract<DivCommand, { type: 'markRegion' }>): PlantDispatchResult {
  const r = dispatchDiv(w, cmd);
  if (!r.ok || !r.id) return r;
  const mk = w.div.marks.find((x) => x.id === r.id)!;
  const o = w.observations[cmd.observationId];
  const under = underPoint(o, cmd.u, cmd.v);
  if (mk.verdict !== 'valid') {
    const specific = under.find((s) => s !== cmd.structure);
    mk.hit = (under.includes(cmd.structure as StructureId) ? (cmd.structure as StructureId) : specific) ?? null;
    if (cmd.structure === 'stele') errB(w, 'TV-45', 'STELE_MISPLACED', 'WARN', { obj: cmd.observationId });
    if (cmd.structure === 'cambium') errB(w, 'TV-46', 'CAMBIUM_OVERCLAIM', 'WARN', { obj: cmd.observationId });
    if (cmd.structure === 'companionCell') errB(w, 'TV-60', 'COMPANION_UNRESOLVED', 'WARN', { obj: cmd.observationId });
    if (cmd.structure === 'casparian') errB(w, 'TV-61', 'CASPARIAN_UNRESOLVED', 'WARN', { obj: cmd.observationId });
  }
  return r;
}

/** Medición: sin escala queda bloqueada con explicación y sin descuento (TV-53, R10). */
function measure(w: PlantWorld, cmd: Extract<DivCommand, { type: 'measure' }>): PlantDispatchResult {
  const r = dispatchDiv(w, cmd);
  if (!r.ok && !w.div.scale.available) flagB(w, 'asset:uncalibrated');
  return r;
}

// ─────────────────────────── Cierre ───────────────────────────

/** Lo que el cierre de B09 agrega al de B06: ácido sin atender, preparaciones frescas sin descartar, herramientas. */
export function plantOutstanding(w: PlantWorld): string[] {
  const out = [...new Set([...outstanding(w), ...divOutstanding(w)])];
  if (acidOnBench(w)) out.push('acidSpill');
  return out;
}

const acidOnBench = (w: PlantWorld) => (w.cell.benchStainMl.hcl ?? 0) > 1e-9;

function closeBench(w: PlantWorld): PlantDispatchResult {
  const had = w.evidence.benchRestored;
  if (acidOnBench(w)) errB(w, 'TV-69', 'ACID_SPILL_OPEN', 'ALERT');
  if (w.microscope.slideOnStage && w.slideCase.open) errB(w, 'TV-72', 'BENCH_NOT_CLEARED', 'WARN', { obj: w.microscope.slideOnStage });
  // Wiesner asignada y nunca documentada: la comparación teñida quedó sin hacer (TV-22).
  if (w.plant.wiesnerAssigned && !w.evidence['stain:documented']) errB(w, 'TV-22', 'STAIN_MISSING', 'WARN');
  const r = dispatchDiv(w, { type: 'closeBench' });
  if (acidOnBench(w)) {
    if (!had) delete w.evidence.benchRestored;
    return { ...r, value: 0 };
  }
  if (!w.evidence.benchRestored) return r;
  if (Object.values(w.mounts).every((m) => !m.cell?.zones.length || ['bioWaste', 'glassBin', 'cleanTray'].includes(w.objects[m.slideId]?.support ?? ''))) flagB(w, 'sample:disposed');
  return r;
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepPlantWorld(w: PlantWorld): void {
  stepDivWorld(w);
  // Enfocar la lámina a 4X ya es localizarla (si no, el paso a 40X contaría como TV-33 aunque se empezara por el 4X).
  if (w.view.instrument === 'compound' && w.tick % 4 === 0 && !w.evidence.located4x) {
    const v = microscopeView(w);
    if (v.objectiveX === 4 && v.slideId && v.assetId && v.sharpness01 >= w.params.microscope.sharpnessValid && !v.lightIssues.includes('LIGHT_OFF')) flagB(w, 'located4x');
  }
  // Sección fresca sin medio acuoso: se seca y encoge (TV-19).
  const mp = w.params.mount;
  for (const m of Object.values(w.mounts)) {
    const z = m.cell?.zones[0];
    if (z && !z.premade && (z.kind === 'celery' || z.kind === 'plantLeaf' || z.kind === 'pear') && m.hydrated01 < 0.6 && liquidMl(m) < mp.needMl * 0.5) errB(w, 'TV-19', 'SECTION_DRY', 'WARN', { obj: m.slideId });
  }
}

export function runPlantFor(w: PlantWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepPlantWorld(w);
}

// ─────────────────────────── Conservación ───────────────────────────

/** Los balances de B06: agua, reactivos (floroglucinol y ácido) y masa de tejido (mL y mg; deben ser 0). */
export const conservedPlant = (w: PlantWorld): Record<string, number> => conservedDiv(w);

export function plantSummary(w: PlantWorld) {
  return {
    ...divSummary(w),
    labels: w.plant.labels.map((l) => [l.specimen, l.regionId, l.part, l.ok]),
    sections: w.plant.sections.map((s) => [s.id, s.plane, s.actualPlane, Math.round(s.thicknessUm), Math.round(s.integrity01 * 1000), s.slideId]),
    areas: w.plant.areas.map((a) => Math.round(a.fraction * 1000)),
  };
}

// ─────────────────────────── Creación ───────────────────────────

export type PlantStateExtras = Pick<PlantState, 'wiesnerAssigned' | 'stereoRequired' | 'requiredSlides' | 'mislabeled' | 'coverJam' | 'unknowns' | 'assetScope' | 'ringsAnnualKnown'>;

export function createPlantWorld(spec: OpticalWorldSpec, cx: CellWorldExtras, dx: DivWorldExtras, x: PlantStateExtras): PlantWorld {
  const w = createDivWorld(spec, cx, dx) as PlantWorld;
  w.plant = { ...structuredClone(x), rotated: {}, labels: [], holding: null, sections: [], pendingSection: null, areas: [], areaSeq: 0 };
  return w;
}

export const acidSpillOpen = acidOnBench;
export const CUT_PLANES: CutPlane[] = ['transverse', 'longitudinal', 'epidermal'];
