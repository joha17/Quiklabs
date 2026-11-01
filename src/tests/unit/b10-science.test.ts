/**
 * B10 — la ciencia que la práctica enseña (§3) y la correspondencia entre el catálogo puro y lo que se dibuja: cada región evaluada existe
 * en la geometría, y cada rasgo que el catálogo afirma se puede ver en el modelo o la lámina.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ANATOMY_MODELS, modelById, orientationFor, regionVisible, viewVector } from '../../simulation/animal-world/catalog';
import { ANIMAL_ASSETS, assetById, structureStatus } from '../../simulation/specimens/assets';
import { Kit } from '../../engine/anatomy/kit';
import { SPECIMEN_BUILDERS } from '../../engine/anatomy/specimens';
import { TRACK_IDS, buildTrack } from '../../engine/anatomy/tracks';
import { TA_NAMES } from '../../simulation/animal-world/codes';
import { SIMULATED_ERRORS_B10 } from '../../practices/practice-b10/error-scenarios';

const parts = (id: string) => modelById(id)!.regions.map((r) => r.part);
const regionsIn = (root: THREE.Object3D) => {
  const out = new Set<string>();
  root.traverse((o) => {
    if (typeof o.userData.region === 'string') out.add(o.userData.region);
  });
  return out;
};
const triangles = (root: THREE.Object3D) => {
  let n = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) n += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  return n;
};
const built = (id: string) => {
  if (modelById(id)!.group === 'track') return buildTrack(id);
  const k = new Kit();
  SPECIMEN_BUILDERS[id](k);
  return k.root;
};

describe('B10 — correcciones científicas de la guía', () => {
  it('la vaca no tiene incisivos superiores: rodete dentario; el caballo sí', () => {
    expect(parts('skullCow')).toContain('dentalPad');
    expect(parts('skullHorse')).toContain('incisor');
    expect(parts('skullHorse')).not.toContain('dentalPad');
    expect(modelById('skullCow')!.regions.find((r) => r.part === 'dentalPad')!.facing![1]).toBeLessThan(0);
  });
  it('ambos tienen diastema; el canino de la vaca no se rotula aparte', () => {
    expect(parts('skullCow')).toContain('diastema');
    expect(parts('skullHorse')).toContain('diastema');
    expect(parts('skullCow')).not.toContain('canine');
  });
  it('solo el cerdo lleva colmillo rotulado', () => {
    for (const m of ANATOMY_MODELS.filter((x) => x.group === 'skull')) expect(m.regions.some((r) => r.part === 'tusk')).toBe(m.id === 'skullPig');
  });
  it('los arácnidos no llevan cabeza y tórax separados', () => {
    for (const id of ['spider', 'scorpion', 'opilion']) {
      expect(parts(id)).not.toContain('head');
      expect(parts(id)).not.toContain('thorax');
    }
    expect(parts('grasshopper')).toEqual(expect.arrayContaining(['head', 'thorax', 'abdomen']));
  });
  it('los gusanos no segmentados no tienen segmentos que rotular', () => {
    for (const id of ['planaria', 'fluke', 'nematode']) expect(parts(id)).not.toContain('segment');
    expect(parts('earthworm')).toEqual(expect.arrayContaining(['segment', 'clitellum']));
  });
  it('un ave sin rasgo claro no se evalúa, y la identificación es funcional', () => {
    expect(modelById('birdRunner')!.beak).toBeUndefined();
    for (const m of ANATOMY_MODELS.filter((x) => x.group === 'bird')) expect(m.taxon).toBe('aves');
  });
  it('huellas: dedos y apoyo de cada animal', () => {
    const t = (id: string) => modelById(id)!.track!;
    expect(t('trackHorse')).toEqual({ digits: 1, support: 'unguligrade', claws: false });
    expect(t('trackCow')).toEqual({ digits: 2, support: 'unguligrade', claws: false });
    expect(t('trackDog').claws).toBe(true);
    expect(t('trackCat').claws).toBe(false);
    expect(t('trackBear')).toMatchObject({ digits: 5, support: 'plantigrade' });
  });
  it('los discos intercalares solo son visibles en el activo que los resuelve', () => {
    expect(structureStatus(assetById('muscleCardiac')!, 'intercalatedDisc')).toBe('inferred');
    expect(structureStatus(assetById('muscleCardiacDiscs')!, 'intercalatedDisc')).toBe('visible');
    expect(structureStatus(assetById('muscleSkeletal')!, 'intercalatedDisc')).toBe('unavailable');
  });
  it('las estriaciones se resuelven a 40X, no a 4X', () => {
    const an = assetById('muscleSkeletal')!.annotations.find((a) => a.structureId === 'striations')!;
    expect(an.observableAtObjectiveX).toEqual([40]);
    expect(structureStatus(assetById('muscleSmooth')!, 'striations')).toBe('unavailable');
  });
  it('la esponja no anota capas de tejido y la medusa sí', () => {
    expect(structureStatus(assetById('sponge')!, 'mesoglea')).toBe('unavailable');
    expect(structureStatus(assetById('medusa')!, 'mesoglea')).toBe('visible');
  });
});

describe('B10 — catálogo contra geometría', () => {
  it('hay un cuerpo por modelo', () => {
    for (const m of ANATOMY_MODELS) {
      if (m.group === 'track') expect(TRACK_IDS, m.id).toContain(m.id);
      else expect(SPECIMEN_BUILDERS[m.id], m.id).toBeTruthy();
    }
  });
  it('cada región del catálogo existe en la geometría, y nada se dibuja con una región inventada', () => {
    for (const m of ANATOMY_MODELS) {
      const drawn = regionsIn(built(m.id));
      const declared = new Set(m.regions.map((r) => r.id));
      expect([...declared].filter((r) => !drawn.has(r)), `${m.id} sin dibujar`).toEqual([]);
      expect([...drawn].filter((r) => !declared.has(r)), `${m.id} sobrante`).toEqual([]);
    }
  });
  it('cada región se puede mirar desde alguna orientación', () => {
    for (const m of ANATOMY_MODELS) for (const r of m.regions) {
      const o = orientationFor(r);
      expect(regionVisible(r, o.yawDeg, o.pitchDeg), `${m.id}.${r.id}`).toBe(true);
    }
  });
  it('el dominio y el visor giran igual: lo que el catálogo dice que mira a la cámara, mira a la cámara', () => {
    for (const [yaw, pitch] of [[0, 0], [90, 0], [200, 0], [30, 45], [300, -60]] as const) {
      const g = new THREE.Object3D();
      g.rotation.set((pitch * Math.PI) / 180, (-yaw * Math.PI) / 180, 0, 'XYZ');
      g.updateMatrixWorld();
      const v = viewVector(yaw, pitch);
      const toCam = new THREE.Vector3(...v).applyMatrix4(g.matrixWorld);
      expect(toCam.z).toBeCloseTo(1, 5);
    }
  });
  it('los regímenes de letra por modelo son únicos', () => {
    for (const m of ANATOMY_MODELS) expect(new Set(m.regions.map((r) => r.id)).size, m.id).toBe(m.regions.length);
  });
  it('cada modelo cabe en el presupuesto del visor', () => {
    for (const m of ANATOMY_MODELS) expect(triangles(built(m.id)), m.id).toBeLessThan(120000);
  });
  it('el modelo cabe en el encuadre del visor', () => {
    for (const m of ANATOMY_MODELS) {
      if (m.group === 'track') continue;
      const b = new THREE.Box3().setFromObject(built(m.id));
      expect(Math.max(b.max.x, -b.min.x), `${m.id} x`).toBeLessThan(6.2);
      expect(Math.max(b.max.y, -b.min.y), `${m.id} y`).toBeLessThan(6);
    }
  });
});

describe('B10 — catálogo de errores', () => {
  it('98 códigos únicos, en orden, y seis incidencias', () => {
    expect(TA_NAMES).toHaveLength(98);
    expect(new Set(TA_NAMES).size).toBe(98);
    expect(SIMULATED_ERRORS_B10.filter((e) => e.kind === 'asset')).toHaveLength(6);
  });
  it('los activos declaran extensión realista y anotaciones dentro de la imagen', () => {
    for (const a of Object.values(ANIMAL_ASSETS)) {
      expect(a.extentMm[0], a.assetId).toBeGreaterThan(1);
      for (const an of a.annotations) for (const [u, v] of an.polygonNormalized) {
        expect(u, `${a.assetId} ${an.structureId}`).toBeGreaterThanOrEqual(0);
        expect(v, `${a.assetId} ${an.structureId}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
