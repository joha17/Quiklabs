/**
 * Módulos de interfaz de cada laboratorio: la pantalla (carga diferida), su store (para aplicar el modo del curso y
 * exponerlo como `window.__<id>` a las pruebas) y el intento guardado en este navegador (tarjeta del menú).
 * La lista de laboratorios, su orden y su área están en `src/labs/registry.ts`; `Record<LabId, …>` obliga a que cada
 * id tenga su entrada aquí.
 */
import { lazy, type ComponentType } from 'react';
import type { LabId } from '../labs/registry';
import { useLab } from './store';
import { P2App } from './P2App';
import { loadAttempt } from './persistence';
import { loadP01Attempt } from './p01/persistence';
import { loadP3Attempt } from './p3/persistence';
import { loadP4Attempt } from './p4/persistence';
import { loadP5Attempt } from './p5/persistence';
import { loadP6Attempt } from './p6/persistence';
import { loadP07Attempt } from './p7/persistence';
import { loadP08Attempt } from './p8/persistence';
import { loadP09Attempt } from './p9/persistence';
import { loadP10Attempt } from './p10/persistence';
import { loadB01Attempt } from './b01/persistence';
import { loadB02Attempt } from './b02/persistence';
import { loadB03Attempt } from './b03/persistence';
import { loadB04Attempt } from './b04/persistence';
import { loadB05Attempt } from './b05/persistence';
import { loadB06Attempt } from './b06/persistence';
import { loadB07Attempt } from './b07/persistence';
import { loadB08Attempt } from './b08/persistence';
import { loadB09Attempt } from './b09/persistence';
import { loadB10Attempt } from './b10/persistence';
import { loadF101Attempt } from './f101/persistence';
import { loadF102Attempt } from './f102/persistence';
import { loadF103Attempt } from './f103/persistence';
import { loadF04Attempt } from './f04/persistence';
import { loadF05Attempt } from './f05/persistence';
import { loadF06Attempt } from './f06/persistence';
import { loadF07Attempt } from './f07/persistence';
import { loadF08Attempt } from './f08/persistence';
import { loadF09Attempt } from './f09/persistence';
import { loadF10Attempt } from './f10/persistence';
import { loadF11Attempt } from './f11/persistence';

/** Lo mínimo que la plataforma necesita del store de un laboratorio. */
export interface LabStore {
  getState(): { setSettings(s: { mode: never }): void };
}

/** Lo que el menú muestra de un intento guardado. */
export interface SavedAttempt {
  settings: { mode: string };
  world: { timeS: number };
  submitted: boolean;
}

export interface LabModule {
  App: ComponentType<{ onBack: () => void }>;
  store: () => LabStore | Promise<LabStore>;
  loadAttempt: () => SavedAttempt | null;
}

export const LAB_MODULES: Record<LabId, LabModule> = {
  p01: { App: lazy(() => import('./p01/P01App')), store: () => import('./p01/store').then((m) => m.useP01), loadAttempt: loadP01Attempt },
  p2: { App: P2App, store: () => useLab, loadAttempt },
  p3: { App: lazy(() => import('./p3/P3App')), store: () => import('./p3/store').then((m) => m.useP3), loadAttempt: loadP3Attempt },
  p4: { App: lazy(() => import('./p4/P4App')), store: () => import('./p4/store').then((m) => m.useP4), loadAttempt: loadP4Attempt },
  p5: { App: lazy(() => import('./p5/P5App')), store: () => import('./p5/store').then((m) => m.useP5), loadAttempt: loadP5Attempt },
  p6: { App: lazy(() => import('./p6/P6App')), store: () => import('./p6/store').then((m) => m.useP6), loadAttempt: loadP6Attempt },
  p7: { App: lazy(() => import('./p7/P07App')), store: () => import('./p7/store').then((m) => m.useP07), loadAttempt: loadP07Attempt },
  p8: { App: lazy(() => import('./p8/P08App')), store: () => import('./p8/store').then((m) => m.useP08), loadAttempt: loadP08Attempt },
  p9: { App: lazy(() => import('./p9/P09App')), store: () => import('./p9/store').then((m) => m.useP09), loadAttempt: loadP09Attempt },
  p10: { App: lazy(() => import('./p10/P10App')), store: () => import('./p10/store').then((m) => m.useP10), loadAttempt: loadP10Attempt },
  b01: { App: lazy(() => import('./b01/B01App')), store: () => import('./b01/store').then((m) => m.useB01), loadAttempt: loadB01Attempt },
  b02: { App: lazy(() => import('./b02/B02App')), store: () => import('./b02/store').then((m) => m.useB02), loadAttempt: loadB02Attempt },
  b03: { App: lazy(() => import('./b03/B03App')), store: () => import('./b03/store').then((m) => m.useB03), loadAttempt: loadB03Attempt },
  b04: { App: lazy(() => import('./b04/B04App')), store: () => import('./b04/store').then((m) => m.useB04), loadAttempt: loadB04Attempt },
  b05: { App: lazy(() => import('./b05/B05App')), store: () => import('./b05/store').then((m) => m.useB05), loadAttempt: loadB05Attempt },
  b06: { App: lazy(() => import('./b06/B06App')), store: () => import('./b06/store').then((m) => m.useB06), loadAttempt: loadB06Attempt },
  b07: { App: lazy(() => import('./b07/B07App')), store: () => import('./b07/store').then((m) => m.useB07), loadAttempt: loadB07Attempt },
  b08: { App: lazy(() => import('./b08/B08App')), store: () => import('./b08/store').then((m) => m.useB08), loadAttempt: loadB08Attempt },
  b09: { App: lazy(() => import('./b09/B09App')), store: () => import('./b09/store').then((m) => m.useB09), loadAttempt: loadB09Attempt },
  b10: { App: lazy(() => import('./b10/B10App')), store: () => import('./b10/store').then((m) => m.useB10), loadAttempt: loadB10Attempt },
  f101: { App: lazy(() => import('./f101/F101App')), store: () => import('./f101/store').then((m) => m.useF101), loadAttempt: loadF101Attempt },
  f102: { App: lazy(() => import('./f102/F102App')), store: () => import('./f102/store').then((m) => m.useF102), loadAttempt: loadF102Attempt },
  f103: { App: lazy(() => import('./f103/F103App')), store: () => import('./f103/store').then((m) => m.useF103), loadAttempt: loadF103Attempt },
  f04: { App: lazy(() => import('./f04/F04App')), store: () => import('./f04/store').then((m) => m.useF04), loadAttempt: loadF04Attempt },
  f05: { App: lazy(() => import('./f05/F05App')), store: () => import('./f05/store').then((m) => m.useF05), loadAttempt: loadF05Attempt },
  f06: { App: lazy(() => import('./f06/F06App')), store: () => import('./f06/store').then((m) => m.useF06), loadAttempt: loadF06Attempt },
  f07: { App: lazy(() => import('./f07/F07App')), store: () => import('./f07/store').then((m) => m.useF07), loadAttempt: loadF07Attempt },
  f08: { App: lazy(() => import('./f08/F08App')), store: () => import('./f08/store').then((m) => m.useF08), loadAttempt: loadF08Attempt },
  f09: { App: lazy(() => import('./f09/F09App')), store: () => import('./f09/store').then((m) => m.useF09), loadAttempt: loadF09Attempt },
  f10: { App: lazy(() => import('./f10/F10App')), store: () => import('./f10/store').then((m) => m.useF10), loadAttempt: loadF10Attempt },
  f11: { App: lazy(() => import('./f11/F11App')), store: () => import('./f11/store').then((m) => m.useF11), loadAttempt: loadF11Attempt },
};
