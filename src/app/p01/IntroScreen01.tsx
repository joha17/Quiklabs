import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadP01Attempt, useP01 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { P01Mode } from '../../practices/practice-01/definition';
import { P01_SCENARIOS, type P01Scenario } from '../../practices/practice-01/error-scenarios';
import { S } from '../../simulation/density-world/world';
import { fmtTime } from './ui';

const MODES: P01Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Perfiles de actividad (§7.1): no sustituyen el modo; fijan qué escenarios docentes empiezan activos. */
const PROFILES: Record<'BASICS' | 'TECHNIQUE' | 'DIAGNOSIS', P01Scenario[]> = {
  BASICS: [],
  TECHNIQUE: [S.PIPETTE_AIR, S.THERMO_SLOW, S.NAILS_AIR],
  DIAGNOSIS: [S.BALANCE_ZERO, S.CALIPER_ZERO, S.THERMO_BIAS],
};

export function IntroScreen01({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useP01((s) => s.settings);
  const setSettings = useP01((s) => s.setSettings);
  const start = useP01((s) => s.start);
  const resume = useP01((s) => s.resume);
  const startDemo = useP01((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadP01Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const toggleScenario = (s: P01Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : [...settings.scenarios, s] });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('p01.app.kicker')}</div>
          <h1>{t('p01.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('p01.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { useP01.getState().discardAndExit(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('p01.intro.lead')}</p>
            <ul>
              {tList('p01.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('p01.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('p01.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint">{t('p01.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="p01mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`p01.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('p01.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="p01profile">{t('p01.intro.profile')}</label>
                  <select id="p01profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: [...PROFILES[k]] }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`p01.profile.${k}`)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p01room">{t('p01.intro.room')}</label>
                  <select id="p01room" value={settings.roomTempC} onChange={(e) => setSettings({ roomTempC: Number(e.target.value) })}>
                    {[20, 22, 25, 28].map((v) => <option key={v} value={v}>{v} °C</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p01bath">{t('p01.intro.bath')}</label>
                  <select id="p01bath" value={settings.coldBathTargetC} onChange={(e) => setSettings({ coldBathTargetC: Number(e.target.value) })}>
                    {[2, 5, 10].map((v) => <option key={v} value={v}>{v} °C</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p01conv">{t('p01.intro.convention')}</label>
                  <select id="p01conv" value={settings.convention} onChange={(e) => setSettings({ convention: e.target.value as 'RECTANGULAR' | 'DIRECT' })}>
                    <option value="RECTANGULAR">{t('p01.conventionBadge.RECTANGULAR')}</option>
                    <option value="DIRECT">{t('p01.conventionBadge.DIRECT')}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p01mat">{t('p01.intro.material')}</label>
                  <select id="p01mat" value={settings.cylinderMaterial} onChange={(e) => setSettings({ cylinderMaterial: e.target.value as 'ALUMINUM' | 'BRASS' | 'STEEL' })}>
                    {(['ALUMINUM', 'BRASS', 'STEEL'] as const).map((m) => <option key={m} value={m}>{t(`p01.material.${m}`)}</option>)}
                  </select>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('p01.intro.scenarios')}</legend>
                  {P01_SCENARIOS.map((s) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`p01.scenario.${s}`)}</label>
                  ))}
                </fieldset>
              </div>
            </details>
            <div className="field">
              <label htmlFor="p01seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="p01seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('p01.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('p01.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
