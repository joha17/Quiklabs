/**
 * Panel de administración: cuentas (alta, edición, suspensión, contraseña temporal, desbloqueo), cursos y matrículas,
 * importación del padrón en CSV, licencia de la universidad y auditoría. Es el único lugar donde se crean cuentas.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LAB_IDS, type AuditEntry, type Course, type License, type PublicUser, type Role } from '../../../worker/core/types';
import { LabCards } from '../LabMenu';
import { api } from './api';
import { usePlatform } from './session';
import { GradebookTable, type Gradebook, type RosterRow } from './TeacherPanel';
import { Notice, PanelShell, TempPasswordDialog, downloadCsv, errorText, fmtDate, fromLocalInput, toLocalInput } from './ui';

type Tab = 'overview' | 'users' | 'courses' | 'import' | 'license' | 'audit';
type AdminCourse = Course & { enrolled: number };
interface Overview {
  users: { admin: number; teacher: number; student: number; suspended: number };
  courses: { total: number; live: number };
  seats: { used: number; total: number };
  license: License & { active: boolean };
  submissions: number;
}
type Msg = { kind: 'ok' | 'error'; text: string } | null;

export function AdminPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const reload = useCallback(async () => {
    const [u, c] = await Promise.all([api<PublicUser[]>('GET', '/admin/users'), api<AdminCourse[]>('GET', '/admin/courses')]);
    setUsers(u);
    setCourses(c);
  }, []);
  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);
  const tabs: Tab[] = ['overview', 'users', 'courses', 'import', 'license', 'audit'];
  return (
    <PanelShell title={t('pf.admin.title')}>
      <div className="pf-tabs" role="tablist" aria-label={t('pf.admin.title')}>
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" id={`pf-tab-${k}`} aria-selected={tab === k} aria-controls={`pf-pane-${k}`} className={`pf-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {t(`pf.admin.tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`pf-pane-${tab}`} aria-labelledby={`pf-tab-${tab}`}>
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab users={users} reload={reload} onTemp={setTemp} />}
        {tab === 'courses' && <CoursesTab courses={courses} users={users} reload={reload} />}
        {tab === 'import' && <ImportTab courses={courses} reload={reload} />}
        {tab === 'license' && <LicenseTab />}
        {tab === 'audit' && <AuditTab users={users} />}
      </div>
      {temp && <TempPasswordDialog name={temp.name} password={temp.password} onClose={() => setTemp(null)} />}
    </PanelShell>
  );
}

function OverviewTab() {
  const { t } = useTranslation();
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => {
    void api<Overview>('GET', '/admin/overview').then(setO);
  }, []);
  if (!o) return <p className="pf-empty">{t('pf.loading')}</p>;
  const stats: Array<[string, string]> = [
    [t('pf.admin.stats.students'), String(o.users.student)],
    [t('pf.admin.stats.teachers'), String(o.users.teacher)],
    [t('pf.admin.stats.courses'), `${o.courses.live} / ${o.courses.total}`],
    [t('pf.admin.stats.seats'), `${o.seats.used} / ${o.seats.total}`],
    [t('pf.admin.stats.submissions'), String(o.submissions)],
    [t('pf.admin.stats.suspended'), String(o.users.suspended)],
  ];
  return (
    <section className="pf-section">
      <dl className="pf-stats">
        {stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <article className="pf-card">
        <h3>{t('pf.admin.license')}: {o.license.institution}</h3>
        <p className="pf-muted">{fmtDate(o.license.validFrom)} – {fmtDate(o.license.validTo)} · <span className={`pf-tag ${o.license.active ? 'pf-tag-ok' : 'pf-tag-bad'}`}>{o.license.active ? t('pf.admin.active') : t('pf.admin.inactive')}</span></p>
      </article>
      <h2>{t('pf.labs.title')}</h2>
      <p className="pf-muted">{t('pf.labs.preview', { role: t('pf.role.admin').toLowerCase() })}</p>
      <LabCards />
    </section>
  );
}

function UsersTab({ users, reload, onTemp }: { users: PublicUser[]; reload: () => Promise<void>; onTemp: (x: { name: string; password: string }) => void }) {
  const { t } = useTranslation();
  const me = usePlatform((s) => s.me)!;
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [msg, setMsg] = useState<Msg>(null);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [form, setForm] = useState({ role: 'student' as Role, name: '', email: '', code: '' });
  const now = Date.now();
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return users
      .filter((u) => role === 'all' || u.role === role)
      .filter((u) => !n || [u.name, u.email, u.code ?? ''].some((x) => x.toLowerCase().includes(n)))
      .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name, 'es'));
  }, [users, q, role]);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      await reload();
      if (ok) setMsg({ kind: 'ok', text: ok });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await api<{ user: PublicUser; temporaryPassword: string }>('POST', '/admin/users', { ...form, code: form.code || undefined });
      onTemp({ name: r.user.name, password: r.temporaryPassword });
      setForm({ ...form, name: '', email: '', code: '' });
    });
  };
  return (
    <section className="pf-section">
      <form className="pf-inline-form" onSubmit={create} aria-label={t('pf.admin.newUser')}>
        <h2>{t('pf.admin.newUser')}</h2>
        <label><span>{t('pf.admin.role')}</span>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {(['student', 'teacher', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{t(`pf.role.${r}`)}</option>)}
          </select>
        </label>
        <label><span>{t('pf.admin.name')}</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label><span>{t('pf.admin.email')}</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label><span>{t('pf.admin.code')}</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
        <button type="submit" className="btn primary">{t('pf.admin.create')}</button>
      </form>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="pf-filters">
        <input type="search" placeholder={t('pf.admin.search')} aria-label={t('pf.admin.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as Role | 'all')} aria-label={t('pf.admin.filterRole')}>
          <option value="all">{t('pf.admin.all')}</option>
          {(['admin', 'teacher', 'student'] as Role[]).map((r) => <option key={r} value={r}>{t(`pf.role.${r}`)}</option>)}
        </select>
        <span className="pf-muted">{list.length}</span>
      </div>
      <div className="table-scroll">
        <table className="pf-table">
          <thead><tr><th>{t('pf.admin.name')}</th><th>{t('pf.admin.role')}</th><th>{t('pf.admin.email')}</th><th>{t('pf.admin.code')}</th><th>{t('pf.admin.status')}</th><th>{t('pf.admin.lastLogin')}</th><th /></tr></thead>
          <tbody>
            {list.map((u) => {
              const locked = !!u.lockedUntil && Date.parse(u.lockedUntil) > now;
              return (
                <tr key={u.id} className={u.status !== 'active' ? 'pf-dim' : ''}>
                  <td>{u.name}{u.mustChangePassword && <span className="pf-tag" title={t('pf.change.title')}>🔑</span>}</td>
                  <td><span className={`pf-role pf-role-${u.role}`}>{t(`pf.role.${u.role}`)}</span></td>
                  <td>{u.email}</td>
                  <td>{u.code ?? '—'}</td>
                  <td>{locked ? <span className="pf-tag pf-tag-bad">{t('pf.admin.locked')}</span> : u.status === 'active' ? t('pf.admin.statusActive') : <span className="pf-tag pf-tag-bad">{t('pf.admin.statusSuspended')}</span>}</td>
                  <td>{u.lastLoginAt ? fmtDate(u.lastLoginAt, true) : t('pf.teacher.never')}</td>
                  <td className="pf-actions">
                    <button type="button" className="btn small" onClick={() => setEditing(u)} aria-label={`${t('pf.admin.edit')}: ${u.name}`}>{t('pf.admin.edit')}</button>
                    {u.id !== me.user.id && (
                      <button type="button" className="btn small" aria-label={`${u.status === 'active' ? t('pf.admin.suspend') : t('pf.admin.reactivate')}: ${u.name}`}
                        onClick={() => void run(() => api('PATCH', `/admin/users/${u.id}`, { status: u.status === 'active' ? 'suspended' : 'active' }), t('pf.admin.saved'))}>
                        {u.status === 'active' ? t('pf.admin.suspend') : t('pf.admin.reactivate')}
                      </button>
                    )}
                    <button type="button" className="btn small" aria-label={`${t('pf.admin.resetPassword')}: ${u.name}`}
                      onClick={() => void run(async () => {
                        const r = await api<{ temporaryPassword: string }>('POST', `/admin/users/${u.id}/reset-password`);
                        onTemp({ name: u.name, password: r.temporaryPassword });
                      })}>
                      {t('pf.admin.resetPassword')}
                    </button>
                    {locked && <button type="button" className="btn small" onClick={() => void run(() => api('POST', `/admin/users/${u.id}/unlock`), t('pf.admin.saved'))}>{t('pf.admin.unlock')}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <EditUserDialog user={editing} onClose={() => setEditing(null)} onSave={(patch) => run(async () => {
        await api('PATCH', `/admin/users/${editing.id}`, patch);
        setEditing(null);
      }, t('pf.admin.saved'))} />}
    </section>
  );
}

function EditUserDialog({ user, onClose, onSave }: { user: PublicUser; onClose: () => void; onSave: (patch: Record<string, string>) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: user.name, email: user.email, code: user.code ?? '', role: user.role });
  return (
    <div className="modal-back" role="presentation">
      <form className="modal pf-form" role="dialog" aria-modal="true" aria-labelledby="pf-edit-title" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <h2 id="pf-edit-title">{t('pf.admin.edit')}: {user.name}</h2>
        <label><span>{t('pf.admin.name')}</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>
        <label><span>{t('pf.admin.email')}</span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label><span>{t('pf.admin.code')}</span><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></label>
        <label><span>{t('pf.admin.role')}</span>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {(['student', 'teacher', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{t(`pf.role.${r}`)}</option>)}
          </select>
        </label>
        <div className="foot" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>{t('pf.admin.cancel')}</button>
          <button type="submit" className="btn primary">{t('pf.admin.save')}</button>
        </div>
      </form>
    </div>
  );
}

const emptyCourse = () => ({ code: 'QU-0100', name: 'Química General I', term: '', group: '', teacherIds: [] as string[], startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 120 * 864e5).toISOString() });

function CoursesTab({ courses, users, reload }: { courses: AdminCourse[]; users: PublicUser[]; reload: () => Promise<void> }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<string | null>(courses[0]?.id ?? null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [gb, setGb] = useState<Gradebook | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [form, setForm] = useState(emptyCourse);
  const teachers = users.filter((u) => u.role === 'teacher');
  const course = courses.find((c) => c.id === sel);
  const loadRoster = useCallback(async (id: string) => {
    const [r, g] = await Promise.all([api<RosterRow[]>('GET', `/admin/courses/${id}/roster`), api<Gradebook>('GET', `/admin/courses/${id}/gradebook`)]);
    setRoster(r);
    setGb(g);
  }, []);
  useEffect(() => {
    if (!sel && courses[0]) setSel(courses[0].id);
  }, [courses, sel]);
  useEffect(() => {
    if (sel) void loadRoster(sel).catch((e) => setMsg({ kind: 'error', text: errorText(e) }));
  }, [sel, loadRoster]);
  const run = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
      await reload();
      if (sel) await loadRoster(sel);
      setMsg({ kind: 'ok', text: t('pf.admin.saved') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };
  const enrolledIds = new Set(roster.filter((r) => r.status === 'active').map((r) => r.id));
  const candidates = users.filter((u) => u.role === 'student' && u.status === 'active' && !enrolledIds.has(u.id));
  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const c = await api<Course>('POST', '/admin/courses', {
        ...form, labs: LAB_IDS.map((labId) => ({ labId, opensAt: form.startsAt, closesAt: form.endsAt, mode: 'PRACTICE' })),
      });
      setSel(c.id);
      setForm(emptyCourse());
    });
  };
  return (
    <section className="pf-section">
      <div className="table-scroll">
        <table className="pf-table">
          <thead><tr><th>{t('pf.admin.courseCode')}</th><th>{t('pf.admin.courseName')}</th><th>{t('pf.admin.term')}</th><th>{t('pf.admin.group')}</th><th>{t('pf.admin.teachers')}</th><th>{t('pf.admin.startsAt')}</th><th>{t('pf.admin.endsAt')}</th><th className="num">{t('pf.admin.enrolled')}</th><th /></tr></thead>
          <tbody>
            {courses.map((c) => {
              const live = Date.now() >= Date.parse(c.startsAt) && Date.now() <= Date.parse(c.endsAt) && !c.archived;
              return (
                <tr key={c.id} className={c.id === sel ? 'pf-selected' : ''}>
                  <td>{c.code}</td><td>{c.name}</td><td>{c.term}</td><td>{c.group}</td>
                  <td>{c.teacherIds.map((id) => users.find((u) => u.id === id)?.name ?? id).join(', ')}</td>
                  <td>{fmtDate(c.startsAt)}</td><td>{fmtDate(c.endsAt)} <span className={`pf-tag ${live ? 'pf-tag-ok' : ''}`}>{live ? t('pf.admin.live') : t('pf.admin.notLive')}</span></td>
                  <td className="num">{c.enrolled}</td>
                  <td><button type="button" className="btn small" onClick={() => setSel(c.id)} aria-pressed={c.id === sel}>{t('pf.admin.roster')}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {course && (
        <>
          <h2>{t('pf.admin.roster')}: {course.code} · {course.term} · G{course.group}</h2>
          <div className="pf-enroll">
            <label className="pf-grow"><span>{t('pf.admin.pickStudents')}</span>
              <select multiple size={Math.min(6, Math.max(2, candidates.length))} value={pick} onChange={(e) => setPick([...e.target.selectedOptions].map((o) => o.value))}>
                {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code ?? u.email})</option>)}
              </select>
            </label>
            <button type="button" className="btn primary" disabled={pick.length === 0} onClick={() => void run(async () => {
              await api('POST', `/admin/courses/${course.id}/enrollments`, { studentIds: pick });
              setPick([]);
            })}>{t('pf.admin.enroll')}</button>
          </div>
          <div className="table-scroll">
            <table className="pf-table">
              <thead><tr><th>{t('pf.admin.name')}</th><th>{t('pf.admin.code')}</th><th>{t('pf.admin.email')}</th><th>{t('pf.admin.status')}</th><th /></tr></thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.enrollmentId} className={r.status !== 'active' ? 'pf-dim' : ''}>
                    <td>{r.name}</td><td>{r.code ?? '—'}</td><td>{r.email}</td><td>{t(`pf.teacher.status.${r.status}`)}</td>
                    <td className="pf-actions">
                      {r.status === 'active' ? (
                        <>
                          <button type="button" className="btn small" onClick={() => void run(() => api('PATCH', `/admin/enrollments/${r.enrollmentId}`, { status: 'withdrawn' }))} aria-label={`${t('pf.admin.withdraw')}: ${r.name}`}>{t('pf.admin.withdraw')}</button>
                          <button type="button" className="btn small" onClick={() => void run(() => api('PATCH', `/admin/enrollments/${r.enrollmentId}`, { status: 'completed' }))} aria-label={`${t('pf.admin.complete')}: ${r.name}`}>{t('pf.admin.complete')}</button>
                        </>
                      ) : (
                        <button type="button" className="btn small" onClick={() => void run(() => api('PATCH', `/admin/enrollments/${r.enrollmentId}`, { status: 'active' }))} aria-label={`${t('pf.admin.reenroll')}: ${r.name}`}>{t('pf.admin.reenroll')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>{t('pf.admin.gradebook')}</h2>
          {gb && <GradebookTable gb={gb} />}
        </>
      )}
      <form className="pf-inline-form" onSubmit={create} aria-label={t('pf.admin.newCourse')}>
        <h2>{t('pf.admin.newCourse')}</h2>
        <label><span>{t('pf.admin.courseCode')}</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></label>
        <label><span>{t('pf.admin.courseName')}</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label><span>{t('pf.admin.term')}</span><input value={form.term} placeholder="2027-I" onChange={(e) => setForm({ ...form, term: e.target.value })} required /></label>
        <label><span>{t('pf.admin.group')}</span><input value={form.group} placeholder="01" onChange={(e) => setForm({ ...form, group: e.target.value })} required /></label>
        <label><span>{t('pf.admin.teachers')}</span>
          <select value={form.teacherIds[0] ?? ''} onChange={(e) => setForm({ ...form, teacherIds: e.target.value ? [e.target.value] : [] })}>
            <option value="">—</option>
            {teachers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label><span>{t('pf.admin.startsAt')}</span><input type="datetime-local" value={toLocalInput(form.startsAt)} onChange={(e) => e.target.value && setForm({ ...form, startsAt: fromLocalInput(e.target.value) })} /></label>
        <label><span>{t('pf.admin.endsAt')}</span><input type="datetime-local" value={toLocalInput(form.endsAt)} onChange={(e) => e.target.value && setForm({ ...form, endsAt: fromLocalInput(e.target.value) })} /></label>
        <button type="submit" className="btn primary">{t('pf.admin.create')}</button>
      </form>
    </section>
  );
}

interface ImportResult {
  created: Array<{ code: string; name: string; email: string; temporaryPassword: string }>;
  enrolled: number;
  skipped: Array<{ line: number; reason: string; text: string }>;
}

function ImportTab({ courses, reload }: { courses: AdminCourse[]; reload: () => Promise<void> }) {
  const { t } = useTranslation();
  const [csv, setCsv] = useState('carné,nombre,correo\n');
  const [courseId, setCourseId] = useState('');
  const [res, setRes] = useState<ImportResult | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const runImport = async () => {
    setMsg(null);
    try {
      const r = await api<ImportResult>('POST', '/admin/users/import', { csv, courseId: courseId || null });
      setRes(r);
      await reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };
  return (
    <section className="pf-section">
      <p className="pf-muted">{t('pf.admin.importLead')}</p>
      <textarea className="pf-csv" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="CSV" spellCheck={false} />
      <div className="pf-enroll">
        <label><span>{t('pf.admin.importCourse')}</span>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">{t('pf.admin.noCourse')}</option>
            {courses.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.term} · G{c.group}</option>)}
          </select>
        </label>
        <button type="button" className="btn primary" onClick={() => void runImport()}>{t('pf.admin.importRun')}</button>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {res && (
        <>
          <Notice kind="ok">{t('pf.admin.importResult', { created: res.created.length, enrolled: res.enrolled, skipped: res.skipped.length })}</Notice>
          {res.created.length > 0 && (
            <>
              <p><strong>{t('pf.admin.importTemp')}</strong></p>
              <div className="table-scroll">
                <table className="pf-table">
                  <thead><tr><th>{t('pf.admin.code')}</th><th>{t('pf.admin.name')}</th><th>{t('pf.admin.email')}</th><th>{t('pf.admin.tempTitle')}</th></tr></thead>
                  <tbody>{res.created.map((c) => <tr key={c.email}><td>{c.code}</td><td>{c.name}</td><td>{c.email}</td><td><code>{c.temporaryPassword}</code></td></tr>)}</tbody>
                </table>
              </div>
              <button type="button" className="btn" onClick={() => downloadCsv('cuentas-nuevas.csv', [['carné', 'nombre', 'correo', 'contraseña temporal'], ...res.created.map((c) => [c.code, c.name, c.email, c.temporaryPassword])])}>{t('pf.admin.downloadCsv')}</button>
            </>
          )}
          {res.skipped.length > 0 && (
            <>
              <p><strong>{t('pf.admin.skippedTitle')}</strong></p>
              <ul className="pf-list">{res.skipped.map((s) => <li key={s.line}><span>#{s.line} {s.text}</span><span className="pf-tag pf-tag-bad">{errorText(s.reason)}</span></li>)}</ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function LicenseTab() {
  const { t } = useTranslation();
  const [l, setL] = useState<License | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    void api<License>('GET', '/admin/license').then(setL);
  }, []);
  if (!l) return <p className="pf-empty">{t('pf.loading')}</p>;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setL(await api<License>('PATCH', '/admin/license', l));
      setMsg({ kind: 'ok', text: t('pf.admin.saved') });
    } catch (err) {
      setMsg({ kind: 'error', text: errorText(err) });
    }
  };
  return (
    <section className="pf-section">
      <form className="pf-form pf-narrow" onSubmit={(e) => void save(e)}>
        <label><span>{t('pf.admin.institution')}</span><input value={l.institution} onChange={(e) => setL({ ...l, institution: e.target.value })} /></label>
        <label><span>{t('pf.admin.validFrom')}</span><input type="datetime-local" value={toLocalInput(l.validFrom)} onChange={(e) => e.target.value && setL({ ...l, validFrom: fromLocalInput(e.target.value) })} /></label>
        <label><span>{t('pf.admin.validTo')}</span><input type="datetime-local" value={toLocalInput(l.validTo)} onChange={(e) => e.target.value && setL({ ...l, validTo: fromLocalInput(e.target.value) })} /></label>
        <label><span>{t('pf.admin.seats')}</span><input type="number" min={0} value={l.studentSeats} onChange={(e) => setL({ ...l, studentSeats: Number(e.target.value) })} /></label>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button type="submit" className="btn primary">{t('pf.admin.save')}</button>
      </form>
    </section>
  );
}

function AuditTab({ users }: { users: PublicUser[] }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    void api<AuditEntry[]>('GET', '/admin/audit?limit=300').then(setRows);
  }, []);
  const who = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  if (!rows) return <p className="pf-empty">{t('pf.loading')}</p>;
  return (
    <section className="pf-section">
      <div className="table-scroll">
        <table className="pf-table">
          <thead><tr><th>{t('pf.admin.auditWhen')}</th><th>{t('pf.admin.auditWho')}</th><th>{t('pf.admin.auditWhat')}</th><th>{t('pf.admin.auditDetail')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{fmtDate(r.at, true)}</td><td>{who(r.actorId)}</td><td><code>{r.action}</code></td><td className="pf-detail">{r.target ? `${who(r.target)} ` : ''}{r.detail ?? ''}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
