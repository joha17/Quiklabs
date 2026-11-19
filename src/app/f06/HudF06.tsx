import { useTranslation } from 'react-i18next';
import { goToStationF06, useF06 } from './store';
import { F06_STATIONS } from '../../practices/practice-f06/definition';
import { fmtTime } from './ui';

export function HudF06() {
  const { t } = useTranslation();
  useF06((s) => s.version);
  const rt = useF06((s) => s.runtime);
  const st = useF06((s) => s.workflowStage);
  const settings = useF06((s) => s.settings);
  const setSettings = useF06((s) => s.setSettings);
  const paused = useF06((s) => s.paused);
  const setPaused = useF06((s) => s.setPaused);
  const setModal = useF06((s) => s.setModal);
  const toggleNotebook = useF06((s) => s.toggleNotebook);
  const notebookOpen = useF06((s) => s.notebookOpen);
  const time = rt?.world.timeS ?? 0;
  const readings = rt?.world.readingOrder.length ?? 0;
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('f06.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`f06.stage.${st}`)}</span>
      {readings > 0 && <span className="stage-pill" title={t('f06.hud.readingsTitle')}>{t('f06.hud.readings', { n: readings })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {F06_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`f06.station.${s.id}`)} aria-label={t(`f06.station.${s.id}`)} onClick={() => goToStationF06(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        <label className="sr-only" htmlFor="f06speed">{t('hud.speed')}</label>
        <select id="f06speed" value={settings.timeScale} title={t('hud.speed')} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
          {[1, 2, 3, 5].map((v) => <option key={v} value={v}>×{v}</option>)}
        </select>
        <button className="btn small" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? `▶ ${t('hud.play')}` : `⏸ ${t('hud.pause')}`}</button>
      </div>
      <div className="group">
        <button className="btn small" aria-pressed={notebookOpen} onClick={toggleNotebook}>📓 {t('hud.notebook')}</button>
        <button className="btn small" onClick={() => setModal({ kind: 'settings' })}>⚙ {t('hud.settings')}</button>
        <button className="btn small" onClick={() => setModal({ kind: 'help' })}>? {t('hud.help')}</button>
        <button className="btn small primary" onClick={() => setModal({ kind: 'submit' })}>{t('hud.submit')}</button>
      </div>
    </header>
  );
}
