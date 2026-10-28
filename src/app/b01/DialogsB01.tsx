import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB01 } from './store';
import { Modal } from './ui';
import { tList } from '../i18n';
import { ExitLabPrompt } from '../common/ui';
import type { QualitySetting } from '../../engine/quality';
import { CoatIcon, HairIcon, ShoesIcon } from '../accessibility/PpeIcons';
import { b01StageEvidence } from '../../practices/practice-b01/evidence';
import type { OpticalWorld } from '../../simulation/optical-world/types';

/** Manos limpias y guantes (iconos propios de la práctica). */
function HandsIcon({ worn }: { worn: boolean }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" className="ppe-backdrop" />
      <path d="M34 80 V46 Q34 40 40 40 V24 Q40 20 44 20 Q48 20 48 24 V40 V20 Q48 16 52 16 Q56 16 56 20 V42 V26 Q56 22 60 22 Q64 22 64 26 V60 Q64 74 56 80 Z" fill={worn ? '#f5cba7' : '#dfe3e8'} stroke="#55636f" strokeWidth="2" strokeLinejoin="round" />
      {worn && <path d="M24 30 q4 -6 8 0 M70 34 q4 -6 8 0" stroke="#4fc3f7" strokeWidth="3" fill="none" />}
    </svg>
  );
}
function GlovesIcon({ worn }: { worn: boolean }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" className="ppe-backdrop" />
      <path d="M30 84 V48 Q30 40 36 40 V22 Q36 18 40 18 Q44 18 44 22 V36 V16 Q44 12 48 12 Q52 12 52 16 V36 V19 Q52 15 56 15 Q60 15 60 19 V38 V28 Q60 24 64 24 Q68 24 68 28 V58 Q68 72 58 84 Z" fill={worn ? '#5c6bc0' : '#dfe3e8'} stroke="#55636f" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** Requeridos: bata, calzado cerrado, cabello recogido, manos limpias. Guantes: solo si el protocolo lo exige (§11.1). */
const PPE_ITEMS = [
  { key: 'coat', Icon: CoatIcon, required: true },
  { key: 'shoes', Icon: ShoesIcon, required: true },
  { key: 'hair', Icon: HairIcon, required: true },
  { key: 'hands', Icon: HandsIcon, required: true },
  { key: 'gloves', Icon: GlovesIcon, required: false },
] as const;
type PpeKey = (typeof PPE_ITEMS)[number]['key'];

/** No se entrega con un cubreobjetos bajando, algo en la pinza, vidrio roto sin recoger o un bloqueo activo. */
export function b01SubmissionBlockers(w: OpticalWorld): string[] {
  const out: string[] = [];
  if (w.forceps.holding) out.push('FORCEPS');
  if (w.shards > 0) out.push('SHARDS');
  if (w.safety.block) out.push('BLOCK');
  return out;
}

/**
 * Equipo de protección (§11.1): bata, calzado cerrado, cabello recogido y manos limpias; los guantes son opcionales
 * (no se universalizan para un microscopio limpio). Empezar con algo requerido faltante se rechaza y queda registrado (E68).
 */
function PpeDialog() {
  const { t } = useTranslation();
  const confirm = useB01((s) => s.confirmPpe);
  const [c, setC] = useState<Record<PpeKey, boolean>>({ coat: false, shoes: false, hair: false, hands: false, gloves: false });
  const [refused, setRefused] = useState(false);
  const count = Object.values(c).filter(Boolean).length;
  const missing = PPE_ITEMS.filter(({ key, required }) => required && !c[key]).map(({ key }) => t(`b01.ppe.${key}`));
  return (
    <Modal title={t('ppe.title')}>
      <p style={{ margin: 0 }}>{t('b01.ppe.lead')}</p>
      <div className="ppe-grid">
        {PPE_ITEMS.map(({ key, Icon }) => (
          <button key={key} type="button" className="ppe-btn" aria-pressed={c[key]} aria-label={t(`b01.ppe.${key}`)} onClick={() => setC({ ...c, [key]: !c[key] })}>
            <span className="ppe-check" aria-hidden="true">✓</span>
            <Icon worn={c[key]} />
            <span className="ppe-name">{t(`b01.ppe.${key}`)}</span>
            <span className="ppe-state" aria-hidden="true">{c[key] ? t('ppe.on') : t('ppe.off')}</span>
          </button>
        ))}
      </div>
      <ul className="hint" style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {tList('b01.ppe.hazards').map((h) => <li key={h}>{h}</li>)}
      </ul>
      <span className="hint" aria-live="polite">{t('ppe.count', { n: count })}</span>
      {refused && missing.length > 0 && <div className="toast critical" role="alert" style={{ display: 'block' }}>⛔ {t('b01.ppe.refused', { items: missing.join(', ') })}</div>}
      <div className="foot">
        <button className="btn primary" onClick={() => setRefused(!confirm(c))}>{t('ppe.confirm')}</button>
      </div>
    </Modal>
  );
}

function SubmitDialog() {
  const { t } = useTranslation();
  const rt = useB01((s) => s.runtime)!;
  const nb = useB01((s) => s.notebook);
  const submit = useB01((s) => s.submit);
  useB01((s) => s.version);
  const close = () => useB01.getState().setModal(null);
  const flags = b01StageEvidence(rt.world, nb);
  const missing = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k);
  const blockers = b01SubmissionBlockers(rt.world);
  return (
    <Modal title={t('submit.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('b01.submit.lead')}</p>
      {blockers.length > 0 && (
        <div className="toast alert" role="alert" style={{ display: 'block' }}>
          <strong>{t('b01.submit.blocked')}</strong>
          <ul style={{ margin: '0.3rem 0 0' }}>{blockers.map((b) => <li key={b}>{t(`b01.submit.b_${b}`)}</li>)}</ul>
        </div>
      )}
      {missing.length > 0 && (
        <div><strong>{t('submit.missing')}</strong><ul style={{ margin: '0.3rem 0 0' }}>{missing.map((m) => <li key={m}>{t(`b01.flag.${m}`)}</li>)}</ul></div>
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
  const s = useB01((x) => x.settings);
  const set = useB01((x) => x.setSettings);
  const close = () => useB01.getState().setModal(null);
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
  const close = () => useB01.getState().setModal(null);
  const backToIntro = useB01((s) => s.backToIntro);
  const discardAndExit = useB01((s) => s.discardAndExit);
  const demo = useB01((s) => !!s.demo);
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
        {tList('b01.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
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
  const close = () => useB01.getState().setModal(null);
  return (
    <Modal title={t('p3.restored.title')} onClose={close}>
      <p style={{ margin: 0 }}>{t('b01.restored.text')}</p>
      <div className="foot"><button className="btn primary" onClick={close}>{t('common.close')}</button></div>
    </Modal>
  );
}

export function DialogsB01() {
  const modal = useB01((s) => s.modal);
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
