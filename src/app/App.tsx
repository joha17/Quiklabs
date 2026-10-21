import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { startBackgroundLoops, useLab } from './store';
import { IntroScreen } from './practice-config/IntroScreen';
import { LabScreen } from './hud/LabScreen';
import { ReviewScreen } from './review/ReviewScreen';
import { Landing } from './landing/Landing';
import { isLab, isLegal, useShell, type LabId } from './shell';
import { LegalPage } from './landing/LegalPage';
import { labAccess, usePlatform } from './platform/session';
import { ChangePasswordScreen, LoginScreen } from './platform/LoginScreen';
import { StudentPanel } from './platform/StudentPanel';
import { TeacherPanel } from './platform/TeacherPanel';
import { AdminPanel } from './platform/AdminPanel';

const P3App = lazy(() => import('./p3/P3App'));
const P4App = lazy(() => import('./p4/P4App'));
const P5App = lazy(() => import('./p5/P5App'));
const P6App = lazy(() => import('./p6/P6App'));
const P01App = lazy(() => import('./p01/P01App'));
const P07App = lazy(() => import('./p7/P07App'));
const P08App = lazy(() => import('./p8/P08App'));
const P09App = lazy(() => import('./p9/P09App'));
const P10App = lazy(() => import('./p10/P10App'));
const B01App = lazy(() => import('./b01/B01App'));

const Loading = () => <div className="scene-loading" role="status">…</div>;

/** Cambia de ruta después de pintar (no durante el render). */
function Go({ to }: { to: Parameters<ReturnType<typeof useShell.getState>['open']>[0] }) {
  const open = useShell((s) => s.open);
  useEffect(() => open(to), [open, to]);
  return <Loading />;
}

/**
 * Rutas: la portada y las páginas legales son públicas; `#login` es el único acceso; `#panel` y los laboratorios exigen sesión. Un estudiante
 * solo abre las prácticas que su curso tiene abiertas, en el modo que fijó su docente.
 */
export function App() {
  const route = useShell((s) => s.lab);
  const status = usePlatform((s) => s.status);
  const me = usePlatform((s) => s.me);
  const refresh = usePlatform((s) => s.refresh);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  if (route === null) return <Landing />;
  if (isLegal(route)) return <LegalPage doc={route} />;
  if (status === 'unknown') return <Loading />;
  if (route === 'login') return me ? <Go to="panel" /> : <LoginScreen />;
  if (!me) return <Go to="login" />;
  if (me.user.mustChangePassword) return <ChangePasswordScreen />;
  if (route === 'panel') {
    if (me.user.role === 'admin') return <AdminPanel />;
    if (me.user.role === 'teacher') return <TeacherPanel />;
    return <StudentPanel />;
  }
  if (isLab(route)) {
    const access = labAccess(me, route);
    if (!access) return <LabBlocked />;
    return <LabHost id={route} mode={access.mode} />;
  }
  return <Landing />;
}

function LabBlocked() {
  const { t } = useTranslation();
  const open = useShell((s) => s.open);
  return (
    <main className="pf-auth">
      <div className="pf-auth-card">
        <h1>{t('pf.labs.title')}</h1>
        <p className="pf-auth-lead">{t('pf.labs.blocked')}</p>
        <button type="button" className="btn primary" onClick={() => open('panel')}>{t('pf.backToPanel')}</button>
      </div>
    </main>
  );
}

/** Laboratorio dentro de la plataforma: «volver» lleva al panel; el modo del curso se aplica al entrar. */
function LabHost({ id, mode }: { id: LabId; mode: string | null }) {
  const open = useShell((s) => s.open);
  useEffect(() => {
    if (!mode) return;
    if (id === 'p2') useLab.getState().setSettings({ mode: mode as never });
    if (id === 'p3') void import('./p3/store').then((m) => m.useP3.getState().setSettings({ mode: mode as never }));
    if (id === 'p4') void import('./p4/store').then((m) => m.useP4.getState().setSettings({ mode: mode as never }));
    if (id === 'p5') void import('./p5/store').then((m) => m.useP5.getState().setSettings({ mode: mode as never }));
    if (id === 'p6') void import('./p6/store').then((m) => m.useP6.getState().setSettings({ mode: mode as never }));
    if (id === 'p01') void import('./p01/store').then((m) => m.useP01.getState().setSettings({ mode: mode as never }));
    if (id === 'p7') void import('./p7/store').then((m) => m.useP07.getState().setSettings({ mode: mode as never }));
    if (id === 'p8') void import('./p8/store').then((m) => m.useP08.getState().setSettings({ mode: mode as never }));
    if (id === 'p9') void import('./p9/store').then((m) => m.useP09.getState().setSettings({ mode: mode as never }));
    if (id === 'p10') void import('./p10/store').then((m) => m.useP10.getState().setSettings({ mode: mode as never }));
    if (id === 'b01') void import('./b01/store').then((m) => m.useB01.getState().setSettings({ mode: mode as never }));
  }, [id, mode]);
  const back = () => open('panel');
  if (id === 'p2') return <P2App onBack={back} />;
  return (
    <Suspense fallback={<Loading />}>
      {id === 'p01' ? <P01App onBack={back} /> : id === 'p3' ? <P3App onBack={back} /> : id === 'p4' ? <P4App onBack={back} /> : id === 'p5' ? <P5App onBack={back} /> : id === 'p6' ? <P6App onBack={back} /> : id === 'p7' ? <P07App onBack={back} /> : id === 'p8' ? <P08App onBack={back} /> : id === 'p9' ? <P09App onBack={back} /> : id === 'b01' ? <B01App onBack={back} /> : <P10App onBack={back} />}
    </Suspense>
  );
}


/** Práctica 2: clasificación de la materia y técnicas de separación. */
function P2App({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const screen = useLab((s) => s.screen);
  const uiScale = useLab((s) => s.settings.uiScale);
  useEffect(() => startBackgroundLoops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  if (screen === 'lab') return <LabScreen />;
  if (screen === 'review') return <ReviewScreen />;
  return (
    <>
      <button className="btn small menu-back" onClick={onBack}>← {t('menu.back')}</button>
      <IntroScreen />
    </>
  );
}
