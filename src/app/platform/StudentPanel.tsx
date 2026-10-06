/**
 * Panel del estudiante: sus cursos vigentes, las prácticas que su docente tiene abiertas (con modo y cierre) y el
 * historial de entregas con la nota que calculó el simulador.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LabId, LabMode, Submission } from '../../../worker/core/types';
import { LabCards } from '../LabMenu';
import { api } from './api';
import { usePlatform } from './session';
import { Notice, PanelShell, errorText, fmtDate, pct } from './ui';

interface StudentCourse {
  id: string;
  code: string;
  name: string;
  term: string;
  group: string;
  teachers: string[];
  endsAt: string;
  labs: Array<{ labId: LabId; opensAt: string; closesAt: string; mode: LabMode; open: boolean }>;
}

const LAB_TITLE: Record<LabId, string> = { p2: 'menu.labs.p2.title', p3: 'menu.labs.p3.title', p4: 'menu.labs.p4.title', p5: 'menu.labs.p5.title', p6: 'menu.labs.p6.title' };

export function StudentPanel() {
  const { t } = useTranslation();
  const me = usePlatform((s) => s.me)!;
  const [courses, setCourses] = useState<StudentCourse[] | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api<StudentCourse[]>('GET', '/student/courses'), api<Submission[]>('GET', '/student/submissions')])
      .then(([c, s]) => {
        setCourses(c);
        setSubs(s);
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  const openLabs = me.labs.map((l) => l.labId);
  const byLab = new Map(me.labs.map((l) => [l.labId, l]));
  const courseOf = (id: string) => courses?.find((c) => c.id === id);

  return (
    <PanelShell title={t('pf.role.student')}>
      <h1 className="pf-h1">{t('pf.student.hello', { name: me.user.name.split(' ')[0] })}</h1>
      {error && <Notice kind="error">{error}</Notice>}

      <section className="pf-section" aria-labelledby="pf-labs">
        <h2 id="pf-labs">{t('pf.labs.title')}</h2>
        {openLabs.length === 0 ? (
          <p className="pf-empty">{t('pf.labs.none')}</p>
        ) : (
          <LabCards
            only={openLabs}
            extra={(id) => {
              const l = byLab.get(id);
              const c = l?.courseId ? courseOf(l.courseId) : null;
              return (
                <p className="pf-lab-meta">
                  {c && <span>{c.code} · G{c.group}</span>}
                  {l?.mode && <span className="pf-tag">{t(`pf.labs.mode.${l.mode}`)}</span>}
                  {l?.closesAt && <span>{t('pf.labs.closes', { date: fmtDate(l.closesAt, true) })}</span>}
                </p>
              );
            }}
          />
        )}
      </section>

      <section className="pf-section" aria-labelledby="pf-courses">
        <h2 id="pf-courses">{t('pf.student.courses')}</h2>
        {!courses ? <p className="pf-empty">{t('pf.loading')}</p> : (
          <div className="pf-cards">
            {courses.map((c) => (
              <article key={c.id} className="pf-card">
                <h3>{c.code} · {c.name}</h3>
                <p className="pf-muted">{c.term} · G{c.group} · {t('pf.student.teacher', { names: c.teachers.join(', ') })}</p>
                <p className="pf-muted">{t('pf.student.until', { date: fmtDate(c.endsAt) })}</p>
                <ul className="pf-list">
                  {c.labs.map((l) => (
                    <li key={l.labId}>
                      <span>{t(LAB_TITLE[l.labId])}</span>
                      <span className={`pf-tag ${l.open ? 'pf-tag-ok' : ''}`}>{l.open ? t('pf.labs.closes', { date: fmtDate(l.closesAt) }) : t('pf.labs.opens', { date: fmtDate(l.opensAt) })}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="pf-section" aria-labelledby="pf-subs">
        <h2 id="pf-subs">{t('pf.student.submissions')}</h2>
        {subs.length === 0 ? <p className="pf-empty">{t('pf.student.noSubmissions')}</p> : (
          <div className="table-scroll">
            <table className="pf-table">
              <thead><tr><th>{t('pf.student.when')}</th><th>{t('pf.student.lab')}</th><th>{t('pf.student.course')}</th><th>{t('pf.teacher.mode')}</th><th className="num">{t('pf.student.score')}</th></tr></thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDate(s.submittedAt, true)}</td>
                    <td>{t(LAB_TITLE[s.labId])}</td>
                    <td>{courseOf(s.courseId) ? `${courseOf(s.courseId)!.code} G${courseOf(s.courseId)!.group}` : '—'}</td>
                    <td>{t(`pf.labs.mode.${s.mode}`)}</td>
                    <td className="num"><strong>{pct(s.score)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PanelShell>
  );
}
