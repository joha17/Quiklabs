import { useTranslation } from 'react-i18next';
import { goToStationF103, useF103 } from './store';
import { F103_STATIONS } from '../../practices/practice-f103/definition';
import { fmtTime } from './ui';

export function HudF103() {
  const { t } = useTranslation();
  useF103((s) => s.version);
  const rt = useF103((s) => s.runtime);
  const st = useF103((s) => s.workflowStage);
  const settings = useF103((s) => s.settings);
  const setSettings = useF103((s) => s.setSettings);
  const paused = useF103((s) => s.paused);
  const setPaused = useF103((s) => s.setPaused);
  const setModal = useF103((s) => s.setModal);
  const toggleNotebook = useF103((s) => s.toggleNotebook);
  const notebookOpen = useF103((s) => s.notebookOpen);
  const time = rt?.world.timeS ?? 0;
  const readings = rt?.world.readingOrder.length ?? 0;
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('f103.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`f103.stage.${st}`)}</span>
      {readings > 0 && <span className="stage-pill" title={t('f103.hud.readingsTitle')}>{t('f103.hud.readings', { n: readings })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {F103_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`f103.station.${s.id}`)} aria-label={t(`f103.station.${s.id}`)} onClick={() => goToStationF103(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        <label className="sr-only" htmlFor="f103speed">{t('hud.speed')}</label>
        <select id="f103speed" value={settings.timeScale} title={t('hud.speed')} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
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
