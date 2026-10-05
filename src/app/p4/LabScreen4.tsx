import { useTranslation } from 'react-i18next';
import { useP4 } from './store';
import { Hud4 } from './Hud4';
import { LabCanvas4 } from './LabCanvas4';
import { ActionPanel4 } from './ActionPanel4';
import { Inventory4 } from './Inventory4';
import { NotebookPanel4 } from './NotebookPanel4';
import { Dialogs4 } from './Dialogs4';
import { SafetyBanner4, SafetyPanel4 } from './SafetyPanel4';
import { GuidePanel4 } from './GuidePanel4';
import { DebugPanel4 } from './DebugPanel4';
import { Toasts4 } from './ui';
import { DemoPanel4 } from './demo/DemoPanel4';

function ZoomControls4() {
  const { t } = useTranslation();
  const stage = useP4((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** §13.1 — mientras arde el Mg: aviso visible y (sin pantalla delante) un velo oscuro; nunca un destello real. */
function MgVeil() {
  const { t } = useTranslation();
  useP4((s) => s.version);
  const rt = useP4((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const burning = Object.values(w.ribbons).some((r) => r.phase === 'BRIGHT_COMBUSTION');
  if (!burning) return null;
  const direct = w.mgView.inView && !w.mgView.shielded;
  return (
    <div className={`mg-veil${direct ? ' direct' : ''}`} role="status" aria-live="assertive">
      <span>☀ {direct ? t('p4.mgveil.direct') : t('p4.mgveil.shielded')}</span>
    </div>
  );
}

export function LabScreen4() {
  const { t } = useTranslation();
  const notebookOpen = useP4((s) => s.notebookOpen);
  const inventoryOpen = useP4((s) => s.inventoryOpen);
  const mode = useP4((s) => s.settings.mode);
  const paused = useP4((s) => s.paused);
  const demo = useP4((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud4 />
      <div className="lab-main">
        {inventoryOpen ? <Inventory4 /> : <div />}
        <div className={`canvas-wrap p3 p4${demo ? ' demo' : ''}`}>
          <LabCanvas4 />
          <MgVeil />
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanel4 />}
          {!demo && mode === 'GUIDED' && <GuidePanel4 />}
          {!demo && mode === 'DEBUG' && <DebugPanel4 />}
          <SafetyPanel4 />
          <ZoomControls4 />
          <Toasts4 />
          <SafetyBanner4 />
        </div>
        {notebookOpen ? <NotebookPanel4 /> : <div />}
      </div>
      <ActionPanel4 />
      <Dialogs4 />
    </div>
  );
}
