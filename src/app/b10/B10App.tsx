import { useEffect } from 'react';
import { loadLabPhotos } from '../platform/labPhotos';
import { startB10Loops, useB10 } from './store';
import { IntroScreenB10 } from './IntroScreenB10';
import { LabScreenB10 } from './LabScreenB10';
import { ReviewScreenB10 } from './ReviewScreenB10';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './b10.css';

/** Biología B10: del preparado a la observación — microscopía y estereoscopía experimental. */
export default function B10App({ onBack }: { onBack: () => void }) {
  const screen = useB10((s) => s.screen);
  const uiScale = useB10((s) => s.settings.uiScale);
  useEffect(() => startB10Loops(), []);
  // Fotografías reales del ocular del curso (si el docente o la administración las subieron).
  useEffect(() => loadLabPhotos('b10'), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB10.getState();
    st.save();
    st.setPaused(true);
    useB10.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB10 />;
  if (screen === 'review') return <ReviewScreenB10 onBack={back} />;
  return <IntroScreenB10 onBack={back} />;
}
