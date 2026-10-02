import { useLab } from '../store';
import { Hud } from './Hud';
import { LabCanvas } from './LabCanvas';
import { ActionPanel } from './ActionPanel';
import { Inventory } from './Inventory';
import { Toasts } from './Toasts';
import { SafetyBanner } from './SafetyBanner';
import { GuidePanel } from './GuidePanel';
import { NotebookPanel } from '../notebook/NotebookPanel';
import { Dialogs } from '../accessibility/Dialogs';
import { DebugPanel } from './DebugPanel';
import { ZoomControls } from './ZoomControls';
import { useTranslation } from 'react-i18next';

export function LabScreen() {
  const { t } = useTranslation();
  const notebookOpen = useLab((s) => s.notebookOpen);
  const inventoryOpen = useLab((s) => s.inventoryOpen);
  const mode = useLab((s) => s.settings.mode);
  const paused = useLab((s) => s.paused);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud />
      <div className="lab-main">
        {inventoryOpen ? <Inventory /> : <div />}
        <div className="canvas-wrap">
          <LabCanvas />
          {paused && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {mode === 'GUIDED' && <GuidePanel />}
          {mode === 'DEBUG' && <DebugPanel />}
          <ZoomControls />
          <Toasts />
          <SafetyBanner />
        </div>
        {notebookOpen ? <NotebookPanel /> : <div />}
      </div>
      <ActionPanel />
      <Dialogs />
    </div>
  );
}
