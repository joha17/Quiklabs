import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadP07Attempt, useP07 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { P07Mode } from '../../practices/practice-07/definition';
import { P07_SCENARIOS, validScenarios, type P07Scenario } from '../../practices/practice-07/error-scenarios';
import { S } from '../../simulation/bonding-world/world';
import { fmtTime } from './ui';

const MODES: P07Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Perfiles de actividad (§7.1): no sustituyen el modo; fijan qué escenarios docentes empiezan activos. */
const PROFILES: Record<'STANDARD' | 'SURFACES' | 'INSTRUMENTS' | 'INQUIRY', P07Scenario[]> = {
  STANDARD: [S.STANDARD],
  SURFACES: [S.HUMID_CRYSTAL, S.OXIDIZED_ALUMINUM, S.GRAPHITE_SAMPLE],
  INSTRUMENTS: [S.PROBE_NOT_RINSED, S.WRONG_RANGE, S.BALANCE_OFFSET, S.PROBE_TEMPERATURE],
  INQUIRY: [S.UNKNOWNS_BLINDED, S.SUGAR_WITH_SALT, S.SOLUBILITY_LIMIT, S.MULTIPHASE],
};

export function IntroScreen07({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useP07((s) => s.settings);
  const setSettings = useP07((s) => s.setSettings);
  const start = useP07((s) => s.start);
  const resume = useP07((s) => s.resume);
  const startDemo = useP07((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadP07Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  // Escenarios compatibles entre sí (§10): al marcar uno incompatible, gana el que ya estaba.
  const toggleScenario = (s: P07Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : validScenarios([...settings.scenarios, s]) });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('p7.app.kicker')}</div>
          <h1>{t('p7.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('p7.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { useP07.getState().discardAndExit(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('p7.intro.lead')}</p>
            <ul>
              {tList('p7.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('p7.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('p7.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint">{t('p7.intro.safetyNote')}</p>
            <p className="hint">{t('p7.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="p7mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`p7.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('p7.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="p7profile">{t('p7.intro.profile')}</label>
                  <select id="p7profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: [...PROFILES[k]] }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`p7.profile.${k}`)}</option>)}
                  </select>
                </div>
                {settings.mode === 'DEBUG' && (
                  <label className="check"><input type="checkbox" checked={settings.allowRestricted} onChange={(e) => setSettings({ allowRestricted: e.target.checked })} /> {t('p7.intro.allowRestricted')}</label>
                )}
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('p7.intro.scenarios')}</legend>
                  {P07_SCENARIOS.map(({ id: s }) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`p7.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="p7seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="p7seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('p7.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('p7.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
