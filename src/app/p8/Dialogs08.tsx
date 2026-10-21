import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP08 } from './store';
import { Modal } from './ui';
import { tList } from '../i18n';
import type { QualitySetting } from '../../engine/quality';
import { CoatIcon, GogglesIcon, HairIcon } from '../accessibility/PpeIcons';
import { SPECIES, speciesIn } from '../../simulation/organic-chemistry/species';
import { p08StageEvidence } from '../../practices/practice-08/evidence';
import type { P08World } from '../../simulation/organic-world/types';

/** Guantes (icono propio de esta práctica: nitrilo para ácidos y anhídrido). */
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
  { key: 'hair', Icon: HairIcon },
] as const;
type PpeKey = (typeof PPE_ITEMS)[number]['key'];

/** No se entrega con un vertido o un gotero en curso, un bloqueo de seguridad o frascos de inflamables abiertos. */
export function p08SubmissionBlockers(w: P08World): string[] {
  const out: string[] = [];
  if (Object.keys(w.pours).length) out.push('POURING');
  if (Object.values(w.droppers).some((d) => d.squeeze01 !== 0)) out.push('DROPPER');
  if (w.safety.block) out.push('BLOCK');
  if (Object.values(w.vessels).some((v) => v.capped === false && v.id.startsWith('bt') && speciesIn(v.liq, 1e-6).some((k) => SPECIES[k].flammable))) out.push('UNCAPPED');
  return out;
}

/**
 * Equipo de protección (§11.1): gafas, bata, guantes de nitrilo y cabello recogido. Empezar con algo faltante se
 * rechaza, se explica y queda registrado (ORG01, ORG02).
 */
function PpeDialog() {
  const { t } = useTranslation();
  const confirm = useP08((s) => s.confirmPpe);
  const [c, setC] = useState<Record<PpeKey, boolean>>({ goggles: false, coat: false, gloves: false, hair: false });
  const [refused, setRefused] = useState(false);
  const count = Object.values(c).filter(Boolean).length;
  const missing = PPE_ITEMS.filter(({ key }) => !c[key]).map(({ key }) => t(`p8.ppe.${key}`));
  return (
    <Modal title={t('ppe.title')}>
      <p style={{ margin: 0 }}>{t('p8.ppe.lead')}</p>
      <div className="ppe-grid">
        {PPE_ITEMS.map(({ key, Icon }) => (
          <button key={key} type="button" className="ppe-btn" aria-pressed={c[key]} aria-label={t(`p8.ppe.${key}`)} onClick={() => setC({ ...c, [key]: !c[key] })}>
            <span className="ppe-check" aria-hidden="true">✓</span>
            <Icon worn={c[key]} />
            <span className="ppe-name">{t(`p8.ppe.${key}`)}</span>
            <span className="ppe-state" aria-hidden="true">{c[key] ? t('ppe.on') : t('ppe.off')}</span>
          </button>
        ))}
      </div>
      <ul className="hint" style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {tList('p8.ppe.hazards').map((h) => <li key={h}>{h}</li>)}
      </ul>
      <span className="hint" aria-live="polite">{t('ppe.count', { n: count })}</span>
      {refused && missing.length > 0 && <div className="toast critical" role="alert" style={{ display: 'block' }}>⛔ {t('p8.ppe.refused', { items: missing.join(', ') })}</div>}
      <div className="foot">
        <button className="btn primary" onClick={() => setRefused(!confirm(c))}>{t('ppe.confirm')}</button>
      </div>
    </Modal>
  );
}

function SubmitDialog() {
  const { t } = useTranslation();
  const rt = useP08((s) => s.runtime)!;
  const nb = useP08((s) => s.notebook);
  const submit = useP08((s) => s.submit);
  useP08((s) => s.version);
  const close = () => useP08.getState().setModal(null);
  const flags = p08StageEvidence(rt.world, nb);
  const missing = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k);
  const blockers = p08SubmissionBlockers(rt.world);
  return (
    <Modal title={t('submit.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p8.submit.lead')}</p>
      {blockers.length > 0 && (
        <div className="toast alert" role="alert" style={{ display: 'block' }}>
          <strong>{t('p8.submit.blocked')}</strong>
          <ul style={{ margin: '0.3rem 0 0' }}>{blockers.map((b) => <li key={b}>{t(`p8.submit.b_${b}`)}</li>)}</ul>
        </div>
      )}
      {missing.length > 0 && (
        <div><strong>{t('submit.missing')}</strong><ul style={{ margin: '0.3rem 0 0' }}>{missing.map((m) => <li key={m}>{t(`p8.flag.${m}`)}</li>)}</ul></div>
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
  const s = useP08((x) => x.settings);
  const set = useP08((x) => x.setSettings);
  const close = () => useP08.getState().setModal(null);
  return (
    <Modal title={t('settings.title')} onClose={close}>
      <div className="field">
        <label htmlFor="p8scale">{t('settings.scale')}</label>
        <select id="p8scale" value={s.uiScale} onChange={(e) => set({ uiScale: Number(e.target.value) })}>
          {[1, 1.25, 1.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="p8quality">{t('settings.quality')}</label>
        <select id="p8quality" value={s.quality ?? 'AUTO'} onChange={(e) => set({ quality: e.target.value as QualitySetting })}>
          {(['AUTO', 'HIGH', 'MEDIUM', 'LOW'] as const).map((q) => <option key={q} value={q}>{t(`settings.q${q}`)}</option>)}
        </select>
      </div>
      <label className="check"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> {t('p10.settings.reducedMotion')}</label>
      <label className="check"><input type="checkbox" checked={s.captions} onChange={(e) => set({ captions: e.target.checked })} /> {t('settings.captions')}</label>
      <label className="check"><input type="checkbox" checked={s.showNames !== false} onChange={(e) => set({ showNames: e.target.checked })} /> {t('settings.names')}</label>
      <div className="field">
        <label htmlFor="p8vol">{t('settings.volume')}</label>
        <input id="p8vol" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </div>
      <div className="foot"><button className="btn primary" onClick={close}>{t('settings.close')}</button></div>
    </Modal>
  );
}

function HelpDialog() {
  const { t } = useTranslation();
  const close = () => useP08.getState().setModal(null);
  const backToIntro = useP08((s) => s.backToIntro);
  return (
    <Modal title={t('intro.controls')} onClose={close}>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem' }}>
        {tList('p8.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
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
  const close = () => useP08.getState().setModal(null);
  return (
    <Modal title={t('p3.restored.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p8.restored.text')}</p>
      <div className="foot"><button className="btn primary" onClick={close}>{t('common.close')}</button></div>
    </Modal>
  );
}

export function Dialogs08() {
  const modal = useP08((s) => s.modal);
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
