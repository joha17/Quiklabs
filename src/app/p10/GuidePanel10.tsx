import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { tList } from '../i18n';

/** Modo guiado: pasos de la etapa actual (no avanzan la práctica; la avanza la evidencia). */
export function GuidePanel10() {
  const { t } = useTranslation();
  const stage = useP10((s) => s.workflowStage);
  const [open, setOpen] = useState(true);
  const steps = tList(`p10.guide.${stage}`);
  if (!steps.length) return null;
  return (
    <aside className="guide" aria-label={t(`p10.stage.${stage}`)}>
      <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
        <span>🧭 {t(`p10.stage.${stage}`)}</span>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </h3>
      {open && <ol>{steps.map((s) => <li key={s}>{s}</li>)}</ol>}
    </aside>
  );
}
