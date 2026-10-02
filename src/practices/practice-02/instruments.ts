/**
 * Perfiles de cristalería (§3.5): superficies de revolución definidas por (radio, altura) en cm.
 * Son DATOS (sin Three): los usa la geometría del vertido, el volumen↔altura y el renderizador 3D.
 * Escena: 1 unidad = 1 cm.
 */
export type ProfilePt = [r: number, y: number];

export interface InstrumentProfile {
  /** Perfil exterior desde la base (r=0 en el eje) hasta el borde. */
  outer: ProfilePt[];
  /** Cavidad interior desde el fondo interior (r=0) hasta el borde. */
  inner: ProfilePt[];
  /** Radio de la boca (interior) y altura del borde (cm). */
  mouthR: number;
  rimY: number;
  /** Altura del fondo interior sobre la base. */
  bottomY: number;
  /** Radio exterior máximo (huella). */
  outerR: number;
  wall: number;
  material: 'glass' | 'porcelain' | 'plastic';
}

function cylinder(outerR: number, h: number, wall: number, bottom: number): InstrumentProfile {
  const ri = outerR - wall;
  return {
    outer: [[0, 0], [outerR - 0.1, 0], [outerR, 0.1], [outerR, h]],
    inner: [[0, bottom], [ri - 0.08, bottom], [ri, bottom + 0.08], [ri, h]],
    mouthR: ri, rimY: h, bottomY: bottom, outerR, wall, material: 'glass',
  };
}

function roundBottomTube(outerR: number, h: number, wall: number): InstrumentProfile {
  const ri = outerR - wall;
  const outer: ProfilePt[] = [];
  const inner: ProfilePt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (Math.PI / 2) * (i / 10);
    outer.push([outerR * Math.sin(a), outerR - outerR * Math.cos(a)]);
    inner.push([ri * Math.sin(a), outerR - ri * Math.cos(a)]);
  }
  outer.push([outerR, h]);
  inner.push([ri, h]);
  return { outer, inner, mouthR: ri, rimY: h, bottomY: outerR - ri, outerR, wall, material: 'glass' };
}

/** Beaker 50 mL: Ø ext 4,6 cm, alto 6,0 cm, pared 0,15 cm. */
export const BEAKER = cylinder(2.3, 6.0, 0.15, 0.22);

/** Probeta 10 mL: Ø ext 1,6 cm, alto 11,0 cm (incluye el pie), pared 0,12 cm, fondo grueso. */
export const GRADUATED_CYLINDER: InstrumentProfile = (() => {
  const p = cylinder(0.8, 11.0, 0.12, 1.1);
  // El pie (hexagonal) se dibuja aparte; el cuerpo empieza a 0,6 cm.
  p.outer = [[0, 0.6], [0.8, 0.6], [0.8, 11.0]];
  return p;
})();

/** Tubo de ensayo: Ø ext 1,6 cm, alto 15,0 cm, pared 0,10 cm, fondo semiesférico. */
export const TEST_TUBE = roundBottomTube(0.8, 15.0, 0.1);

/** Cápsula de porcelana: Ø ext 7,0 cm, alto 3,0 cm, pared 0,30 cm. */
export const PORCELAIN_DISH: InstrumentProfile = (() => {
  const outer: ProfilePt[] = [[0, 0], [1.4, 0], [1.5, 0.15]];
  const inner: ProfilePt[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    outer.push([1.5 + 2.0 * Math.sqrt(u), 0.15 + 2.85 * u]);
    inner.push([3.2 * Math.sqrt(u), 0.5 + 2.5 * u]);
  }
  return { outer, inner, mouthR: 3.2, rimY: 3.0, bottomY: 0.5, outerR: 3.5, wall: 0.3, material: 'porcelain' };
})();

/** Embudo de espiga corta: Ø 6,5 cm, alto total 8,0 cm (espiga 4,0 + cono 4,0). Origen = vértice del cono. */
export const FUNNEL: InstrumentProfile = {
  outer: [[0.4, -4.0], [0.4, 0], [3.25, 4.0]],
  inner: [[0, 0], [0.25, 0], [3.1, 4.0]],
  mouthR: 3.1, rimY: 4.0, bottomY: 0, outerR: 3.25, wall: 0.15, material: 'glass',
};
export const FUNNEL_STEM_CM = 4.0;
/** Borde del cono de papel de filtro dentro del embudo (≈ 0,65 cm bajo el borde del vidrio). La capacidad útil del embudo es hasta aquí. */
export const FUNNEL_PAPER_RIM_Y = 3.35;

/** Vidrio de reloj: casquete esférico Ø 6,0 cm, alto 1,0 cm. */
export const WATCH_GLASS = { diameter: 6.0, height: 1.0, thickness: 0.1 };

/** Otros recipientes (datos simples, no exigidos por la tabla de §3.5). */
export const BATH = cylinder(5.3, 7.2, 0.3, 0.4);
export const REAGENT_JAR = cylinder(2.0, 5.4, 0.2, 0.4);
export const REAGENT_BOTTLE = cylinder(1.8, 6.5, 0.2, 0.4);
export const VIAL = cylinder(1.0, 4.4, 0.1, 0.25);
export const JUG = cylinder(4.6, 15, 0.2, 0.3);
export const WASH_BOTTLE = cylinder(3.3, 15, 0.15, 0.3);
export const WASTE = cylinder(4.3, 11, 0.3, 0.3);
export const ICE_BUCKET = cylinder(5.3, 8, 0.6, 0.6);

export const PROFILES = {
  BEAKER, GRADUATED_CYLINDER, TEST_TUBE, PORCELAIN_DISH, FUNNEL, BATH, REAGENT_JAR, REAGENT_BOTTLE, VIAL, JUG, WASH_BOTTLE, WASTE, ICE_BUCKET,
} as const;

/** Radio interior a la altura y (interpolación lineal del perfil interior). */
export function innerRadiusAt(p: InstrumentProfile, y: number): number {
  const pts = p.inner;
  if (y <= pts[0][1]) return pts[0][0];
  for (let i = 1; i < pts.length; i++) {
    const [r1, y1] = pts[i];
    if (y <= y1) {
      const [r0, y0] = pts[i - 1];
      return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
  }
  return pts[pts.length - 1][0];
}

/** Volumen interior (mL) desde el fondo interior hasta la altura y (integración del perfil). */
export function volumeToHeight(p: InstrumentProfile, y: number): number {
  const y0 = p.inner[0][1];
  const y1 = Math.min(y, p.rimY);
  if (y1 <= y0) return 0;
  const n = 120;
  const dy = (y1 - y0) / n;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const r = innerRadiusAt(p, y0 + (i + 0.5) * dy);
    v += Math.PI * r * r * dy;
  }
  return v;
}

/** Altura del nivel (desde la base del objeto) para un volumen dado, recipiente vertical. */
export function heightFromVolume(p: InstrumentProfile, ml: number): number {
  let lo = p.inner[0][1];
  let hi = p.rimY;
  if (ml <= 0) return lo;
  if (ml >= volumeToHeight(p, hi)) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (volumeToHeight(p, mid) < ml) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function brimVolume(p: InstrumentProfile): number {
  return volumeToHeight(p, p.rimY);
}
