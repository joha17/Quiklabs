import { useTranslation } from 'react-i18next';
import { goToStationB04, useB04 } from './store';
import { B04_STATIONS } from '../../practices/practice-b04/definition';
import { fmtTime } from './ui';

export function HudB04() {
  const { t } = useTranslation();
  useB04((s) => s.version);
  const rt = useB04((s) => s.runtime);
  const st = useB04((s) => s.workflowStage);
  const settings = useB04((s) => s.settings);
  const setSettings = useB04((s) => s.setSettings);
  const paused = useB04((s) => s.paused);
  const setPaused = useB04((s) => s.setPaused);
  const setModal = useB04((s) => s.setModal);
  const toggleNotebook = useB04((s) => s.toggleNotebook);
  const toggleInventory = useB04((s) => s.toggleInventory);
  const notebookOpen = useB04((s) => s.notebookOpen);
  const inventoryOpen = useB04((s) => s.inventoryOpen);
  const time = rt?.world.timeS ?? 0;
  // Lecturas propias registradas (instrumentos) más capturas válidas del ocular.
  const samples = rt ? rt.world.bio.readingOrder.length + rt.world.observationOrder.filter((id) => rt.world.observations[id]?.isObservationValid).length : 0;
  const demo = useB04((s) => !!s.demo);
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('b04.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`b04.stage.${st}`)}</span>}
      {samples > 0 && <span className="stage-pill" title={t('b04.hud.readingsTitle')}>{t('b04.hud.readings', { n: samples })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {B04_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`b04.station.${s.id}`)} aria-label={t(`b04.station.${s.id}`)} onClick={() => goToStationB04(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="p9speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="p9speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('b04.hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
            {[1, 2, 5, 10, 30].map((v) => <option key={v} value={v}>×{v}</option>)}
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
