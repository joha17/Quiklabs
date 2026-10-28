import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from '../locales/es/translation.json';
import es3 from '../locales/es/practice3.json';
import es4 from '../locales/es/practice4.json';
import es5 from '../locales/es/practice5.json';
import es6 from '../locales/es/practice6.json';
import es01 from '../locales/es/practice01.json';
import es07 from '../locales/es/practice7.json';
import es08 from '../locales/es/practice8.json';
import es09 from '../locales/es/practice9.json';
import es10 from '../locales/es/practice10.json';
import esB01 from '../locales/es/practiceB01.json';
import esB02 from '../locales/es/practiceB02.json';
import esB03 from '../locales/es/practiceB03.json';
import esLanding from '../locales/es/landing.json';
import esPlatform from '../locales/es/platform.json';

void i18n.use(initReactI18next).init({
  // Las prácticas 3 a 6 y 10, el menú de laboratorios y la página de inicio tienen su propio archivo (claves `p01.*`, `p3.*`–`p9.*` y `p10.*`, `p3fb.*`–`p9fb.*` y `p10fb.*`, `menu.*`, `landing.*`).
  resources: { es: { translation: { ...es, ...es3, ...es4, ...es5, ...es6, ...es01, ...es07, ...es08, ...es09, ...es10, ...esB01, ...esB02, ...esB03, ...esLanding, ...esPlatform } } },
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
