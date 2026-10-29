import { useEffect } from 'react';
import { loadLabPhotos } from '../platform/labPhotos';
import { startB06Loops, useB06 } from './store';
import { IntroScreenB06 } from './IntroScreenB06';
import { LabScreenB06 } from './LabScreenB06';
import { ReviewScreenB06 } from './ReviewScreenB06';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './b06.css';

/** Biología B06: del preparado a la observación — microscopía y estereoscopía experimental. */
export default function B06App({ onBack }: { onBack: () => void }) {
  const screen = useB06((s) => s.screen);
  const uiScale = useB06((s) => s.settings.uiScale);
  useEffect(() => startB06Loops(), []);
  // Fotografías reales del ocular del curso (si el docente o la administración las subieron).
  useEffect(() => loadLabPhotos('b06'), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB06.getState();
    st.save();
    st.setPaused(true);
    useB06.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB06 />;
  if (screen === 'review') return <ReviewScreenB06 onBack={back} />;
  return <IntroScreenB06 onBack={back} />;
}
