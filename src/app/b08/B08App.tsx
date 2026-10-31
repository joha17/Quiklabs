import { useEffect } from 'react';
import { loadLabPhotos } from '../platform/labPhotos';
import { startB08Loops, useB08 } from './store';
import { IntroScreenB08 } from './IntroScreenB08';
import { LabScreenB08 } from './LabScreenB08';
import { ReviewScreenB08 } from './ReviewScreenB08';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './b08.css';

/** Biología B08: del preparado a la observación — microscopía y estereoscopía experimental. */
export default function B08App({ onBack }: { onBack: () => void }) {
  const screen = useB08((s) => s.screen);
  const uiScale = useB08((s) => s.settings.uiScale);
  useEffect(() => startB08Loops(), []);
  // Fotografías reales del ocular del curso (si el docente o la administración las subieron).
  useEffect(() => loadLabPhotos('b08'), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB08.getState();
    st.save();
    st.setPaused(true);
    useB08.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB08 />;
  if (screen === 'review') return <ReviewScreenB08 onBack={back} />;
  return <IntroScreenB08 onBack={back} />;
}
