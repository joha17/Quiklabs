import { useEffect } from 'react';
import { startF10Loops, useF10 } from './store';
import { IntroScreenF10 } from './IntroScreenF10';
import { LabScreenF10 } from './LabScreenF10';
import { ReviewScreenF10 } from './ReviewScreenF10';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f10.css';

/** F10: equilibrio de vigas y elasticidad de materiales (décima práctica de Física). */
export default function F10App({ onBack }: { onBack: () => void }) {
  const screen = useF10((s) => s.screen);
  const uiScale = useF10((s) => s.settings.uiScale);
  useEffect(() => startF10Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF10.getState();
    st.save();
    st.setPaused(true);
    useF10.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF10 />;
  if (screen === 'review') return <ReviewScreenF10 onBack={back} />;
  return <IntroScreenF10 onBack={back} />;
}
