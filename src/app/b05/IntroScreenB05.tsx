import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadB05Attempt, useB05 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { B05Mode } from '../../practices/practice-b05/definition';
import { B05_ROUTES, B05_SCENARIOS, validScenariosB05 } from '../../practices/practice-b05/error-scenarios';
import type { B05Scenario } from '../../practices/practice-b05/error-scenarios';
import { fmtTime } from './ui';

const MODES: B05Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Rutas docentes (§10): no sustituyen el modo; fijan qué escenarios empiezan activos. */
const PROFILES: Record<keyof typeof B05_ROUTES, B05Scenario[]> = B05_ROUTES;

export function IntroScreenB05({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useB05((s) => s.settings);
  const setSettings = useB05((s) => s.setSettings);
  const start = useB05((s) => s.start);
  const resume = useB05((s) => s.resume);
  const startDemo = useB05((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadB05Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  // Escenarios compatibles entre sí (§10): al marcar uno incompatible, gana el que ya estaba.
  const toggleScenario = (s: B05Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : validScenariosB05([...settings.scenarios, s]) });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('b05.app.kicker')}</div>
          <h1>{t('b05.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('b05.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { useB05.getState().discardAndExit(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('b05.intro.lead')}</p>
            <ul>
              {tList('b05.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('b05.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('b05.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint virtual-note" role="note">⚠ {t('b05.intro.safetyNote')}</p>
            <p className="hint">{t('b05.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="b05mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`b05.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('b05.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="b05profile">{t('b05.intro.profile')}</label>
                  <select id="b05profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: validScenariosB05([...PROFILES[k]]) }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`b05.profile.${k}`)}</option>)}
                  </select>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('b05.intro.scenarios')}</legend>
                  {B05_SCENARIOS.map(({ id: s }) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`b05.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="b05seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="b05seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('b05.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('b05.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
