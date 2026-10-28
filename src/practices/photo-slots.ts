/**
 * Fotografías reales del ocular (fase 2 de B01, también B02 y B03): qué muestras de cada práctica admiten una foto por
 * objetivo. Lo comparten el servidor (valida la carga) y el cliente (panel del docente y ocular).
 *
 * Las fotos son SOLO PRESENTACIÓN: el ocular las dibuja en lugar de la ilustración cuando hay una para la muestra y el
 * objetivo enclavado, pero la evidencia (estructuras visibles, capturas válidas, nota) la siguen decidiendo los
 * manifiestos anotados del dominio, cuyo hash queda congelado en cada intento. Cambiar una foto no altera ninguna cinta.
 */
export const PHOTO_LABS = ['b01', 'b02', 'b03'] as const;
export type PhotoLab = (typeof PHOTO_LABS)[number];

export const PHOTO_OBJECTIVES = [4, 10, 40, 100] as const;
export type PhotoObjective = (typeof PHOTO_OBJECTIVES)[number];

/** Una muestra que admite fotos; `scenario`: solo aparece con un escenario docente (se lista aparte). */
export interface PhotoSlot {
  assetId: string;
  scenario?: boolean;
}

export const PHOTO_SLOTS: Record<PhotoLab, PhotoSlot[]> = {
  b01: [
    { assetId: 'elodea' }, { assetId: 'onion' }, { assetId: 'cornStem' }, { assetId: 'rootTip' },
    { assetId: 'onionPlain', scenario: true },
  ],
  b02: [
    { assetId: 'elodea' }, { assetId: 'potatoPlain' }, { assetId: 'potatoLugol' }, { assetId: 'tomato' }, { assetId: 'pepper' },
    { assetId: 'carrot' }, { assetId: 'pear' }, { assetId: 'buccalPlain' }, { assetId: 'buccalMB' },
    { assetId: 'onion', scenario: true }, { assetId: 'cornStem', scenario: true }, { assetId: 'elodeaDense', scenario: true },
    { assetId: 'pepperRed', scenario: true }, { assetId: 'pearEosin', scenario: true }, { assetId: 'pearClear', scenario: true },
    { assetId: 'guava', scenario: true }, { assetId: 'buccalEosin', scenario: true },
  ],
  // B03: la misma Elodea en agua, con plasmólisis incipiente y plasmolizada (NaCl).
  b03: [{ assetId: 'elodea' }, { assetId: 'elodeaPlasmoMild' }, { assetId: 'elodeaPlasmo' }],
};

export const isPhotoLab = (x: unknown): x is PhotoLab => (PHOTO_LABS as readonly unknown[]).includes(x);

export function isPhotoSlot(lab: PhotoLab, assetId: string, objective: number): objective is PhotoObjective {
  return PHOTO_SLOTS[lab].some((s) => s.assetId === assetId) && (PHOTO_OBJECTIVES as readonly number[]).includes(objective);
}

/** Muestra de la foto para un recurso del dominio: la versión docente de un activo (`…T2`) usa la foto del original. */
export const photoAssetKey = (assetId: string) => assetId.replace(/T2$/, '');

/** Formatos aceptados y tamaño máximo de una foto ya reducida en el navegador (bytes). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_MAX_BYTES = 1_500_000;
/** Lado mayor (px) al que el navegador reduce la foto antes de subirla. */
export const PHOTO_MAX_SIDE = 1600;
