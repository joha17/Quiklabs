import { useEffect } from 'react';
import { loadLabPhotos } from '../platform/labPhotos';
import { startB04Loops, useB04 } from './store';
import { IntroScreenB04 } from './IntroScreenB04';
import { LabScreenB04 } from './LabScreenB04';
import { ReviewScreenB04 } from './ReviewScreenB04';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../b02/b02.css';
import './b04.css';

/** Biología B04: del preparado a la observación — microscopía y estereoscopía experimental. */
export default function B04App({ onBack }: { onBack: () => void }) {
  const screen = useB04((s) => s.screen);
  const uiScale = useB04((s) => s.settings.uiScale);
  useEffect(() => startB04Loops(), []);
  // Fotografías reales del ocular del curso (si el docente o la administración las subieron).
  useEffect(() => loadLabPhotos('b04'), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB04.getState();
    st.save();
    st.setPaused(true);
    useB04.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB04 />;
  if (screen === 'review') return <ReviewScreenB04 onBack={back} />;
  return <IntroScreenB04 onBack={back} />;
}
