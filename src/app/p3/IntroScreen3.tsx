import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearP3Attempt, loadP3Attempt, useP3 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { P3Mode } from '../../practices/practice-03/definition';
import { P3_SCENARIOS, type P3Scenario } from '../../practices/practice-03/error-scenarios';
import { fmtTime } from './ui';

const MODES: P3Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

export function IntroScreen3({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useP3((s) => s.settings);
  const setSettings = useP3((s) => s.setSettings);
  const start = useP3((s) => s.start);
  const resume = useP3((s) => s.resume);
  const startDemo = useP3((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadP3Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const toggleScenario = (s: P3Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : [...settings.scenarios, s] });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('p3.app.kicker')}</div>
          <h1>{t('p3.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('p3.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { clearP3Attempt(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('p3.intro.lead')}</p>
            <ul>
              {tList('p3.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('p3.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('p3.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="p3mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`p3.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('p3.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="p3fuel">{t('p3.intro.fuel')}</label>
                  <select id="p3fuel" value={settings.fuel} onChange={(e) => setSettings({ fuel: e.target.value as 'PROPANE' | 'BUTANE' })}>
                    <option value="PROPANE">{t('p3.fuel.PROPANE')}</option>
                    <option value="BUTANE">{t('p3.fuel.BUTANE')}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p3loops">{t('p3.intro.loopMode')}</label>
                  <select id="p3loops" value={settings.loopMode} onChange={(e) => setSettings({ loopMode: e.target.value as 'DEDICATED' | 'SHARED' })}>
                    <option value="DEDICATED">{t('p3.loopMode.DEDICATED')}</option>
                    <option value="SHARED">{t('p3.loopMode.SHARED')}</option>
                  </select>
                </div>
                <label className="check"><input type="checkbox" checked={settings.atomizer} onChange={(e) => setSettings({ atomizer: e.target.checked })} /> {t('p3.intro.atomizer')}</label>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('p3.intro.scenarios')}</legend>
                  {P3_SCENARIOS.map((s) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`p3.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="p3seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="p3seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('p3.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('p3.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
