import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearP6Attempt, loadP6Attempt, useP6 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { P6Mode } from '../../practices/practice-06/definition';
import { P6_SCENARIOS, type P6Scenario } from '../../practices/practice-06/error-scenarios';
import { fmtTime } from './ui';
import { UNKNOWN_BANK } from '../../simulation/calorimetry/materials';

const MODES: P6Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

export function IntroScreen6({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useP6((s) => s.settings);
  const setSettings = useP6((s) => s.setSettings);
  const start = useP6((s) => s.start);
  const resume = useP6((s) => s.resume);
  const startDemo = useP6((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadP6Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const toggleScenario = (s: P6Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : [...settings.scenarios, s] });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('p6.app.kicker')}</div>
          <h1>{t('p6.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('p6.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { clearP6Attempt(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('p6.intro.lead')}</p>
            <ul>
              {tList('p6.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('p6.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('p6.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="p6mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`p6.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('p6.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="p6model">{t('p6.intro.model')}</label>
                  <select id="p6model" value={settings.model} onChange={(e) => setSettings({ model: e.target.value as 'IDEAL' | 'REALISTIC' })}>
                    <option value="REALISTIC">{t('p6.intro.modelRealistic')}</option>
                    <option value="IDEAL">{t('p6.intro.modelIdeal')}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p6unknown">{t('p6.intro.unknown')}</label>
                  <select id="p6unknown" value={settings.unknown ?? ''} onChange={(e) => setSettings({ unknown: (e.target.value || null) as never })}>
                    <option value="">{t('p6.intro.unknownSeed')}</option>
                    {UNKNOWN_BANK.map((m) => <option key={m} value={m}>{t(`p6.metal.${m}`)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p6press">{t('p6.intro.pressure')}</label>
                  <select id="p6press" value={settings.pressureKPa} onChange={(e) => setSettings({ pressureKPa: Number(e.target.value) })}>
                    {[101.325, 88, 75].map((v) => <option key={v} value={v}>{String(v).replace('.', ',')} kPa</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p6res">{t('p6.intro.resolution')}</label>
                  <select id="p6res" value={settings.balanceResolution} onChange={(e) => setSettings({ balanceResolution: Number(e.target.value) as 0.1 | 0.01 })}>
                    <option value={0.1}>0,1 g</option>
                    <option value={0.01}>0,01 g</option>
                  </select>
                </div>
                <label className="check"><input type="checkbox" checked={settings.cpModel === 'T_DEPENDENT'} onChange={(e) => setSettings({ cpModel: e.target.checked ? 'T_DEPENDENT' : 'CONSTANT' })} /> {t('p6.intro.cpT')}</label>
                <label className="check"><input type="checkbox" checked={settings.bombEnabled} onChange={(e) => setSettings({ bombEnabled: e.target.checked })} /> {t('p6.intro.bomb')}</label>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('p6.intro.scenarios')}</legend>
                  {P6_SCENARIOS.map((s) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`p6.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="p6seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="p6seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('p6.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('p6.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
