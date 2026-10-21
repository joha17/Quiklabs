/**
 * Geometría física de la Práctica 8 (cm, cm², mL), propuesta para la representación (§4). Un único perfil por
 * recipiente gobierna capacidad, nivel de líquido, interfase y marcas; la escena dibuja con estas mismas medidas.
 * Los recipientes curvos (balón, embudo de separación, Erlenmeyer) usan una sección efectiva constante (simplificación).
 */
export const GEO08 = {
  roundFlask: { r: 2.3, neckR: 0.7, h: 11, floor: 0.4, bulbH: 4.6 },
  beaker50: { r: 2.1, h: 6.2, floor: 0.3 },
  beaker100: { r: 2.6, h: 7.5, floor: 0.3 },
  erlenmeyer: { r: 2.9, mouthR: 1.1, h: 10, floor: 0.4 },
  cyl10: { r: 0.65, outerR: 0.85, h: 15, floor: 1.2, baseR: 2.2 },
  cyl25: { r: 0.95, outerR: 1.15, h: 18, floor: 1.4, baseR: 2.6 },
  sepFunnel: { r: 3.0, h: 16, floor: 2.0, stemLen: 7 },
  kitasato: { r: 3.6, h: 15, floor: 0.4 },
  buchner: { r: 3.5, h: 4, stemLen: 5 },
  filterPaper: { r: 3.4, h: 2.2, floor: 0.05 },
  vial: { r: 1.3, h: 6, floor: 0.3 },
  bottle250: { r: 3.2, h: 12, floor: 0.5 },
  bottle100: { r: 2.5, h: 9.5, floor: 0.4 },
  dropperBottle: { r: 1.8, h: 7, floor: 0.3 },
  jar: { r: 2.2, h: 5, floor: 0.3 },
  watchGlass: { r: 4.5, h: 0.8 },
  washBottle: { r: 3.5, h: 21 },
  waste: { r: 4.3, h: 12.5, floor: 0.5 },
  bath: { r: 5.2, h: 9, floor: 0.4 },
  iceBath: { w: 18, d: 18, h: 12 },
  plasticCup: { r: 2.4, h: 7, floor: 0.2 },
  plate: { w: 25, d: 25, h: 12 },
  balance: { w: 25, d: 18, h: 13, pan: 13, panZ: 9 },
  condenser: { h: 22, r: 0.9 },
  stand: { h: 55 },
  fractionModule: { w: 35, d: 24, h: 30 },
  analyzer: { w: 22, d: 24, h: 18 },
  mpApparatus: { w: 18, d: 16, h: 25 },
  oven: { w: 30, d: 26, h: 26 },
};

export const areaOf = (r: number) => Math.PI * r * r;

export type VesselShape08 =
  | 'roundFlask' | 'beaker50' | 'beaker100' | 'erlenmeyer' | 'cyl10' | 'cyl25' | 'sepFunnel' | 'kitasato' | 'filterPaper' | 'vial'
  | 'bottle250' | 'bottle100' | 'dropperBottle' | 'jar' | 'watchGlass' | 'washBottle' | 'waste' | 'bath' | 'iceBath' | 'plasticCup';

export interface ShapeSpec08 {
  capacityMl: number;
  brimMl: number;
  areaCm2: number;
  floorCm: number;
}

export function shapeSpec08(s: VesselShape08): ShapeSpec08 {
  const cyl = (r: number, h: number, floor: number, cap: number): ShapeSpec08 => ({ capacityMl: cap, brimMl: areaOf(r) * (h - floor), areaCm2: areaOf(r), floorCm: floor });
  const G = GEO08;
  switch (s) {
    case 'roundFlask': return { capacityMl: 50, brimMl: 62, areaCm2: 50 / (G.roundFlask.bulbH * 1.05), floorCm: G.roundFlask.floor };
    case 'beaker50': return cyl(G.beaker50.r, G.beaker50.h, G.beaker50.floor, 50);
    case 'beaker100': return cyl(G.beaker100.r, G.beaker100.h, G.beaker100.floor, 100);
    case 'erlenmeyer': return { capacityMl: 100, brimMl: 125, areaCm2: 16, floorCm: G.erlenmeyer.floor };
    case 'cyl10': return cyl(G.cyl10.r, G.cyl10.h, G.cyl10.floor, 10);
    case 'cyl25': return cyl(G.cyl25.r, G.cyl25.h, G.cyl25.floor, 25);
    case 'sepFunnel': return { capacityMl: 125, brimMl: 140, areaCm2: 10, floorCm: G.sepFunnel.floor };
    case 'kitasato': return cyl(G.kitasato.r, G.kitasato.h, G.kitasato.floor, 250);
    case 'filterPaper': return { capacityMl: 40, brimMl: 45, areaCm2: areaOf(G.filterPaper.r), floorCm: G.filterPaper.floor };
    case 'vial': return cyl(G.vial.r, G.vial.h, G.vial.floor, 20);
    case 'bottle250': return cyl(G.bottle250.r, G.bottle250.h, G.bottle250.floor, 250);
    case 'bottle100': return cyl(G.bottle100.r, G.bottle100.h, G.bottle100.floor, 100);
    case 'dropperBottle': return cyl(G.dropperBottle.r, G.dropperBottle.h, G.dropperBottle.floor, 30);
    case 'jar': return cyl(G.jar.r, G.jar.h, G.jar.floor, 60);
    case 'watchGlass': return { capacityMl: 5, brimMl: 6, areaCm2: areaOf(G.watchGlass.r), floorCm: 0.1 };
    case 'washBottle': return cyl(G.washBottle.r, G.washBottle.h * 0.8, 0.5, 500);
    case 'waste': return cyl(G.waste.r, G.waste.h, G.waste.floor, 600);
    case 'bath': return cyl(G.bath.r, G.bath.h, G.bath.floor, 400);
    case 'iceBath': return { capacityMl: 2500, brimMl: 3000, areaCm2: G.iceBath.w * G.iceBath.d, floorCm: 0.5 };
    case 'plasticCup': return cyl(G.plasticCup.r, G.plasticCup.h, G.plasticCup.floor, 100);
  }
}

/** Altura del líquido (cm sobre el fondo interior). */
export const liquidHeightCm08 = (s: VesselShape08, ml: number) => (ml <= 0 ? 0 : ml / shapeSpec08(s).areaCm2);
