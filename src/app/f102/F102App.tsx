import { useEffect } from 'react';
import { startF102Loops, useF102 } from './store';
import { IntroScreenF102 } from './IntroScreenF102';
import { LabScreenF102 } from './LabScreenF102';
import { ReviewScreenF102 } from './ReviewScreenF102';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f102.css';

/** F102: metrología experimental y suma vectorial (primera práctica de Física). */
export default function F102App({ onBack }: { onBack: () => void }) {
  const screen = useF102((s) => s.screen);
  const uiScale = useF102((s) => s.settings.uiScale);
  useEffect(() => startF102Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF102.getState();
    st.save();
    st.setPaused(true);
    useF102.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF102 />;
  if (screen === 'review') return <ReviewScreenF102 onBack={back} />;
  return <IntroScreenF102 onBack={back} />;
}
