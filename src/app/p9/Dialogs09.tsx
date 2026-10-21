import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import { Modal } from './ui';
import { tList } from '../i18n';
import type { QualitySetting } from '../../engine/quality';
import { CoatIcon, GogglesIcon } from '../accessibility/PpeIcons';
import { p09StageEvidence } from '../../practices/practice-09/evidence';
import type { P09World } from '../../simulation/cation-analysis-world/types';

/** Guantes de nitrilo (sales de hierro, amoníaco diluido y ácido nítrico diluido). */
function GlovesIcon({ worn }: { worn: boolean }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" className="ppe-backdrop" />
      <path d="M30 84 V48 Q30 40 36 40 V22 Q36 18 40 18 Q44 18 44 22 V36 V16 Q44 12 48 12 Q52 12 52 16 V36 V19 Q52 15 56 15 Q60 15 60 19 V38 V28 Q60 24 64 24 Q68 24 68 28 V58 Q68 72 58 84 Z" fill={worn ? '#5c6bc0' : '#dfe3e8'} stroke="#55636f" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

const PPE_ITEMS = [
  { key: 'goggles', Icon: GogglesIcon },
  { key: 'coat', Icon: CoatIcon },
  { key: 'gloves', Icon: GlovesIcon },
] as const;
type PpeKey = (typeof PPE_ITEMS)[number]['key'];

/** No se entrega con un vertido en curso, la pipeta entregando, la llama encendida, el rotor girando o un bloqueo. */
export function p09SubmissionBlockers(w: P09World): string[] {
  const out: string[] = [];
  if (Object.keys(w.pours).length) out.push('POURING');
  if (w.pipette.squeeze01 !== 0) out.push('PIPETTE');
  if (w.flame.ignited) out.push('FLAME');
  if (w.centrifuge.rpm > 1) out.push('ROTOR');
  if (w.safety.block) out.push('BLOCK');
  return out;
}

/**
 * Equipo de protección (§10): gafas, bata y guantes de nitrilo. Empezar con algo faltante se rechaza, se explica y
 * queda registrado (E01).
 */
function PpeDialog() {
  const { t } = useTranslation();
  const confirm = useP09((s) => s.confirmPpe);
  const [c, setC] = useState<Record<PpeKey, boolean>>({ goggles: false, coat: false, gloves: false });
  const [refused, setRefused] = useState(false);
  const count = Object.values(c).filter(Boolean).length;
  const missing = PPE_ITEMS.filter(({ key }) => !c[key]).map(({ key }) => t(`p9.ppe.${key}`));
  return (
    <Modal title={t('ppe.title')}>
      <p style={{ margin: 0 }}>{t('p9.ppe.lead')}</p>
      <div className="ppe-grid">
        {PPE_ITEMS.map(({ key, Icon }) => (
          <button key={key} type="button" className="ppe-btn" aria-pressed={c[key]} aria-label={t(`p9.ppe.${key}`)} onClick={() => setC({ ...c, [key]: !c[key] })}>
            <span className="ppe-check" aria-hidden="true">✓</span>
            <Icon worn={c[key]} />
            <span className="ppe-name">{t(`p9.ppe.${key}`)}</span>
            <span className="ppe-state" aria-hidden="true">{c[key] ? t('ppe.on') : t('ppe.off')}</span>
          </button>
        ))}
      </div>
      <ul className="hint" style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {tList('p9.ppe.hazards').map((h) => <li key={h}>{h}</li>)}
      </ul>
      <span className="hint" aria-live="polite">{t('ppe.count', { n: count })}</span>
      {refused && missing.length > 0 && <div className="toast critical" role="alert" style={{ display: 'block' }}>⛔ {t('p9.ppe.refused', { items: missing.join(', ') })}</div>}
      <div className="foot">
        <button className="btn primary" onClick={() => setRefused(!confirm(c))}>{t('ppe.confirm')}</button>
      </div>
    </Modal>
  );
}

function SubmitDialog() {
  const { t } = useTranslation();
  const rt = useP09((s) => s.runtime)!;
  const nb = useP09((s) => s.notebook);
  const submit = useP09((s) => s.submit);
  useP09((s) => s.version);
  const close = () => useP09.getState().setModal(null);
  const flags = p09StageEvidence(rt.world, nb);
  const missing = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k);
  const blockers = p09SubmissionBlockers(rt.world);
  return (
    <Modal title={t('submit.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p9.submit.lead')}</p>
      {blockers.length > 0 && (
        <div className="toast alert" role="alert" style={{ display: 'block' }}>
          <strong>{t('p9.submit.blocked')}</strong>
          <ul style={{ margin: '0.3rem 0 0' }}>{blockers.map((b) => <li key={b}>{t(`p9.submit.b_${b}`)}</li>)}</ul>
        </div>
      )}
      {missing.length > 0 && (
        <div><strong>{t('submit.missing')}</strong><ul style={{ margin: '0.3rem 0 0' }}>{missing.map((m) => <li key={m}>{t(`p9.flag.${m}`)}</li>)}</ul></div>
      )}
      <div className="foot">
        <button className="btn" onClick={close}>{t('submit.cancel')}</button>
        <button className="btn primary" disabled={blockers.length > 0} onClick={submit}>{t('submit.confirm')}</button>
      </div>
    </Modal>
  );
}

