import { useEffect } from 'react';
import { startF06Loops, useF06 } from './store';
import { IntroScreenF06 } from './IntroScreenF06';
import { LabScreenF06 } from './LabScreenF06';
import { ReviewScreenF06 } from './ReviewScreenF06';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f06.css';

/** F06: leyes de Newton y sistemas acoplados (cuarta práctica de Física). */
export default function F06App({ onBack }: { onBack: () => void }) {
  const screen = useF06((s) => s.screen);
  const uiScale = useF06((s) => s.settings.uiScale);
  useEffect(() => startF06Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF06.getState();
    st.save();
    st.setPaused(true);
    useF06.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF06 />;
  if (screen === 'review') return <ReviewScreenF06 onBack={back} />;
  return <IntroScreenF06 onBack={back} />;
}
