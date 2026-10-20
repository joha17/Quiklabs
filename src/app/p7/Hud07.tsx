import { useTranslation } from 'react-i18next';
import { goToStation07, useP07 } from './store';
import { P07_STATIONS } from '../../practices/practice-07/definition';
import { fmtTime } from './ui';

export function Hud07() {
  const { t } = useTranslation();
  useP07((s) => s.version);
  const rt = useP07((s) => s.runtime);
  const st = useP07((s) => s.workflowStage);
  const settings = useP07((s) => s.settings);
  const setSettings = useP07((s) => s.setSettings);
  const paused = useP07((s) => s.paused);
  const setPaused = useP07((s) => s.setPaused);
  const setModal = useP07((s) => s.setModal);
  const toggleNotebook = useP07((s) => s.toggleNotebook);
  const toggleInventory = useP07((s) => s.toggleInventory);
  const notebookOpen = useP07((s) => s.notebookOpen);
  const inventoryOpen = useP07((s) => s.inventoryOpen);
  const time = rt?.world.timeS ?? 0;
  const samples = rt ? rt.world.readingOrder.filter((id) => rt.world.readings[id]?.valid).length : 0;
  const demo = useP07((s) => !!s.demo);
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('p7.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`p7.stage.${st}`)}</span>}
      {samples > 0 && <span className="stage-pill" title={t('p7.hud.readingsTitle')}>{t('p7.hud.readings', { n: samples })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {P07_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`p7.station.${s.id}`)} aria-label={t(`p7.station.${s.id}`)} onClick={() => goToStation07(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="p7speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="p7speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('p7.hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
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
