import { useTranslation } from 'react-i18next';
import { goToStationB07, useB07 } from './store';
import { B07_STATIONS } from '../../practices/practice-b07/definition';
import { fmtTime } from './ui';

export function HudB07() {
  const { t } = useTranslation();
  useB07((s) => s.version);
  const rt = useB07((s) => s.runtime);
  const st = useB07((s) => s.workflowStage);
  const settings = useB07((s) => s.settings);
  const setSettings = useB07((s) => s.setSettings);
  const paused = useB07((s) => s.paused);
  const setPaused = useB07((s) => s.setPaused);
  const setModal = useB07((s) => s.setModal);
  const toggleNotebook = useB07((s) => s.toggleNotebook);
  const toggleInventory = useB07((s) => s.toggleInventory);
  const notebookOpen = useB07((s) => s.notebookOpen);
  const inventoryOpen = useB07((s) => s.inventoryOpen);
  const time = rt?.world.timeS ?? 0;
  const samples = rt ? rt.world.observationOrder.filter((id) => rt.world.observations[id]?.isObservationValid).length : 0;
  const demo = useB07((s) => !!s.demo);
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('b07.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`b07.stage.${st}`)}</span>}
      {samples > 0 && <span className="stage-pill" title={t('b07.hud.readingsTitle')}>{t('b07.hud.readings', { n: samples })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {B07_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`b07.station.${s.id}`)} aria-label={t(`b07.station.${s.id}`)} onClick={() => goToStationB07(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="p9speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="p9speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('b07.hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
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
