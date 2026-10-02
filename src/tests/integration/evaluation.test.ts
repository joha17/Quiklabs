/**
 * §12 — Evaluación por evidencia: la ruta correcta puntúa alto; los errores se reflejan en el componente correcto.
 */
import { describe, expect, it } from 'vitest';
import { newPracticeWorld } from '../../practices/practice-02';
import { evaluate } from '../../practices/practice-02/rubric';
import { emptyNotebook, type NotebookState } from '../../practices/practice-02/notebook';
import { partBResults } from '../../practices/practice-02/results';
import { tubeLabels } from '../../practices/practice-02/definition';
import { cmd, pourMl, run, squeezeTo } from '../helpers';
import { crystallize, evaporate, filter, heat, prepareSample, setupFilter, splitFiltrate } from '../routes';
import type { World } from '../../simulation/entities/types';

function goodNotebook(w: World): NotebookState {
  const nb = emptyNotebook();
  const row = (k: keyof NotebookState['table21'], formula: string, classification: string, state: string, color: string, odor: string, solubility: string) => {
    Object.assign(nb.table21[k], { formula, classification, state, color, odor, solubility });
  };
  row('Zn', 'Zn', 'ELEMENT', 'SOLID', 'gris_plateado', 'inodoro', 'insoluble');
  row('C', 'C', 'ELEMENT', 'SOLID', 'negro', 'inodoro', 'insoluble');
  row('S', 'S', 'ELEMENT', 'SOLID', 'amarillo', 'inodoro', 'insoluble');
  row('NaCl', 'NaCl', 'COMPOUND', 'SOLID', 'blanco', 'inodoro', 'soluble');
  row('sacarosa', 'C12H22O11', 'COMPOUND', 'SOLID', 'blanco', 'inodoro', 'soluble');
  row('aceite', 'mezcla', 'HOMOGENEOUS_MIXTURE', 'LIQUID', 'amarillo_palido', 'tenue', 'inmiscible');
  const r = partBResults(w);
  nb.table22.EVAPORATION = { observations: 'El volumen disminuye y queda un sólido blanco cristalino.', massG: r.dishSolidsG.toFixed(2), appearance: 'blanco', updatedAt: 1 };
  nb.table22.CRYSTALLIZATION = { observations: 'Aparecen cristales blancos en forma de agujas; queda disolución madre.', massG: r.crystalsG.toFixed(2), appearance: 'blanco', updatedAt: 1 };
  nb.activities.a1 = { arenaSal: 'HETEROGENEOUS_MIXTURE', aguaArena: 'HETEROGENEOUS_MIXTURE', salAgua: 'HOMOGENEOUS_MIXTURE' };
  nb.activities.a2 = {
    destilacion: 'Separa líquidos por diferencia de punto de ebullición.',
    decantacion: 'Separa un sólido sedimentado vertiendo el líquido.',
    filtracion: 'Retiene el sólido en un papel poroso y deja pasar el líquido.',
    cristalizacion: 'Forma cristales al enfriar una disolución saturada.',
    evaporacion: 'Elimina el disolvente por calentamiento y deja el soluto.',
  };
  nb.activities.a3 = 'Acelerar la disolución del KNO₃ y evitar que cristalice durante la filtración.';
  nb.activities.a4 = 'La evaporación recupera todo el soluto pero con impurezas y gasta más energía; la cristalización es más pura.';
  nb.activities.a5 = 'Parte del KNO₃ quedó retenido en el papel de filtro y otra parte quedó en la disolución madre.';
  return nb;
}

function partA(w: World) {
  const jars = ['jar_zn', 'jar_graphite', 'jar_s', 'jar_nacl', 'jar_sucrose'];
  const labels = tubeLabels(w.params.oilProfile);
  for (let i = 0; i < 6; i++) {
    cmd(w, { type: 'place', id: `t${i + 1}`, support: `rack:${i}` });
    cmd(w, { type: 'label', vesselId: `t${i + 1}`, label: labels[i] });
  }
  for (let i = 0; i < 5; i++) {
    cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: jars[i] });
    cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: `t${i + 1}` });
    cmd(w, { type: 'cleanTool', toolId: 'spatula' });
  }
  cmd(w, { type: 'aspirate', toolId: 'dropper', sourceId: 'bottle_oil', ml: 0.6 });
  cmd(w, { type: 'dispenseDrops', toolId: 'dropper', targetId: 't6', drops: 10 });
  for (let i = 0; i < 6; i++) {
    squeezeTo(w, 'cyl', 2.0);
    pourMl(w, 'cyl', `t${i + 1}`, 5, 1);
    cmd(w, { type: 'setAgitation', vesselId: `t${i + 1}`, intensity: 0.8, tool: 'SHAKE' });
    run(w, 4);
    cmd(w, { type: 'setAgitation', vesselId: `t${i + 1}`, intensity: 0, tool: 'NONE' });
    cmd(w, { type: 'fan', vesselId: `t${i + 1}` });
  }
}

function fullRoute(seed: number): World {
  const w = newPracticeWorld({ mode: 'PRACTICE', seed });
  partA(w);
  prepareSample(w);
  heat(w);
  setupFilter(w);
  filter(w);
  splitFiltrate(w);
  evaporate(w);
  crystallize(w);
  return w;
}

describe('§12 evaluación por evidencia', () => {
  const w = fullRoute(31);
  it('la ruta correcta completa obtiene una calificación alta en todos los componentes', () => {
    const ev = evaluate(w, goodNotebook(w), { ppeConfirmed: true, mode: 'PRACTICE' });
    for (const c of ev.components) expect(c.score, `${c.id}: ${JSON.stringify(c.items.filter((i) => !i.ok).map((i) => i.key))}`).toBeGreaterThan(0.8);
    expect(ev.total).toBeGreaterThan(0.88);
  });

  it('distingue seguridad de análisis: oler directo y no confirmar EPP bajan solo «seguridad»', () => {
    const w2 = structuredClone(w);
    cmd(w2, { type: 'sniffDirect', vesselId: 't6' });
    const good = evaluate(w, goodNotebook(w), { ppeConfirmed: true, mode: 'PRACTICE' });
    const bad = evaluate(w2, goodNotebook(w), { ppeConfirmed: false, mode: 'PRACTICE' });
    const g = Object.fromEntries(good.components.map((c) => [c.id, c.score]));
    const b = Object.fromEntries(bad.components.map((c) => [c.id, c.score]));
    expect(b.safety).toBeLessThan(g.safety);
    expect(b.results).toBeCloseTo(g.results, 6);
    expect(b.partA).toBeCloseTo(g.partA, 6);
  });

  it('una libreta vacía baja Parte A y resultados, no la seguridad', () => {
    const ev = evaluate(w, emptyNotebook(), { ppeConfirmed: true, mode: 'PRACTICE' });
    const s = Object.fromEntries(ev.components.map((c) => [c.id, c.score]));
    expect(s.partA).toBeLessThan(0.5);
    expect(s.results).toBeLessThan(0.3);
    expect(s.safety).toBeGreaterThan(0.9);
  });
});
