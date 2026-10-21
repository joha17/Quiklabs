/**
 * Caja de láminas fijas (§5.3): ranuras con su lámina de origen. Retirar exige la tapa abierta; devolver en otra
 * ranura desordena la caja (E44). Las láminas fijas no se reacondicionan: no aceptan gota ni otro cubreobjetos.
 */
export interface SlideCaseState {
  open: boolean;
  /** Ranura → lámina que contiene ahora (o vacía). */
  slots: Record<string, string | null>;
  /** Ranura de origen de cada lámina. */
  home: Record<string, string>;
}

export const slotOf = (c: SlideCaseState, slideId: string): string | null => Object.keys(c.slots).find((k) => c.slots[k] === slideId) ?? null;

export const outsideCase = (c: SlideCaseState): string[] => Object.keys(c.home).filter((id) => !slotOf(c, id));

export const misplaced = (c: SlideCaseState): string[] => Object.keys(c.home).filter((id) => {
  const s = slotOf(c, id);
  return s !== null && s !== c.home[id];
});
