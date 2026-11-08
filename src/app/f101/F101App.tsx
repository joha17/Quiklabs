import { useEffect } from 'react';
import { startF101Loops, useF101 } from './store';
import { IntroScreenF101 } from './IntroScreenF101';
import { LabScreenF101 } from './LabScreenF101';
import { ReviewScreenF101 } from './ReviewScreenF101';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f101.css';

/** F101: metrología experimental y suma vectorial (primera práctica de Física). */
export default function F101App({ onBack }: { onBack: () => void }) {
  const screen = useF101((s) => s.screen);
  const uiScale = useF101((s) => s.settings.uiScale);
  useEffect(() => startF101Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF101.getState();
    st.save();
    st.setPaused(true);
    useF101.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF101 />;
  if (screen === 'review') return <ReviewScreenF101 onBack={back} />;
  return <IntroScreenF101 onBack={back} />;
}
