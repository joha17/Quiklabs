import { useEffect } from 'react';
import { loadLabPhotos } from '../platform/labPhotos';
import { startB07Loops, useB07 } from './store';
import { IntroScreenB07 } from './IntroScreenB07';
import { LabScreenB07 } from './LabScreenB07';
import { ReviewScreenB07 } from './ReviewScreenB07';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './b07.css';

/** Biología B07: del preparado a la observación — microscopía y estereoscopía experimental. */
export default function B07App({ onBack }: { onBack: () => void }) {
  const screen = useB07((s) => s.screen);
  const uiScale = useB07((s) => s.settings.uiScale);
  useEffect(() => startB07Loops(), []);
  // Fotografías reales del ocular del curso (si el docente o la administración las subieron).
  useEffect(() => loadLabPhotos('b07'), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB07.getState();
    st.save();
    st.setPaused(true);
    useB07.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB07 />;
  if (screen === 'review') return <ReviewScreenB07 onBack={back} />;
  return <IntroScreenB07 onBack={back} />;
}
