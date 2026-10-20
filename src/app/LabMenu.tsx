import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShell, type LabId } from './shell';
import { tList } from './i18n';
import { loadAttempt } from './persistence';
import { loadP3Attempt } from './p3/persistence';
import { loadP4Attempt } from './p4/persistence';
import { loadP5Attempt } from './p5/persistence';
import { loadP6Attempt } from './p6/persistence';
import { loadP01Attempt } from './p01/persistence';
import { loadP07Attempt } from './p7/persistence';
import { loadP10Attempt } from './p10/persistence';
import './menu.css';

/** Grupos de etiquetas de cada tarjeta (textos en `menu.labs.<id>.tags.<grupo>`), en este orden. */
const TAG_KINDS = ['type', 'reactions', 'features'] as const;

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
    const p01 = loadP01Attempt();
    const p2 = loadAttempt();
    const p3 = loadP3Attempt();
    const p4 = loadP4Attempt();
    const p5 = loadP5Attempt();
    const p6 = loadP6Attempt();
    const p7 = loadP07Attempt();
    const p10 = loadP10Attempt();
    return [
      { id: 'p01', number: 1, key: 'menu.labs.p01', saved: p01 ? { mode: p01.settings.mode, minutes: Math.round(p01.world.timeS / 60), submitted: p01.submitted } : null },
      { id: 'p2', number: 2, key: 'menu.labs.p2', saved: p2 ? { mode: p2.settings.mode, minutes: Math.round(p2.world.timeS / 60), submitted: p2.submitted } : null },
      { id: 'p3', number: 3, key: 'menu.labs.p3', saved: p3 ? { mode: p3.settings.mode, minutes: Math.round(p3.world.timeS / 60), submitted: p3.submitted } : null },
      { id: 'p4', number: 4, key: 'menu.labs.p4', saved: p4 ? { mode: p4.settings.mode, minutes: Math.round(p4.world.timeS / 60), submitted: p4.submitted } : null },
      { id: 'p5', number: 5, key: 'menu.labs.p5', saved: p5 ? { mode: p5.settings.mode, minutes: Math.round(p5.world.timeS / 60), submitted: p5.submitted } : null },
      { id: 'p6', number: 6, key: 'menu.labs.p6', saved: p6 ? { mode: p6.settings.mode, minutes: Math.round(p6.world.timeS / 60), submitted: p6.submitted } : null },
      { id: 'p7', number: 7, key: 'menu.labs.p7', saved: p7 ? { mode: p7.settings.mode, minutes: Math.round(p7.world.timeS / 60), submitted: p7.submitted } : null },
      { id: 'p10', number: 10, key: 'menu.labs.p10', saved: p10 ? { mode: p10.settings.mode, minutes: Math.round(p10.world.timeS / 60), submitted: p10.submitted } : null },
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
              <ul className="lab-tags" aria-label={t('menu.tagsLabel')}>
                {TAG_KINDS.flatMap((k) =>
                  tList(`${c.key}.tags.${k}`).map((tag) => (
                    <li key={`${k}:${tag}`} className={`lab-tag tag-${k}`} title={t(`menu.tagKind.${k}`)}>
                      <span className="sr-only">{t(`menu.tagKind.${k}`)}: </span>
                      {tag}
                    </li>
                  )),
                )}
              </ul>
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
