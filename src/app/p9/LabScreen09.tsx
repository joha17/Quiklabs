import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import { Hud09 } from './Hud09';
import { LabCanvas09 } from './LabCanvas09';
import { ActionPanel09 } from './ActionPanel09';
import { Inventory09 } from './Inventory09';
import { NotebookPanel09 } from './NotebookPanel09';
import { Dialogs09 } from './Dialogs09';
import { SafetyBanner09, SafetyPanel09 } from './SafetyPanel09';
import { GuidePanel09 } from './GuidePanel09';
import { DebugPanel09 } from './DebugPanel09';
import { InstrumentsBar09 } from './InstrumentsBar09';
import { Toasts09 } from './ui';
import { DemoPanel09 } from './demo/DemoPanel09';
import { SpectrumPanel09 } from './SpectrumPanel09';

function ZoomControls09() {
  const { t } = useTranslation();
  const stage = useP09((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useP09.getState().selected;
    cam()?.eyeLevel(sel ?? 'T1');
  };
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('p9.cam.eye')} title={`${t('p9.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreen09() {
  const { t } = useTranslation();
  const notebookOpen = useP09((s) => s.notebookOpen);
  const inventoryOpen = useP09((s) => s.inventoryOpen);
  const mode = useP09((s) => s.settings.mode);
  const paused = useP09((s) => s.paused);
  const demo = useP09((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud09 />
      <div className="lab-main">
        {inventoryOpen ? <Inventory09 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 p9${demo ? ' demo' : ''}`}>
          <LabCanvas09 />
          <InstrumentsBar09 />
          <div className="model-badge" role="note">{t('p9.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanel09 />}
          {!demo && mode === 'GUIDED' && <GuidePanel09 />}
          {!demo && mode === 'DEBUG' && <DebugPanel09 />}
          <SafetyPanel09 />
          <SpectrumPanel09 />
          <ZoomControls09 />
          <Toasts09 />
          <SafetyBanner09 />
        </div>
        {notebookOpen ? <NotebookPanel09 /> : <div />}
      </div>
      <ActionPanel09 />
      <Dialogs09 />
    </div>
  );
}
