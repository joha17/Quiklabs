import { useEffect } from 'react';
import { startB01Loops, useB01 } from './store';
import { IntroScreenB01 } from './IntroScreenB01';
import { LabScreenB01 } from './LabScreenB01';
import { ReviewScreenB01 } from './ReviewScreenB01';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './b01.css';

/** Biología B01: del preparado a la observación — microscopía y estereoscopía experimental. */
export default function B01App({ onBack }: { onBack: () => void }) {
  const screen = useB01((s) => s.screen);
  const uiScale = useB01((s) => s.settings.uiScale);
  useEffect(() => startB01Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useB01.getState();
    st.save();
    st.setPaused(true);
    useB01.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenB01 />;
  if (screen === 'review') return <ReviewScreenB01 onBack={back} />;
  return <IntroScreenB01 onBack={back} />;
}
