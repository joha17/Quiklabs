import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadP08Attempt, useP08 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { P08Mode } from '../../practices/practice-08/definition';
import { P08_SCENARIOS, validScenarios08, type P08Scenario } from '../../practices/practice-08/error-scenarios';
import { S8 } from '../../simulation/organic-world/world';
import { ROUTES08, ROUTE_IDS } from '../../practices/practice-08/routes';
import { fmtTime } from './ui';

const MODES: P08Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Perfiles de actividad (§2.5, §10): no sustituyen el modo; fijan qué escenarios docentes empiezan activos. */
const PROFILES: Record<'STANDARD' | 'INSTRUMENTS' | 'EQUILIBRIUM' | 'ISOLATION', P08Scenario[]> = {
  STANDARD: [],
  INSTRUMENTS: [S8.MASS_OFFSET, S8.THERM_BIAS, S8.ANALYZER_OFFSET],
  EQUILIBRIUM: [S8.WATER_LOAD, S8.WET_VESSEL, S8.LIMITING_SWITCH, S8.UNPURE_START],
  ISOLATION: [S8.FILTER_TEAR, S8.FILTER_WET, S8.DRYING_LOW, S8.LAYER_EMULSION, S8.FRACTION_CROSSOVER],
};

export function IntroScreen08({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useP08((s) => s.settings);
  const setSettings = useP08((s) => s.setSettings);
  const start = useP08((s) => s.start);
  const resume = useP08((s) => s.resume);
  const startDemo = useP08((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadP08Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  // Escenarios compatibles entre sí (§10): al marcar uno incompatible, gana el que ya estaba.
  const toggleScenario = (s: P08Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : validScenarios08([...settings.scenarios, s], settings.route) });
  const setRoute = (r: typeof settings.route) => setSettings({ route: r, scenarios: validScenarios08(settings.scenarios, r) });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('p8.app.kicker')}</div>
          <h1>{t('p8.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('p8.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })} · {t(`p8.route.${saved.world.route}.name`)}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { useP08.getState().discardAndExit(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('p8.intro.lead')}</p>
            <ul>
              {tList('p8.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('p8.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('p8.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint">{t('p8.intro.safetyNote')}</p>
            <p className="hint">{t('p8.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} data-testid="p8-routes">
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('p8.intro.route')}</legend>
              <div className="mode-list">
                {ROUTE_IDS.map((r) => (
                  <label key={r} className="mode-opt">
                    <input type="radio" name="p8route" value={r} checked={settings.route === r} onChange={() => setRoute(r)} />
                    <span>
                      <strong>{t(`p8.route.${r}.name`)}</strong>
                      <small>{t(`p8.route.${r}.card`, { reaction: t(`p8.reaction.${ROUTES08[r].reaction}`), isolation: t(`p8.isolation.${ROUTES08[r].isolation}`) })}</small>
                    </span>
                  </label>
                ))}
              </div>
              <span className="hint">{t('p8.intro.routeFixed')}</span>
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="p8mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`p8.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('p8.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="p8profile">{t('p8.intro.profile')}</label>
                  <select id="p8profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: validScenarios08([...PROFILES[k]], settings.route) }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`p8.profile.${k}`)}</option>)}
                  </select>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('p8.intro.scenarios')}</legend>
                  {P08_SCENARIOS.filter((x) => x.routes.includes(settings.route)).map(({ id: s }) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`p8.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="p8seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="p8seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('p8.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('p8.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
