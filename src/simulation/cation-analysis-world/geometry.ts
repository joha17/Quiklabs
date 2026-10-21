/**
 * Geometría de la Práctica 9 (cm, cm², mL) `[VALIDAR]` (§4). Un único perfil por recipiente gobierna capacidad, nivel
 * de líquido y altura del sedimento; la escena dibuja con estas mismas medidas.
 */
export const GEO09 = {
  tube: { r: 0.75, outerR: 0.85, h: 11, floor: 0.6 },
  rack: { w: 26, d: 7, h: 7, slots: 8, pitch: 3 },
  cylinder: { r: 0.65, outerR: 0.85, h: 15, floor: 1.2, baseR: 2.2 },
  beaker: { r: 2.4, h: 6.5, floor: 0.3 },
  pipette: { length: 22, r: 0.35 },
  dropperBottle: { r: 1.5, h: 6, floor: 0.3 },
  bottle: { r: 2.4, h: 9, floor: 0.4 },
  washBottle: { r: 3.2, h: 19 },
  balance: { w: 22, d: 26, h: 9, pan: 14, panZ: 9.2 },
  centrifuge: { w: 30, d: 30, h: 22, rotorR: 7, slots: 4 },
  hood: { x0: 150, x1: 320, depth: 65, h: 190, workZ: 0, sashMax: 70 },
  emitter: { r: 3.5, h: 14, padZ: 15 },
  loop: { length: 22 },
  watchGlass: { r: 4, h: 0.8 },
  refractoryCup: { r: 2, h: 1.5 },
  cleanCup: { r: 2.2, h: 6 },
  turbidimeter: { w: 14, d: 16, h: 9 },
  waste: { r: 4.3, h: 12.5, floor: 0.5 },
};

export const areaOf = (r: number) => Math.PI * r * r;

export type VesselShape09 = 'tube' | 'cylinder' | 'beaker' | 'dropperBottle' | 'bottle' | 'washBottle' | 'watchGlass' | 'refractoryCup' | 'cleanCup' | 'waste';

export interface ShapeSpec09 {
  capacityMl: number;
  areaCm2: number;
  floorCm: number;
}

export function shapeSpec09(s: VesselShape09): ShapeSpec09 {
  const G = GEO09;
  const cyl = (r: number, floor: number, cap: number): ShapeSpec09 => ({ capacityMl: cap, areaCm2: areaOf(r), floorCm: floor });
  switch (s) {
    case 'tube': return cyl(G.tube.r, G.tube.floor, 15);
    case 'cylinder': return cyl(G.cylinder.r, G.cylinder.floor, 10);
    case 'beaker': return cyl(G.beaker.r, G.beaker.floor, 50);
    case 'dropperBottle': return cyl(G.dropperBottle.r, G.dropperBottle.floor, 30);
    case 'bottle': return cyl(G.bottle.r, G.bottle.floor, 100);
    case 'washBottle': return cyl(G.washBottle.r - 0.3, 0.5, 500);
    case 'watchGlass': return { capacityMl: 4, areaCm2: areaOf(G.watchGlass.r * 0.6), floorCm: 0.1 };
    case 'refractoryCup': return { capacityMl: 2, areaCm2: areaOf(G.refractoryCup.r * 0.8), floorCm: 0.3 };
    case 'cleanCup': return cyl(G.cleanCup.r, 0.3, 20);
    case 'waste': return cyl(G.waste.r, G.waste.floor, 600);
  }
}

export const liquidHeightCm09 = (s: VesselShape09, ml: number) => (ml <= 0 ? 0 : ml / shapeSpec09(s).areaCm2);
