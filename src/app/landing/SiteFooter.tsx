/**
 * Pie del sitio (portada y páginas legales): marca y descripción de la empresa, enlaces rápidos, soluciones, contacto
 * y la barra inferior con las políticas. Los datos de contacto vienen de `landing.footer.contact` (locales/es/landing.json):
 * un campo vacío no se muestra.
 */
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useShell, type Route } from '../shell';

export const LEGAL_DOCS = ['privacidad', 'terminos', 'cookies', 'accesibilidad'] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

interface Link {
  label: string;
  href: string;
}

const list = <T,>(key: string): T[] => {
  const r = i18n.t(key, { returnObjects: true }) as unknown;
  return Array.isArray(r) ? (r as T[]) : [];
};

/** En la portada los anclajes desplazan; desde otra página primero vuelven a la portada. */
function useAnchor() {
  const open = useShell((s) => s.open);
  const route = useShell((s) => s.lab);
  return (href: string) => (e: MouseEvent) => {
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('http')) return;
    const id = href.replace('#', '');
    if ((LEGAL_DOCS as readonly string[]).includes(id) || id === 'login' || id === 'panel') {
      e.preventDefault();
      open(id as Route);
      return;
    }
    e.preventDefault();
    const go = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (route !== null) {
      open(null);
      window.setTimeout(go, 120);
    } else go();
  };
}

export function SiteFooter() {
  const { t } = useTranslation();
  const anchor = useAnchor();
  const c = i18n.t('landing.footer.contact', { returnObjects: true }) as Record<string, string>;
  const quick = list<Link>('landing.footer.quick');
  const solutions = list<Link>('landing.footer.solutions');
  const mail = (subject: string) => `mailto:${c.email}?subject=${encodeURIComponent(subject)}`;
  const wa = (c.whatsapp ?? '').replace(/\D/g, '');
  return (
    <footer className="lp-site-footer" data-cam="end" id="contacto">
      <div className="lp-sf-grid">
        <div className="lp-sf-about">
          <div className="lp-brand lp-sf-brand"><span>{t('landing.brand')}</span></div>
          <p>{t('landing.footer.about')}</p>
        </div>
        <nav aria-labelledby="lp-sf-quick">
          <h2 id="lp-sf-quick">{t('landing.footer.quickTitle')}</h2>
          <ul>{quick.map((l) => <li key={l.label}><a href={l.href} onClick={anchor(l.href)}>{l.label}</a></li>)}</ul>
        </nav>
        <nav aria-labelledby="lp-sf-sol">
          <h2 id="lp-sf-sol">{t('landing.footer.solutionsTitle')}</h2>
          <ul>
            {solutions.map((l) => {
              const href = l.href.startsWith('mailto') && c.email ? mail(l.label) : l.href;
              return <li key={l.label}><a href={href} onClick={anchor(href)}>{l.label}</a></li>;
            })}
          </ul>
        </nav>
        <div>
          <h2>{t('landing.footer.contactTitle')}</h2>
          <ul>
            {c.email && <li><a href={`mailto:${c.email}`}>{c.email}</a></li>}
            {c.phone && <li><a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></li>}
            {wa && <li><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">{t('landing.footer.whatsapp')}</a></li>}
            {c.email && <li><a href={mail(t('landing.footer.demoSubject'))}>{t('landing.footer.demo')}</a></li>}
            {c.location && <li className="lp-sf-plain">{c.location}</li>}
          </ul>
        </div>
      </div>
      <div className="lp-sf-bottom">
        <p>{t('landing.footer.copy', { year: new Date().getFullYear() })}</p>
        <p className="lp-sf-note">{t('landing.footer.privacy')}</p>
        <nav aria-label={t('landing.footer.legalTitle')}>
          <ul>{LEGAL_DOCS.map((d) => <li key={d}><a href={`#${d}`} onClick={anchor(`#${d}`)}>{t(`landing.legal.${d}.short`)}</a></li>)}</ul>
        </nav>
      </div>
    </footer>
  );
}
