import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP4 } from './store';
import { Modal } from './ui';
import { tList } from '../i18n';
import type { QualitySetting } from '../../engine/quality';
import { CoatIcon, GogglesIcon, HairIcon, ShoesIcon } from '../accessibility/PpeIcons';
import { p4StageEvidence } from '../../practices/practice-04/evidence';
import { submissionBlockers } from '../../simulation/reaction-world/world';

const PPE_ITEMS = [
  { key: 'coat', Icon: CoatIcon },
  { key: 'goggles', Icon: GogglesIcon },
  { key: 'hair', Icon: HairIcon },
  { key: 'shoes', Icon: ShoesIcon },
] as const;
type PpeKey = (typeof PPE_ITEMS)[number]['key'];

/** §18.1 — bata, gafas, cabello recogido y calzado cerrado; los guantes, cuando el protocolo lo indique. */
function PpeDialog() {
  const { t } = useTranslation();
  const confirm = useP4((s) => s.confirmPpe);
  const dispatch = useP4((s) => s.dispatch);
  const [c, setC] = useState<Record<PpeKey, boolean>>({ coat: false, goggles: false, hair: false, shoes: false });
  const [gloves, setGloves] = useState(false);
  const all = Object.values(c).every(Boolean);
  const count = Object.values(c).filter(Boolean).length;
  return (
    <Modal title={t('ppe.title')}>
      <p style={{ margin: 0 }}>{t('p4.ppe.lead')}</p>
      <div className="ppe-grid">
        {PPE_ITEMS.map(({ key, Icon }) => (
          <button key={key} type="button" className="ppe-btn" aria-pressed={c[key]} aria-label={t(`p3.ppe.${key}`)} onClick={() => setC({ ...c, [key]: !c[key] })}>
            <span className="ppe-check" aria-hidden="true">✓</span>
            <Icon worn={c[key]} />
            <span className="ppe-name">{t(`p3.ppe.${key}`)}</span>
            <span className="ppe-state" aria-hidden="true">{c[key] ? t('ppe.on') : t('ppe.off')}</span>
          </button>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={gloves} onChange={(e) => setGloves(e.target.checked)} /> {t('p4.ppe.gloves')}</label>
      <span className="hint" aria-live="polite">{t('ppe.count', { n: count })} · {t('p4.ppe.note')}</span>
      <div className="foot">
        <button className="btn primary" disabled={!all} onClick={() => { confirm(); if (gloves) dispatch({ type: 'setGloves', on: true }); }}>{t('ppe.confirm')}</button>
      </div>
    </Modal>
  );
}

/** §13.1 — advertencia de la combustión del Mg: se acepta antes de llevar la cinta a la llama. */
function MgWarningDialog() {
  const { t } = useTranslation();
  const dispatch = useP4((s) => s.dispatch);
  const close = () => useP4.getState().setModal(null);
  return (
    <Modal title={t('p4.mgwarn.title')} onClose={close}>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem' }}>
        {tList('p4.mgwarn.items').map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="foot">
        <button className="btn" onClick={close}>{t('common.close')}</button>
        <button className="btn primary" onClick={() => { dispatch({ type: 'acceptMgWarning' }); close(); }}>{t('p4.mgwarn.accept')}</button>
      </div>
    </Modal>
  );
}

function SubmitDialog() {
  const { t } = useTranslation();
  const rt = useP4((s) => s.runtime)!;
  const nb = useP4((s) => s.notebook);
  const submit = useP4((s) => s.submit);
  useP4((s) => s.version);
  const close = () => useP4.getState().setModal(null);
  const flags = p4StageEvidence(rt.world, nb);
  const missing = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k);
  // §22.2, §32: no se entrega con mechero encendido, gas abierto, residuos sin clasificar o material caliente.
  const blockers = submissionBlockers(rt.world, rt.ctx);
  return (
    <Modal title={t('submit.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p4.submit.lead')}</p>
      {blockers.length > 0 && (
        <div className="toast alert" role="alert" style={{ display: 'block' }}>
          <strong>{t('p4.submit.blocked')}</strong>
          <ul style={{ margin: '0.3rem 0 0' }}>{blockers.map((b) => <li key={b}>{t(`p4.submit.b_${b}`)}</li>)}</ul>
        </div>
      )}
      {missing.length > 0 && (
        <div><strong>{t('submit.missing')}</strong><ul style={{ margin: '0.3rem 0 0' }}>{missing.map((m) => <li key={m}>{t(`p4.flag.${m}`)}</li>)}</ul></div>
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
  const s = useP4((x) => x.settings);
  const set = useP4((x) => x.setSettings);
  const close = () => useP4.getState().setModal(null);
  return (
    <Modal title={t('settings.title')} onClose={close}>
      <div className="field">
        <label htmlFor="p4scale">{t('settings.scale')}</label>
        <select id="p4scale" value={s.uiScale} onChange={(e) => set({ uiScale: Number(e.target.value) })}>
          {[1, 1.25, 1.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="p4quality">{t('settings.quality')}</label>
        <select id="p4quality" value={s.quality ?? 'AUTO'} onChange={(e) => set({ quality: e.target.value as QualitySetting })}>
          {(['AUTO', 'HIGH', 'MEDIUM', 'LOW'] as const).map((q) => <option key={q} value={q}>{t(`settings.q${q}`)}</option>)}
        </select>
      </div>
      <label className="check"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> {t('p4.settings.reducedMotion')}</label>
      <label className="check"><input type="checkbox" checked={s.captions} onChange={(e) => set({ captions: e.target.checked })} /> {t('settings.captions')}</label>
      <label className="check"><input type="checkbox" checked={s.showNames !== false} onChange={(e) => set({ showNames: e.target.checked })} /> {t('settings.names')}</label>
      <label className="check"><input type="checkbox" checked={s.colorAid} onChange={(e) => set({ colorAid: e.target.checked })} /> {t('p4.settings.colorAid')}</label>
      <div className="field">
        <label htmlFor="p4vol">{t('settings.volume')}</label>
        <input id="p4vol" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </div>
      <div className="foot"><button className="btn primary" onClick={close}>{t('settings.close')}</button></div>
    </Modal>
  );
}

function HelpDialog() {
  const { t } = useTranslation();
  const close = () => useP4.getState().setModal(null);
  const backToIntro = useP4((s) => s.backToIntro);
  return (
    <Modal title={t('intro.controls')} onClose={close}>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem' }}>
        {tList('p4.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
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
  const close = () => useP4.getState().setModal(null);
  return (
    <Modal title={t('p3.restored.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p4.restored.text')}</p>
      <div className="foot"><button className="btn primary" onClick={close}>{t('common.close')}</button></div>
    </Modal>
  );
}

export function Dialogs4() {
  const modal = useP4((s) => s.modal);
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
    case 'mgWarning':
      return <MgWarningDialog />;
  }
}
