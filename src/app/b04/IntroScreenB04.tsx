import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadB04Attempt, useB04 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { B04Mode } from '../../practices/practice-b04/definition';
import { B04_SCENARIOS, validScenariosB04, type B04Scenario } from '../../practices/practice-b04/error-scenarios';
import { SC_B04 as SC } from '../../simulation/bio-world/world';
import { fmtTime } from './ui';

const MODES: B04Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Perfiles de actividad: no sustituyen el modo; fijan qué escenarios docentes empiezan activos. */
const PROFILES: Record<'STANDARD' | 'ASSAYS' | 'FEULGEN' | 'ENZYMES' | 'ADH' | 'RESOURCES', B04Scenario[]> = {
  STANDARD: [],
  ASSAYS: [SC.MILK_VAR, SC.DETERGENT, SC.OLD_BENEDICT, SC.CU_EXCESS, SC.PIGMENT, SC.MISLABELED],
  FEULGEN: [SC.FEULGEN_UNDER, SC.FEULGEN_OVER],
  ENZYMES: [SC.LOW_CATALASE, SC.PREHEATED_LIVER, SC.OLD_PEROXIDE, SC.LOW_AMYLASE, SC.AMYLASE_PH, SC.OVERFLOW],
  ADH: [SC.ADH, SC.PHOTOMETER_NO_BLANK, SC.NAD_LIMIT, SC.COMPETITOR],
  RESOURCES: [SC.BALANCE_DRIFT, SC.SLOW_BATH, SC.FEULGEN_MISSING],
};

export function IntroScreenB04({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useB04((s) => s.settings);
  const setSettings = useB04((s) => s.setSettings);
  const start = useB04((s) => s.start);
  const resume = useB04((s) => s.resume);
  const startDemo = useB04((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadB04Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  // Escenarios compatibles entre sí (§10): al marcar uno incompatible, gana el que ya estaba.
  const toggleScenario = (s: B04Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : validScenariosB04([...settings.scenarios, s]) });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('b04.app.kicker')}</div>
          <h1>{t('b04.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('b04.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { useB04.getState().discardAndExit(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('b04.intro.lead')}</p>
            <ul>
              {tList('b04.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('b04.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('b04.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint virtual-note" role="note">⚠ {t('b04.intro.safetyNote')}</p>
            <p className="hint">{t('b04.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="b04mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`b04.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('b04.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="b04profile">{t('b04.intro.profile')}</label>
                  <select id="b04profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: validScenariosB04([...PROFILES[k]]) }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`b04.profile.${k}`)}</option>)}
                  </select>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('b04.intro.scenarios')}</legend>
                  {B04_SCENARIOS.map(({ id: s }) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`b04.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="b04seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="b04seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('b04.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('b04.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
