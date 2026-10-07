import { useTranslation } from 'react-i18next';
import { useP10 } from '../store';
import { newSeed } from '../../../simulation/core/rng';
import type { P10Mode } from '../../../practices/practice-10/definition';
import { activeDemo10 } from './index';

const SPEEDS = [0.5, 1, 2, 4];

/** Panel de la demostración: qué se está haciendo y por qué, con pausa, velocidad y saltar paso. */
export function DemoPanel10() {
  const { t } = useTranslation();
  const demo = useP10((s) => s.demo);
  const paused = useP10((s) => s.paused);
  const setPaused = useP10((s) => s.setPaused);
  const setDemo = useP10((s) => s.setDemo);
  if (!demo) return null;
  const tryIt = (mode: P10Mode) => {
    const st = useP10.getState();
    st.setSettings({ mode, seed: newSeed() });
    st.start();
  };
  if (demo.done) {
    return (
      <aside className="demo-panel" aria-live="polite" aria-label={t('demo.ui.panel')}>
        <div className="kicker">{t('demo.ui.kicker')}</div>
        <h2>{t('demo.ui.doneTitle')}</h2>
        <p>{t('p10.demo.ui.doneText')}</p>
        <div className="demo-ctrl">
          <button className="btn primary" onClick={() => tryIt('PRACTICE')}>{t('demo.ui.tryPractice')}</button>
          <button className="btn" onClick={() => tryIt('GUIDED')}>{t('demo.ui.tryGuided')}</button>
        </div>
        <div className="demo-ctrl">
          <button className="btn ghost" onClick={() => useP10.getState().startDemo()}>↺ {t('demo.ui.again')}</button>
          <button className="btn ghost" onClick={() => useP10.getState().backToIntro()}>{t('demo.ui.exit')}</button>
        </div>
      </aside>
    );
  }
  const started = demo.index >= 0 && demo.key;
  return (
    <aside className="demo-panel" aria-live="polite" aria-label={t('demo.ui.panel')}>
      <div className="demo-head">
        <span className="kicker">{t('demo.ui.kicker')} · {t(`p10.demo.ui.part${demo.part}`)}</span>
        {started && <span className="demo-count">{t('demo.ui.step', { n: demo.index + 1, total: demo.total })}</span>}
      </div>
      {started && <progress max={demo.total} value={demo.index + 1} aria-hidden="true" />}
      <h2>{started ? t(`p10.demo.steps.${demo.key}.title`) : t('demo.ui.loading')}</h2>
      {started && <p>{t(`p10.demo.steps.${demo.key}.text`)}</p>}
      {demo.note && <p className="demo-note">{demo.note}</p>}
      <div className="demo-ctrl">
        <button className="btn small" onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? `▶ ${t('demo.ui.play')}` : `⏸ ${t('demo.ui.pause')}`}
        </button>
        <label className="demo-speed">
          <span>{t('demo.ui.speed')}</span>
          <select value={demo.speed} onChange={(e) => { const v = Number(e.target.value); setDemo({ speed: v }); activeDemo10()?.setSpeed(v); }}>
            {SPEEDS.map((v) => <option key={v} value={v}>×{String(v).replace('.', ',')}</option>)}
          </select>
        </label>
        <button className="btn small" disabled={!started || paused} onClick={() => activeDemo10()?.skip()}>⏭ {t('demo.ui.skip')}</button>
        <button className="btn small ghost" onClick={() => useP10.getState().backToIntro()}>{t('demo.ui.exit')}</button>
      </div>
    </aside>
  );
}
