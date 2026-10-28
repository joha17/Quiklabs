import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP07 } from './store';
import { Modal } from './ui';
import { tList } from '../i18n';
import { ExitLabPrompt } from '../common/ui';
import type { QualitySetting } from '../../engine/quality';
import { CoatIcon, GogglesIcon, ShoesIcon } from '../accessibility/PpeIcons';
import type { GloveType } from '../../simulation/bonding-world/commands';
import { p07StageEvidence } from '../../practices/practice-07/evidence';
import type { P07World } from '../../simulation/bonding-world/types';

const PPE_ITEMS = [
  { key: 'coat', Icon: CoatIcon },
  { key: 'goggles', Icon: GogglesIcon },
  { key: 'shoes', Icon: ShoesIcon },
] as const;
type PpeKey = (typeof PPE_ITEMS)[number]['key'];

/** No se entrega con un vertido o un gotero en curso, un bloqueo de seguridad o frascos de disolvente abiertos (§5.F). */
export function p07SubmissionBlockers(w: P07World): string[] {
  const out: string[] = [];
  if (Object.keys(w.pours).length) out.push('POURING');
  if (Object.values(w.droppers).some((d) => d.squeeze01 !== 0)) out.push('DROPPER');
  if (w.safety.block) out.push('BLOCK');
  if (Object.values(w.vessels).some((v) => v.capped === false && (Object.keys(v.apolar).length > 0 || (v.polar.ethanol ?? 0) > 0 || (v.polar.acetone ?? 0) > 0 || (v.polar.isopropanol ?? 0) > 0))) out.push('UNCAPPED');
  return out;
}

/**
 * Equipo de protección (§5.A, §11.1): el estudiante elige lo que se pone, incluidos los guantes según la ficha de
 * compatibilidad (no a ciegas). Empezar con algo faltante se rechaza, se explica y queda registrado (L01–L03).
 */
function PpeDialog() {
  const { t } = useTranslation();
  const confirm = useP07((s) => s.confirmPpe);
  const [c, setC] = useState<Record<PpeKey, boolean>>({ coat: false, goggles: false, shoes: false });
  const [gloves, setGloves] = useState<GloveType>('none');
  const [refused, setRefused] = useState(false);
  const count = Object.values(c).filter(Boolean).length;
  const missing = [...PPE_ITEMS.filter(({ key }) => !c[key]).map(({ key }) => t(`p3.ppe.${key}`)), ...(gloves === 'none' ? [t('p7.ppe.gloves')] : [])];
  return (
    <Modal title={t('ppe.title')}>
      <p style={{ margin: 0 }}>{t('p7.ppe.lead')}</p>
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
      <fieldset className="field">
        <legend>{t('p7.ppe.gloves')}</legend>
        {(['nitrile', 'latex', 'none'] as const).map((g) => (
          <label key={g} className="check"><input type="radio" name="p7gloves" checked={gloves === g} onChange={() => setGloves(g)} /> {t(`p7.gloves.${g}`)}</label>
        ))}
        <span className="hint">{t('p7.ppe.glovesHelp')}</span>
      </fieldset>
      <ul className="hint" style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {tList('p7.ppe.hazards').map((h) => <li key={h}>{h}</li>)}
      </ul>
      <span className="hint" aria-live="polite">{t('ppe.count', { n: count })}</span>
      {refused && missing.length > 0 && <div className="toast critical" role="alert" style={{ display: 'block' }}>⛔ {t('p7.ppe.refused', { items: missing.join(', ') })}</div>}
      <div className="foot">
        <button className="btn primary" onClick={() => setRefused(!confirm({ ...c, gloves }))}>{t('ppe.confirm')}</button>
      </div>
    </Modal>
  );
}

function SubmitDialog() {
  const { t } = useTranslation();
  const rt = useP07((s) => s.runtime)!;
  const nb = useP07((s) => s.notebook);
  const submit = useP07((s) => s.submit);
  useP07((s) => s.version);
  const close = () => useP07.getState().setModal(null);
  const flags = p07StageEvidence(rt.world, nb);
  const missing = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k);
  const blockers = p07SubmissionBlockers(rt.world);
  return (
    <Modal title={t('submit.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p7.submit.lead')}</p>
      {blockers.length > 0 && (
        <div className="toast alert" role="alert" style={{ display: 'block' }}>
          <strong>{t('p7.submit.blocked')}</strong>
          <ul style={{ margin: '0.3rem 0 0' }}>{blockers.map((b) => <li key={b}>{t(`p7.submit.b_${b}`)}</li>)}</ul>
        </div>
      )}
      {missing.length > 0 && (
        <div><strong>{t('submit.missing')}</strong><ul style={{ margin: '0.3rem 0 0' }}>{missing.map((m) => <li key={m}>{t(`p7.flag.${m}`)}</li>)}</ul></div>
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
  const s = useP07((x) => x.settings);
  const set = useP07((x) => x.setSettings);
  const close = () => useP07.getState().setModal(null);
  return (
    <Modal title={t('settings.title')} onClose={close}>
      <div className="field">
        <label htmlFor="p7scale">{t('settings.scale')}</label>
        <select id="p7scale" value={s.uiScale} onChange={(e) => set({ uiScale: Number(e.target.value) })}>
          {[1, 1.25, 1.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="p7quality">{t('settings.quality')}</label>
        <select id="p7quality" value={s.quality ?? 'AUTO'} onChange={(e) => set({ quality: e.target.value as QualitySetting })}>
          {(['AUTO', 'HIGH', 'MEDIUM', 'LOW'] as const).map((q) => <option key={q} value={q}>{t(`settings.q${q}`)}</option>)}
        </select>
      </div>
      <label className="check"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> {t('p10.settings.reducedMotion')}</label>
      <label className="check"><input type="checkbox" checked={s.captions} onChange={(e) => set({ captions: e.target.checked })} /> {t('settings.captions')}</label>
      <label className="check"><input type="checkbox" checked={s.showNames !== false} onChange={(e) => set({ showNames: e.target.checked })} /> {t('settings.names')}</label>
      <div className="field">
        <label htmlFor="p7vol">{t('settings.volume')}</label>
        <input id="p7vol" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </div>
      <div className="foot"><button className="btn primary" onClick={close}>{t('settings.close')}</button></div>
    </Modal>
  );
}

function HelpDialog() {
  const { t } = useTranslation();
  const close = () => useP07.getState().setModal(null);
  const backToIntro = useP07((s) => s.backToIntro);
  const discardAndExit = useP07((s) => s.discardAndExit);
  const demo = useP07((s) => !!s.demo);
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
        {tList('p7.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
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
  const close = () => useP07.getState().setModal(null);
  return (
    <Modal title={t('p3.restored.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('p7.restored.text')}</p>
      <div className="foot"><button className="btn primary" onClick={close}>{t('common.close')}</button></div>
    </Modal>
  );
}

export function Dialogs07() {
  const modal = useP07((s) => s.modal);
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
