import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadF102Attempt, useF102 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { F102Mode } from '../../practices/practice-f102/definition';
import { F102_SCENARIOS, type F102Scenario } from '../../practices/practice-f102/error-scenarios';
import { SF2 } from '../../simulation/f102-world/world';
import { fmtTime } from './ui';

const MODES: F102Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Perfiles de actividad : no sustituyen el modo; fijan qué escenarios docentes empiezan activos. */
const PROFILES: Record<'BASICS' | 'TECHNIQUE' | 'DIAGNOSIS', F102Scenario[]> = {
  BASICS: [],
  TECHNIQUE: [SF2.NARROW_FLAG, SF2.PULLEY_INERTIA, SF2.CART_FRICTION, SF2.FILTER_MASSES],
  DIAGNOSIS: [SF2.MISPLACED_GATE, SF2.SIDE_WIND, SF2.NOISY_SENSOR, SF2.TIMER_OFFSET],
};

export function IntroScreenF102({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useF102((s) => s.settings);
  const setSettings = useF102((s) => s.setSettings);
  const start = useF102((s) => s.start);
  const resume = useF102((s) => s.resume);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadF102Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const toggleScenario = (s: F102Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : [...settings.scenarios, s] });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('f102.app.kicker')}</div>
          <h1>{t('f102.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('f102.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { useF102.getState().discardAndExit(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('f102.intro.lead')}</p>
            <ul>
              {tList('f102.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('f102.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('f102.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint">{t('f102.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="f102mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`f102.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('f102.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="f102profile">{t('f102.intro.profile')}</label>
                  <select id="f102profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: [...PROFILES[k]] }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`f102.profile.${k}`)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f102sci">{t('f102.intro.scientific')}</label>
                  <select id="f102sci" value={settings.scientificMode} onChange={(e) => setSettings({ scientificMode: e.target.value as 'CURRICULAR' | 'REALISTIC' })}>
                    <option value="REALISTIC">{t('f102.intro.sci.REALISTIC')}</option>
                    <option value="CURRICULAR">{t('f102.intro.sci.CURRICULAR')}</option>
                  </select>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('f102.intro.scenarios')}</legend>
                  {F102_SCENARIOS.map((s) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`f102.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="f102seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="f102seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('f102.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
