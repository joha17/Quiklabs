/**
 * Guion de la demostración de B10 (§16): la MANO VIRTUAL sobre el controlador real recorre la práctica con los mismos comandos que
 * el estudiante: clasificación, láminas de tejidos e invertebrados, estereoscopio, modelos 3D, aves, cráneos, huellas y cierre. Las láminas y
 * los modelos extra se recorren acelerando. No genera nota.
 */
import type { DemoDirectorB10, DemoStepB10 } from './director';
import type { B10Notebook } from '../../../practices/practice-b10/notebook';
import type { AnimalCommand } from '../../../simulation/animal-world/commands';
import type { AnimalWorld } from '../../../simulation/animal-world/types';
import { modelById, orientationFor } from '../../../simulation/animal-world/catalog';
import { MATERIALS } from '../../../simulation/animal-world/materials';
import { microscopeView, stereoView } from '../../../simulation/optical-world/world';
import { STAGE_SEAT, caseSlotIndex, caseSlotPos } from '../../../simulation/optical-world/geometry';
import { assetById, type StructureId } from '../../../simulation/specimens/assets';

const AIM: Record<string, StructureId> = { fxME: 'mesoglea', fxCE: 'scolexS', fxFL: 'oralSuckerS', fxPL: 'pharynxS', fxNE: 'neuronBody', fxSP: 'choanocyte', fxNM: 'nematodeGut' };

export interface DemoUiHooksB10 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B10Notebook) => void): void;
}

