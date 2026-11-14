import { useEffect } from 'react';
import { startF08Loops, useF08 } from './store';
import { IntroScreenF08 } from './IntroScreenF08';
import { LabScreenF08 } from './LabScreenF08';
import { ReviewScreenF08 } from './ReviewScreenF08';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f08.css';

/** F08: leyes de Newton y sistemas acoplados (cuarta práctica de Física). */
export default function F08App({ onBack }: { onBack: () => void }) {
  const screen = useF08((s) => s.screen);
  const uiScale = useF08((s) => s.settings.uiScale);
  useEffect(() => startF08Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF08.getState();
    st.save();
    st.setPaused(true);
    useF08.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF08 />;
  if (screen === 'review') return <ReviewScreenF08 onBack={back} />;
  return <IntroScreenF08 onBack={back} />;
}
