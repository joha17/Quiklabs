/**
 * Revisión de entregas del docente: la nota recalculada por el servidor, los problemas de plausibilidad que detectó y
 * la verificación por repetición. «Verificar intento» descarga el estado entregado y la cinta de comandos, repite el
 * intento tic a tic en este navegador (con el mismo código del simulador) y registra si llega al mismo estado y nota.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LabId, Submission, SubmissionReplay } from '../../../worker/core/types';
import { api } from './api';
import { LAB_TITLE } from './TeacherPanel';
import { Notice, errorText, fmtDate, pct } from './ui';

export type CourseSubmission = Submission & { studentName: string; studentCode: string | null; hasTape: boolean };

/** Repite el intento en el navegador; `onProgress` recibe la fracción hecha (0…1). */
async function verifyAttempt(sub: CourseSubmission, onProgress: (f: number) => void): Promise<Omit<SubmissionReplay, 'at' | 'by'>> {
  const [{ replayTape }, { unpackJson }] = await Promise.all([import('../../practices/grading'), import('../../../worker/core/pack')]);
  const data = await api<{ snapshot: string; tape: string | null }>('GET', `/teacher/submissions/${sub.id}/data`);
  if (!data.tape) return { status: 'NO_TAPE', exactState: false, replayScore: null, diffs: [] };
  const [tape, snapshot] = await Promise.all([unpackJson<Parameters<typeof replayTape>[0]>(data.tape), unpackJson<Parameters<typeof replayTape>[1]>(data.snapshot)]);
  const submitted = { total: sub.score, needsTeacherReview: [], components: sub.components.map((c) => ({ id: c.key, score: c.score, weight: c.weight, items: [] })) };
  const out = await replayTape(tape, snapshot, submitted, {
    yieldEvery: 3000,
    onProgress: async (done, total) => {
      onProgress(total > 0 ? done / total : 1);
      // Cede el hilo para que la página siga respondiendo durante una repetición larga.
      await new Promise((r) => setTimeout(r, 0));
    },
  });
  return { status: out.status, exactState: out.exactState, replayScore: out.replayScore, diffs: out.diffs, error: out.error };
}

function ReplayCell({ sub, onDone }: { sub: CourseSubmission; onDone: (s: CourseSubmission) => void }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    setProgress(0);
    try {
      const r = await verifyAttempt(sub, setProgress);
      const saved = await api<Submission>('POST', `/teacher/submissions/${sub.id}/replay`, r);
      onDone({ ...sub, replay: saved.replay });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setProgress(null);
    }
  };
  if (progress !== null) {
    return <span role="status">{t('pf.review.running', { pct: pct(progress) })} <progress max={1} value={progress} aria-label={t('pf.review.verify')} /></span>;
  }
  const r = sub.replay;
  const disabled = !sub.hasTape || sub.grading !== 'SERVER';
  return (
    <>
      {r && (
        <span className={`pf-tag ${r.status === 'OK' ? 'pf-tag-ok' : 'pf-tag-bad'}`} title={`${fmtDate(r.at, true)}${r.error ? ` · ${r.error}` : ''}`}>
          {t(`pf.review.replay.${r.status}`)}
        </span>
      )}
      {r && r.status === 'MISMATCH' && (
        <span className="pf-muted">
          {' '}{t('pf.review.replayScore', { score: r.replayScore === null ? '—' : pct(r.replayScore) })}
          {r.diffs.length > 0 && ` · ${r.diffs.map((d) => `${d.key} ${pct(d.submitted)}→${pct(d.replay)}`).join(', ')}`}
        </span>
      )}
      {r && r.status === 'OK' && !r.exactState && <span className="pf-muted"> {t('pf.review.notExact')}</span>}
      {' '}
      <button type="button" className="btn small" disabled={disabled} onClick={() => void run()} title={disabled ? t('pf.review.noTape') : undefined}>
        {r ? t('pf.review.again') : t('pf.review.verify')}
      </button>
      {error && <Notice kind="error">{error}</Notice>}
    </>
  );
}

export function SubmissionReview({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const [subs, setSubs] = useState<CourseSubmission[] | null>(null);
  const [lab, setLab] = useState<LabId | ''>('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setSubs(null);
    api<CourseSubmission[]>('GET', `/teacher/courses/${courseId}/submissions`).then(setSubs).catch((e) => setError(errorText(e)));
  }, [courseId]);
  useEffect(load, [load]);
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!subs) return <p className="pf-empty">{t('pf.loading')}</p>;
  const labs = [...new Set(subs.map((s) => s.labId))].sort();
  const shown = subs.filter((s) => !lab || s.labId === lab);
  const flagged = subs.filter((s) => s.issues.length > 0 || (s.replay && s.replay.status !== 'OK')).length;
  return (
    <>
      <p className="pf-muted">{t('pf.review.intro')}</p>
      {flagged > 0 && <Notice kind="error">{t('pf.review.flagged', { count: flagged })}</Notice>}
      {subs.length === 0 ? <p className="pf-empty">{t('pf.review.none')}</p> : (
        <>
          <div className="pf-row-end">
            <label>
              {t('pf.student.lab')}{' '}
              <select value={lab} onChange={(e) => setLab(e.target.value as LabId | '')}>
                <option value="">{t('pf.review.allLabs')}</option>
                {labs.map((l) => <option key={l} value={l}>{t(LAB_TITLE[l])}</option>)}
              </select>
            </label>
          </div>
          <div className="table-scroll">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>{t('pf.admin.name')}</th><th>{t('pf.student.lab')}</th><th>{t('pf.review.date')}</th><th className="num">{t('pf.review.score')}</th>
                  <th>{t('pf.review.grading')}</th><th>{t('pf.review.verification')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td>{s.studentName}{s.studentCode && <span className="pf-muted"> · {s.studentCode}</span>}</td>
                    <td>{t(LAB_TITLE[s.labId])} <span className="pf-muted">· {t(`pf.labs.mode.${s.mode}`)}</span></td>
                    <td>{fmtDate(s.submittedAt, true)}</td>
                    <td className="num"><strong>{pct(s.score)}</strong></td>
                    <td>
                      {s.grading === 'CLIENT' ? <span className="pf-tag">{t('pf.review.legacy')}</span>
                        : s.issues.length === 0 ? <span className="pf-tag pf-tag-ok">{t('pf.review.server')}</span>
                          : s.issues.map((i) => (
                            <span key={i} className="pf-tag pf-tag-bad" title={i === 'CLIENT_SCORE_MISMATCH' && s.clientScore !== null ? t('pf.review.clientScore', { score: pct(s.clientScore) }) : undefined}>
                              {t(`pf.review.issue.${i}`, { defaultValue: i })}
                            </span>
                          ))}
                    </td>
                    <td><ReplayCell sub={s} onDone={(n) => setSubs((xs) => xs?.map((x) => (x.id === n.id ? n : x)) ?? null)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
