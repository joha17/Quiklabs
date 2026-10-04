import { useTranslation } from 'react-i18next';
import { useP3 } from './store';
import { P3_STATIONS } from '../../practices/practice-03/definition';
import { fmtTime } from './ui';

export function Hud3() {
  const { t } = useTranslation();
  useP3((s) => s.version);
  const rt = useP3((s) => s.runtime);
  const stage = useP3((s) => s.stage);
  const st = useP3((s) => s.workflowStage);
  const settings = useP3((s) => s.settings);
  const setSettings = useP3((s) => s.setSettings);
  const paused = useP3((s) => s.paused);
  const setPaused = useP3((s) => s.setPaused);
  const setModal = useP3((s) => s.setModal);
  const toggleNotebook = useP3((s) => s.toggleNotebook);
  const toggleInventory = useP3((s) => s.toggleInventory);
  const togglePartsPanel = useP3((s) => s.togglePartsPanel);
  const notebookOpen = useP3((s) => s.notebookOpen);
  const inventoryOpen = useP3((s) => s.inventoryOpen);
  const partsOpen = useP3((s) => s.partsOpen);
  const time = rt?.world.timeS ?? 0;
  const demo = useP3((s) => !!s.demo);

  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('p3.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`p3.stage.${st}`)}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {P3_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`p3.station.${s.id}`)} aria-label={t(`p3.station.${s.id}`)} onClick={() => stage?.goToStation(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="p3speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="p3speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('p3.hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
            {[1, 2, 5, 10].map((v) => <option key={v} value={v}>×{v}</option>)}
          </select>
        )}
        <button className="btn small" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? `▶ ${t('hud.play')}` : `⏸ ${t('hud.pause')}`}</button>
      </div>
      <div className="group">
        <button className="btn small" aria-pressed={partsOpen} onClick={togglePartsPanel}>🔎 {t('p3.hud.parts')}</button>
        <button className="btn small" aria-pressed={inventoryOpen} onClick={toggleInventory}>{t('hud.inventory')}</button>
        <button className="btn small" aria-pressed={notebookOpen} onClick={toggleNotebook}>📓 {t('hud.notebook')}</button>
        <button className="btn small" onClick={() => setModal({ kind: 'settings' })}>⚙ {t('hud.settings')}</button>
        <button className="btn small" onClick={() => setModal({ kind: 'help' })}>? {t('hud.help')}</button>
        {!demo && <button className="btn small primary" onClick={() => setModal({ kind: 'submit' })}>{t('hud.submit')}</button>}
      </div>
    </header>
  );
}
