import { useEffect } from 'react';
import { loadLabPhotos } from '../platform/labPhotos';
import { startB09Loops, useB09 } from './store';
import { IntroScreenB09 } from './IntroScreenB09';
import { LabScreenB09 } from './LabScreenB09';
import { ReviewScreenB09 } from './ReviewScreenB09';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './b09.css';

/** Biología B09: del preparado a la observación — microscopía y estereoscopía experimental. */
export default function B09App({ onBack }: { onBack: () => void }) {
  const screen = useB09((s) => s.screen);
  const uiScale = useB09((s) => s.settings.uiScale);
  useEffect(() => startB09Loops(), []);
  // Fotografías reales del ocular del curso (si el docente o la administración las subieron).
  useEffect(() => loadLabPhotos('b09'), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB09.getState();
    st.save();
    st.setPaused(true);
    useB09.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB09 />;
  if (screen === 'review') return <ReviewScreenB09 onBack={back} />;
  return <IntroScreenB09 onBack={back} />;
}