function SettingsDialog() {
  const { t } = useTranslation();
  const s = useP09((x) => x.settings);
  const set = useP09((x) => x.setSettings);
  const close = () => useP09.getState().setModal(null);
  return (
    <Modal title={t('settings.title')} onClose={close}>
      <div className="field">
        <label htmlFor="p9scale">{t('settings.scale')}</label>
        <select id="p9scale" value={s.uiScale} onChange={(e) => set({ uiScale: Number(e.target.value) })}>
          {[1, 1.25, 1.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="p9quality">{t('settings.quality')}</label>
        <select id="p9quality" value={s.quality ?? 'AUTO'} onChange={(e) => set({ quality: e.target.value as QualitySetting })}>
          {(['AUTO', 'HIGH', 'MEDIUM', 'LOW'] as const).map((q) => <option key={q} value={q}>{t(`settings.q${q}`)}</option>)}
        </select>
      </div>
      <label className="check"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> {t('p10.settings.reducedMotion')}</label>
      <label className="check"><input type="checkbox" checked={s.captions} onChange={(e) => set({ captions: e.target.checked })} /> {t('settings.captions')}</label>
      <label className="check"><input type="checkbox" checked={s.showNames !== false} onChange={(e) => set({ showNames: e.target.checked })} /> {t('settings.names')}</label>
      <div className="field">
        <label htmlFor="p9vol">{t('settings.volume')}</label>
        <input id="p9vol" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </div>
      <div className="foot"><button className="btn primary" onClick={close}>{t('settings.close')}</button></div>
    </Modal>
  );
}

function HelpDialog() {
  const { t } = useTranslation();
  const close = () => useP09.getState().setModal(null);
  const backToIntro = useP09((s) => s.backToIntro);
  return (
    <Modal title={t('intro.controls')} onClose={close}>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem' }}>
        {tList('p9.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="foot">
        <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
        <button className="btn primary" onClick={close}>{t('common.close')}</button>
      </div>
    </Modal>
  );
}

function RestoredDialog() {
  const { t } = useTranslation();
  const close = () => useP09.getState().setModal(null);
  return (
    <Modal title={t('p3.restored.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p9.restored.text')}</p>
      <div className="foot"><button className="btn primary" onClick={close}>{t('common.close')}</button></div>
    </Modal>
  );
}

export function Dialogs09() {
  const modal = useP09((s) => s.modal);
  if (!modal) return null;
  switch (modal.kind) {
    case 'ppe':
      return <PpeDialog />;
    case 'submit':
      return <SubmitDialog />;
    case 'settings':
      return <SettingsDialog />;
    case 'help':
      return <HelpDialog />;
    case 'restored':
      return <RestoredDialog />;
  }
}
