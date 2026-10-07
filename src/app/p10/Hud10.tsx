import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { P10_STATIONS } from '../../practices/practice-10/definition';
import { fmtTime } from './ui';

export function Hud10() {
  const { t } = useTranslation();
  useP10((s) => s.version);
  const rt = useP10((s) => s.runtime);
  const stage = useP10((s) => s.stage);
  const st = useP10((s) => s.workflowStage);
  const settings = useP10((s) => s.settings);
  const setSettings = useP10((s) => s.setSettings);
  const paused = useP10((s) => s.paused);
  const setPaused = useP10((s) => s.setPaused);
  const setModal = useP10((s) => s.setModal);
  const toggleNotebook = useP10((s) => s.toggleNotebook);
  const toggleInventory = useP10((s) => s.toggleInventory);
  const notebookOpen = useP10((s) => s.notebookOpen);
  const inventoryOpen = useP10((s) => s.inventoryOpen);
  const time = rt?.world.timeS ?? 0;
  const runs = rt?.world.runs.length ?? 0;
  const demo = useP10((s) => !!s.demo);
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('p10.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`p10.stage.${st}`)}</span>}
      {runs > 0 && <span className="stage-pill" title={t('p10.hud.runs')}>{t('p10.hud.run', { n: runs, total: settings.replicates })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {P10_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`p10.station.${s.id}`)} aria-label={t(`p10.station.${s.id}`)} onClick={() => stage?.goToStation(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="p10speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="p10speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('p10.hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
            {[1, 2, 3, 5, 10, 20].map((v) => <option key={v} value={v}>×{v}</option>)}
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
