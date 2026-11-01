import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB10 } from './store';
import { AnatomyViewer3D } from '../../engine/anatomy/AnatomyViewer3D';
import type { AnimalCommand } from '../../simulation/animal-world/commands';
import { modelById, modelsOf, regionVisible, type AnatomyPart, type BeakType, type FootType, type ModelGroup, type SkullDiet, type TrackSupport } from '../../simulation/animal-world/catalog';
import { labelsOk, modelDone, sawRelief } from '../../simulation/animal-world/world';

const GROUPS: ModelGroup[] = ['invertebrate', 'vertebrate', 'bird', 'skull', 'track'];
const SHELF_GROUP: Record<string, ModelGroup> = { invRack: 'invertebrate', verRack: 'vertebrate', birdRack: 'bird', skullRack: 'skull', trackBox: 'track' };
const BEAKS: BeakType[] = ['seed', 'hook', 'filter', 'nectar', 'probe'];
const FEET: FootType[] = ['perching', 'webbed', 'raptorial', 'wading', 'cursorial'];
const DIETS: SkullDiet[] = ['grazer', 'ruminant', 'carnivore', 'omnivore'];
const TAXA = ['horse', 'cow', 'carnivore', 'omnivore'];
const SUPPORTS: TrackSupport[] = ['unguligrade', 'digitigrade', 'plantigrade', 'avian'];

/** Todas las partes del grupo, en orden fijo: la lista no delata cuáles tiene el modelo abierto. */
const partsOf = (g: ModelGroup) => [...new Set(modelsOf(g).flatMap((m) => m.regions.map((r) => r.part)))].sort();
/** El nombre visible nunca dice qué es: identificarlo es parte del ejercicio. */
const numberOf = (id: string) => modelsOf(modelById(id)!.group).findIndex((m) => m.id === id) + 1;

/**
 * Visor anatómico de B10 (§4.7, §6.5): elegir un modelo, girarlo, señalar regiones por letra, comparar dos lado a lado, y en las huellas
 * mover la luz. Los gestos son comandos; el mundo guarda la orientación y este panel solo la dibuja. Todo lo que se hace con el ratón sobre el
 * lienzo también se puede hacer con los botones, los selectores y el teclado (Q/E, flechas, +/−).
 */
