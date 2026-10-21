import { useTranslation } from 'react-i18next';
import { goToStation08, useP08 } from './store';
import { P08_STATIONS } from '../../practices/practice-08/definition';
import { fmtTime } from './ui';

export function Hud08() {
  const { t } = useTranslation();
  useP08((s) => s.version);
  const rt = useP08((s) => s.runtime);
  const st = useP08((s) => s.workflowStage);
  const settings = useP08((s) => s.settings);
  const setSettings = useP08((s) => s.setSettings);
  const paused = useP08((s) => s.paused);
  const setPaused = useP08((s) => s.setPaused);
  const setModal = useP08((s) => s.setModal);
  const toggleNotebook = useP08((s) => s.toggleNotebook);
  const toggleInventory = useP08((s) => s.toggleInventory);
  const notebookOpen = useP08((s) => s.notebookOpen);
  const inventoryOpen = useP08((s) => s.inventoryOpen);
  const time = rt?.world.timeS ?? 0;
  const samples = rt ? rt.world.readingOrder.filter((id) => rt.world.readings[id]?.valid).length : 0;
  const demo = useP08((s) => !!s.demo);
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('p8.app.short')} · {rt ? rt.world.route : ''}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`p8.stage.${st}`)}</span>}
      {samples > 0 && <span className="stage-pill" title={t('p8.hud.readingsTitle')}>{t('p8.hud.readings', { n: samples })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {P08_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`p8.station.${s.id}`)} aria-label={t(`p8.station.${s.id}`)} onClick={() => goToStation08(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="p8speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="p8speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('p8.hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
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
