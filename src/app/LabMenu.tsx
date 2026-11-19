import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShell, type LabId } from './shell';
import { tList } from './i18n';
import { SUBJECTS, subjectOf, type Subject } from './labCatalog';
import { LAB_MODULES } from './labModules';
import { LAB_IDS, labNumber } from '../labs/registry';
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
  const cards = useMemo<LabCard[]>(
    () =>
      LAB_IDS.map((id) => {
        const saved = LAB_MODULES[id].loadAttempt();
        return { id, number: labNumber(id), key: `menu.labs.${id}`, saved: saved ? { mode: saved.settings.mode, minutes: Math.round(saved.world.timeS / 60), submitted: saved.submitted } : null };
      }),
  []);
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
