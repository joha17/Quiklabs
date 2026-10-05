/**
 * Inicio de sesión. No hay registro: las cuentas las crea la administración (licencia de la universidad) y el acceso
 * dura mientras el estudiante esté matriculado. Los mensajes del servidor se muestran en lenguaje claro.
 */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import '@fontsource-variable/nunito';
import { useShell } from '../shell';
import { usePlatform } from './session';
import { errorText } from './ui';

export function LoginScreen() {
  const { t } = useTranslation();
  const open = useShell((s) => s.open);
  const login = usePlatform((s) => s.login);
  const notice = usePlatform((s) => s.notice);
  const setNotice = usePlatform((s) => s.setNotice);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice ? errorText(notice) : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await login(email, password);
      open('panel');
    } catch (err) {
      setError(errorText(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="pf-auth">
      <div className="pf-auth-card">
        <a className="pf-auth-back" href="#" onClick={(e) => { e.preventDefault(); open(null); }}>{t('pf.login.back')}</a>
        <div className="pf-auth-mark" aria-hidden="true">QUIK<br />LABS</div>
        <h1>{t('pf.login.title')}</h1>
        <p className="pf-auth-lead">{t('pf.login.lead')}</p>
        <form onSubmit={(e) => void submit(e)} className="pf-form" noValidate>
          <label>
            <span>{t('pf.login.email')}</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <div className="pf-field">
            <label htmlFor="pf-password">{t('pf.login.password')}</label>
            <span className="pf-pass">
              <input id="pf-password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn small" onClick={() => setShow(!show)} aria-pressed={show} aria-controls="pf-password">{show ? t('pf.login.hide') : t('pf.login.show')}</button>
            </span>
          </div>
          {error && <div className="pf-notice pf-notice-error" role="alert">{error}</div>}
          <button type="submit" className="btn primary pf-submit" disabled={busy || !email || !password}>{busy ? t('pf.login.busy') : t('pf.login.submit')}</button>
        </form>
        <p className="pf-auth-note">{t('pf.login.noSignup')}</p>
      </div>
    </main>
  );
}

export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const changePassword = usePlatform((s) => s.changePassword);
  const logout = usePlatform((s) => s.logout);
  const open = useShell((s) => s.open);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== repeat) {
      setError(t('pf.change.mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      open('panel');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="pf-auth">
      <div className="pf-auth-card">
        <h1>{t('pf.change.title')}</h1>
        <p className="pf-auth-lead">{t('pf.change.lead')}</p>
        <form onSubmit={(e) => void submit(e)} className="pf-form" noValidate>
          <label><span>{t('pf.change.current')}</span><input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus /></label>
          <label><span>{t('pf.change.next')}</span><input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="pf-rules" /></label>
          <label><span>{t('pf.change.repeat')}</span><input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
          <p id="pf-rules" className="pf-hint">{t('pf.change.rules')}</p>
          {error && <div className="pf-notice pf-notice-error" role="alert">{error}</div>}
          <button type="submit" className="btn primary pf-submit" disabled={busy || !current || !next || !repeat}>{t('pf.change.submit')}</button>
        </form>
        <button type="button" className="btn ghost" onClick={() => void logout().then(() => open('login'))}>{t('pf.logout')}</button>
      </div>
    </main>
  );
}
