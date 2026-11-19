import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadF05Attempt, useF05 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { F05Mode } from '../../practices/practice-f05/definition';
import { F05_SCENARIOS, type F05Scenario } from '../../practices/practice-f05/error-scenarios';
import { SF5 } from '../../simulation/f05-world/world';
import { fmtTime } from './ui';

const MODES: F05Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Perfiles de actividad : no sustituyen el modo; fijan qué escenarios docentes empiezan activos. */
const PROFILES: Record<'BASICS' | 'TECHNIQUE' | 'DIAGNOSIS', F05Scenario[]> = {
  BASICS: [],
  TECHNIQUE: [SF5.TILTED_PULL, SF5.OFFSET, SF5.LOOSE_SCREW, SF5.OSCILLATING],
  DIAGNOSIS: [SF5.VARIABLE, SF5.WORN, SF5.NEAR_CRITICAL, SF5.LOW_THRESHOLD],
};

export function IntroScreenF05({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useF05((s) => s.settings);
  const setSettings = useF05((s) => s.setSettings);
  const start = useF05((s) => s.start);
  const startDemo = useF05((s) => s.startDemo);
  const resume = useF05((s) => s.resume);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadF05Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const toggleScenario = (s: F05Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : [...settings.scenarios, s] });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('f05.app.kicker')}</div>
          <h1>{t('f05.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('f05.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { useF05.getState().discardAndExit(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('f05.intro.lead')}</p>
            <ul>
              {tList('f05.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('f05.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('f05.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint">{t('f05.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="f05mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`f05.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('f05.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="f05profile">{t('f05.intro.profile')}</label>
                  <select id="f05profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: [...PROFILES[k]] }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`f05.profile.${k}`)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f05sci">{t('f05.intro.scientific')}</label>
                  <select id="f05sci" value={settings.scientificMode} onChange={(e) => setSettings({ scientificMode: e.target.value as 'CURRICULAR' | 'REALISTIC' })}>
                    <option value="REALISTIC">{t('f05.intro.sci.REALISTIC')}</option>
                    <option value="CURRICULAR">{t('f05.intro.sci.CURRICULAR')}</option>
                  </select>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('f05.intro.scenarios')}</legend>
                  {F05_SCENARIOS.map((s) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`f05.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="f05seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="f05seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('f05.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('f05.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
