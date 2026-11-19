import { useEffect } from 'react';
import { startF07Loops, useF07 } from './store';
import { IntroScreenF07 } from './IntroScreenF07';
import { LabScreenF07 } from './LabScreenF07';
import { ReviewScreenF07 } from './ReviewScreenF07';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f07.css';

/** F07: leyes de Newton y sistemas acoplados (cuarta práctica de Física). */
export default function F07App({ onBack }: { onBack: () => void }) {
  const screen = useF07((s) => s.screen);
  const uiScale = useF07((s) => s.settings.uiScale);
  useEffect(() => startF07Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF07.getState();
    st.save();
    st.setPaused(true);
    useF07.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF07 />;
  if (screen === 'review') return <ReviewScreenF07 onBack={back} />;
  return <IntroScreenF07 onBack={back} />;
}
