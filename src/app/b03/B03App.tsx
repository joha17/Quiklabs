import { useEffect } from 'react';
import { loadLabPhotos } from '../platform/labPhotos';
import { startB03Loops, useB03 } from './store';
import { IntroScreenB03 } from './IntroScreenB03';
import { LabScreenB03 } from './LabScreenB03';
import { ReviewScreenB03 } from './ReviewScreenB03';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../b02/b02.css';
import './b03.css';

/** Biología B03: del preparado a la observación — microscopía y estereoscopía experimental. */
export default function B03App({ onBack }: { onBack: () => void }) {
  const screen = useB03((s) => s.screen);
  const uiScale = useB03((s) => s.settings.uiScale);
  useEffect(() => startB03Loops(), []);
  // Fotografías reales del ocular del curso (si el docente o la administración las subieron).
  useEffect(() => loadLabPhotos('b03'), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB03.getState();
    st.save();
    st.setPaused(true);
    useB03.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB03 />;
  if (screen === 'review') return <ReviewScreenB03 onBack={back} />;
  return <IntroScreenB03 onBack={back} />;
}
