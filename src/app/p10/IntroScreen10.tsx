import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearP10Attempt, loadP10Attempt, useP10 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { P10Mode } from '../../practices/practice-10/definition';
import { P10_SCENARIOS, type P10Scenario } from '../../practices/practice-10/error-scenarios';
import { fmtTime } from './ui';
import type { SensorModel } from '../../simulation/instruments/pressure-sensor';

const MODES: P10Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

export function IntroScreen10({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useP10((s) => s.settings);
  const setSettings = useP10((s) => s.setSettings);
  const start = useP10((s) => s.start);
  const resume = useP10((s) => s.resume);
  const startDemo = useP10((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadP10Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const toggleScenario = (s: P10Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : [...settings.scenarios, s] });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('p10.app.kicker')}</div>
          <h1>{t('p10.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('p10.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { clearP10Attempt(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('p10.intro.lead')}</p>
            <ul>
              {tList('p10.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('p10.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('p10.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="p10mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`p10.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('p10.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="p10model">{t('p10.intro.model')}</label>
                  <select id="p10model" value={settings.model} onChange={(e) => setSettings({ model: e.target.value as 'CURRICULAR' | 'REALISTIC' })}>
                    <option value="CURRICULAR">{t('p10.intro.modelCurricular')}</option>
                    <option value="REALISTIC">{t('p10.intro.modelRealistic')}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p10press">{t('p10.intro.pressure')}</label>
                  <select id="p10press" value={`${settings.pressureKPa}|${settings.altitudeM}`} onChange={(e) => { const [p, a] = e.target.value.split('|').map(Number); setSettings({ pressureKPa: p, altitudeM: a }); }}>
                    <option value="101.325|0">101,325 kPa · {t('p10.intro.seaLevel')}</option>
                    <option value="88.6|1150">88,6 kPa · 1150 m</option>
                    <option value="76.5|2400">76,5 kPa · 2400 m</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p10amb">{t('p10.intro.ambient')}</label>
                  <select id="p10amb" value={settings.ambientC} onChange={(e) => setSettings({ ambientC: Number(e.target.value) })}>
                    {[20, 22, 23.5, 25, 26].map((v) => <option key={v} value={v}>{String(v).replace('.', ',')} °C</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p10vin">{t('p10.intro.vinegar')}</label>
                  <select id="p10vin" value={`${settings.vinegarPercent}|${settings.vinegarBasis}`} onChange={(e) => { const [p, b] = e.target.value.split('|'); setSettings({ vinegarPercent: Number(p), vinegarBasis: b as 'm/m' | 'm/v' | 'v/v' }); }}>
                    {['5|m/v', '5|m/m', '5|v/v', '4|m/v', '0.5|m/v'].map((v) => <option key={v} value={v}>{v.replace('|', ' % ').replace('.', ',')}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p10flask">{t('p10.intro.flask')}</label>
                  <select id="p10flask" value={settings.flaskMl} onChange={(e) => setSettings({ flaskMl: Number(e.target.value) as 100 | 50 })}>
                    <option value={100}>100,00 mL</option>
                    <option value={50}>50,00 mL ({t('p10.intro.flaskAlt')})</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p10sensor">{t('p10.intro.sensor')}</label>
                  <select id="p10sensor" value={settings.sensorModel} onChange={(e) => setSettings({ sensorModel: e.target.value as SensorModel })}>
                    {(['GPS_BTA', 'GDX_GP', 'GAUGE_DEMO'] as const).map((m) => <option key={m} value={m}>{t(`p10.sensorName.${m}`)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p10res">{t('p10.intro.resolution')}</label>
                  <select id="p10res" value={settings.balanceResolution} onChange={(e) => setSettings({ balanceResolution: Number(e.target.value) as 0.0001 | 0.001 })}>
                    <option value={0.0001}>0,0001 g</option>
                    <option value={0.001}>0,001 g</option>
                  </select>
                </div>
                <label className="check"><input type="checkbox" checked={settings.vapor === 'ANTOINE'} onChange={(e) => setSettings({ vapor: e.target.checked ? 'ANTOINE' : 'TABLE' })} /> {t('p10.intro.antoine')}</label>
                <label className="check"><input type="checkbox" checked={settings.bathWater === 'SATURATED'} onChange={(e) => setSettings({ bathWater: e.target.checked ? 'SATURATED' : 'FRESH' })} /> {t('p10.intro.saturated')}</label>
                <label className="check"><input type="checkbox" checked={settings.replicates === 1} onChange={(e) => setSettings({ replicates: e.target.checked ? 1 : 2 })} /> {t('p10.intro.oneReplicate')}</label>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('p10.intro.scenarios')}</legend>
                  {P10_SCENARIOS.map((s) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`p10.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="p10seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="p10seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('p10.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('p10.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
