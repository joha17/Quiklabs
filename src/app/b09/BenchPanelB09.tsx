import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB09 } from './store';
import { b09NameOf } from './describe';
import type { PlantCommand } from '../../simulation/plant-world/commands';
import type { CutPlane, ExternalPart, PlantSpecimenId } from '../../simulation/plant-world/types';
import { EXTERNAL_REGIONS, SOURCE_REGION } from '../../simulation/plant-world/model';

type Tab = 'external' | 'cut';
const TAB_OF: Record<string, Tab> = { plantSpecimen: 'external', woodyBranch: 'external', tissueSource: 'cut', scalpel: 'cut', cuttingBoard: 'cut' };
const PARTS: ExternalPart[] = ['primaryRoot', 'lateralRoot', 'fibrousRoot', 'apicalBud', 'node', 'internode', 'petiole', 'blade', 'sheath'];
const PLANES: CutPlane[] = ['transverse', 'longitudinal', 'epidermal'];
const REGIONS = ['petiole', 'flesh', 'blade', 'other'];

/**
 * Mesa de trabajo de B09: plántulas (girar y rotular zonas sobre el modelo) y corte (sujetar, plano, grosor, región y presión del
 * bisturí; lavado). Se abre al elegir el objeto. Cada control envía un HECHO del gesto; el dominio decide qué sección resulta.
 */
