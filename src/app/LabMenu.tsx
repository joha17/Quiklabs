import { useMemo, useState, type ReactNode } from 'react';
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
import { loadP08Attempt } from './p8/persistence';
import { loadP09Attempt } from './p9/persistence';
import { loadP10Attempt } from './p10/persistence';
import { loadB01Attempt } from './b01/persistence';
import { loadB02Attempt } from './b02/persistence';
import { SUBJECTS, subjectOf, type Subject } from './labCatalog';
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
 * Cada tarjeta lleva la insignia de su área (Química, Biología, Física); con `grouped` se agrupan por área y, si hay
 * más de una, aparece un filtro.
 */
export function LabCards({ locked = false, only, extra, grouped = false }: { locked?: boolean; only?: LabId[]; extra?: (id: LabId) => ReactNode; grouped?: boolean } = {}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Subject | 'all'>('all');
  const open = useShell((s) => s.open);
  const cards = useMemo<LabCard[]>(() => {
    const p01 = loadP01Attempt();
    const p2 = loadAttempt();
    const p3 = loadP3Attempt();
    const p4 = loadP4Attempt();
    const p5 = loadP5Attempt();
    const p6 = loadP6Attempt();
    const p7 = loadP07Attempt();
    const p8 = loadP08Attempt();
    const p9 = loadP09Attempt();
    const p10 = loadP10Attempt();
    const b01 = loadB01Attempt();
    const b02 = loadB02Attempt();
    return [
      { id: 'p01', number: 1, key: 'menu.labs.p01', saved: p01 ? { mode: p01.settings.mode, minutes: Math.round(p01.world.timeS / 60), submitted: p01.submitted } : null },
      { id: 'p2', number: 2, key: 'menu.labs.p2', saved: p2 ? { mode: p2.settings.mode, minutes: Math.round(p2.world.timeS / 60), submitted: p2.submitted } : null },
      { id: 'p3', number: 3, key: 'menu.labs.p3', saved: p3 ? { mode: p3.settings.mode, minutes: Math.round(p3.world.timeS / 60), submitted: p3.submitted } : null },
      { id: 'p4', number: 4, key: 'menu.labs.p4', saved: p4 ? { mode: p4.settings.mode, minutes: Math.round(p4.world.timeS / 60), submitted: p4.submitted } : null },
      { id: 'p5', number: 5, key: 'menu.labs.p5', saved: p5 ? { mode: p5.settings.mode, minutes: Math.round(p5.world.timeS / 60), submitted: p5.submitted } : null },
      { id: 'p6', number: 6, key: 'menu.labs.p6', saved: p6 ? { mode: p6.settings.mode, minutes: Math.round(p6.world.timeS / 60), submitted: p6.submitted } : null },
      { id: 'p7', number: 7, key: 'menu.labs.p7', saved: p7 ? { mode: p7.settings.mode, minutes: Math.round(p7.world.timeS / 60), submitted: p7.submitted } : null },
      { id: 'p8', number: 8, key: 'menu.labs.p8', saved: p8 ? { mode: p8.settings.mode, minutes: Math.round(p8.world.timeS / 60), submitted: p8.submitted } : null },
      { id: 'p9', number: 9, key: 'menu.labs.p9', saved: p9 ? { mode: p9.settings.mode, minutes: Math.round(p9.world.timeS / 60), submitted: p9.submitted } : null },
      { id: 'p10', number: 10, key: 'menu.labs.p10', saved: p10 ? { mode: p10.settings.mode, minutes: Math.round(p10.world.timeS / 60), submitted: p10.submitted } : null },
      { id: 'b01', number: 11, key: 'menu.labs.b01', saved: b01 ? { mode: b01.settings.mode, minutes: Math.round(b01.world.timeS / 60), submitted: b01.submitted } : null },
      { id: 'b02', number: 12, key: 'menu.labs.b02', saved: b02 ? { mode: b02.settings.mode, minutes: Math.round(b02.world.timeS / 60), submitted: b02.submitted } : null },
    ];
  }, []);
  const visible = cards.filter((c) => !only || only.includes(c.id));
  // Agrupadas, las tarjetas quedan bajo el título del área (h3): su título baja a h4.
  const Title = grouped ? 'h4' : 'h3';
  const card = (c: LabCard) => (
    <li key={c.id}>
      <article className="lab-card">
        <div className={`lab-card-art art-${c.id}`}>
          <span className={`lab-subject-badge subject-${subjectOf(c.id)}`}>{t(`menu.subject.${subjectOf(c.id)}`)}</span>
          <Title className="lab-card-title">{t(`${c.key}.title`)}</Title>
        </div>
        <div className="lab-card-body">
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
  );
  if (!grouped) return <ul className="lab-cards" aria-label={t('menu.listLabel')}>{visible.map(card)}</ul>;
  const present = SUBJECTS.filter((sub) => visible.some((c) => subjectOf(c.id) === sub));
  const shown = present.filter((sub) => filter === 'all' || filter === sub);
  return (
    <div className="lab-subjects">
      {present.length > 1 && (
        <div className="lab-subject-filter" role="group" aria-label={t('menu.subjectFilter')}>
          {(['all', ...present] as const).map((sub) => (
            <button key={sub} type="button" className="btn small" aria-pressed={filter === sub} onClick={() => setFilter(sub)}>
              {sub === 'all' ? t('menu.subjectAll') : t(`menu.subject.${sub}`)}
            </button>
          ))}
        </div>
      )}
      {shown.map((sub) => {
        const list = visible.filter((c) => subjectOf(c.id) === sub);
        return (
          <section key={sub} className="lab-subject" aria-labelledby={`lab-subject-${sub}`}>
            <h3 id={`lab-subject-${sub}`} className="lab-subject-title">
              <span className={`lab-subject-dot subject-${sub}`} aria-hidden="true" />
              {t(`menu.subject.${sub}`)} <span className="lab-subject-count">{t('menu.subjectCount', { count: list.length })}</span>
            </h3>
            <ul className="lab-cards" aria-label={t('menu.subjectList', { subject: t(`menu.subject.${sub}`) })}>{list.map(card)}</ul>
          </section>
        );
      })}
    </div>
  );
}
