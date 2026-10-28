/**
 * Fotografías reales del ocular (B01/B02): una por muestra y objetivo. El docente las sube para su curso antes de abrir
 * la práctica; la administración sube un juego general para los cursos que no tengan las suyas. Las fotos se reducen en
 * el navegador (lado mayor 1600 px, JPEG) antes de subirlas. Solo cambian lo que se ve por el ocular, nunca la nota.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PhotoInfo } from '../../../worker/core/service';
import { PHOTO_LABS, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, PHOTO_OBJECTIVES, PHOTO_SLOTS, type PhotoLab, type PhotoSlot } from '../../practices/photo-slots';
import { assetById } from '../../simulation/specimens/assets';
import { useShell } from '../shell';
import { ApiFailure, api } from './api';
import { previewPhotosOf } from './labPhotos';
import { Notice, errorText } from './ui';

type Target = { kind: 'course'; courseId: string } | { kind: 'general' };

/** Reduce y recomprime la foto elegida (JPEG); devuelve el cuerpo de la subida. */
async function prepare(file: File) {
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error('INVALID_PHOTO');
  });
  const k = Math.min(1, PHOTO_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  for (const q of [0.86, 0.75, 0.62]) {
    const url = c.toDataURL('image/jpeg', q);
    const dataB64 = url.slice(url.indexOf(',') + 1);
    if ((dataB64.length * 3) / 4 <= PHOTO_MAX_BYTES) return { dataB64, contentType: 'image/jpeg', width: w, height: h };
  }
  throw new Error('PHOTO_TOO_LARGE');
}

function Cell({ own, inherited, busy, label, onPick, onRemove }: {
  own: PhotoInfo | undefined;
  inherited: PhotoInfo | undefined;
  busy: boolean;
  label: string;
  onPick: (f: File) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const shown = own ?? inherited;
  return (
    <td className="pf-photo-cell">
      {shown ? (
        <a href={shown.url} target="_blank" rel="noreferrer" className="pf-photo-thumb" title={t('pf.photos.open')}>
          <img src={shown.url} alt={label} loading="lazy" width={88} height={66} />
        </a>
      ) : <span className="pf-photo-empty">{t('pf.photos.illustration')}</span>}
      {!own && inherited && <span className="pf-tag">{t('pf.photos.general')}</span>}
      <span className="pf-photo-actions">
        <label className={`btn small ${busy ? 'disabled' : ''}`}>
          {busy ? t('pf.photos.uploading') : own ? t('pf.photos.replace') : t('pf.photos.upload')}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} aria-label={`${t('pf.photos.upload')}: ${label}`}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
        </label>
        {own && <button type="button" className="btn small ghost" disabled={busy} onClick={onRemove} aria-label={`${t('pf.photos.remove')}: ${label}`}>{t('pf.photos.remove')}</button>}
      </span>
    </td>
  );
}

function LabPhotos({ target, lab }: { target: Target; lab: PhotoLab }) {
  const { t } = useTranslation();
  const [own, setOwn] = useState<PhotoInfo[] | null>(null);
  const [general, setGeneral] = useState<PhotoInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const base = target.kind === 'course' ? `/teacher/courses/${target.courseId}/photos/${lab}` : `/admin/photos/${lab}`;
  const load = useCallback(() => {
    if (target.kind === 'course') {
      api<{ course: PhotoInfo[]; general: PhotoInfo[] }>('GET', base).then((r) => { setOwn(r.course); setGeneral(r.general); }).catch((e) => setMsg({ kind: 'error', text: errorText(e) }));
    } else {
      api<PhotoInfo[]>('GET', base).then(setOwn).catch((e) => setMsg({ kind: 'error', text: errorText(e) }));
    }
  }, [base, target.kind]);
  useEffect(load, [load]);

  const find = (list: PhotoInfo[], a: string, x: number) => list.find((p) => p.assetId === a && p.objective === x);
  const name = (a: string) => assetById(a)?.name ?? a;
  const upload = async (a: string, x: number, f: File) => {
    setBusy(`${a}:${x}`);
    setMsg(null);
    try {
      await api('PUT', `${base}/${a}/${x}`, await prepare(f));
      setMsg({ kind: 'ok', text: t('pf.photos.saved', { name: name(a), x }) });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e instanceof Error && !(e instanceof ApiFailure) ? e.message : e) });
    } finally {
      setBusy(null);
    }
  };
  const remove = async (a: string, x: number) => {
    setBusy(`${a}:${x}`);
    try {
      await api('DELETE', `${base}/${a}/${x}`);
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const rows = (slots: PhotoSlot[]) => slots.map(({ assetId: a }) => (
    <tr key={a}>
      <th scope="row">{name(a)}</th>
      {PHOTO_OBJECTIVES.map((x) => (
        <Cell key={x} own={own ? find(own, a, x) : undefined} inherited={find(general, a, x)} busy={busy === `${a}:${x}`} label={`${name(a)} · ${x}X`}
          onPick={(f) => void upload(a, x, f)} onRemove={() => void remove(a, x)} />
      ))}
    </tr>
  ));
  const head = (
    <thead><tr><th>{t('pf.photos.sample')}</th>{PHOTO_OBJECTIVES.map((x) => <th key={x}>{x}X</th>)}</tr></thead>
  );
  const main = PHOTO_SLOTS[lab].filter((s) => !s.scenario);
  const extra = PHOTO_SLOTS[lab].filter((s) => s.scenario);
  return (
    <>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {own === null ? <p className="pf-empty">{t('pf.loading')}</p> : (
        <>
          <div className="table-scroll"><table className="pf-table pf-photos">{head}<tbody>{rows(main)}</tbody></table></div>
          {extra.length > 0 && (
            <details className="pf-photo-extra">
              <summary>{t('pf.photos.scenarios', { n: extra.length })}</summary>
              <div className="table-scroll"><table className="pf-table pf-photos">{head}<tbody>{rows(extra)}</tbody></table></div>
            </details>
          )}
        </>
      )}
      {target.kind === 'course' && (
        <div className="pf-row-end">
          <button type="button" className="btn" onClick={() => { previewPhotosOf(target.courseId); useShell.getState().open(lab); }}>{t('pf.photos.try')}</button>
        </div>
      )}
    </>
  );
}

export function PhotoManager({ target, labs }: { target: Target; labs?: PhotoLab[] }) {
  const { t } = useTranslation();
  const list = labs?.length ? labs : [...PHOTO_LABS];
  const [lab, setLab] = useState<PhotoLab>(list[0]);
  const current = list.includes(lab) ? lab : list[0];
  return (
    <>
      <p className="pf-muted">{t(target.kind === 'course' ? 'pf.photos.leadCourse' : 'pf.photos.leadGeneral')}</p>
      <div className="pf-tabs" role="tablist" aria-label={t('pf.photos.title')}>
        {list.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={l === current} className={`pf-tab ${l === current ? 'on' : ''}`} onClick={() => setLab(l)}>{t(`menu.labs.${l}.title`)}</button>
        ))}
      </div>
      <LabPhotos key={`${current}:${target.kind === 'course' ? target.courseId : '*'}`} target={target} lab={current} />
    </>
  );
}
