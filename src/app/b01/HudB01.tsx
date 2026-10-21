import { useTranslation } from 'react-i18next';
import { goToStationB01, useB01 } from './store';
import { B01_STATIONS } from '../../practices/practice-b01/definition';
import { fmtTime } from './ui';

export function HudB01() {
  const { t } = useTranslation();
  useB01((s) => s.version);
  const rt = useB01((s) => s.runtime);
  const st = useB01((s) => s.workflowStage);
  const settings = useB01((s) => s.settings);
  const setSettings = useB01((s) => s.setSettings);
  const paused = useB01((s) => s.paused);
  const setPaused = useB01((s) => s.setPaused);
  const setModal = useB01((s) => s.setModal);
  const toggleNotebook = useB01((s) => s.toggleNotebook);
  const toggleInventory = useB01((s) => s.toggleInventory);
  const notebookOpen = useB01((s) => s.notebookOpen);
  const inventoryOpen = useB01((s) => s.inventoryOpen);
  const time = rt?.world.timeS ?? 0;
  const samples = rt ? rt.world.observationOrder.filter((id) => rt.world.observations[id]?.isObservationValid).length : 0;
  const demo = useB01((s) => !!s.demo);
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('b01.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`b01.stage.${st}`)}</span>}
      {samples > 0 && <span className="stage-pill" title={t('b01.hud.readingsTitle')}>{t('b01.hud.readings', { n: samples })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {B01_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`b01.station.${s.id}`)} aria-label={t(`b01.station.${s.id}`)} onClick={() => goToStationB01(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="p9speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="p9speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('b01.hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
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
