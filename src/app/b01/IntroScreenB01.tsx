import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearB01Attempt, loadB01Attempt, useB01 } from './store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { B01Mode } from '../../practices/practice-b01/definition';
import { B01_SCENARIOS, validScenariosB01, type B01Scenario } from '../../practices/practice-b01/error-scenarios';
import { SB } from '../../simulation/optical-world/world';
import { fmtTime } from './ui';

const MODES: B01Mode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

/** Perfiles de actividad: no sustituyen el modo; fijan qué escenarios docentes empiezan activos. */
const PROFILES: Record<'STANDARD' | 'PREP' | 'MICROSCOPE' | 'SLIDES' | 'STEREO', B01Scenario[]> = {
  STANDARD: [],
  PREP: [SB.DIRTY_SLIDE, SB.BIG_LEAF, SB.LIMITED_DROPPER, SB.COVER_GRIP],
  MICROSCOPE: [SB.LOW_LIGHT, SB.CONDENSER, SB.STAGE_OFF, SB.CLIP_CLOSED, SB.START_40X],
  SLIDES: [SB.SIMILAR_SLIDES, SB.TWO_PLANES],
  STEREO: [SB.REFLECTIVE, SB.STEREO_DEFOCUS, SB.STEREO_PAIR],
};

export function IntroScreenB01({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const settings = useB01((s) => s.settings);
  const setSettings = useB01((s) => s.setSettings);
  const start = useB01((s) => s.start);
  const resume = useB01((s) => s.resume);
  const startDemo = useB01((s) => s.startDemo);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadB01Attempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));
  // Escenarios compatibles entre sí (§10): al marcar uno incompatible, gana el que ya estaba.
  const toggleScenario = (s: B01Scenario) =>
    setSettings({ scenarios: settings.scenarios.includes(s) ? settings.scenarios.filter((x) => x !== s) : validScenariosB01([...settings.scenarios, s]) });

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <button className="btn small ghost back-link" onClick={onBack}>← {t('menu.back')}</button>
          <div className="kicker">{t('app.course')} · {t('b01.app.kicker')}</div>
          <h1>{t('b01.app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('b01.app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { clearB01Attempt(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('b01.intro.lead')}</p>
            <ul>
              {tList('b01.intro.modules').map((m) => <li key={m}>{m}</li>)}
              <li>{t('b01.intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('b01.intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="hint virtual-note" role="note">⚠ {t('b01.intro.safetyNote')}</p>
            <p className="hint">{t('b01.intro.attribution')}</p>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="p9mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`b01.mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="teacher-opts">
              <summary className="label">{t('b01.intro.teacher')}</summary>
              <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="p9profile">{t('b01.intro.profile')}</label>
                  <select id="p9profile" defaultValue="" onChange={(e) => { const k = e.target.value as keyof typeof PROFILES; if (PROFILES[k]) setSettings({ scenarios: validScenariosB01([...PROFILES[k]]) }); }}>
                    <option value="">{t('nb.choose')}</option>
                    {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((k) => <option key={k} value={k}>{t(`b01.profile.${k}`)}</option>)}
                  </select>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">{t('b01.intro.scenarios')}</legend>
                  {B01_SCENARIOS.map(({ id: s }) => (
                    <label key={s} className="check"><input type="checkbox" checked={settings.scenarios.includes(s)} onChange={() => toggleScenario(s)} /> {t(`b01.scenario.${s}`)}</label>
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
              <span className="hint">{t('b01.intro.seedHelp')}</span>
            </div>
            <button className="btn primary" style={{ minHeight: '2.8rem', fontSize: '1rem' }} onClick={() => start({ sameSeed: true })}>
              {t('intro.start')}
            </button>
            <div className="demo-cta">
              <button className="btn" style={{ minHeight: '2.6rem', fontSize: '0.98rem' }} onClick={startDemo}>▶ {t('demo.ui.watch')}</button>
              <span className="hint">{t('b01.demo.ui.watchHelp')}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
