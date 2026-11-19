import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LAB_MODULES } from './labModules';
import { Landing } from './landing/Landing';
import { isLab, isLegal, useShell, type LabId } from './shell';
import { LegalPage } from './landing/LegalPage';
import { labAccess, usePlatform } from './platform/session';
import { ChangePasswordScreen, LoginScreen } from './platform/LoginScreen';
import { StudentPanel } from './platform/StudentPanel';
import { TeacherPanel } from './platform/TeacherPanel';
import { AdminPanel } from './platform/AdminPanel';


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
  const lab = LAB_MODULES[id];
  useEffect(() => {
    if (!mode) return;
    const apply = (store: Awaited<ReturnType<typeof lab.store>>) => store.getState().setSettings({ mode: mode as never });
    const store = lab.store();
    if (store instanceof Promise) void store.then(apply);
    else apply(store);
  }, [lab, mode]);
  const back = () => open('panel');
  const Screen = lab.App;
  return (
    <Suspense fallback={<Loading />}>
      <Screen onBack={back} />
    </Suspense>
  );
}
