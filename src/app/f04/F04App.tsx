import { useEffect } from 'react';
import { startF04Loops, useF04 } from './store';
import { IntroScreenF04 } from './IntroScreenF04';
import { LabScreenF04 } from './LabScreenF04';
import { ReviewScreenF04 } from './ReviewScreenF04';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f04.css';

/** F04: metrología experimental y suma vectorial (primera práctica de Física). */
export default function F04App({ onBack }: { onBack: () => void }) {
  const screen = useF04((s) => s.screen);
  const uiScale = useF04((s) => s.settings.uiScale);
  useEffect(() => startF04Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF04.getState();
    st.save();
    st.setPaused(true);
    useF04.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF04 />;
  if (screen === 'review') return <ReviewScreenF04 onBack={back} />;
  return <IntroScreenF04 onBack={back} />;
}
