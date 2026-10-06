import { useTranslation } from 'react-i18next';
import { useP5 } from '../store';
import { newSeed } from '../../../simulation/core/rng';
import type { P5Mode } from '../../../practices/practice-05/definition';
import { activeDemo5 } from './index';

const SPEEDS = [0.5, 1, 2, 4];

/** Panel de la demostración: qué se está haciendo y por qué, con pausa, velocidad y saltar paso. */
export function DemoPanel5() {
  const { t } = useTranslation();
  const demo = useP5((s) => s.demo);
  const paused = useP5((s) => s.paused);
  const setPaused = useP5((s) => s.setPaused);
  const setDemo = useP5((s) => s.setDemo);
  if (!demo) return null;
  const tryIt = (mode: P5Mode) => {
    const st = useP5.getState();
    st.setSettings({ mode, seed: newSeed() });
    st.start();
  };
  if (demo.done) {
    return (
      <aside className="demo-panel" aria-live="polite" aria-label={t('demo.ui.panel')}>
        <div className="kicker">{t('demo.ui.kicker')}</div>
        <h2>{t('demo.ui.doneTitle')}</h2>
        <p>{t('p5.demo.ui.doneText')}</p>
        <div className="demo-ctrl">
          <button className="btn primary" onClick={() => tryIt('PRACTICE')}>{t('demo.ui.tryPractice')}</button>
          <button className="btn" onClick={() => tryIt('GUIDED')}>{t('demo.ui.tryGuided')}</button>
        </div>
        <div className="demo-ctrl">
          <button className="btn ghost" onClick={() => useP5.getState().startDemo()}>↺ {t('demo.ui.again')}</button>
          <button className="btn ghost" onClick={() => useP5.getState().backToIntro()}>{t('demo.ui.exit')}</button>
        </div>
      </aside>
    );
  }
  const started = demo.index >= 0 && demo.key;
  return (
    <aside className="demo-panel" aria-live="polite" aria-label={t('demo.ui.panel')}>
      <div className="demo-head">
        <span className="kicker">{t('demo.ui.kicker')} · {t(`p5.demo.ui.part${demo.part}`)}</span>
        {started && <span className="demo-count">{t('demo.ui.step', { n: demo.index + 1, total: demo.total })}</span>}
      </div>
      {started && <progress max={demo.total} value={demo.index + 1} aria-hidden="true" />}
      <h2>{started ? t(`p5.demo.steps.${demo.key}.title`) : t('demo.ui.loading')}</h2>
      {started && <p>{t(`p5.demo.steps.${demo.key}.text`)}</p>}
      {demo.note && <p className="demo-note">{demo.note}</p>}
      <div className="demo-ctrl">
        <button className="btn small" onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? `▶ ${t('demo.ui.play')}` : `⏸ ${t('demo.ui.pause')}`}
        </button>
        <label className="demo-speed">
          <span>{t('demo.ui.speed')}</span>
          <select value={demo.speed} onChange={(e) => { const v = Number(e.target.value); setDemo({ speed: v }); activeDemo5()?.setSpeed(v); }}>
            {SPEEDS.map((v) => <option key={v} value={v}>×{String(v).replace('.', ',')}</option>)}
          </select>
        </label>
        <button className="btn small" disabled={!started || paused} onClick={() => activeDemo5()?.skip()}>⏭ {t('demo.ui.skip')}</button>
        <button className="btn small ghost" onClick={() => useP5.getState().backToIntro()}>{t('demo.ui.exit')}</button>
      </div>
    </aside>
  );
}
