import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShell, type LabId } from './shell';
import { tList } from './i18n';
import { loadAttempt } from './persistence';
import { loadP3Attempt } from './p3/persistence';
import { loadP4Attempt } from './p4/persistence';
import { loadP5Attempt } from './p5/persistence';
import { loadP6Attempt } from './p6/persistence';
import './menu.css';

interface LabCard {
  id: LabId;
  number: number;
  key: string;
  saved: { mode: string; minutes: number; submitted: boolean } | null;
}

/**
 * Tarjetas de los laboratorios. En la portada van «bloqueadas» (el botón lleva a iniciar sesión: el acceso es por
 * licencia); en los paneles se muestran solo las prácticas que la cuenta puede abrir, con su botón de entrada.
 */
export function LabCards({ locked = false, only, extra }: { locked?: boolean; only?: LabId[]; extra?: (id: LabId) => ReactNode } = {}) {
  const { t } = useTranslation();
  const open = useShell((s) => s.open);
  const cards = useMemo<LabCard[]>(() => {
    const p2 = loadAttempt();
    const p3 = loadP3Attempt();
    const p4 = loadP4Attempt();
    const p5 = loadP5Attempt();
    const p6 = loadP6Attempt();
    return [
      { id: 'p2', number: 2, key: 'menu.labs.p2', saved: p2 ? { mode: p2.settings.mode, minutes: Math.round(p2.world.timeS / 60), submitted: p2.submitted } : null },
      { id: 'p3', number: 3, key: 'menu.labs.p3', saved: p3 ? { mode: p3.settings.mode, minutes: Math.round(p3.world.timeS / 60), submitted: p3.submitted } : null },
      { id: 'p4', number: 4, key: 'menu.labs.p4', saved: p4 ? { mode: p4.settings.mode, minutes: Math.round(p4.world.timeS / 60), submitted: p4.submitted } : null },
      { id: 'p5', number: 5, key: 'menu.labs.p5', saved: p5 ? { mode: p5.settings.mode, minutes: Math.round(p5.world.timeS / 60), submitted: p5.submitted } : null },
      { id: 'p6', number: 6, key: 'menu.labs.p6', saved: p6 ? { mode: p6.settings.mode, minutes: Math.round(p6.world.timeS / 60), submitted: p6.submitted } : null },
    ];
  }, []);
  return (
    <ul className="lab-cards" aria-label={t('menu.listLabel')}>
      {cards.filter((c) => !only || only.includes(c.id)).map((c) => (
        <li key={c.id}>
          <article className="lab-card">
            <div className={`lab-card-art art-${c.id}`} aria-hidden="true"><span>{c.number}</span></div>
            <div className="lab-card-body">
              <div className="kicker">{t('menu.practice', { n: c.number })}</div>
              <h3>{t(`${c.key}.title`)}</h3>
              <p>{t(`${c.key}.subtitle`)}</p>
              <ul>
                {tList(`${c.key}.points`).map((p) => <li key={p}>{p}</li>)}
              </ul>
              <div className="lab-card-meta">
                <span>⏱ {t(`${c.key}.duration`)}</span>
                {c.saved && !locked && (
                  <span className="saved-pill">
                    {c.saved.submitted ? t('menu.submitted') : t('menu.inProgress', { mode: t(`mode.${c.saved.mode}`), min: c.saved.minutes })}
                  </span>
                )}
              </div>
              {extra?.(c.id)}
              {locked ? (
                <button className="btn primary" onClick={() => open('login')} aria-label={t('landing.labs.loginLabel', { title: t(`${c.key}.title`) })}>
                  {t('landing.labs.login')} →
                </button>
              ) : (
                <button className="btn primary" onClick={() => open(c.id)} aria-label={t('menu.enterLabel', { title: t(`${c.key}.title`) })}>
                  {t('menu.enter')} →
                </button>
              )}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