export function AnatomyPanelB10() {
  const { t } = useTranslation();
  useB10((s) => s.version);
  const rt = useB10((s) => s.runtime);
  const sel = useB10((s) => s.selected);
  const dispatch = useB10((s) => s.dispatch);
  const toast = useB10((s) => s.toast);
  const demo = useB10((s) => !!s.demo);
  const [group, setGroup] = useState<ModelGroup | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<AnatomyViewer3D | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; id: string } | null>(null);
  const a = rt?.world.animal;
  const open = a?.openModel ?? null;
  const other = a?.compareWith ?? null;
  const shown = group ?? (open ? modelById(open)!.group : null);

  useEffect(() => {
    if (sel && SHELF_GROUP[sel]) setGroup(SHELF_GROUP[sel]);
  }, [sel]);

  const visible = !!shown;
  useEffect(() => {
    const c = canvas.current;
    if (!visible || !c) return;
    let v: AnatomyViewer3D;
    try {
      v = new AnatomyViewer3D(c);
    } catch {
      // Sin WebGL el panel sigue completo: selectores y botones hacen lo mismo que el lienzo.
      return;
    }
    viewer.current = v;
    const fit = () => v.resize(c.clientWidth, c.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => {
      ro.disconnect();
      v.dispose();
      viewer.current = null;
    };
  }, [visible]);

  const ids = open ? (other ? [open, other] : [open]) : [];
  const key = ids.join('+');
  const views = a?.views;
  const showNames = !!a?.showStudyLabels;
  const lights = a?.lights;
  // Cada cambio del mundo se copia al visor; el visor nunca escribe en el mundo.
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.setModels(ids);
    for (const id of ids) {
      const p = views?.[id];
      v.setPose(id, { yawDeg: p?.yawDeg ?? 0, pitchDeg: p?.pitchDeg ?? 0, zoom: p?.zoom ?? 1 });
      const l = lights?.[id];
      if (modelById(id)?.group === 'track') v.setTrackLight(id, l?.azimuthDeg ?? 90, l?.elevationDeg ?? 90);
      const names = showNames ? Object.fromEntries(modelById(id)!.regions.map((r) => [r.id, t(`b10.anat.${r.part}`)])) : null;
      v.decorate(id, id === open ? region : null, names);
    }
  });

  if (!rt || !a || !shown) return null;
  const w = rt.world;
  const D = (c: AnimalCommand) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k = `b10.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b10.cmd.FAILED'));
    }
    return r;
  };
  const close = () => {
    if (open) D({ type: 'openModel', modelId: null });
    setGroup(null);
    setRegion(null);
    useB10.getState().select(null);
  };
  const m = open ? modelById(open)! : null;
  const view = open ? a.views[open] : undefined;
  const turn = (id: string, dYaw: number, dPitch: number, zoomBy = 1) => {
    const p = a.views[id];
    D({ type: 'orientModel', modelId: id, yawDeg: (p?.yawDeg ?? 0) + dYaw, pitchDeg: (p?.pitchDeg ?? 0) + dPitch, zoom: (p?.zoom ?? 1) * zoomBy });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    const step: Record<string, [number, number, number]> = { q: [-15, 0, 1], e: [15, 0, 1], ArrowLeft: [-15, 0, 1], ArrowRight: [15, 0, 1], ArrowUp: [0, 15, 1], ArrowDown: [0, -15, 1], '+': [0, 0, 1.15], '-': [0, 0, 0.87] };
    const s = step[e.key];
    if (!s) return;
    e.preventDefault();
    e.stopPropagation();
    turn(open, s[0], s[1], s[2]);
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ids.length) return;
    const b = e.currentTarget.getBoundingClientRect();
    const id = ids[Math.min(ids.length - 1, Math.floor(((e.clientX - b.left) / b.width) * ids.length))];
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) < 3) return;
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    turn(d.id, dx * 0.6, dy * 0.6);
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !viewer.current) return;
    const b = e.currentTarget.getBoundingClientRect();
    const hit = viewer.current.pick((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
    if (hit && hit.modelId === open) setRegion(hit.regionId);
  };
  const name = (id: string) => t(`b10.modelNo.${modelById(id)!.group}`, { n: numberOf(id) });
  const light = open ? a.lights[open] : undefined;
  const bird = open ? a.birds[open] : undefined;
  const skull = open ? a.skulls[open] : undefined;
  const track = open ? a.tracks[open] : undefined;
  const parts = m ? partsOf(m.group) : [];
  const chooser = <T extends string>(label: string, value: T | '' | null | undefined, options: readonly T[], prefix: string, on: (v: T) => void) => (
    <label className="slider">
      <span>{label}</span>
      <select aria-label={label} value={value ?? ''} onChange={(e) => e.target.value && on(e.target.value as T)}>
        <option value="">{t('nb.choose')}</option>
        {options.map((o) => <option key={o} value={o}>{t(`${prefix}.${o}`)}</option>)}
      </select>
    </label>
  );

  return (
    <section className={demo ? 'anatomy-panel in-demo' : 'anatomy-panel'} role="dialog" aria-label={t('b10.viewer.title')} data-testid="b10-viewer" onKeyDown={onKey}>
      <div className="tabs" role="tablist">
        {GROUPS.map((g) => <button key={g} role="tab" aria-selected={shown === g} className="tab" onClick={() => setGroup(g)}>{t(`b10.viewer.group.${g}`)}</button>)}
        <span style={{ flex: 1 }} />
        {a.studyAllowed && (
          <label className="check"><input type="checkbox" checked={a.showStudyLabels} onChange={(e) => D({ type: 'setStudyLabels', on: e.target.checked })} /> {t('b10.viewer.study')}</label>
        )}
        <button className="btn small ghost" aria-label={t('common.close')} onClick={close}>✕</button>
      </div>
      <div className="row model-list">
        {modelsOf(shown).map((x) => {
          const required = a.requiredModels.includes(x.id) || a.requiredTracks.includes(x.id);
          return (
            <button key={x.id} className="btn small" aria-pressed={open === x.id} onClick={() => { setRegion(null); D({ type: 'openModel', modelId: x.id }); }}>
              {name(x.id)}{required ? ' •' : ''}{modelDone(w, x.id) && required ? ' ✓' : ''}
            </button>
          );
        })}
      </div>
      <div className="anatomy-body">
        <div className="anatomy-view">
          <canvas ref={canvas} tabIndex={0} aria-label={t('b10.viewer.canvas')} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
          {!open && <p className="anatomy-empty">{t('b10.viewer.pick')}</p>}
          {open && (
            <div className="anatomy-cam" role="group" aria-label={t('b10.viewer.rotate')}>
              <button className="btn small" aria-label={t('b10.viewer.left')} onClick={() => turn(open, -30, 0)}>⟲</button>
              <button className="btn small" aria-label={t('b10.viewer.right')} onClick={() => turn(open, 30, 0)}>⟳</button>
              <button className="btn small" aria-label={t('b10.viewer.up')} onClick={() => turn(open, 0, 30)}>▲</button>
              <button className="btn small" aria-label={t('b10.viewer.down')} onClick={() => turn(open, 0, -30)}>▼</button>
              <button className="btn small" aria-label={t('hud.zoomIn')} onClick={() => turn(open, 0, 0, 1.25)}>＋</button>
              <button className="btn small" aria-label={t('hud.zoomOut')} onClick={() => turn(open, 0, 0, 0.8)}>－</button>
              <span className="hint">{Math.round(view?.rotatedDeg ?? 0)}°</span>
            </div>
          )}
        </div>
        {m && (
          <div className="anatomy-side">
            <p className="hint">{t('b10.viewer.help')}</p>
            {(m.group === 'invertebrate' || m.group === 'vertebrate') && (
              <label className="slider">
                <span>{t('b10.viewer.identify')}</span>
                <select aria-label={t('b10.viewer.identify')} value={a.identified[m.id]?.guess ?? ''} onChange={(e) => e.target.value && D({ type: 'identifyModel', modelId: m.id, guess: e.target.value })}>
                  <option value="">{t('nb.choose')}</option>
                  {[...modelsOf(m.group), ...(m.group === 'vertebrate' ? [modelById('birdFinch')!] : [])].map((x) => <option key={x.id} value={x.id}>{t(`b10.model.${x.id}`)}</option>)}
                </select>
              </label>
            )}
            {m.regions.map((r) => {
              const cur = a.labels.find((l) => l.modelId === m.id && l.regionId === r.id);
              const facing = regionVisible(r, view?.yawDeg ?? 0, view?.pitchDeg ?? 0);
              return (
                <div className={region === r.id ? 'row region-row active' : 'row region-row'} key={r.id} onFocus={() => setRegion(r.id)}>
                  <strong>{r.id.toUpperCase()}</strong>
                  <select aria-label={t('b10.viewer.regionLabel', { r: r.id.toUpperCase() })} value={cur?.part ?? ''} onChange={(e) => e.target.value && D({ type: 'labelRegion', modelId: m.id, regionId: r.id, part: e.target.value as AnatomyPart })}>
                    <option value="">{t('nb.choose')}</option>
                    {parts.map((p) => <option key={p} value={p}>{t(`b10.anat.${p}`)}</option>)}
                  </select>
                  {!facing && <span className="hint" title={t('b10.viewer.hiddenHelp')}>{t('b10.viewer.hidden')}</span>}
                </div>
              );
            })}
            <p className="hint">{t('b10.viewer.labeled', { n: labelsOk(w, m.id), total: m.regions.length })}</p>
            {m.group === 'bird' && (
              <div className="row">
                {chooser(t('b10.viewer.beak'), bird?.beak, BEAKS, 'b10.beak', (v) => D({ type: 'answerBird', modelId: m.id, beak: v, foot: bird?.foot ?? null }))}
                {chooser(t('b10.viewer.foot'), bird?.foot, FEET, 'b10.foot', (v) => D({ type: 'answerBird', modelId: m.id, beak: bird?.beak ?? null, foot: v }))}
              </div>
            )}
            {m.group === 'skull' && (
              <div className="row">
                {chooser(t('b10.viewer.taxon'), skull?.taxon, TAXA, 'b10.taxon', (v) => D({ type: 'answerSkull', modelId: m.id, taxon: v, diet: skull?.diet ?? '' }))}
                {chooser(t('b10.viewer.diet'), skull?.diet, DIETS, 'b10.diet', (v) => D({ type: 'answerSkull', modelId: m.id, taxon: skull?.taxon ?? '', diet: v }))}
              </div>
            )}
            {m.group === 'track' && (
              <>
                <label className="slider">
                  <span>{t('b10.viewer.azimuth')}</span>
                  <input aria-label={t('b10.viewer.azimuth')} type="range" min={0} max={360} step={5} value={light?.azimuthDeg ?? 90} onChange={(e) => D({ type: 'setTrackLight', trackId: m.id, azimuthDeg: Number(e.target.value), elevationDeg: light?.elevationDeg ?? 90 })} />
                  <output>{Math.round(light?.azimuthDeg ?? 90)}°</output>
                </label>
                <label className="slider">
                  <span>{t('b10.viewer.elevation')}</span>
                  <input aria-label={t('b10.viewer.elevation')} type="range" min={5} max={90} step={5} value={light?.elevationDeg ?? 90} onChange={(e) => D({ type: 'setTrackLight', trackId: m.id, azimuthDeg: light?.azimuthDeg ?? 90, elevationDeg: Number(e.target.value) })} />
                  <output>{Math.round(light?.elevationDeg ?? 90)}°</output>
                </label>
                {sawRelief(w, m.id) && <p className="hint">✓ {t('b10.viewer.reliefRead')}</p>}
                <div className="row">
                  <label className="slider">
                    <span>{t('b10.viewer.digits')}</span>
                    <input aria-label={t('b10.viewer.digits')} type="number" min={1} max={5} value={track?.digits ?? 1} onChange={(e) => D({ type: 'answerTrack', trackId: m.id, digits: Number(e.target.value), support: track?.support ?? 'unguligrade', claws: track?.claws ?? false })} />
                  </label>
                  {chooser(t('b10.viewer.support'), track?.support, SUPPORTS, 'b10.support', (v) => D({ type: 'answerTrack', trackId: m.id, digits: track?.digits ?? 1, support: v, claws: track?.claws ?? false }))}
                  <label className="check"><input type="checkbox" checked={track?.claws ?? false} onChange={(e) => D({ type: 'answerTrack', trackId: m.id, digits: track?.digits ?? 1, support: track?.support ?? 'unguligrade', claws: e.target.checked })} /> {t('b10.viewer.claws')}</label>
                </div>
              </>
            )}
            <label className="slider">
              <span>{t('b10.viewer.compare')}</span>
              <select aria-label={t('b10.viewer.compare')} value={other ?? ''} onChange={(e) => D({ type: 'compareModels', a: m.id, b: e.target.value || null })}>
                <option value="">—</option>
                {modelsOf(m.group).filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{name(x.id)}</option>)}
              </select>
            </label>
            <button className="btn small ghost" onClick={() => { D({ type: 'reportAsset', assetId: m.id, problem: 'incomplete' }); toast('info', t('b10.viewer.reported')); }}>⚑ {t('b10.viewer.report')}</button>
          </div>
        )}
      </div>
      {key && <span className="sr-only" aria-live="polite">{t('b10.viewer.opened', { name: name(open!) })}</span>}
    </section>
  );
}
