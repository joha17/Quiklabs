import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLab } from '../store';
import { nameOf } from '../describe';
import { tubeLabels } from '../../practices/practice-02/definition';
import { stageEvidence } from '../../practices/practice-02/evidence';
import { tList } from '../i18n';
import type { QualitySetting } from '../../engine/quality';
import { CoatIcon, GogglesIcon, HairIcon, ShoesIcon } from './PpeIcons';

function Modal(props: { title: string; onClose?: () => void; children: React.ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && props.onClose) props.onClose();
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex="0"]')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && props.onClose) props.onClose(); }}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={props.title}>
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  );
}

const PPE_ITEMS = [
  { key: 'coat', Icon: CoatIcon },
  { key: 'goggles', Icon: GogglesIcon },
  { key: 'hair', Icon: HairIcon },
  { key: 'shoes', Icon: ShoesIcon },
] as const;
type PpeKey = (typeof PPE_ITEMS)[number]['key'];

function PpeDialog() {
  const { t } = useTranslation();
  const confirm = useLab((s) => s.confirmPpe);
  const [c, setC] = useState<Record<PpeKey, boolean>>({ coat: false, goggles: false, hair: false, shoes: false });
  const all = Object.values(c).every(Boolean);
  const count = Object.values(c).filter(Boolean).length;
  return (
    <Modal title={t('ppe.title')}>
      <p style={{ margin: 0 }}>{t('ppe.lead')}</p>
      {/* Botones con la ilustración de cada accesorio: pulsar = «me lo puse» (botón de alternancia accesible). */}
      <div className="ppe-grid">
        {PPE_ITEMS.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            className="ppe-btn"
            aria-pressed={c[key]}
            aria-label={t(`ppe.${key}`)}
            onClick={() => setC({ ...c, [key]: !c[key] })}
          >
            <span className="ppe-check" aria-hidden="true">✓</span>
            <Icon worn={c[key]} />
            <span className="ppe-name">{t(`ppe.${key}`)}</span>
            <span className="ppe-state" aria-hidden="true">{c[key] ? t('ppe.on') : t('ppe.off')}</span>
          </button>
        ))}
      </div>
      <span className="hint" aria-live="polite">{t('ppe.count', { n: count })} · {t('ppe.note')}</span>
      <div className="foot"><button className="btn primary" disabled={!all} onClick={confirm}>{t('ppe.confirm')}</button></div>
    </Modal>
  );
}

function LabelDialog({ id }: { id: string }) {
  const { t } = useTranslation();
  const rt = useLab((s) => s.runtime)!;
  const dispatch = useLab((s) => s.dispatch);
  const close = () => useLab.getState().setModal(null);
  const labels = tubeLabels(rt.world.params.oilProfile);
  return (
    <Modal title={t('labelDlg.title', { name: nameOf(rt.world, id) })} onClose={close}>
      <div className="label-grid">
        {labels.map((l) => (
          <button key={l} className="btn" aria-pressed={rt.world.vessels[id]?.label === l} onClick={() => { const ctl = useLab.getState().stage?.controller; if (ctl) ctl.labelPop(id, l); else dispatch({ type: 'label', vesselId: id, label: l }); close(); }}>{l}</button>
        ))}
      </div>
      <div className="foot">
        <button className="btn ghost" onClick={() => { dispatch({ type: 'label', vesselId: id, label: null }); close(); }}>{t('labelDlg.none')}</button>
        <button className="btn" onClick={close}>{t('labelDlg.cancel')}</button>
      </div>
    </Modal>
  );
}