export function BenchPanelB09() {
  const { t } = useTranslation();
  useB09((s) => s.version);
  const rt = useB09((s) => s.runtime);
  const sel = useB09((s) => s.selected);
  const held = useB09((s) => s.held);
  const dispatch = useB09((s) => s.dispatch);
  const toast = useB09((s) => s.toast);
  const demo = useB09((s) => !!s.demo);
  const [tab, setTab] = useState<Tab | null>(null);
  const [specimen, setSpecimen] = useState<PlantSpecimenId>('bean');
  const [source, setSource] = useState('cel');
  const [plane, setPlane] = useState<CutPlane>('transverse');
  const [um, setUm] = useState(120);
  const [pressure, setPressure] = useState(0.4);
  const [region, setRegion] = useState('petiole');
  const [rinseMl, setRinseMl] = useState(0.3);
  const w = rt?.world;
  const id = held ?? sel;
  const kind = id && w ? w.objects[id]?.kind : undefined;
  useEffect(() => {
    if (!kind || !id || !TAB_OF[kind]) return;
    setTab(TAB_OF[kind]);
    if (kind === 'plantSpecimen') setSpecimen(id as PlantSpecimenId);
    if (SOURCE_REGION[id]) {
      setSource(id);
      setRegion(SOURCE_REGION[id].region);
    }
  }, [kind, id]);
  if (!w || !tab) return null;
  // Con el ocular abierto o trabajando en el microscopio la mesa de corte estorba: vuelve al elegir de nuevo su material.
  if (w.view.instrument || (id && (w.slides[id]?.kind === 'fixed' || kind === 'microscope' || kind === 'stereo' || kind === 'slideCase'))) return null;
  const D = (c: PlantCommand) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k = `b09.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b09.cmd.FAILED'));
    }
    return r;
  };
  const num = (label: string, v: number, set: (n: number) => void, min: number, max: number, step: number, unit: string) => (
    <label className="slider">
      <span>{label}</span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} />
      <output>{v}{unit}</output>
    </label>
  );
  const mounted = Object.keys(w.mounts).filter((s) => w.mounts[s].cell?.zones.length && !w.mounts[s].coverId && w.slides[s]?.kind !== 'fixed');
  return (
    <section className={demo ? "bench-panel in-demo" : "bench-panel"} role="dialog" aria-label={t(`b09.bench.tab.${tab}`)} data-testid="b09-bench" style={{ position: 'absolute', top: '3.2rem', left: '0.6rem', zIndex: 6, width: 'min(24rem, 60%)', pointerEvents: demo ? 'none' : 'auto' }}>
      <div className="tabs" role="tablist">
        {(['external', 'cut'] as Tab[]).map((k) => <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{t(`b09.bench.tab.${k}`)}</button>)}
        <button className="btn small ghost" aria-label={t('common.close')} onClick={() => setTab(null)}>✕</button>
      </div>
      {tab === 'external' && (
        <>
          <div className="row">
            {(['bean', 'maize'] as PlantSpecimenId[]).map((s) => <button key={s} className="btn small" aria-pressed={specimen === s} onClick={() => setSpecimen(s)}>{b09NameOf(w, s)}</button>)}
            <button className="btn small" onClick={() => D({ type: 'rotatePlant', specimen, deg: 60 })}>⟳ {t('b09.bench.rotate')}</button>
            <span className="hint">{Math.round(w.plant.rotated[specimen] ?? 0)}°</span>
          </div>
          <p className="hint">{t('b09.bench.regionsHelp')}</p>
          {Object.keys(EXTERNAL_REGIONS[specimen]).map((r) => {
            const cur = w.plant.labels.find((l) => l.specimen === specimen && l.regionId === r);
            return (
              <div className="row" key={r}>
                <strong>{r.toUpperCase()}</strong>
                <select aria-label={t('b09.bench.regionLabel', { r: r.toUpperCase() })} value={cur?.part ?? ''} onChange={(e) => e.target.value && D({ type: 'labelExternal', specimen, regionId: r, part: e.target.value as ExternalPart })}>
                  <option value="">{t('nb.choose')}</option>
                  {PARTS.map((p) => <option key={p} value={p}>{t(`b09.organ.${p}`)}</option>)}
                </select>
              </div>
            );
          })}
        </>
      )}
      {tab === 'cut' && (
        <>
          <div className="row">
            {Object.keys(SOURCE_REGION).map((s) => <button key={s} className="btn small" aria-pressed={source === s} onClick={() => { setSource(s); setRegion(SOURCE_REGION[s].region); }}>{b09NameOf(w, s)}</button>)}
          </div>
          <div className="row">
            <button className="btn small" aria-pressed={w.plant.holding === source} onClick={() => D({ type: 'holdSource', sourceId: source, hold: w.plant.holding !== source })}>🤏 {t(w.plant.holding === source ? 'b09.bench.release' : 'b09.bench.hold')}</button>
            <label className="slider"><span>{t('b09.bench.plane')}</span>
              <select aria-label={t('b09.bench.plane')} value={plane} onChange={(e) => setPlane(e.target.value as CutPlane)}>{PLANES.map((p) => <option key={p} value={p}>{t(`b09.plane.${p}`)}</option>)}</select>
            </label>
            <label className="slider"><span>{t('b09.bench.region')}</span>
              <select aria-label={t('b09.bench.region')} value={region} onChange={(e) => setRegion(e.target.value)}>{REGIONS.map((p) => <option key={p} value={p}>{t(`b09.cutRegion.${p}`)}</option>)}</select>
            </label>
          </div>
          <div className="row">
            {num(t('b09.bench.thickness'), um, setUm, 10, 500, 10, ' µm')}
            {num(t('b09.bench.pressure'), pressure, setPressure, 0, 1, 0.05, '')}
            <button className="btn small primary" onClick={() => D({ type: 'cutSection', sourceId: source, plane, thicknessUm: um, lengthCm: 0.8, region, pressure01: pressure })}>✂ {t('b09.bench.cut')}</button>
          </div>
          {w.cell.board && <p className="hint">{t('b09.bench.onBoard')}</p>}
          {mounted.length > 0 && (
            <div className="row">
              {num(t('b09.bench.rinse'), rinseMl, setRinseMl, 0.1, 1.5, 0.1, ' mL')}
              {mounted.map((s) => <button key={s} className="btn small" onClick={() => D({ type: 'rinseSection', slideId: s, volumeMl: rinseMl })}>💧 {b09NameOf(w, s)}</button>)}
            </div>
          )}
          <ul className="fb-list">
            {w.plant.sections.map((s) => <li key={s.id}>{s.id} · {b09NameOf(w, s.sourceId)} · {Math.round(s.thicknessUm)} µm · {t('b09.nb.integrity', { pct: Math.round(s.integrity01 * 100) })}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
