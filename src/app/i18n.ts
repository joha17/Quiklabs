import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from '../locales/es/translation.json';

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es } },
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
