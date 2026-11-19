import { useEffect } from 'react';
import { startF09Loops, useF09 } from './store';
import { IntroScreenF09 } from './IntroScreenF09';
import { LabScreenF09 } from './LabScreenF09';
import { ReviewScreenF09 } from './ReviewScreenF09';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f09.css';

/** F09: leyes de Newton y sistemas acoplados (cuarta práctica de Física). */
export default function F09App({ onBack }: { onBack: () => void }) {
  const screen = useF09((s) => s.screen);
  const uiScale = useF09((s) => s.settings.uiScale);
  useEffect(() => startF09Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF09.getState();
    st.save();
    st.setPaused(true);
    useF09.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF09 />;
  if (screen === 'review') return <ReviewScreenF09 onBack={back} />;
  return <IntroScreenF09 onBack={back} />;
}
