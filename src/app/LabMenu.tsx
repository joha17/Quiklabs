import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShell, type LabId } from './shell';
import { tList } from './i18n';
import { loadAttempt } from './persistence';
import { loadP3Attempt } from './p3/persistence';
import './menu.css';

interface LabCard {
  id: LabId;
  number: number;
  key: string;
  saved: { mode: string; minutes: number; submitted: boolean } | null;
}

/** Portada: menú de laboratorios disponibles. El estudiante elige la práctica y entra a su configuración. */
export function LabMenu() {
  const { t } = useTranslation();
  const open = useShell((s) => s.open);
  const cards = useMemo<LabCard[]>(() => {
    const p2 = loadAttempt();
    const p3 = loadP3Attempt();
    return [
      { id: 'p2', number: 2, key: 'menu.labs.p2', saved: p2 ? { mode: p2.settings.mode, minutes: Math.round(p2.world.timeS / 60), submitted: p2.submitted } : null },
      { id: 'p3', number: 3, key: 'menu.labs.p3', saved: p3 ? { mode: p3.settings.mode, minutes: Math.round(p3.world.timeS / 60), submitted: p3.submitted } : null },
    ];
  }, []);
  return (
    <main className="intro lab-menu">
      <div className="intro-card">
        <div>
          <div className="kicker">{t('app.course')}</div>
          <h1>{t('menu.title')}</h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ink-2)' }}>{t('menu.lead')}</p>
        </div>
        <ul className="lab-cards" aria-label={t('menu.listLabel')}>
          {cards.map((c) => (
            <li key={c.id}>
              <article className="lab-card">
                <div className={`lab-card-art art-${c.id}`} aria-hidden="true"><span>{c.number}</span></div>
                <div className="lab-card-body">
                  <div className="kicker">{t('menu.practice', { n: c.number })}</div>
                  <h2>{t(`${c.key}.title`)}</h2>
                  <p>{t(`${c.key}.subtitle`)}</p>
                  <ul>
                    {tList(`${c.key}.points`).map((p) => <li key={p}>{p}</li>)}
                  </ul>
                  <div className="lab-card-meta">
                    <span>⏱ {t(`${c.key}.duration`)}</span>
                    {c.saved && (
                      <span className="saved-pill">
                        {c.saved.submitted ? t('menu.submitted') : t('menu.inProgress', { mode: t(`mode.${c.saved.mode}`), min: c.saved.minutes })}
                      </span>
                    )}
                  </div>
                  <button className="btn primary" onClick={() => open(c.id)} aria-label={t('menu.enterLabel', { title: t(`${c.key}.title`) })}>
                    {t('menu.enter')} →
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ margin: 0 }}>{t('menu.note')}</p>
      </div>
    </main>
  );
}
