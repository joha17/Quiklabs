import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadF08Attempt, useF08 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { F08Mode } from '../../practices/practice-f08/definition';
import { F08_SCENARIOS, type F08Scenario } from '../../practices/practice-f08/error-scenarios';
import { SF8 } from '../../simulation/f08-world/world';
import { fmtTime } from './ui';

const MODES: F08Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Perfiles de actividad : no sustituyen el modo; fijan qué escenarios docentes empiezan activos. */
const PROFILES: Record<'BASICS' | 'TECHNIQUE' | 'DIAGNOSIS', F08Scenario[]> = {
  BASICS: [],
  TECHNIQUE: [SF8.RING, SF8.ASYM, SF8.ENC_MISCAL, SF8.CATCH],
  DIAGNOSIS: [SF8.FRICTION, SF8.OFFSET_AXIS, SF8.LOW_TORQUE, SF8.BAR],
};

export function IntroScreenF08({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useF08((s) => s.settings);
  const setSettings = useF08((s) => s.setSettings);
  const start = useF08((s) => s.start);
  const startDemo = useF08((s) => s.startDemo);
  const resume = useF08((s) => s.resume);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadF08Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const toggleScenario = (s: F08Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : [...settings.scenarios, s] });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('f08.app.kicker')}</div>
          <h1>{t('f08.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('f08.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { useF08.getState().discardAndExit(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('f08.intro.lead')}</p>
            <ul>
              {tList('f08.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('f08.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('f08.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint">{t('f08.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="f08mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`f08.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('f08.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="f08profile">{t('f08.intro.profile')}</label>
                  <select id="f08profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: [...PROFILES[k]] }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`f08.profile.${k}`)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f08sci">{t('f08.intro.scientific')}</label>
                  <select id="f08sci" value={settings.scientificMode} onChange={(e) => setSettings({ scientificMode: e.target.value as 'CURRICULAR' | 'REALISTIC' })}>
                    <option value="REALISTIC">{t('f08.intro.sci.REALISTIC')}</option>
                    <option value="CURRICULAR">{t('f08.intro.sci.CURRICULAR')}</option>
                  </select>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('f08.intro.scenarios')}</legend>
                  {F08_SCENARIOS.map((s) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`f08.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="f08seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="f08seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('f08.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('f08.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
