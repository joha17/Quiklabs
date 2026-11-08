import { useEffect } from 'react';
import { startF103Loops, useF103 } from './store';
import { IntroScreenF103 } from './IntroScreenF103';
import { LabScreenF103 } from './LabScreenF103';
import { ReviewScreenF103 } from './ReviewScreenF103';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f103.css';

/** F103: metrología experimental y suma vectorial (primera práctica de Física). */
export default function F103App({ onBack }: { onBack: () => void }) {
  const screen = useF103((s) => s.screen);
  const uiScale = useF103((s) => s.settings.uiScale);
  useEffect(() => startF103Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF103.getState();
    st.save();
    st.setPaused(true);
    useF103.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF103 />;
  if (screen === 'review') return <ReviewScreenF103 onBack={back} />;
  return <IntroScreenF103 onBack={back} />;
}
