import { useEffect } from 'react';
import { loadLabPhotos } from '../platform/labPhotos';
import { startB05Loops, useB05 } from './store';
import { IntroScreenB05 } from './IntroScreenB05';
import { LabScreenB05 } from './LabScreenB05';
import { ReviewScreenB05 } from './ReviewScreenB05';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../b02/b02.css';
import './b05.css';

/** Biología B05: cinética en acción — catalasa, amilasa y regulación enzimática (con el microscopio de B01/B02). */
export default function B05App({ onBack }: { onBack: () => void }) {
  const screen = useB05((s) => s.screen);
  const uiScale = useB05((s) => s.settings.uiScale);
  useEffect(() => startB05Loops(), []);
  // Fotografías reales del ocular del curso (si el docente o la administración las subieron).
  useEffect(() => loadLabPhotos('b05'), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB05.getState();
    st.save();
    st.setPaused(true);
    useB05.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB05 />;
  if (screen === 'review') return <ReviewScreenB05 onBack={back} />;
  return <IntroScreenB05 onBack={back} />;
}
