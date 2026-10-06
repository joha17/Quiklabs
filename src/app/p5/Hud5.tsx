import { useTranslation } from 'react-i18next';
import { useP5 } from './store';
import { P5_STATIONS } from '../../practices/practice-05/definition';
import { stopwatchS } from '../../simulation/stoich-world/world';
import { fmtTime } from './ui';

/** Cronómetro (§13): medir la duración de cada ciclo de calentamiento es parte del procedimiento. */
function Stopwatch5() {
  const { t } = useTranslation();
  const rt = useP5((s) => s.runtime);
  const dispatch = useP5((s) => s.dispatch);
  useP5((s) => s.version);
  if (!rt) return null;
  const sw = rt.world.stopwatch;
  const s = Math.floor(stopwatchS(rt.world));
  return (
    <div className="group stopwatch" role="group" aria-label={t('p4.sw.title')}>
      <span className="clock" title={t('p4.sw.title')} aria-live="off">⏲ {fmtTime(s)}</span>
      <button className="btn small" onClick={() => dispatch({ type: 'stopwatch', action: sw.running ? 'STOP' : 'START' })}>{sw.running ? t('p4.sw.stop') : t('p4.sw.start')}</button>
      <button className="btn small ghost" aria-label={t('p4.sw.reset')} onClick={() => dispatch({ type: 'stopwatch', action: 'RESET' })}>↺</button>
    </div>
  );
}

export function Hud5() {
  const { t } = useTranslation();
  useP5((s) => s.version);
  const rt = useP5((s) => s.runtime);
  const stage = useP5((s) => s.stage);
  const st = useP5((s) => s.workflowStage);
  const settings = useP5((s) => s.settings);
  const setSettings = useP5((s) => s.setSettings);
  const paused = useP5((s) => s.paused);
  const setPaused = useP5((s) => s.setPaused);
  const setModal = useP5((s) => s.setModal);
  const toggleNotebook = useP5((s) => s.toggleNotebook);
  const toggleInventory = useP5((s) => s.toggleInventory);
  const notebookOpen = useP5((s) => s.notebookOpen);
  const inventoryOpen = useP5((s) => s.inventoryOpen);
  const time = rt?.world.timeS ?? 0;
  const demo = useP5((s) => !!s.demo);
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('p5.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`p5.stage.${st}`)}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {P5_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`p5.station.${s.id}`)} aria-label={t(`p5.station.${s.id}`)} onClick={() => stage?.goToStation(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <Stopwatch5 />
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="p5speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="p5speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('p5.hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
            {[1, 2, 5, 10, 20, 40].map((v) => <option key={v} value={v}>×{v}</option>)}
          </select>
        )}
        <button className="btn small" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? `▶ ${t('hud.play')}` : `⏸ ${t('hud.pause')}`}</button>
      </div>
      <div className="group">
        <button className="btn small" aria-pressed={inventoryOpen} onClick={toggleInventory}>{t('hud.inventory')}</button>
        <button className="btn small" aria-pressed={notebookOpen} onClick={toggleNotebook}>📓 {t('hud.notebook')}</button>
        <button className="btn small" onClick={() => setModal({ kind: 'settings' })}>⚙ {t('hud.settings')}</button>
        <button className="btn small" onClick={() => setModal({ kind: 'help' })}>? {t('hud.help')}</button>
        {!demo && <button className="btn small primary" onClick={() => setModal({ kind: 'submit' })}>{t('hud.submit')}</button>}
      </div>
    </header>
  );
}
