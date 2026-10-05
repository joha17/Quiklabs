import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { startBackgroundLoops, useLab } from './store';
import { IntroScreen } from './practice-config/IntroScreen';
import { LabScreen } from './hud/LabScreen';
import { ReviewScreen } from './review/ReviewScreen';
import { Landing } from './landing/Landing';
import { isLab, useShell, type LabId } from './shell';
import { labAccess, usePlatform } from './platform/session';
import { ChangePasswordScreen, LoginScreen } from './platform/LoginScreen';
import { StudentPanel } from './platform/StudentPanel';
import { TeacherPanel } from './platform/TeacherPanel';
import { AdminPanel } from './platform/AdminPanel';

const P3App = lazy(() => import('./p3/P3App'));
const P4App = lazy(() => import('./p4/P4App'));

const Loading = () => <div className="scene-loading" role="status">…</div>;

/** Cambia de ruta después de pintar (no durante el render). */
function Go({ to }: { to: Parameters<ReturnType<typeof useShell.getState>['open']>[0] }) {
  const open = useShell((s) => s.open);
  useEffect(() => open(to), [open, to]);
  return <Loading />;
}

/**
 * Rutas: la portada es pública; `#login` es el único acceso; `#panel` y los laboratorios exigen sesión. Un estudiante
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
  }, [id, mode]);
  const back = () => open('panel');
  if (id === 'p2') return <P2App onBack={back} />;
  return (
    <Suspense fallback={<Loading />}>
      {id === 'p3' ? <P3App onBack={back} /> : <P4App onBack={back} />}
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
