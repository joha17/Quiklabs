import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadP09Attempt, useP09 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { P09Mode } from '../../practices/practice-09/definition';
import { P09_SCENARIOS, validScenarios09, type P09Scenario } from '../../practices/practice-09/error-scenarios';
import { S9 } from '../../simulation/cation-analysis-world/world';
import { fmtTime } from './ui';

const MODES: P09Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Perfiles de actividad: no sustituyen el modo; fijan qué escenarios docentes empiezan activos. */
const PROFILES: Record<'STANDARD' | 'SAMPLES' | 'FLAME' | 'SEPARATION', P09Scenario[]> = {
  STANDARD: [],
  SAMPLES: [S9.NA_CONTAMINANT, S9.NEAR_LIMIT],
  FLAME: [S9.DIRTY_LOOP, S9.SUPPORT_RESIDUE, S9.BRIGHT_ROOM, S9.LOW_FLOW],
  SEPARATION: [S9.SULFATE_CLOGGED, S9.ALKALI_CONTAMINATED, S9.MISLABELED, S9.UNBALANCED, S9.SLOW_SETTLING],
};

export function IntroScreen09({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useP09((s) => s.settings);
  const setSettings = useP09((s) => s.setSettings);
  const start = useP09((s) => s.start);
  const resume = useP09((s) => s.resume);
  const startDemo = useP09((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadP09Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  // Escenarios compatibles entre sí (§10): al marcar uno incompatible, gana el que ya estaba.
  const toggleScenario = (s: P09Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : validScenarios09([...settings.scenarios, s]) });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('p9.app.kicker')}</div>
          <h1>{t('p9.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('p9.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { useP09.getState().discardAndExit(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('p9.intro.lead')}</p>
            <ul>
              {tList('p9.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('p9.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('p9.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint virtual-note" role="note">⚠ {t('p9.intro.safetyNote')}</p>
            <p className="hint">{t('p9.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="p9mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`p9.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('p9.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="p9profile">{t('p9.intro.profile')}</label>
                  <select id="p9profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: validScenarios09([...PROFILES[k]]) }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`p9.profile.${k}`)}</option>)}
                  </select>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('p9.intro.scenarios')}</legend>
                  {P09_SCENARIOS.map(({ id: s }) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`p9.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="p9seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="p9seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('p9.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('p9.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
