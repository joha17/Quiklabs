import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from '../locales/es/translation.json';
import es3 from '../locales/es/practice3.json';

void i18n.use(initReactI18next).init({
  // La Práctica 3 y el menú de laboratorios tienen su propio archivo (claves `p3.*`, `p3fb.*` y `menu.*`).
  resources: { es: { translation: { ...es, ...es3 } } },
  lng: 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

export const t = (key: string, opts?: Record<string, unknown>): string => {
  const r = i18n.t(key, { ...(opts ?? {}), returnObjects: false });
  return typeof r === 'string' ? r : key;
};

export const tList = (key: string): string[] => {
  const r = i18n.t(key, { returnObjects: true }) as unknown;
  return Array.isArray(r) ? (r as string[]) : [];
};

export default i18n;
