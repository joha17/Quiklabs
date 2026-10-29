/**
 * Tinción (B02, §3.3, §6.5): recetas por muestra (qué reactivos admite y cuál exige), tiempo de contacto y elección
 * del ACTIVO que corresponde a la condición (material + preparación + tinción). No manipula fotografías: si no existe
 * un recurso aprobado para la condición, el activo queda sin cambio (Lugol con poco contacto sigue siendo «sin teñir»)
 * o se declara faltante. Volúmenes en mL; reglas deterministas.
 */
import type { CellKind, CellMountInfo, CellZone, PrepKind, StainId } from './thin-section';

export interface CellRecipe {
  kind: CellKind;
  preps: PrepKind[];
  /** Reactivos que admite la receta (agua incluida si corresponde). */
  reagents: StainId[];
  /** Colorante que exige la evidencia (`null`: ninguno; `'any'`: cualquier colorante admitido). */
  required: Exclude<StainId, 'water'> | 'any' | null;
  /** Herramientas que obtienen la muestra. */
  tools: string[];
}

export const CELL_RECIPES: Record<CellKind, CellRecipe> = {
  elodea: { kind: 'elodea', preps: ['leaf'], reagents: ['water'], required: null, tools: ['fc'] },
  potato: { kind: 'potato', preps: ['scrape'], reagents: ['water', 'lugol'], required: 'lugol', tools: ['sp', 'sc'] },
  tomato: { kind: 'tomato', preps: ['cut', 'scrape'], reagents: ['water'], required: null, tools: ['sc', 'sp'] },
  pepper: { kind: 'pepper', preps: ['cut', 'scrape'], reagents: ['water'], required: null, tools: ['sc', 'sp'] },
  carrot: { kind: 'carrot', preps: ['cut'], reagents: ['water'], required: null, tools: ['sc'] },
  pear: { kind: 'pear', preps: ['cut'], reagents: ['water', 'eosin-1pct'], required: null, tools: ['sc'] },
  guava: { kind: 'guava', preps: ['cut'], reagents: ['water', 'eosin-1pct'], required: null, tools: ['sc'] },
  apple: { kind: 'apple', preps: ['cut'], reagents: ['water', 'eosin-1pct'], required: null, tools: ['sc'] },
  buccal: { kind: 'buccal', preps: ['smear'], reagents: ['water', 'methylene-blue', 'eosin-1pct'], required: 'any', tools: ['swab'] },
  // B06: epidermis separada con pinza; protistas en gota de cultivo (metilcelulosa, Lugol y nigrosina admitidos y documentados).
  tradescantia: { kind: 'tradescantia', preps: ['peel'], reagents: ['water'], required: null, tools: ['fc'] },
  euglena: { kind: 'euglena', preps: ['drop'], reagents: ['water', 'methylcellulose', 'lugol', 'nigrosin'], required: null, tools: ['pipette'] },
  paramecium: { kind: 'paramecium', preps: ['drop'], reagents: ['water', 'methylcellulose', 'lugol', 'nigrosin'], required: null, tools: ['pipette'] },
};

export const stainVolume = (info: CellMountInfo, s: StainId) => info.stainMl[s] ?? 0;
export const hasStain = (info: CellMountInfo, s: StainId) => stainVolume(info, s) > 1e-9;

/** ¿Cumple la receta el colorante exigido? (el agua sola nunca lo cumple). */
export function requiredStainPresent(kind: CellKind, info: CellMountInfo): boolean {
  const req = CELL_RECIPES[kind].required;
  if (!req) return true;
  if (req === 'any') return CELL_RECIPES[kind].reagents.some((r) => r !== 'water' && hasStain(info, r));
  return hasStain(info, req);
}

/** Lugol con contacto suficiente: solo entonces corresponde el recurso «teñido». */
export const lugolDeveloped = (info: CellMountInfo, minContactS: number) => hasStain(info, 'lugol') && (info.contactS.lugol ?? 0) >= minContactS;

/** Condiciones del intento que eligen variantes de recurso (escenarios congelados). */
export interface AssetChoice {
  denseElodea: boolean;
  similarFruits: boolean;
  clearSclereids: boolean;
  /** Recurso base → versión docente asignada (S17). */
  override: Record<string, string>;
  /** Recursos que faltan en la asignación (S18). */
  missing: string[];
  /** Variantes de B06 (ausentes en B02–B05). */
  div?: { blurStomata: boolean; eugVisible: boolean; parFine: boolean };
}

/** Recurso base de la condición de una zona. */
export function baseAssetFor(z: CellZone, info: CellMountInfo, c: AssetChoice, minContactS: number): string {
  switch (z.kind) {
    case 'elodea': return c.denseElodea ? 'elodeaDense' : 'elodea';
    case 'potato': return lugolDeveloped(info, minContactS) ? 'potatoLugol' : 'potatoPlain';
    case 'tomato': return 'tomato';
    case 'pepper': return c.similarFruits ? 'pepperRed' : 'pepper';
    case 'carrot': return 'carrot';
    case 'pear': return hasStain(info, 'eosin-1pct') ? 'pearEosin' : c.clearSclereids ? 'pearClear' : 'pear';
    case 'guava': return 'guava';
    case 'apple': return 'missing:apple';
    case 'buccal': return hasStain(info, 'methylene-blue') ? 'buccalMB' : hasStain(info, 'eosin-1pct') ? 'buccalEosin' : 'buccalPlain';
    case 'tradescantia': return c.div?.blurStomata ? 'tradescantiaBlur' : 'tradescantia';
    // Lugol sobre un protista vivo: lo inmoviliza (recurso de la condición, no prueba de una reserva).
    case 'euglena': return hasStain(info, 'lugol') ? 'euglenaLugol' : c.div?.eugVisible ? 'euglenaVisible' : 'euglena';
    case 'paramecium': return hasStain(info, 'lugol') ? 'parameciumLugol' : hasStain(info, 'nigrosin') ? 'parameciumNigrosin' : c.div?.parFine ? 'parameciumFine' : 'paramecium';
  }
}

/** Recurso efectivo: versión docente si la hay; `missing:<id>` si la asignación no lo trae. */
export function assetFor(z: CellZone, info: CellMountInfo, c: AssetChoice, minContactS: number): string {
  const base = baseAssetFor(z, info, c, minContactS);
  if (base.startsWith('missing:') || c.missing.includes(base)) return base.startsWith('missing:') ? base : `missing:${base}`;
  return c.override[base] ?? base;
}
