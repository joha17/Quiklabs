/**
 * Guion de la demostración de B09 (§16): la MANO VIRTUAL sobre el controlador real recorre los dieciocho pasos con los mismos
 * comandos que el estudiante: morfología externa, cortes de apio y pera, Wiesner en la zona ventilada, láminas de raíz, tallo y hoja,
 * rótulos, una medición y el cierre. Las láminas extra se recorren acelerando. No genera nota.
 */
import type { DemoDirectorB09, DemoStepB09 } from './director';
import type { B09Notebook } from '../../../practices/practice-b09/notebook';
import type { PlantCommand } from '../../../simulation/plant-world/commands';
import type { PlantWorld } from '../../../simulation/plant-world/types';
import { EXTERNAL_REGIONS } from '../../../simulation/plant-world/model';
import { microscopeView } from '../../../simulation/optical-world/world';
import { CLEAN_TRAY, PREP_SPOT, STAGE_SEAT, caseSlotIndex, caseSlotPos } from '../../../simulation/optical-world/geometry';
import { PREP2_SPOT } from '../../../simulation/cell-world/geometry';
import { assetById, type StructureId } from '../../../simulation/specimens/assets';

export interface DemoUiHooksB09 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B09Notebook) => void): void;
}

export function buildDemoScriptB09(ui: DemoUiHooksB09): DemoStepB09[] {
  const caps: Record<string, Record<number, string>> = {};
  const W = (d: DemoDirectorB09) => d.w as PlantWorld;
  const D = (d: DemoDirectorB09, c: PlantCommand) => d.dispatch(c);

  const focus = async (d: DemoDirectorB09) => {
    const obj = microscopeView(W(d)).objectiveX ?? 4;
    d.pointPart('mic', obj === 4 ? 'coarse' : 'fine');
    if (obj === 4) {
      D(d, { type: 'checkSide' });
      for (let i = 0; i < 80 && microscopeView(W(d)).sharpness01 < 0.25; i++) D(d, { type: 'turnCoarse', deltaTurns: 0.1 });
    }
    let best = microscopeView(W(d)).sharpness01;
    for (const dir of [1, -1]) {
      for (let i = 0; i < 60; i++) {
        D(d, { type: 'turnFine', deltaTurns: dir * 0.02 });
        const s = microscopeView(W(d)).sharpness01;
        if (s + 1e-9 < best) {
          D(d, { type: 'turnFine', deltaTurns: -dir * 0.02 });
          break;
        }
        best = s;
      }
    }
    await d.wait(0.3);
    d.endPress();
  };
  /** Lámina a la platina y captura por objetivo. */
  const observe = async (d: DemoDirectorB09, id: string, objectives: Array<4 | 10 | 40>) => {
    const out: Record<number, string> = {};
    if (!W(d).microscope.clipOpen) D(d, { type: 'openClip', open: true });
    await d.carry(id, STAGE_SEAT.x, STAGE_SEAT.y);
    D(d, { type: 'openClip', open: false });
    if (microscopeView(W(d)).objectiveX !== 4) D(d, { type: 'selectObjective', objectiveX: 4 });
    await focus(d);
    D(d, { type: 'observe', instrument: 'compound', open: true });
    await d.wait(1);
    for (const x of [4, 10, 40] as const) {
      if (x !== 4) {
        D(d, { type: 'selectObjective', objectiveX: x });
        await focus(d);
      }
      D(d, { type: 'setDiaphragm', value01: x === 40 ? 0.6 : 0.5 });
      if (objectives.includes(x)) {
        await d.wait(1.8);
        const r = D(d, { type: 'captureObservation', instrument: 'compound' });
        if (r.id) out[x] = r.id;
      }
    }
    D(d, { type: 'setDiaphragm', value01: 0.5 });
    D(d, { type: 'observe', instrument: 'compound', open: false });
    return out;
  };
  /** Baja la platina, vuelve al 4X y retira la lámina. */
  const unstage = async (d: DemoDirectorB09, id: string, x: number, y: number) => {
    D(d, { type: 'selectObjective', objectiveX: 4 });
    D(d, { type: 'turnCoarse', deltaTurns: -W(d).microscope.coarseTurns });
    D(d, { type: 'turnFine', deltaTurns: -W(d).microscope.fineTurns });
    D(d, { type: 'openClip', open: true });
    await d.carry(id, x, y);
  };
  const fixedSlide = async (d: DemoDirectorB09, id: string, objectives: Array<4 | 10 | 40> = [10]) => {
    if (!W(d).slideCase.open) D(d, { type: 'openSlideCase', open: true });
    caps[id] = await observe(d, id, objectives);
    const home = W(d).slideCase.home[id];
    const p = caseSlotPos(caseSlotIndex(home));
    await unstage(d, id, p.x, p.y);
  };
  const cut = async (d: DemoDirectorB09, sourceId: string, region: string, slide: string, spot: { x: number; y: number }) => {
    await d.carry(slide, spot.x, spot.y);
    D(d, { type: 'wipe', targetId: 'sc', toolId: 'lp' });
    await d.press(sourceId, undefined, 0.4);
    D(d, { type: 'holdSource', sourceId, hold: true });
    await d.wait(0.4);
    D(d, { type: 'cutSection', sourceId, plane: 'transverse', thicknessUm: 80, lengthCm: 0.8, region, pressure01: 0.3 });
    await d.wait(0.5);
    d.endPress();
    D(d, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    D(d, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
    await d.wait(0.3);
    D(d, { type: 'placeSpecimen', toolId: 'fc', targetId: slide, dxCm: 0, dyCm: 0 });
    await d.wait(0.4);
  };
  const drop = async (d: DemoDirectorB09, dropper: string, slide: string) => {
    await d.press(dropper, undefined, 0.4);
    D(d, { type: 'squeezeDropper', dispenserId: dropper, targetId: slide, force01: 0.5, dxCm: 0, dyCm: 0 });
    await d.wait(0.5);
    d.endPress();
  };
  const cover = async (d: DemoDirectorB09, slide: string, coverId: string) => {
    D(d, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    D(d, { type: 'grabCover', coverId, toolId: 'fc' });
    D(d, { type: 'setCoverTilt', coverId, angleDeg: 45 });
    await d.wait(0.4);
    D(d, { type: 'lowerCover', coverId, slideId: slide, speedCmS: 0.4, dxCm: 0, dyCm: 0 });
    await d.wait(0.5);
  };
  const markCenter = (d: DemoDirectorB09, obs: string | undefined, s: StructureId) => {
    if (!obs) return;
    const o = W(d).observations[obs];
    const an = assetById(o.assetId)?.annotations.find((x) => x.structureId === s);
    if (!an) return;
    const [cx, cy, vw, vh] = o.normalizedViewport;
    const ux = an.polygonNormalized.reduce((a, q) => a + q[0], 0) / an.polygonNormalized.length;
    const uy = an.polygonNormalized.reduce((a, q) => a + q[1], 0) / an.polygonNormalized.length;
    D(d, { type: 'markRegion', observationId: obs, structure: s, u: 0.5 + (ux - cx) / vw, v: 0.5 + (uy - cy) / vh });
  };

  return [
    {
      part: 'A', key: 'safety',
      run: async (d) => {
        d.station('A');
        for (const id of ['glassBin', 'bioWaste', 'trashBin', 'mic', 'case']) {
          await d.press(id, undefined, 0.3);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'hypothesis',
      run: async (d) => {
        ui.notebook(true, 'pre');
        ui.edit((nb) => {
          nb.prereport = { hypothesis: 'La disposición de los haces distingue raíz, tallo y hoja', instruments: 'Microscopio, estereoscopio y bisturí', precautions: 'Ácido solo en la zona ventilada' };
        });
        await d.wait(1.6);
        ui.notebook(false);
      },
    },
    ...(['bean', 'maize'] as const).map((sp): DemoStepB09 => ({
      part: 'B', key: sp,
      run: async (d) => {
        d.station('B');
        const o = W(d).objects[sp].pose;
        d.look(o.x, o.y, 10, 44, 0.3);
        await d.press(sp, undefined, 0.5);
        for (let i = 0; i < 4; i++) {
          D(d, { type: 'rotatePlant', specimen: sp, deg: 50 });
          await d.wait(0.35);
        }
        for (const [regionId, part] of Object.entries(EXTERNAL_REGIONS[sp])) {
          D(d, { type: 'labelExternal', specimen: sp, regionId, part });
          await d.wait(0.25);
        }
        d.endPress();
        ui.edit((nb) => {
          nb.external[sp === 'bean' ? 0 : 1] = sp === 'bean'
            ? { specimen: 'bean', taxon: 'Phaseolus vulgaris, invernadero', rootPattern: 'taproot', venation: 'reticulate', petiole: 'present', stereoObservationId: null }
            : { specimen: 'maize', taxon: 'Zea mays, invernadero', rootPattern: 'fibrous', venation: 'parallel', petiole: 'absent', stereoObservationId: null };
        });
      },
    })),
    {
      part: 'C', key: 'celeryCut',
      run: async (d) => {
        d.station('C');
        await cut(d, 'cel', 'petiole', 'sl1', PREP_SPOT);
      },
    },
    {
      part: 'C', key: 'celeryMount',
      run: async (d) => {
        await drop(d, 'dw', 'sl1');
        await cover(d, 'sl1', 'cv1');
      },
    },
    {
      part: 'D', key: 'celeryObserve',
      run: async (d) => {
        d.station('D');
        await d.press('mic', undefined, 0.3);
        D(d, { type: 'setPower', device: 'microscope', on: true });
        d.endPress();
        caps.sl1 = await observe(d, 'sl1', [10, 40]);
        await unstage(d, 'sl1', CLEAN_TRAY.x, CLEAN_TRAY.y);
      },
    },
    {
      part: 'E', key: 'wiesnerCut',
      run: async (d) => {
        d.station('E');
        await cut(d, 'cel', 'petiole', 'sl2', PREP2_SPOT);
        d.note(d.hooks.t('b09.demo.ui.zone'));
      },
    },
    {
      part: 'E', key: 'wiesnerStain',
      run: async (d) => {
        d.station('E');
        await drop(d, 'flo', 'sl2');
        await drop(d, 'hcl', 'sl2');
        await d.simUntil(() => (W(d).mounts.sl2?.cell?.contactS.hcl ?? 0) >= 60, 80, 10);
        await cover(d, 'sl2', 'cv2');
      },
    },
    {
      part: 'E', key: 'wiesnerObserve',
      run: async (d) => {
        d.station('D');
        caps.sl2 = await observe(d, 'sl2', [10, 40]);
        await unstage(d, 'sl2', CLEAN_TRAY.x + 4, CLEAN_TRAY.y);
      },
    },
    {
      part: 'C', key: 'pear',
      run: async (d) => {
        d.station('C');
        await cut(d, 'pea', 'flesh', 'sl3', PREP_SPOT);
        await drop(d, 'dw', 'sl3');
        await cover(d, 'sl3', 'cv3');
        d.station('D');
        caps.sl3 = await observe(d, 'sl3', [10]);
        await unstage(d, 'sl3', CLEAN_TRAY.x - 4, CLEAN_TRAY.y);
      },
    },
    {
      part: 'D', key: 'roots',
      run: async (d) => {
        d.station('D');
        await d.fast(3, async () => {
          await fixedSlide(d, 'fxRT');
          await fixedSlide(d, 'fxRE');
          await fixedSlide(d, 'fxRM');
        });
        markCenter(d, caps.fxRT?.[10], 'rootCap');
        markCenter(d, caps.fxRE?.[10], 'stele');
        markCenter(d, caps.fxRM?.[10], 'xylem');
      },
    },
    {
      part: 'D', key: 'stems',
      run: async (d) => {
        d.station('D');
        await d.fast(3, async () => {
          await fixedSlide(d, 'fxSE', [10, 40]);
          await fixedSlide(d, 'fxSM');
        });
        markCenter(d, caps.fxSE?.[10], 'vascularBundle');
        markCenter(d, caps.fxSM?.[10], 'vascularBundle');
      },
    },
    {
      part: 'E', key: 'leaves',
      run: async (d) => {
        d.station('D');
        await d.fast(3, async () => {
          await fixedSlide(d, 'fxLE');
          await fixedSlide(d, 'fxLM');
        });
        markCenter(d, caps.fxLE?.[10], 'palisade');
        markCenter(d, caps.fxLM?.[10], 'vascularBundle');
        D(d, { type: 'openSlideCase', open: false });
      },
    },
    {
      part: 'E', key: 'measure',
      run: async (d) => {
        ui.notebook(true, 'meas');
        const obs = caps.fxSE?.[40];
        const m = obs ? D(d, { type: 'measure', observationId: obs, ax: 300, ay: 500, bx: 700, by: 500, scale: 'calibration' }) : null;
        const rec = m?.id ? W(d).div.measurements.find((x) => x.id === m.id) : null;
        if (rec) {
          ui.edit((nb) => {
            nb.measures[0] = { observationId: rec.observationId, measurementId: rec.id, structure: 'Haz vascular', pixels: String(rec.rawPixelDistance), umPerPx: String(rec.umPerPx), lengthUm: String(rec.lengthUm), uncertaintyUm: String(rec.uncertaintyUm), unit: 'um', totalMag: String(W(d).params.microscope.ocularX * 40), usedFieldAsCell: false };
          });
        }
        await d.wait(1.6);
      },
    },
    {
      part: 'E', key: 'matrix',
      run: async (d) => {
        ui.notebook(true, 'stem');
        ui.edit((nb) => {
          nb.stems[0] = { observationId: caps.fxSE?.[10] ?? null, group: 'eudicot', bundles: 'ring', pith: 'visible', cambium: 'notResolved', collenchyma: 'visible', xylemSide: 'inner', basis: 'observedFeature' };
          nb.stems[1] = { observationId: caps.fxSM?.[10] ?? null, group: 'monocot', bundles: 'scattered', pith: 'absent', cambium: 'absent', collenchyma: 'notResolved', xylemSide: 'inner', basis: 'observedFeature' };
          nb.roots[0] = { observationId: caps.fxRE?.[10] ?? null, group: 'eudicot', plane: 'transverse', xylemPattern: 'star', pith: 'absent', endodermis: 'notResolved', cambium: 'notResolved', casparian: 'notResolved', basis: 'observedFeature' };
          nb.roots[1] = { observationId: caps.fxRM?.[10] ?? null, group: 'monocot', plane: 'transverse', xylemPattern: 'ring', pith: 'visible', endodermis: 'notResolved', cambium: 'notResolved', casparian: 'notResolved', basis: 'observedFeature' };
          nb.leaves[0] = { observationId: caps.fxLE?.[10] ?? null, group: 'eudicot', mesophyll: 'dorsiventral', stoma: 'visible', orientationChecked: true, xylemFace: 'adaxial' };
          nb.leaves[1] = { observationId: caps.fxLM?.[10] ?? null, group: 'monocot', mesophyll: 'undifferentiated', stoma: 'notResolved', orientationChecked: true, xylemFace: 'adaxial' };
          nb.stain = { observationId: caps.sl2?.[10] ?? null, controlObservationId: caps.sl1?.[10] ?? null, redMeans: 'lignifiedWall', collenchymaLignified: 'notDiagnosed', treatmentOfCapture: 'wiesner', limits: 'No cuantifica lignina' };
          nb.matrix[0] = { organ: 'stem', system: 'vascular', evidenceObservationId: caps.fxSE?.[10] ?? null, observation: 'Haces en anillo', inference: 'Sostén y conducción' };
        });
        await d.wait(1.8);
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'waste',
      run: async (d) => {
        d.station('F');
        for (const id of ['sl1', 'sl2', 'sl3']) {
          D(d, { type: 'dispose', objectId: id, containerId: 'bioWaste' });
          await d.wait(0.4);
        }
        for (const t of ['fc', 'sc']) D(d, { type: 'wipe', targetId: t, toolId: 'lp' });
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        D(d, { type: 'setPower', device: 'microscope', on: false });
        await d.wait(0.5);
        D(d, { type: 'closeBench' });
        await d.wait(1);
      },
    },
  ];
}
