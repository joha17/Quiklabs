import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF101 } from './store';
import { Modal } from './ui';
import { tList } from '../i18n';
import { ExitLabPrompt } from '../common/ui';
import type { QualitySetting } from '../../engine/quality';
import { CoatIcon, GogglesIcon, HairIcon, ShoesIcon } from '../accessibility/PpeIcons';
import { f101StageEvidence } from '../../practices/practice-f101/evidence';
import type { F101World } from '../../simulation/f101-world/types';

const PPE_ITEMS = [
  { key: 'coat', Icon: CoatIcon },
  { key: 'goggles', Icon: GogglesIcon },
  { key: 'hair', Icon: HairIcon },
  { key: 'shoes', Icon: ShoesIcon },
] as const;
type PpeKey = (typeof PPE_ITEMS)[number]['key'];

/** No se entrega con una captura en curso o un bloqueo de seguridad sin atender. */
export function f101SubmissionBlockers(w: F101World): string[] {
  const out: string[] = [];
  if (w.table.sensor.capture) out.push('CAPTURING');
  if (w.safety.block) out.push('BLOCK');
  return out;
}

/**
 * Equipo de protección: el estudiante elige lo que se pone. Se puede intentar empezar con algo faltante: el
 * laboratorio lo rechaza, lo explica y queda registrado.
 */
function PpeDialog() {
  const { t } = useTranslation();
  const confirm = useF101((s) => s.confirmPpe);
  const [c, setC] = useState<Record<PpeKey, boolean>>({ coat: false, goggles: false, hair: false, shoes: false });
  const [refused, setRefused] = useState(false);
  const count = Object.values(c).filter(Boolean).length;
  const missing = PPE_ITEMS.filter(({ key }) => !c[key]).map(({ key }) => t(`p3.ppe.${key}`));
  return (
    <Modal title={t('ppe.title')}>
      <p style={{ margin: 0 }}>{t('f101.ppe.lead')}</p>
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
        {tList('f101.ppe.hazards').map((h) => <li key={h}>{h}</li>)}
      </ul>
      <span className="hint" aria-live="polite">{t('ppe.count', { n: count })}</span>
      {refused && missing.length > 0 && <div className="toast critical" role="alert" style={{ display: 'block' }}>⛔ {t('f101.ppe.refused', { items: missing.join(', ') })}</div>}
      <div className="foot">
        <button className="btn primary" onClick={() => setRefused(!confirm(c))}>{t('ppe.confirm')}</button>
      </div>
    </Modal>
  );
}

function SubmitDialog() {
  const { t } = useTranslation();
  const rt = useF101((s) => s.runtime)!;
  const nb = useF101((s) => s.notebook);
  const submit = useF101((s) => s.submit);
  useF101((s) => s.version);
  const close = () => useF101.getState().setModal(null);
  const flags = f101StageEvidence(rt.world, nb);
  const missing = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k);
  const blockers = f101SubmissionBlockers(rt.world);
  return (
    <Modal title={t('submit.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('f101.submit.lead')}</p>
      {blockers.length > 0 && (
        <div className="toast alert" role="alert" style={{ display: 'block' }}>
          <strong>{t('f101.submit.blocked')}</strong>
          <ul style={{ margin: '0.3rem 0 0' }}>{blockers.map((b) => <li key={b}>{t(`f101.submit.b_${b}`)}</li>)}</ul>
        </div>
      )}
      {missing.length > 0 && (
        <div><strong>{t('submit.missing')}</strong><ul style={{ margin: '0.3rem 0 0' }}>{missing.map((m) => <li key={m}>{t(`f101.stageFlag.${m}`)}</li>)}</ul></div>
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
  const s = useF101((x) => x.settings);
  const set = useF101((x) => x.setSettings);
  const close = () => useF101.getState().setModal(null);
  return (
    <Modal title={t('settings.title')} onClose={close}>
      <div className="field">
        <label htmlFor="f101scale">{t('settings.scale')}</label>
        <select id="f101scale" value={s.uiScale} onChange={(e) => set({ uiScale: Number(e.target.value) })}>
          {[1, 1.25, 1.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="f101quality">{t('settings.quality')}</label>
        <select id="f101quality" value={s.quality ?? 'AUTO'} onChange={(e) => set({ quality: e.target.value as QualitySetting })}>
          {(['AUTO', 'HIGH', 'MEDIUM', 'LOW'] as const).map((q) => <option key={q} value={q}>{t(`settings.q${q}`)}</option>)}
        </select>
      </div>
      <label className="check"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> {t('p10.settings.reducedMotion')}</label>
      <label className="check"><input type="checkbox" checked={s.captions} onChange={(e) => set({ captions: e.target.checked })} /> {t('settings.captions')}</label>
      <label className="check"><input type="checkbox" checked={s.showNames !== false} onChange={(e) => set({ showNames: e.target.checked })} /> {t('settings.names')}</label>
      <div className="field">
        <label htmlFor="f101vol">{t('settings.volume')}</label>
        <input id="f101vol" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </div>
      <div className="foot"><button className="btn primary" onClick={close}>{t('settings.close')}</button></div>
    </Modal>
  );
}

function HelpDialog() {
  const { t } = useTranslation();
  const close = () => useF101.getState().setModal(null);
  const backToIntro = useF101((s) => s.backToIntro);
  const discardAndExit = useF101((s) => s.discardAndExit);
  const demo = useF101((s) => !!s.demo);
  const [exiting, setExiting] = useState(false);
  if (exiting) {
    return (
      <Modal key="exit" title={t('exit.title')} onClose={close}>
        <ExitLabPrompt onSave={backToIntro} onDiscard={discardAndExit} onCancel={close} />
      </Modal>
    );
  }
  return (
    <Modal title={t('intro.controls')} onClose={close}>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem' }}>
        {tList('f101.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="foot">
        <button className="btn ghost" onClick={demo ? backToIntro : () => setExiting(true)}>{t('review.back')}</button>
        <button className="btn primary" onClick={close}>{t('common.close')}</button>
      </div>
    </Modal>
  );
}

function RestoredDialog() {
  const { t } = useTranslation();
  const close = () => useF101.getState().setModal(null);
  return (
    <Modal title={t('p3.restored.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('f101.restored.text')}</p>
      <div className="foot"><button className="btn primary" onClick={close}>{t('common.close')}</button></div>
    </Modal>
  );
}

export function DialogsF101() {
  const modal = useF101((s) => s.modal);
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
