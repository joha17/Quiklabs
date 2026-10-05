/**
 * Panel docente: sus grupos, la lista de estudiantes, la programación de prácticas (apertura, cierre y modo) y el
 * libro de calificaciones exportable. Puede abrir cualquier práctica para revisarla sin generar entregas.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LAB_IDS, type Course, type CourseLab, type LabId, type LabMode } from '../../../worker/core/types';
import { LabCards } from '../LabMenu';
import { api } from './api';
import { usePlatform } from './session';
import { Notice, PanelShell, downloadCsv, errorText, fmtDate, fromLocalInput, pct, toLocalInput } from './ui';

export interface RosterRow {
  enrollmentId: string;
  status: 'active' | 'withdrawn' | 'completed';
  id: string;
  name: string;
  email: string;
  code?: string;
  lastLoginAt: string | null;
}
type TeacherCourse = Course & { live: boolean; students: RosterRow[] };
export interface Gradebook {
  course: Course;
  labs: LabId[];
  rows: Array<{ student: RosterRow; cells: Record<string, { best: number; attempts: number; lastAt: string } | null> }>;
}

export const LAB_TITLE: Record<LabId, string> = { p2: 'menu.labs.p2.title', p3: 'menu.labs.p3.title', p4: 'menu.labs.p4.title' };
const MODES: LabMode[] = ['PRACTICE', 'GUIDED', 'EVALUATION'];

/** Tabla de calificaciones (también la usa el administrador). */
export function GradebookTable({ gb }: { gb: Gradebook }) {
  const { t } = useTranslation();
  const exportCsv = () => {
    const head = ['carné', 'nombre', 'correo', 'matrícula', ...gb.labs.flatMap((l) => [`${l} nota`, `${l} entregas`])];
    const rows = gb.rows.map((r) => [r.student.code ?? '', r.student.name, r.student.email, r.student.status, ...gb.labs.flatMap((l) => {
      const c = r.cells[l];
      return c ? [pct(c.best), c.attempts] : ['', 0];
    })]);
    downloadCsv(`calificaciones-${gb.course.code}-${gb.course.term}-G${gb.course.group}.csv`, [head, ...rows]);
  };
  return (
    <>
      <div className="pf-row-end"><button type="button" className="btn small" onClick={exportCsv}>{t('pf.teacher.export')}</button></div>
      {gb.rows.length === 0 ? <p className="pf-empty">{t('pf.teacher.noEnrolled')}</p> : (
        <div className="table-scroll">
          <table className="pf-table">
            <thead>
              <tr>
                <th>{t('pf.admin.name')}</th><th>{t('pf.admin.code')}</th>
                {gb.labs.map((l) => <th key={l} className="num">{t(LAB_TITLE[l])}</th>)}
              </tr>
            </thead>
            <tbody>
              {gb.rows.map((r) => (
                <tr key={r.student.id} className={r.student.status !== 'active' ? 'pf-dim' : ''}>
                  <td>{r.student.name}{r.student.status !== 'active' && <span className="pf-tag">{t(`pf.teacher.status.${r.student.status}`)}</span>}</td>
                  <td>{r.student.code ?? '—'}</td>
                  {gb.labs.map((l) => {
                    const c = r.cells[l];
                    return (
                      <td key={l} className="num" title={c ? fmtDate(c.lastAt, true) : undefined}>
                        {c ? <><strong>{pct(c.best)}</strong> <span className="pf-muted">({t('pf.teacher.attempts', { n: c.attempts })})</span></> : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LabSchedule({ course, onSaved }: { course: Course; onSaved: (c: Course) => void }) {
  const { t } = useTranslation();
  const defaults = (labId: LabId): CourseLab => ({ labId, opensAt: course.startsAt, closesAt: course.endsAt, mode: 'PRACTICE' });
  const [draft, setDraft] = useState<Record<LabId, CourseLab & { on: boolean }>>(() =>
    Object.fromEntries(LAB_IDS.map((id) => {
      const l = course.labs.find((x) => x.labId === id);
      return [id, { ...(l ?? defaults(id)), on: !!l }];
    })) as Record<LabId, CourseLab & { on: boolean }>);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const set = (id: LabId, p: Partial<CourseLab & { on: boolean }>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const save = async () => {
    const labs: CourseLab[] = LAB_IDS.filter((id) => draft[id].on).map((id) => ({ labId: id, opensAt: draft[id].opensAt, closesAt: draft[id].closesAt, mode: draft[id].mode }));
    try {
      const c = await api<Course>('PUT', `/teacher/courses/${course.id}/labs`, { labs });
      onSaved(c);
      setMsg({ kind: 'ok', text: t('pf.teacher.saved') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };
  return (
    <>
      <div className="table-scroll">
        <table className="pf-table">
          <thead><tr><th>{t('pf.teacher.assigned')}</th><th>{t('pf.student.lab')}</th><th>{t('pf.teacher.opensAt')}</th><th>{t('pf.teacher.closesAt')}</th><th>{t('pf.teacher.mode')}</th></tr></thead>
          <tbody>
            {LAB_IDS.map((id) => {
              const l = draft[id];
              const title = t(LAB_TITLE[id]);
              return (
                <tr key={id}>
                  <td><input type="checkbox" checked={l.on} onChange={(e) => set(id, { on: e.target.checked })} aria-label={`${t('pf.teacher.assigned')}: ${title}`} /></td>
                  <td>{title}</td>
                  <td><input type="datetime-local" value={toLocalInput(l.opensAt)} disabled={!l.on} onChange={(e) => e.target.value && set(id, { opensAt: fromLocalInput(e.target.value) })} aria-label={`${t('pf.teacher.opensAt')}: ${title}`} /></td>
                  <td><input type="datetime-local" value={toLocalInput(l.closesAt)} disabled={!l.on} onChange={(e) => e.target.value && set(id, { closesAt: fromLocalInput(e.target.value) })} aria-label={`${t('pf.teacher.closesAt')}: ${title}`} /></td>
                  <td>
                    <select value={l.mode} disabled={!l.on} onChange={(e) => set(id, { mode: e.target.value as LabMode })} aria-label={`${t('pf.teacher.mode')}: ${title}`}>
                      {MODES.map((m) => <option key={m} value={m}>{t(`pf.labs.mode.${m}`)}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="pf-row-end"><button type="button" className="btn primary" onClick={() => void save()}>{t('pf.teacher.save')}</button></div>
    </>
  );
}

export function TeacherPanel() {
  const { t } = useTranslation();
  const me = usePlatform((s) => s.me)!;
  const [courses, setCourses] = useState<TeacherCourse[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [gb, setGb] = useState<Gradebook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<TeacherCourse[]>('GET', '/teacher/courses')
      .then((c) => {
        setCourses(c);
        setSel((s) => s ?? c[0]?.id ?? null);
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!sel) return;
    setGb(null);
    api<Gradebook>('GET', `/teacher/courses/${sel}/gradebook`).then(setGb).catch((e) => setError(errorText(e)));
  }, [sel]);
  const course = courses?.find((c) => c.id === sel);

  return (
    <PanelShell title={t('pf.role.teacher')}>
      <h1 className="pf-h1">{t('pf.teacher.hello', { name: me.user.name })}</h1>
      {error && <Notice kind="error">{error}</Notice>}
      {courses && courses.length === 0 && <p className="pf-empty">{t('pf.teacher.none')}</p>}
      {courses && courses.length > 0 && (
        <div className="pf-tabs" role="tablist" aria-label={t('pf.teacher.courses')}>
          {courses.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === sel} className={`pf-tab ${c.id === sel ? 'on' : ''}`} onClick={() => setSel(c.id)}>
              {c.code} · {c.term} · G{c.group}
            </button>
          ))}
        </div>
      )}
      {course && (
        <>
          <section className="pf-section" aria-labelledby="pf-t-labs">
            <h2 id="pf-t-labs">{t('pf.teacher.labs')}</h2>
            <LabSchedule key={course.id} course={course} onSaved={(c) => setCourses((cs) => cs?.map((x) => (x.id === c.id ? { ...x, ...c } : x)) ?? null)} />
          </section>
          <section className="pf-section" aria-labelledby="pf-t-gb">
            <h2 id="pf-t-gb">{t('pf.teacher.gradebook')}</h2>
            {gb ? <GradebookTable gb={gb} /> : <p className="pf-empty">{t('pf.loading')}</p>}
          </section>
          <section className="pf-section" aria-labelledby="pf-t-st">
            <h2 id="pf-t-st">{t('pf.teacher.students')} ({course.students.filter((s) => s.status === 'active').length})</h2>
            {course.students.length === 0 ? <p className="pf-empty">{t('pf.teacher.noEnrolled')}</p> : (
              <div className="table-scroll">
                <table className="pf-table">
                  <thead><tr><th>{t('pf.admin.name')}</th><th>{t('pf.admin.code')}</th><th>{t('pf.admin.email')}</th><th>{t('pf.admin.status')}</th><th>{t('pf.teacher.lastLogin')}</th></tr></thead>
                  <tbody>
                    {course.students.map((s) => (
                      <tr key={s.id} className={s.status !== 'active' ? 'pf-dim' : ''}>
                        <td>{s.name}</td><td>{s.code ?? '—'}</td><td>{s.email}</td>
                        <td>{t(`pf.teacher.status.${s.status}`)}</td>
                        <td>{s.lastLoginAt ? fmtDate(s.lastLoginAt, true) : t('pf.teacher.never')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <section className="pf-section" aria-labelledby="pf-t-try">
        <h2 id="pf-t-try">{t('pf.labs.title')}</h2>
        <p className="pf-muted">{t('pf.labs.preview', { role: t('pf.role.teacher').toLowerCase() })}</p>
        <LabCards />
      </section>
    </PanelShell>
  );
}
