/**
 * Geometría física de la Práctica 7 (cm, cm², mL), propuesta para la representación (§4.1). Un único perfil por
 * recipiente gobierna volumen, niveles de las fases, menisco y marcas; la escena dibuja con estas mismas medidas.
 */
export const GEO07 = {
  /** Tubo de ensayo 15 × 1,8 cm (radio interior 0,75 cm → 1,767 cm²): fondo interior a 0,4 cm. */
  tube: { r: 0.75, outerR: 0.9, h: 15, floor: 0.4 },
  /** Gradilla de 8 sitios, 24 × 9 × 7 cm. */
  rack: { w: 24, d: 9, h: 7, slots: 8, pitch: 2.8 },
  /** Probeta de 10,0 mL con marcas de 0,2 mL: radio interior 0,65 cm (1,327 cm² → 0,151 cm por 0,2 mL). */
  cylinder10: { r: 0.65, outerR: 0.85, floor: 1.2, h: 12, baseR: 2.2 },
  /** Vaso de 50 mL (marcas cada 10 mL). */
  beaker50: { r: 2.1, h: 6.2, floor: 0.3 },
  /** Matraz aforado de 100 mL: bulbo hasta z = 9 (95 mL) y cuello de 0,7 cm de radio con la marca de aforo. */
  flask100: { bulbR: 3.3, bulbZ: 9, bulbMl: 95, neckR: 0.7, h: 17, floor: 0.4 },
  /** Frascos: agua de referencia (250 mL), disolventes y soluciones (100 mL), sólidos y patrones. */
  bottle250: { r: 3.2, h: 12, floor: 0.5 },
  bottle100: { r: 2.5, h: 9.5, floor: 0.4 },
  jar: { r: 2.2, h: 5, floor: 0.3 },
  vial: { r: 1.8, h: 6.5, floor: 0.3 },
  waste: { r: 4.3, h: 12.5, floor: 0.5 },
  /** Gotero graduado de 5,0 mL. */
  dropper: { r: 0.45, length: 13, tipLen: 3 },
  /** Sonda conductimétrica 12 × 1,8 cm; las celdas ocupan los últimos 1,5 cm. */
  probe: { r: 0.9, length: 12, cellCm: 1.5 },
  watchGlass: { r: 3.5, h: 0.8 },
  spatula: { length: 17, w: 1 },
  stirRod: { length: 19, r: 0.25 },
  washBottle: { r: 3.5, h: 21 },
  /** Balanza granataria 22 × 26 × 11 cm, platillo 14 × 14 cm a 8,4 cm. */
  balance: { w: 22, d: 26, h: 11, pan: 14, panZ: 8.4 },
  /** Detector de sólidos 11 × 7 × 5 cm con panel de control incorporado; puntas de 14 cm. */
  detector: { w: 11, d: 7, h: 5, tipLen: 14 },
  meter: { w: 17, d: 10, h: 4 },
  tile: { w: 9, d: 9, h: 0.6 },
};

export const areaOf = (r: number) => Math.PI * r * r;

const FLASK_BULB_AREA = GEO07.flask100.bulbMl / (GEO07.flask100.bulbZ - GEO07.flask100.floor);
const FLASK_NECK_AREA = areaOf(GEO07.flask100.neckR);
/** Altura de la marca de aforo del matraz (cm sobre su base). */
export const FLASK_MARK_Z = GEO07.flask100.bulbZ + (100 - GEO07.flask100.bulbMl) / FLASK_NECK_AREA;

export type VesselShape = 'tube' | 'cylinder10' | 'beaker50' | 'flask100' | 'bottle250' | 'bottle100' | 'jar' | 'vial' | 'waste' | 'watchGlass' | 'washBottle';

export interface ShapeSpec {
  capacityMl: number;
  brimMl: number;
  areaCm2: number;
  floorCm: number;
}

export function shapeSpec(s: VesselShape): ShapeSpec {
  const cyl = (r: number, h: number, floor: number, cap: number): ShapeSpec => ({ capacityMl: cap, brimMl: areaOf(r) * (h - floor), areaCm2: areaOf(r), floorCm: floor });
  switch (s) {
    case 'tube': return cyl(GEO07.tube.r, GEO07.tube.h, GEO07.tube.floor, 20);
    case 'cylinder10': return cyl(GEO07.cylinder10.r, GEO07.cylinder10.h, GEO07.cylinder10.floor, 10);
    case 'beaker50': return cyl(GEO07.beaker50.r, GEO07.beaker50.h, GEO07.beaker50.floor, 50);
    case 'flask100': {
      const F = GEO07.flask100;
      return { capacityMl: 100, brimMl: F.bulbMl + (F.h - F.bulbZ) * FLASK_NECK_AREA, areaCm2: FLASK_BULB_AREA, floorCm: F.floor };
    }
    case 'bottle250': return cyl(GEO07.bottle250.r, GEO07.bottle250.h, GEO07.bottle250.floor, 250);
    case 'bottle100': return cyl(GEO07.bottle100.r, GEO07.bottle100.h, GEO07.bottle100.floor, 100);
    case 'jar': return cyl(GEO07.jar.r, GEO07.jar.h, GEO07.jar.floor, 60);
    case 'vial': return cyl(GEO07.vial.r, GEO07.vial.h, GEO07.vial.floor, 50);
    case 'waste': return cyl(GEO07.waste.r, GEO07.waste.h, GEO07.waste.floor, 600);
    case 'watchGlass': return { capacityMl: 5, brimMl: 6, areaCm2: areaOf(GEO07.watchGlass.r), floorCm: 0.1 };
    case 'washBottle': return cyl(GEO07.washBottle.r, GEO07.washBottle.h * 0.8, 0.5, 500);
  }
}

/** Altura del líquido (cm sobre el fondo interior) para un volumen dado; el matraz tiene bulbo y cuello. */
export function liquidHeightCm(shape: VesselShape, ml: number): number {
  if (ml <= 0) return 0;
  if (shape === 'flask100') {
    const F = GEO07.flask100;
    if (ml <= F.bulbMl) return ml / FLASK_BULB_AREA;
    return F.bulbZ - F.floor + (ml - F.bulbMl) / FLASK_NECK_AREA;
  }
  return ml / shapeSpec(shape).areaCm2;
}
