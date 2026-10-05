import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from '../locales/es/translation.json';
import es3 from '../locales/es/practice3.json';
import es4 from '../locales/es/practice4.json';
import esLanding from '../locales/es/landing.json';

void i18n.use(initReactI18next).init({
  // Las prácticas 3 y 4, el menú de laboratorios y la página de inicio tienen su propio archivo (claves `p3.*`, `p4.*`, `p3fb.*`, `p4fb.*`, `menu.*`, `landing.*`).
  resources: { es: { translation: { ...es, ...es3, ...es4, ...esLanding } } },
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
