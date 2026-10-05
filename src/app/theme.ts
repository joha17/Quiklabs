/**
 * Tema claro/oscuro de toda la aplicación. Sin elección guardada se sigue el modo del sistema; el botón de la página
 * de inicio fija `data-theme` en <html> (styles.css ya define ambos juegos de tokens) y lo recuerda en este navegador.
 */
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'quiklabs.theme';
const media = () => (typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined);

export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Aplica la elección (o la quita, para volver a seguir el sistema) y la guarda. */
export function applyTheme(pref: Theme | null) {
  const root = document.documentElement;
  if (pref) root.dataset.theme = pref;
  else delete root.dataset.theme;
  try {
    if (pref) localStorage.setItem(KEY, pref);
    else localStorage.removeItem(KEY);
  } catch {
    /* almacenamiento no disponible: el tema vale solo para esta visita */
  }
}

/** Tema efectivo (elección guardada o, si no hay, el del sistema) y un conmutador. */
export function useTheme(): { dark: boolean; toggle: () => void } {
  const [pref, setPref] = useState<Theme | null>(() => storedTheme());
  const [systemDark, setSystemDark] = useState(() => !!media()?.matches);
  useEffect(() => {
    const m = media();
    if (!m) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  const dark = pref ? pref === 'dark' : systemDark;
  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark';
    // Si la elección coincide con el sistema, se vuelve a seguir al sistema.
    const p = (next === 'dark') === systemDark ? null : next;
    applyTheme(p);
    setPref(p);
  };
  return { dark, toggle };
}
