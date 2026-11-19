import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Todos los archivos de textos de src/locales/es/ (uno por práctica, más menú, portada y plataforma): un laboratorio
// nuevo solo agrega su archivo. Las claves no se repiten entre archivos (cada uno usa su prefijo: `p3.*`, `f09.*`…).
const files = import.meta.glob<Record<string, unknown>>('../locales/es/*.json', { eager: true, import: 'default' });
const translation = Object.assign({}, ...Object.values(files)) as Record<string, unknown>;

void i18n.use(initReactI18next).init({
  resources: { es: { translation } },
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
