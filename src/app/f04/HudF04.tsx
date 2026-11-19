import { useTranslation } from 'react-i18next';
import { goToStationF04, useF04 } from './store';
import { F04_STATIONS } from '../../practices/practice-f04/definition';
import { fmtTime } from './ui';

export function HudF04() {
  const { t } = useTranslation();
  useF04((s) => s.version);
  const rt = useF04((s) => s.runtime);
  const st = useF04((s) => s.workflowStage);
  const settings = useF04((s) => s.settings);
  const setSettings = useF04((s) => s.setSettings);
  const paused = useF04((s) => s.paused);
  const setPaused = useF04((s) => s.setPaused);
  const setModal = useF04((s) => s.setModal);
  const toggleNotebook = useF04((s) => s.toggleNotebook);
  const notebookOpen = useF04((s) => s.notebookOpen);
  const time = rt?.world.timeS ?? 0;
  const readings = rt?.world.readingOrder.length ?? 0;
  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('f04.app.short')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmtTime(time)}</span>
      <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`f04.stage.${st}`)}</span>
      {readings > 0 && <span className="stage-pill" title={t('f04.hud.readingsTitle')}>{t('f04.hud.readings', { n: readings })}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {F04_STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`f04.station.${s.id}`)} aria-label={t(`f04.station.${s.id}`)} onClick={() => goToStationF04(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        <label className="sr-only" htmlFor="f04speed">{t('hud.speed')}</label>
        <select id="f04speed" value={settings.timeScale} title={t('hud.speed')} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
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
