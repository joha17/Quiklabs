/**
 * Fotografías reales del ocular al abrir B01/B02: las del curso por el que el estudiante tiene abierta la práctica (o
 * las generales donde falten). El docente puede probar las de su curso con «Probar en el laboratorio» del panel, que
 * deja el curso elegido para esta pestaña. Sin sesión, sin fotos o si falla la red: el ocular usa las ilustraciones.
 */
import type { PhotoInfo } from '../../../worker/core/service';
import type { PhotoLab } from '../../practices/photo-slots';
import { setEyepiecePhotos } from '../../engine/instruments/optical/photos';
import { api } from './api';
import { labAccess, usePlatform } from './session';

const PREVIEW_KEY = 'quiklabs.fotos.curso';

/** El docente prueba en el laboratorio las fotos del curso `courseId` (solo esta pestaña). */
export function previewPhotosOf(courseId: string) {
  try {
    sessionStorage.setItem(PREVIEW_KEY, courseId);
  } catch {
    /* sin sessionStorage: se ven las generales */
  }
}

function previewCourse(): string | null {
  try {
    return sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

/** Pide las fotos de la práctica y las entrega al ocular; devuelve la limpieza para cuando se cierra la práctica. */
export function loadLabPhotos(labId: PhotoLab): () => void {
  let alive = true;
  const me = usePlatform.getState().me;
  if (me) {
    const course = me.user.role === 'student' ? labAccess(me, labId)?.courseId ?? null : me.user.role === 'teacher' ? previewCourse() : null;
    api<PhotoInfo[]>('GET', `/photos/${labId}${course ? `?course=${encodeURIComponent(course)}` : ''}`)
      .then((list) => {
        if (alive) setEyepiecePhotos(list);
      })
      .catch(() => undefined);
  }
  return () => {
    alive = false;
    setEyepiecePhotos([]);
  };
}
