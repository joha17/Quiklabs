import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearP4Attempt, loadP4Attempt, useP4 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { P4Mode } from '../../practices/practice-04/definition';
import { P4_SCENARIOS, type P4Scenario } from '../../practices/practice-04/error-scenarios';
import { fmtTime } from './ui';

const MODES: P4Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

export function IntroScreen4({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useP4((s) => s.settings);
  const setSettings = useP4((s) => s.setSettings);
  const start = useP4((s) => s.start);
  const resume = useP4((s) => s.resume);
  const startDemo = useP4((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadP4Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const toggleScenario = (s: P4Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : [...settings.scenarios, s] });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('p4.app.kicker')}</div>
          <h1>{t('p4.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('p4.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { clearP4Attempt(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('p4.intro.lead')}</p>
            <ul>
              {tList('p4.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('p4.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('p4.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="p4mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`p4.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('p4.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="p4naoh">{t('p4.intro.naoh')}</label>
                  <select id="p4naoh" value={settings.naohSingle ?? 'two'} onChange={(e) => setSettings({ naohSingle: e.target.value === 'two' ? null : Number(e.target.value) })}>
                    <option value="two">{t('p4.intro.naohTwo')}</option>
                    <option value="0.1">{t('p4.intro.naohSingle', { c: '0,10' })}</option>
                    <option value="0.15">{t('p4.intro.naohSingle', { c: '0,15' })}</option>
                  </select>
                </div>
                <label className="check"><input type="checkbox" checked={settings.excessBaseDemo} onChange={(e) => setSettings({ excessBaseDemo: e.target.checked })} /> {t('p4.intro.excessBase')}</label>
                <label className="check"><input type="checkbox" checked={settings.feComparison} onChange={(e) => setSettings({ feComparison: e.target.checked })} /> {t('p4.intro.feComparison')}</label>
                <label className="check"><input type="checkbox" checked={settings.aluminum} onChange={(e) => setSettings({ aluminum: e.target.checked })} /> {t('p4.intro.aluminum')}</label>
                <label className="check"><input type="checkbox" checked={settings.allowNeutralDrain} onChange={(e) => setSettings({ allowNeutralDrain: e.target.checked })} /> {t('p4.intro.drain')}</label>
                <label className="check"><input type="checkbox" checked={settings.mgNitride} onChange={(e) => setSettings({ mgNitride: e.target.checked })} /> {t('p4.intro.nitride')}</label>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('p4.intro.scenarios')}</legend>
                  {P4_SCENARIOS.map((s) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`p4.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="p4seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="p4seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('p4.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('p4.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
