import { useTranslation } from 'react-i18next';
import { goToStation01, useP01 } from './store';
import { P01_STATIONS } from '../../practices/practice-01/definition';
import { fmtTime } from './ui';

export function Hud01() {
  const { t } = useTranslation();
  useP01((s) => s.version);
  const rt = useP01((s) => s.runtime);
  const st = useP01((s) => s.workflowStage);
  const settings = useP01((s) => s.settings);
  const setSettings = useP01((s) => s.setSettings);
  const paused = useP01((s) => s.paused);
  const setPaused = useP01((s) => s.setPaused);
  const setModal = useP01((s) => s.setModal);
  const toggleNotebook = useP01((s) => s.toggleNotebook);
  const toggleInventory = useP01((s) => s.toggleInventory);
  const notebookOpen = useP01((s) => s.notebookOpen);
  const inventoryOpen = useP01((s) => s.inventoryOpen);
  const time = rt?.world.timeS ?? 0;
  const samples = rt?.world.samples.filter((x) => x.endedS !== null).length ?? 0;
  const demo = useP01((s) => !!s.demo);
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('p01.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`p01.stage.${st}`)}</span>}
      {samples > 0 && <span className="stage-pill" title={t('p01.hud.samplesTitle')}>{t('p01.hud.samples', { n: samples })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {P01_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`p01.station.${s.id}`)} aria-label={t(`p01.station.${s.id}`)} onClick={() => goToStation01(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="p01speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="p01speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('p01.hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
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