/** Doblado interactivo del papel de filtro: dos pliegues por arrastre y elección del bolsillo (§2, C1). */
function FoldDialog({ id }: { id: string }) {
  const { t } = useTranslation();
  const rt = useLab((s) => s.runtime)!;
  const dispatch = useLab((s) => s.dispatch);
  useLab((s) => s.version);
  const close = () => useLab.getState().setModal(null);
  const paper = rt.world.vessels[id];
  const fold = paper?.filter?.fold ?? 'FLAT';
  const [drag, setDrag] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const [msg, setMsg] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const misfold = !!rt.world.evidence[`misfold:${id}`];

  const pt = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 300, y: ((e.clientY - r.top) / r.height) * 300 };
  };
  const onDown = (e: React.PointerEvent) => {
    if (fold !== 'FLAT' && fold !== 'HALF') return;
    const p = pt(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ x0: p.x, y0: p.y, x: p.x, y: p.y });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = pt(e);
    setDrag({ ...drag, x: p.x, y: p.y });
  };
  const onUp = () => {
    if (!drag) return;
    const dx = drag.x - drag.x0;
    const dy = drag.y - drag.y0;
    setDrag(null);
    if (fold === 'FLAT') {
      if (dy < 70) return;
      const dev = Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
      if (dev > 14) {
        dispatch({ type: 'foldPaper', paperId: id, action: 'MISALIGNED' });
        setMsg(t('fold.misaligned'));
      } else dispatch({ type: 'foldPaper', paperId: id, action: 'HALF' });
    } else if (fold === 'HALF') {
      if (dx > -60) return;
      const dev = Math.abs((Math.atan2(dy, -dx) * 180) / Math.PI);
      if (dev > 14) {
        dispatch({ type: 'foldPaper', paperId: id, action: 'MISALIGNED' });
        setMsg(t('fold.misaligned'));
      }
      dispatch({ type: 'foldPaper', paperId: id, action: 'QUARTER' });
    }
  };

  const step = fold === 'FLAT' ? 1 : fold === 'HALF' ? 2 : fold === 'QUARTER' ? 3 : 4;
  return (
    <Modal title={t('fold.title')} onClose={close}>
      <p style={{ margin: 0 }} aria-live="polite">{step === 1 ? t('fold.step1') : step === 2 ? t('fold.step2') : step === 3 ? t('fold.step3') : t('fold.done')}</p>
      <svg ref={svgRef} className="fold-svg" viewBox="0 0 300 300" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} role="img" aria-label={t('fold.title')}>
        {step === 1 && <circle cx="150" cy="150" r="110" fill="#fff" stroke="#aaa" />}
        {step === 2 && <path d="M40 150 A110 110 0 0 0 260 150 Z" fill="#fff" stroke="#aaa" />}
        {step === 3 && (
          <g>
            <path d="M150 150 L150 260 A110 110 0 0 1 40 150 Z" fill="#fff" stroke="#aaa" />
            <path d="M150 150 L150 260 A110 110 0 0 1 72 228 Z" fill="#eef5ff" stroke="#5aa9ff" strokeWidth="2" style={{ cursor: 'pointer' }}
              onClick={() => dispatch({ type: 'foldPaper', paperId: id, action: 'OPEN_3_1' })} />
            <path d="M150 150 L72 228 A110 110 0 0 1 40 150 Z" fill="#fff5e6" stroke="#f5a623" strokeWidth="2" style={{ cursor: 'pointer' }}
              onClick={() => dispatch({ type: 'foldPaper', paperId: id, action: 'OPEN_2_2' })} />
            <text x="118" y="225" fontSize="12" fill="#1f6fbf">3 | 1</text>
            <text x="70" y="180" fontSize="12" fill="#a35c00">2 | 2</text>
          </g>
        )}
        {step === 4 && (
          <g>
            <path d="M80 80 L220 80 L150 250 Z" fill="#fff" stroke={fold === 'CONE_OK' ? '#1e8e4e' : '#f5a623'} strokeWidth="2" />
            <ellipse cx="150" cy="80" rx="70" ry="16" fill="#f4f4f4" stroke="#aaa" />
            <text x="150" y="285" fontSize="14" textAnchor="middle" fill={fold === 'CONE_OK' ? '#1e8e4e' : '#a35c00'}>{fold === 'CONE_OK' ? '✓' : '⚠'}</text>
          </g>
        )}
        {drag && <line x1={drag.x0} y1={drag.y0} x2={drag.x} y2={drag.y} stroke="#1f6fbf" strokeWidth="3" strokeDasharray="6 4" />}
        {step === 1 && !drag && <text x="150" y="30" fontSize="13" textAnchor="middle" fill="#6b7784">↓</text>}
        {step === 2 && !drag && <text x="270" y="140" fontSize="13" textAnchor="middle" fill="#6b7784">←</text>}
      </svg>
      {(msg || (misfold && step >= 3)) && <p className="pending" role="status" style={{ margin: 0 }}>{msg || t('fold.misaligned')}</p>}
      <div className="foot">
        {step === 1 && <button className="btn" onClick={() => dispatch({ type: 'foldPaper', paperId: id, action: 'HALF' })}>½</button>}
        {step === 2 && <button className="btn" onClick={() => dispatch({ type: 'foldPaper', paperId: id, action: 'QUARTER' })}>¼</button>}
        {step === 3 && (
          <>
            <button className="btn" onClick={() => dispatch({ type: 'foldPaper', paperId: id, action: 'OPEN_3_1' })}>{t('fold.open31')}</button>
            <button className="btn" onClick={() => dispatch({ type: 'foldPaper', paperId: id, action: 'OPEN_2_2' })}>{t('fold.open22')}</button>
          </>
        )}
        <button className="btn primary" onClick={close}>{t('fold.close')}</button>
      </div>
    </Modal>
  );
}