export function buildDemoScriptB10(ui: DemoUiHooksB10): DemoStepB10[] {
  const caps: Record<string, Record<number, string>> = {};
  const stereoCaps: Record<string, string> = {};
  const W = (d: DemoDirectorB10) => d.w as AnimalWorld;
  const D = (d: DemoDirectorB10, c: AnimalCommand) => d.dispatch(c);

  const focus = async (d: DemoDirectorB10) => {
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
  /** Centra a 4X la estructura de interés con el carro; el sentido se comprueba. */
  const centerOn = (d: DemoDirectorB10, st: StructureId) => {
    const v0 = microscopeView(W(d));
    const a = assetById(v0.assetId ?? '');
    const p = a?.annotations.find((x) => x.structureId === st)?.polygonNormalized;
    if (!a || !p || !v0.centerMm) return;
    const tx = (p.reduce((q, r) => q + r[0], 0) / p.length - 0.5) * a.extentMm[0];
    const ty = (p.reduce((q, r) => q + r[1], 0) / p.length - 0.5) * a.extentMm[1];
    const { stageXmm: sx, stageYmm: sy } = W(d).microscope;
    D(d, { type: 'setStageXY', xMm: sx + 0.1, yMm: sy + 0.1 });
    const v1 = microscopeView(W(d));
    D(d, { type: 'setStageXY', xMm: sx + (Math.sign(v1.centerMm![0] - v0.centerMm[0]) || 1) * (tx - v0.centerMm[0]), yMm: sy + (Math.sign(v1.centerMm![1] - v0.centerMm[1]) || 1) * (ty - v0.centerMm[1]) });
  };
  /** Lámina a la platina y captura por objetivo. */
  const observe = async (d: DemoDirectorB10, id: string, objectives: Array<4 | 10 | 40>) => {
    const out: Record<number, string> = {};
    if (!W(d).microscope.clipOpen) D(d, { type: 'openClip', open: true });
    await d.carry(id, STAGE_SEAT.x, STAGE_SEAT.y);
    D(d, { type: 'openClip', open: false });
    if (microscopeView(W(d)).objectiveX !== 4) D(d, { type: 'selectObjective', objectiveX: 4 });
    await focus(d);
    D(d, { type: 'observe', instrument: 'compound', open: true });
    await d.wait(1);
    if (AIM[id]) centerOn(d, AIM[id]);
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
  const unstage = async (d: DemoDirectorB10, id: string, x: number, y: number) => {
    D(d, { type: 'selectObjective', objectiveX: 4 });
    D(d, { type: 'turnCoarse', deltaTurns: -W(d).microscope.coarseTurns });
    D(d, { type: 'turnFine', deltaTurns: -W(d).microscope.fineTurns });
    D(d, { type: 'openClip', open: true });
    await d.carry(id, x, y);
  };
  const fixedSlide = async (d: DemoDirectorB10, id: string, objectives: Array<4 | 10 | 40> = [10]) => {
    if (!W(d).slideCase.open) D(d, { type: 'openSlideCase', open: true });
    D(d, { type: 'readSlideLabel', slideId: id });
    caps[id] = await observe(d, id, objectives);
    const home = W(d).slideCase.home[id];
    const p = caseSlotPos(caseSlotIndex(home));
    await unstage(d, id, p.x, p.y);
  };
  const markCenter = (d: DemoDirectorB10, obs: string | undefined, s: StructureId) => {
    if (!obs) return;
    const o = W(d).observations[obs];
    const an = assetById(o.assetId)?.annotations.find((x) => x.structureId === s);
    if (!an) return;
    const [cx, cy, vw, vh] = o.normalizedViewport;
    const ux = an.polygonNormalized.reduce((a, q) => a + q[0], 0) / an.polygonNormalized.length;
    const uy = an.polygonNormalized.reduce((a, q) => a + q[1], 0) / an.polygonNormalized.length;
    D(d, { type: 'markRegion', observationId: obs, structure: s, u: 0.5 + (ux - cx) / vw, v: 0.5 + (uy - cy) / vh });
  };

  /** Abre el modelo, lo gira y rotula cada región mirándola: el visor muestra lo mismo que vería el estudiante. */
  const study = async (d: DemoDirectorB10, id: string) => {
    const m = modelById(id)!;
    D(d, { type: 'openModel', modelId: id });
    await d.wait(0.4);
    if (m.group !== 'track') {
      for (const yaw of [60, 120, 180, 240]) {
        D(d, { type: 'orientModel', modelId: id, yawDeg: yaw, pitchDeg: 0, zoom: 1 });
        await d.wait(0.25);
      }
    }
    if (m.group === 'invertebrate' || m.group === 'vertebrate') D(d, { type: 'identifyModel', modelId: id, guess: id });
    for (const r of m.regions) {
      const o = orientationFor(r);
      if (m.group !== 'track') D(d, { type: 'orientModel', modelId: id, yawDeg: o.yawDeg, pitchDeg: o.pitchDeg, zoom: 1 });
      D(d, { type: 'labelRegion', modelId: id, regionId: r.id, part: r.part });
      await d.wait(0.2);
    }
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
      part: 'A', key: 'classify',
      run: async (d) => {
        await d.press('orient', undefined, 0.5);
        for (const [id, m] of Object.entries(MATERIALS)) {
          D(d, { type: 'classifyMaterial', materialId: id, materialClass: m.materialClass, instrument: m.instrument });
          await d.wait(0.2);
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'hypothesis',
      run: async (d) => {
        ui.notebook(true, 'pre');
        ui.edit((nb) => {
          nb.prereport = { hypothesis: 'La organización cambia entre grupos y se reconoce en rasgos observables', instruments: 'Microscopio, estereoscopio y visor 3D', precautions: 'Empezar a 4X y bajar la platina antes de retirar' };
        });
        await d.wait(1.6);
        ui.notebook(false);
      },
    },
    {
      part: 'B', key: 'muscle',
      run: async (d) => {
        d.station('B');
        await d.press('mic', undefined, 0.3);
        D(d, { type: 'setPower', device: 'microscope', on: true });
        d.endPress();
        await fixedSlide(d, 'fxSK', [10, 40]);
        await d.fast(3, async () => {
          await fixedSlide(d, 'fxCA', [10, 40]);
        });
        markCenter(d, caps.fxSK?.[40], 'striations');
      },
    },
    {
      part: 'B', key: 'tissues',
      run: async (d) => {
        d.station('B');
        await d.fast(3, async () => {
          for (const id of ['fxEP', 'fxCT', 'fxNE']) await fixedSlide(d, id);
        });
      },
    },
    {
      part: 'B', key: 'inverts',
      run: async (d) => {
        d.station('B');
        await d.fast(3, async () => {
          for (const id of ['fxSP', 'fxME', 'fxPL', 'fxFL', 'fxNM', 'fxCE']) await fixedSlide(d, id);
        });
        markCenter(d, caps.fxCE?.[10], 'scolexS');
        markCenter(d, caps.fxFL?.[10], 'oralSuckerS');
        D(d, { type: 'openSlideCase', open: false });
        D(d, { type: 'setPower', device: 'microscope', on: false });
      },
    },
    {
      part: 'C', key: 'stereo',
      run: async (d) => {
        d.station('C');
        await d.press('ste', undefined, 0.3);
        D(d, { type: 'setPower', device: 'stereo', on: true });
        D(d, { type: 'setIllumination', device: 'stereo-incident', value01: 0.5 });
        if (W(d).stereo.channelMode === 'stereo-pair') {
          D(d, { type: 'setInterpupillary', valueMm: W(d).params.stereo.userIpdMm });
          D(d, { type: 'setDiopter', side: 'left', value: 0 });
          D(d, { type: 'setDiopter', side: 'right', value: 0 });
        }
        d.endPress();
        for (const id of ['stDaphnia', 'stLouse']) {
          D(d, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
          D(d, { type: 'pickSpecimen', toolId: 'fc', sourceId: id, pressure01: 0.3 });
          await d.wait(0.3);
          D(d, { type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: 0, dyCm: 0 });
          D(d, { type: 'setStereoZoom', zoomX: 1 });
          const p = W(d).params.stereo;
          const lim = p.focusRangeMm / p.focusPitchMmPerTurn - 0.5;
          D(d, { type: 'setStereoFocus', deltaTurns: -lim - W(d).stereo.focusTurns });
          let best = -1;
          let at = W(d).stereo.focusTurns;
          for (let i = 0; W(d).stereo.focusTurns + 0.25 <= lim && i < 200; i++) {
            const s = stereoView(W(d)).sharpness01;
            if (s > best) {
              best = s;
              at = W(d).stereo.focusTurns;
            }
            D(d, { type: 'setStereoFocus', deltaTurns: 0.25 });
          }
          D(d, { type: 'setStereoFocus', deltaTurns: at - W(d).stereo.focusTurns });
          D(d, { type: 'observe', instrument: 'stereo', open: true });
          await d.wait(1.8);
          const r = D(d, { type: 'captureObservation', instrument: 'stereo' });
          if (r.id) stereoCaps[id] = r.id;
          D(d, { type: 'observe', instrument: 'stereo', open: false });
          D(d, { type: 'pickSpecimen', toolId: 'fc', sourceId: id, pressure01: 0.3 });
          D(d, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sampleTray', dxCm: 0, dyCm: 0 });
          await d.wait(0.3);
        }
        D(d, { type: 'setPower', device: 'stereo', on: false });
      },
    },
    {
      part: 'D', key: 'zoo',
      run: async (d) => {
        d.station('E');
        const sim = W(d).animal.requiredModels.filter((id) => ['invertebrate', 'vertebrate'].includes(modelById(id)!.group));
        await study(d, 'grasshopper');
        await d.fast(4, async () => {
          for (const id of sim.filter((x) => x !== 'grasshopper')) await study(d, id);
        });
        D(d, { type: 'compareModels', a: 'boneFish', b: 'cartFish' });
        await d.wait(2);
        D(d, { type: 'compareModels', a: 'boneFish', b: null });
      },
    },
    {
      part: 'D', key: 'birds',
      run: async (d) => {
        for (const id of W(d).animal.requiredModels.filter((x) => modelById(x)!.group === 'bird')) {
          await study(d, id);
          const m = modelById(id)!;
          D(d, { type: 'answerBird', modelId: id, beak: m.beak ?? null, foot: m.foot ?? null });
        }
      },
    },
    {
      part: 'E', key: 'skulls',
      run: async (d) => {
        d.station('F');
        for (const id of ['skullHorse', 'skullCow']) {
          await study(d, id);
          const m = modelById(id)!;
          D(d, { type: 'answerSkull', modelId: id, taxon: m.taxon, diet: m.diet ?? '' });
        }
        D(d, { type: 'orientModel', modelId: 'skullHorse', yawDeg: 0, pitchDeg: 0, zoom: 1 });
        D(d, { type: 'orientModel', modelId: 'skullCow', yawDeg: 0, pitchDeg: 0, zoom: 1 });
        D(d, { type: 'compareModels', a: 'skullHorse', b: 'skullCow' });
        await d.wait(2.4);
        D(d, { type: 'compareModels', a: 'skullHorse', b: null });
      },
    },
    {
      part: 'E', key: 'tracks',
      run: async (d) => {
        for (const id of W(d).animal.requiredTracks) {
          await study(d, id);
          for (const az of [0, 40, 80]) {
            D(d, { type: 'setTrackLight', trackId: id, azimuthDeg: az, elevationDeg: 30 });
            await d.wait(0.4);
          }
          const t = modelById(id)!.track!;
          D(d, { type: 'answerTrack', trackId: id, digits: t.digits, support: t.support, claws: t.claws });
        }
        D(d, { type: 'openModel', modelId: null });
      },
    },
    {
      part: 'F', key: 'notes',
      run: async (d) => {
        ui.notebook(true, 'muscle');
        ui.edit((nb) => {
          nb.muscle = { ...nb.muscle, skeletalObservationId: caps.fxSK?.[10] ?? null, skeletalGuess: 'skeletal', skeletalNuclei: 'notResolved', cardiacObservationId: caps.fxCA?.[10] ?? null, cardiacGuess: 'cardiac', cardiacDiscs: 'notResolved', cardiacBranching: 'visible', prepQuality: 'considered' };
          nb.tissues[0] = { ...nb.tissues[0], observationId: caps.fxEP?.[10] ?? null, tissue: 'epithelial', level: 'tissue', structures: 'Capas de células', functionText: 'Revestimiento', basis: 'observedFeature', totalMag: '100' };
          nb.tissues[1] = { ...nb.tissues[1], observationId: caps.fxCT?.[10] ?? null, tissue: 'connective', level: 'tissue', structures: 'Fibras y fibroblastos', functionText: 'Sostén', basis: 'observedFeature', totalMag: '100' };
          nb.tissues[2] = { ...nb.tissues[2], observationId: caps.fxNE?.[10] ?? null, tissue: 'nervous', level: 'tissue', structures: 'Somas y prolongaciones', functionText: 'Conducción', basis: 'observedFeature', totalMag: '100' };
          nb.small[0] = { observationId: stereoCaps.stDaphnia ?? null, organism: 'daphnia', instrument: 'stereo', stage: 'notDetermined', motion: 'notEvaluable', trait: 'Caparazón y antenas' };
          nb.small[1] = { observationId: stereoCaps.stLouse ?? null, organism: 'louse', instrument: 'stereo', stage: 'notDetermined', motion: 'notEvaluable', trait: 'Patas con pinza' };
          nb.zoo[0] = { modelId: 'boneFish', groupName: 'Peces óseos', trait: 'Opérculo', comparedWith: 'cartFish', difference: 'Hendiduras a la vista' };
          nb.skull = { horseTrait: 'Incisivos arriba y abajo con diastema largo', cowTrait: 'Rodete dentario sin incisivos superiores', dietInference: 'Mesas anchas: moler vegetales' };
          nb.birdsFunction = 'El pico ganchudo se relaciona con desgarrar; el ancho, con filtrar.';
          nb.atlas = { conclusions: 'El atlas reúne mis capturas y rótulos, y distingue lo observado de lo inferido.', delivered: true };
        });
        await d.wait(1.8);
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('F');
        for (const t of ['fc', 'sc']) D(d, { type: 'wipe', targetId: t, toolId: 'lp' });
        await d.wait(0.5);
        D(d, { type: 'closeBench' });
        await d.wait(1);
      },
    },
  ];
}
