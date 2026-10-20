import { useTranslation } from 'react-i18next';
import { useP01 } from './store';
import { Hud01 } from './Hud01';
import { LabCanvas01 } from './LabCanvas01';
import { ActionPanel01 } from './ActionPanel01';
import { Inventory01 } from './Inventory01';
import { NotebookPanel01 } from './NotebookPanel01';
import { Dialogs01 } from './Dialogs01';
import { SafetyBanner01, SafetyPanel01 } from './SafetyPanel01';
import { GuidePanel01 } from './GuidePanel01';
import { DebugPanel01 } from './DebugPanel01';
import { InstrumentsBar01 } from './InstrumentsBar01';
import { Toasts01 } from './ui';
import { DemoPanel01 } from './demo/DemoPanel01';

function ZoomControls01() {
  const { t } = useTranslation();
  const stage = useP01((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useP01.getState().selected;
    cam()?.eyeLevel(sel === 'pipette25' || sel === 'thermometer01' || sel === 'caliper01' ? sel : sel === 'balance01' ? 'balance' : 'cylinder50');
  };
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('p01.cam.eye')} title={`${t('p01.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreen01() {
  const { t } = useTranslation();
  const notebookOpen = useP01((s) => s.notebookOpen);
  const inventoryOpen = useP01((s) => s.inventoryOpen);
  const mode = useP01((s) => s.settings.mode);
  const paused = useP01((s) => s.paused);
  const convention = useP01((s) => s.settings.convention);
  const demo = useP01((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud01 />
      <div className="lab-main">
        {inventoryOpen ? <Inventory01 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01${demo ? ' demo' : ''}`}>
          <LabCanvas01 />
          <InstrumentsBar01 />
          <div className="model-badge" role="note">{t(`p01.conventionBadge.${convention}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanel01 />}
          {!demo && mode === 'GUIDED' && <GuidePanel01 />}
          {!demo && mode === 'DEBUG' && <DebugPanel01 />}
          <SafetyPanel01 />
          <ZoomControls01 />
          <Toasts01 />
          <SafetyBanner01 />
        </div>
        {notebookOpen ? <NotebookPanel01 /> : <div />}
      </div>
      <ActionPanel01 />
      <Dialogs01 />
    </div>
  );
}
