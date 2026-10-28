import { useEffect } from 'react';
import { loadLabPhotos } from '../platform/labPhotos';
import { startB02Loops, useB02 } from './store';
import { IntroScreenB02 } from './IntroScreenB02';
import { LabScreenB02 } from './LabScreenB02';
import { ReviewScreenB02 } from './ReviewScreenB02';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './b02.css';

/** Biología B02: del preparado a la observación — microscopía y estereoscopía experimental. */
export default function B02App({ onBack }: { onBack: () => void }) {
  const screen = useB02((s) => s.screen);
  const uiScale = useB02((s) => s.settings.uiScale);
  useEffect(() => startB02Loops(), []);
  // Fotografías reales del ocular del curso (si el docente o la administración las subieron).
  useEffect(() => loadLabPhotos('b02'), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB02.getState();
    st.save();
    st.setPaused(true);
    useB02.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB02 />;
  if (screen === 'review') return <ReviewScreenB02 onBack={back} />;
  return <IntroScreenB02 onBack={back} />;
}
