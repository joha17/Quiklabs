/**
 * Páginas legales públicas (`#privacidad`, `#terminos`, `#cookies`, `#accesibilidad`): texto en
 * `landing.legal.<doc>` (título, fecha de actualización y secciones con párrafos), con el mismo pie del sitio.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '@fontsource-variable/nunito';
import i18n from '../i18n';
import { useShell } from '../shell';
import { useTheme } from '../theme';
import { SiteFooter, type LegalDoc } from './SiteFooter';
import './landing.css';

interface Section {
  h: string;
  p: string[];
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t } = useTranslation();
  const open = useShell((s) => s.open);
  useTheme();
  const raw = i18n.t(`landing.legal.${doc}.sections`, { returnObjects: true }) as unknown;
  const sections = Array.isArray(raw) ? (raw as Section[]) : [];
  useEffect(() => window.scrollTo(0, 0), [doc]);
  useEffect(() => {
    document.title = `${t(`landing.legal.${doc}.title`)} · ${t('landing.brand')}`;
    return () => {
      document.title = t('landing.brand');
    };
  }, [doc, t]);
  return (
    <div className="lp lp-legal-page">
      <a href="#lp-legal" className="lp-skip">{t('landing.skip')}</a>
      <header className="lp-nav lp-legal-nav">
        <a className="lp-brand" href="./" onClick={(e) => { e.preventDefault(); open(null); }}><span>{t('landing.brand')}</span></a>
        <a className="lp-btn lp-btn-light" href="./" onClick={(e) => { e.preventDefault(); open(null); }}>← {t('landing.legal.back')}</a>
      </header>
      <main id="lp-legal" className="lp-legal">
        <div className="lp-kicker">{t('landing.legal.kicker')}</div>
        <h1>{t(`landing.legal.${doc}.title`)}</h1>
        <p className="lp-legal-date">{t('landing.legal.updated', { date: t(`landing.legal.${doc}.updated`) })}</p>
        <p className="lp-lead">{t(`landing.legal.${doc}.lead`)}</p>
        {sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((x) => <p key={x}>{x}</p>)}
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
