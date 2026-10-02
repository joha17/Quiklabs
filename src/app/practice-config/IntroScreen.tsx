import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearAttempt, loadAttempt, useLab } from '../store';
import { tList } from '../i18n';
import { newSeed } from '../../simulation/core/rng';
import type { PracticeMode } from '../../practices/practice-02/definition';

const MODES: PracticeMode[] = ['PRACTICE', 'GUIDED', 'EVALUATION', 'DEBUG'];

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m} min ${Math.floor(s % 60)} s`;
}

export function IntroScreen() {
  const { t } = useTranslation();
  const settings = useLab((s) => s.settings);
  const setSettings = useLab((s) => s.setSettings);
  const start = useLab((s) => s.start);
  const resume = useLab((s) => s.resume);
  const [savedVersion, setSavedVersion] = useState(0);
  const saved = useMemo(() => loadAttempt(), [savedVersion]);
  const [seedText, setSeedText] = useState(String(settings.seed));

  return (
    <main className="intro">
      <div className="intro-card">
        <div>
          <div className="kicker">{t('app.course')}</div>
          <h1>{t('app.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('app.subtitle')}</p>
        </div>
        {saved && (
          <div className="resume" role="region" aria-label={t('intro.resume')}>
            <span>{t('intro.resumeInfo', { mode: t(`mode.${saved.settings.mode}`), seed: saved.settings.seed, time: fmtTime(saved.world.timeS) })}</span>
            <button className="btn primary" onClick={() => resume(saved)}>{t('intro.resume')}</button>
            <button className="btn ghost" onClick={() => { clearAttempt(); setSavedVersion((v) => v + 1); }}>{t('intro.discard')}</button>
          </div>
        )}
        <div className="intro-grid">
          <section>
            <p style={{ marginTop: 0 }}>{t('intro.lead')}</p>
            <ul>
              <li>{t('intro.partA')}</li>
              <li>{t('intro.partB')}</li>
              <li>{t('intro.duration')}</li>
            </ul>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{t('intro.controls')}</h2>
            <ul>
              {tList('intro.controlsList').map((c) => <li key={c}>{c}</li>)}
            </ul>
          </section>
          <section style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: '0.35rem' }}>{t('intro.mode')}</legend>
              <div className="mode-list">
                {MODES.map((m) => (
                  <label key={m} className="mode-opt">
                    <input type="radio" name="mode" value={m} checked={settings.mode === m} onChange={() => setSettings({ mode: m, showZones: m === 'GUIDED' })} />
                    <span><strong>{t(`mode.${m}`)}</strong><small>{t(`mode.${m}_desc`)}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="oil">{t('intro.oil')}</label>
              <select id="oil" value={settings.oilProfile} onChange={(e) => setSettings({ oilProfile: e.target.value as 'OIL_VEG' | 'OIL_MIN' })}>
                <option value="OIL_VEG">{t('oil.OIL_VEG')}</option>
                <option value="OIL_MIN">{t('oil.OIL_MIN')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="seed">{t('intro.seed')}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="seed" type="text" inputMode="numeric" value={seedText} style={{ flex: 1 }}
                  onChange={(e) => { setSeedText(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setSettings({ seed: n >>> 0 }); }} />
                <button className="btn" onClick={() => { const s = newSeed(); setSeedText(String(s)); setSettings({ seed: s }); }}>{t('intro.seedNew')}</button>
              </div>
              <span className="hint">{t('intro.seedHelp')}</span>
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
