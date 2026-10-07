import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { Modal } from './ui';
import { tList } from '../i18n';
import type { QualitySetting } from '../../engine/quality';
import { CoatIcon, GogglesIcon, HairIcon, ShoesIcon } from '../accessibility/PpeIcons';
import { p10StageEvidence } from '../../practices/practice-10/evidence';
import type { P10World } from '../../simulation/gas-world/types';

const PPE_ITEMS = [
  { key: 'coat', Icon: CoatIcon },
  { key: 'goggles', Icon: GogglesIcon },
  { key: 'hair', Icon: HairIcon },
  { key: 'shoes', Icon: ShoesIcon },
] as const;
type PpeKey = (typeof PPE_ITEMS)[number]['key'];

/** No se entrega con un vertido en curso, el reactor tapado mientras genera gas o la llave de la bureta abierta (§27). */
export function p10SubmissionBlockers(w: P10World): string[] {
  const out: string[] = [];
  if (Object.keys(w.pours).length) out.push('POURING');
  if (w.reactor.stoppered && (w.reactor.stage === 'REACTING' || w.reactor.stage === 'ACID_ADDED')) out.push('REACTING');
  if (w.reactor.pressureKPa - w.params.pressureKPa > 3 && w.reactor.stoppered) out.push('PRESSURIZED');
  if (w.burette.stopcockOpen) out.push('STOPCOCK');
  return out;
}

/** Gafas, bata cerrada, cabello recogido y calzado cerrado (§27.1). */
function PpeDialog() {
  const { t } = useTranslation();
  const confirm = useP10((s) => s.confirmPpe);
  const [c, setC] = useState<Record<PpeKey, boolean>>({ coat: false, goggles: false, hair: false, shoes: false });
  const all = Object.values(c).every(Boolean);
  const count = Object.values(c).filter(Boolean).length;
  return (
    <Modal title={t('ppe.title')}>
      <p style={{ margin: 0 }}>{t('p10.ppe.lead')}</p>
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
      <ul className="hint" style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {tList('p10.ppe.hazards').map((h) => <li key={h}>{h}</li>)}
      </ul>
      <span className="hint" aria-live="polite">{t('ppe.count', { n: count })}</span>
      <div className="foot">
        <button className="btn primary" disabled={!all} onClick={confirm}>{t('ppe.confirm')}</button>
      </div>
    </Modal>
  );
}

function SubmitDialog() {
  const { t } = useTranslation();
  const rt = useP10((s) => s.runtime)!;
  const nb = useP10((s) => s.notebook);
  const submit = useP10((s) => s.submit);
  useP10((s) => s.version);
  const close = () => useP10.getState().setModal(null);
  const flags = p10StageEvidence(rt.world, nb);
  const missing = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k);
  const blockers = p10SubmissionBlockers(rt.world);
  return (
    <Modal title={t('submit.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p10.submit.lead')}</p>
      {blockers.length > 0 && (
        <div className="toast alert" role="alert" style={{ display: 'block' }}>
          <strong>{t('p10.submit.blocked')}</strong>
          <ul style={{ margin: '0.3rem 0 0' }}>{blockers.map((b) => <li key={b}>{t(`p10.submit.b_${b}`)}</li>)}</ul>
        </div>
      )}
      {missing.length > 0 && (
        <div><strong>{t('submit.missing')}</strong><ul style={{ margin: '0.3rem 0 0' }}>{missing.map((m) => <li key={m}>{t(`p10.flag.${m}`)}</li>)}</ul></div>
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
  const s = useP10((x) => x.settings);
  const set = useP10((x) => x.setSettings);
  const close = () => useP10.getState().setModal(null);
  return (
    <Modal title={t('settings.title')} onClose={close}>
      <div className="field">
        <label htmlFor="p10scale">{t('settings.scale')}</label>
        <select id="p10scale" value={s.uiScale} onChange={(e) => set({ uiScale: Number(e.target.value) })}>
          {[1, 1.25, 1.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="p10quality">{t('settings.quality')}</label>
        <select id="p10quality" value={s.quality ?? 'AUTO'} onChange={(e) => set({ quality: e.target.value as QualitySetting })}>
          {(['AUTO', 'HIGH', 'MEDIUM', 'LOW'] as const).map((q) => <option key={q} value={q}>{t(`settings.q${q}`)}</option>)}
        </select>
      </div>
      <label className="check"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> {t('p10.settings.reducedMotion')}</label>
      <label className="check"><input type="checkbox" checked={s.captions} onChange={(e) => set({ captions: e.target.checked })} /> {t('settings.captions')}</label>
      <label className="check"><input type="checkbox" checked={s.showNames !== false} onChange={(e) => set({ showNames: e.target.checked })} /> {t('settings.names')}</label>
      <div className="field">
        <label htmlFor="p10vol">{t('settings.volume')}</label>
        <input id="p10vol" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </div>
      <div className="foot"><button className="btn primary" onClick={close}>{t('settings.close')}</button></div>
    </Modal>
  );
}

function HelpDialog() {
  const { t } = useTranslation();
  const close = () => useP10.getState().setModal(null);
  const backToIntro = useP10((s) => s.backToIntro);
  return (
    <Modal title={t('intro.controls')} onClose={close}>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem' }}>
        {tList('p10.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
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
  const close = () => useP10.getState().setModal(null);
  return (
    <Modal title={t('p3.restored.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p10.restored.text')}</p>
      <div className="foot"><button className="btn primary" onClick={close}>{t('common.close')}</button></div>
    </Modal>
  );
}

export function Dialogs10() {
  const modal = useP10((s) => s.modal);
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
