import { useEffect } from 'react';
import { startP09Loops, useP09 } from './store';
import { IntroScreen09 } from './IntroScreen09';
import { LabScreen09 } from './LabScreen09';
import { ReviewScreen09 } from './ReviewScreen09';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './p9.css';

/** Práctica 9: huellas de los iones — separación de Sr²⁺, Fe³⁺ y K⁺ y espectros de emisión a la llama (virtual). */
export default function P09App({ onBack }: { onBack: () => void }) {
  const screen = useP09((s) => s.screen);
  const uiScale = useP09((s) => s.settings.uiScale);
  useEffect(() => startP09Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useP09.getState();
    st.save();
    st.setPaused(true);
    useP09.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreen09 />;
  if (screen === 'review') return <ReviewScreen09 onBack={back} />;
  return <IntroScreen09 onBack={back} />;
}
