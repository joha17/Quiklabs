import { useTranslation } from 'react-i18next';
import { useLab } from '../store';
import { STATIONS } from '../../practices/practice-02/definition';

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

export function Hud() {
  const { t } = useTranslation();
  useLab((s) => s.version);
  const rt = useLab((s) => s.runtime);
  const stage = useLab((s) => s.stage);
  const st = useLab((s) => s.workflowStage);
  const settings = useLab((s) => s.settings);
  const setSettings = useLab((s) => s.setSettings);
  const paused = useLab((s) => s.paused);
  const setPaused = useLab((s) => s.setPaused);
  const levelView = useLab((s) => s.levelView);
  const setLevelView = useLab((s) => s.setLevelView);
  const setModal = useLab((s) => s.setModal);
  const toggleNotebook = useLab((s) => s.toggleNotebook);
  const toggleInventory = useLab((s) => s.toggleInventory);
  const notebookOpen = useLab((s) => s.notebookOpen);
  const inventoryOpen = useLab((s) => s.inventoryOpen);
  const demo = useLab((s) => !!s.demo);
  const handMode = rt?.world.devices.hand.mode ?? 'HAND';
  const time = rt?.world.timeS ?? 0;

  return (
    <header className="hud" role="toolbar" aria-label="HUD">
      <span className="brand">{t('app.title')}</span>
      <span className="clock" aria-label={t('hud.time')} title={t('hud.time')}>⏱ {fmt(time)}</span>
      {demo
        ? <span className="stage-pill demo-pill">▶ {t('demo.ui.kicker')}</span>
        : <span className="stage-pill" aria-live="polite" title={t('hud.stage')}>{t(`stage.${st}`)}</span>}
      <span className="grow" />
      <nav className="group" aria-label={t('hud.stations')}>
        {STATIONS.map((s) => (
          <button key={s.id} className="btn small station-btn" title={t(`station.${s.id}`)} onClick={() => stage?.goToStation(s.id)}>
            {s.id}
          </button>
        ))}
      </nav>
      <div className="group">
        {!demo && <label className="sr-only" htmlFor="speed">{t('hud.speed')}</label>}
        {!demo && (
          <select id="speed" value={settings.timeScale} title={`${t('hud.speed')} — ${t('hud.speedNote')}`} onChange={(e) => setSettings({ timeScale: Number(e.target.value) })}>
            {[1, 2, 5, 10].map((v) => <option key={v} value={v}>×{v}</option>)}
          </select>
        )}
        <button className="btn small" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? `▶ ${t('hud.play')}` : `⏸ ${t('hud.pause')}`}</button>
      </div>
      <div className="group">
        <button className="btn small" aria-pressed={handMode === 'TONGS'} onClick={() => stage?.controller.toggleTongs()} title={t('hud.handMode', { mode: handMode === 'TONGS' ? t('hud.tongs') : t('hud.hand') })}>
          {handMode === 'TONGS' ? '🗜 ' + t('hud.tongs') : '✋ ' + t('hud.hand')}
        </button>
        <button className="btn small" aria-pressed={levelView} onClick={() => setLevelView(!levelView)}>{levelView ? t('hud.levelOff') : t('hud.level')}</button>
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
