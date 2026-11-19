import { useTranslation } from 'react-i18next';
import { useF103 } from '../store';
import { newSeed } from '../../../simulation/core/rng';
import type { F103Mode } from '../../../practices/practice-f103/definition';
import { activeDemoF103 } from './index';

const SPEEDS = [0.5, 1, 2, 4];

/** Panel de la demostración: qué se está haciendo y por qué, con pausa, velocidad y saltar paso. */
export function DemoPanelF103() {
  const { t } = useTranslation();
  const demo = useF103((s) => s.demo);
  const paused = useF103((s) => s.paused);
  const setPaused = useF103((s) => s.setPaused);
  const setDemo = useF103((s) => s.setDemo);
  if (!demo) return null;
  const tryIt = (mode: F103Mode) => {
    const st = useF103.getState();
    st.setSettings({ mode, seed: newSeed() });
    st.start();
  };
  if (demo.done) {
    return (
      <aside className="demo-panel" aria-live="polite" aria-label={t('demo.ui.panel')}>
        <div className="kicker">{t('demo.ui.kicker')}</div>
        <h2>{t('demo.ui.doneTitle')}</h2>
        <p>{t('f103.demo.ui.doneText')}</p>
        <div className="demo-ctrl">
          <button className="btn primary" onClick={() => tryIt('PRACTICE')}>{t('demo.ui.tryPractice')}</button>
          <button className="btn" onClick={() => tryIt('GUIDED')}>{t('demo.ui.tryGuided')}</button>
        </div>
        <div className="demo-ctrl">
          <button className="btn ghost" onClick={() => useF103.getState().startDemo()}>↺ {t('demo.ui.again')}</button>
          <button className="btn ghost" onClick={() => useF103.getState().backToIntro()}>{t('demo.ui.exit')}</button>
        </div>
      </aside>
    );
  }
  const started = demo.index >= 0 && demo.key;
  return (
    <aside className="demo-panel" aria-live="polite" aria-label={t('demo.ui.panel')}>
      <div className="demo-head">
        <span className="kicker">{t('demo.ui.kicker')} · {t(`f103.demo.ui.part${demo.part}`)}</span>
        {started && <span className="demo-count">{t('demo.ui.step', { n: demo.index + 1, total: demo.total })}</span>}
      </div>
      {started && <progress max={demo.total} value={demo.index + 1} aria-hidden="true" />}
      <h2>{started ? t(`f103.demo.steps.${demo.key}.title`) : t('demo.ui.loading')}</h2>
      {started && <p>{t(`f103.demo.steps.${demo.key}.text`)}</p>}
      {demo.note && <p className="demo-note">{demo.note}</p>}
      <div className="demo-ctrl">
        <button className="btn small" onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? `▶ ${t('demo.ui.play')}` : `⏸ ${t('demo.ui.pause')}`}
        </button>
        <label className="demo-speed">
          <span>{t('demo.ui.speed')}</span>
          <select value={demo.speed} onChange={(e) => { const v = Number(e.target.value); setDemo({ speed: v }); activeDemoF103()?.setSpeed(v); }}>
            {SPEEDS.map((v) => <option key={v} value={v}>×{String(v).replace('.', ',')}</option>)}
          </select>
        </label>
        <button className="btn small" disabled={!started || paused} onClick={() => activeDemoF103()?.skip()}>⏭ {t('demo.ui.skip')}</button>
        <button className="btn small ghost" onClick={() => useF103.getState().backToIntro()}>{t('demo.ui.exit')}</button>
      </div>
    </aside>
  );
}