function SubmitDialog() {
  const { t } = useTranslation();
  const rt = useLab((s) => s.runtime)!;
  const nb = useLab((s) => s.notebook);
  const submit = useLab((s) => s.submit);
  const close = () => useLab.getState().setModal(null);
  const flags = stageEvidence(rt.world, nb);
  const missing = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k);
  const names: Record<string, string> = {
    aSetupDone: t('stage.PART_A_SETUP'), aSamplesDone: t('stage.PART_A_OBSERVATION'), aSolubilityDone: t('stage.PART_A_SOLUBILITY'),
    aRecorded: t('stage.PART_A_REVIEW'), bPrepared: t('stage.PART_B_PREPARATION'), bHeated: t('stage.PART_B_HEATING'),
    bFiltered: t('stage.PART_B_FILTRATION'), bSplit: t('stage.PART_B_SPLIT_FILTRATE'), bEvaporated: t('stage.PART_B_EVAPORATION'),
    bCrystallized: t('stage.PART_B_CRYSTALLIZATION'), notebookDone: t('stage.NOTEBOOK_COMPLETION'),
  };
  return (
    <Modal title={t('submit.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('submit.lead')}</p>
      {missing.length > 0 && (
        <div><strong>{t('submit.missing')}</strong><ul style={{ margin: '0.3rem 0 0' }}>{missing.map((m) => <li key={m}>{names[m]}</li>)}</ul></div>
      )}
      <div className="foot">
        <button className="btn" onClick={close}>{t('submit.cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('submit.confirm')}</button>
      </div>
    </Modal>
  );
}

function SettingsDialog() {
  const { t } = useTranslation();
  const s = useLab((x) => x.settings);
  const set = useLab((x) => x.setSettings);
  const close = () => useLab.getState().setModal(null);
  return (
    <Modal title={t('settings.title')} onClose={close}>
      <div className="field">
        <label htmlFor="scale">{t('settings.scale')}</label>
        <select id="scale" value={s.uiScale} onChange={(e) => set({ uiScale: Number(e.target.value) })}>
          {[1, 1.25, 1.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="quality">{t('settings.quality')}</label>
        <select id="quality" value={s.quality ?? 'AUTO'} onChange={(e) => set({ quality: e.target.value as QualitySetting })}>
          {(['AUTO', 'HIGH', 'MEDIUM', 'LOW'] as const).map((q) => <option key={q} value={q}>{t(`settings.q${q}`)}</option>)}
        </select>
      </div>
      <label className="check"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> {t('settings.reducedMotion')}</label>
      <label className="check"><input type="checkbox" checked={s.captions} onChange={(e) => set({ captions: e.target.checked })} /> {t('settings.captions')}</label>
      <label className="check"><input type="checkbox" checked={s.showZones} onChange={(e) => set({ showZones: e.target.checked })} /> {t('settings.zones')}</label>
      <label className="check"><input type="checkbox" checked={s.showNames !== false} onChange={(e) => set({ showNames: e.target.checked })} /> {t('settings.names')}</label>
      <div className="field">
        <label htmlFor="vol">{t('settings.volume')}</label>
        <input id="vol" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </div>
      <div className="foot"><button className="btn primary" onClick={close}>{t('settings.close')}</button></div>
    </Modal>
  );
}

function HelpDialog() {
  const { t } = useTranslation();
  const close = () => useLab.getState().setModal(null);
  const backToIntro = useLab((s) => s.backToIntro);
  return (
    <Modal title={t('intro.controls')} onClose={close}>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem' }}>
        {tList('intro.controlsList').map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="foot">
        <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
        <button className="btn primary" onClick={close}>{t('common.close')}</button>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const modal = useLab((s) => s.modal);
  if (!modal) return null;
  switch (modal.kind) {
    case 'ppe':
      return <PpeDialog />;
    case 'label':
      return <LabelDialog id={modal.id} />;
    case 'fold':
      return <FoldDialog id={modal.id} />;
    case 'submit':
      return <SubmitDialog />;
    case 'settings':
      return <SettingsDialog />;
    case 'help':
      return <HelpDialog />;
  }
}
