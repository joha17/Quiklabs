import { useEffect } from 'react';
import { startF12Loops, useF12 } from './store';
import { IntroScreenF12 } from './IntroScreenF12';
import { LabScreenF12 } from './LabScreenF12';
import { ReviewScreenF12 } from './ReviewScreenF12';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f12.css';

/** F12: presión en flujo y continuidad de fluidos (duodécima práctica de Física). */
export default function F12App({ onBack }: { onBack: () => void }) {
  const screen = useF12((s) => s.screen);
  const uiScale = useF12((s) => s.settings.uiScale);
  useEffect(() => startF12Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF12.getState();
    st.save();
    st.setPaused(true);
    useF12.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF12 />;
  if (screen === 'review') return <ReviewScreenF12 onBack={back} />;
  return <IntroScreenF12 onBack={back} />;
}
