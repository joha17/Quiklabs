import { useEffect } from 'react';
import { startF11Loops, useF11 } from './store';
import { IntroScreenF11 } from './IntroScreenF11';
import { LabScreenF11 } from './LabScreenF11';
import { ReviewScreenF11 } from './ReviewScreenF11';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f11.css';

/** F11: equilibrio de vigas y elasticidad de materiales (décima práctica de Física). */
export default function F11App({ onBack }: { onBack: () => void }) {
  const screen = useF11((s) => s.screen);
  const uiScale = useF11((s) => s.settings.uiScale);
  useEffect(() => startF11Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF11.getState();
    st.save();
    st.setPaused(true);
    useF11.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF11 />;
  if (screen === 'review') return <ReviewScreenF11 onBack={back} />;
  return <IntroScreenF11 onBack={back} />;
}
