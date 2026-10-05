/**
 * Página de inicio de Quiklabs. Detrás del contenido hay una escena Three.js en «dibujo lineal» (LabBackdrop) que la
 * cámara recorre con el scroll: matraz gigante en el inicio, una valoración real (HCl + NaOH con fenolftaleína) que
 * avanza con el scroll o con la tarjeta, una mesada isométrica y moléculas. Los titulares van en «píldoras» de color.
 * La lista de laboratorios (LabCards) se integra con los mismos botones de entrada del menú anterior.
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import '@fontsource-variable/nunito';
import { LabCards } from '../LabMenu';
import i18n, { tList } from '../i18n';
import type { CamKey, LabBackdrop } from './scene/LabBackdrop';
import { EQUIVALENCE_ML, TITRATION, phenolphthaleinPink, titrationPH } from './scene/titration';
import './landing.css';

const IMG = (name: string) => `${import.meta.env.BASE_URL}landing/${name}.webp`;
const SLIDES = ['na', 'rack', 'swirl', 'flame', 'nail', 'yellow'];

type Seg = { t: string; pill?: 'teal' | 'white' | 'coral' | 'ink' | 'yellow'; muted?: boolean };
interface Item {
  title: string;
  text: string;
}

function objList<T>(key: string): T[] {
  const r = i18n.t(key, { returnObjects: true }) as unknown;
  return Array.isArray(r) ? (r as T[]) : [];
}

/** Titular con palabras resaltadas en píldoras de color (como la referencia). */
function Pills({ k, as: Tag = 'h2', id, className = '' }: { k: string; as?: 'h1' | 'h2' | 'p'; id?: string; className?: string }) {
  const segs = objList<Seg>(k);
  return (
    <Tag id={id} className={`lp-pills ${className}`}>
      {segs.map((s, i) => (
        <span key={i} className={s.pill ? `pill pill-${s.pill}` : s.muted ? 'muted' : 'plain'}>{s.t}</span>
      ))}
    </Tag>
  );
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const fmt = (n: number, d: number) => n.toFixed(d).replace('.', ',');

/** Carrusel accesible con desplazamiento «snap», flechas y puntos. Solo muestra las imágenes que existen. */
function Gallery() {
  const { t } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const slides = SLIDES.filter((s) => ok[s] !== false);
  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const kids = [...el.children] as HTMLElement[];
    const n = (i + kids.length) % Math.max(1, kids.length);
    const child = kids[n];
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: reduced() ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const kids = [...el.children] as HTMLElement[];
      let best = 0;
      let bd = Infinity;
      kids.forEach((k, i) => {
        const d = Math.abs(k.offsetLeft - el.offsetLeft - el.scrollLeft);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      setIdx(best);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  if (slides.length === 0) return null;
  return (
    <div className="lp-gallery" role="region" aria-roledescription="carrusel" aria-label={t('landing.gallery.label')}>
      <div className="lp-track" ref={track} tabIndex={0} aria-label={t('landing.gallery.label')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            go(idx + (e.key === 'ArrowRight' ? 1 : -1));
          }
        }}>
        {slides.map((s, i) => (
          <figure key={s} className="lp-slide" aria-roledescription="diapositiva" aria-label={`${i + 1} / ${slides.length}`}>
            <img src={IMG(s)} alt={t(`landing.gallery.${s}`)} width={1600} height={1000} loading="lazy" decoding="async"
              onError={() => setOk((o) => ({ ...o, [s]: false }))} />
            <figcaption>{t(`landing.gallery.${s}`)}</figcaption>
          </figure>
        ))}
      </div>
      <div className="lp-gallery-ctl">
        <button type="button" className="lp-arrow" onClick={() => go(idx - 1)} aria-label={t('landing.gallery.prev')}>←</button>
        <div className="lp-dots">
          {slides.map((s, i) => (
            <button key={s} type="button" className={`lp-dot ${i === idx ? 'on' : ''}`} aria-label={t('landing.gallery.goTo', { n: i + 1 })} aria-current={i === idx} onClick={() => go(i)} />
          ))}
        </div>
        <button type="button" className="lp-arrow" onClick={() => go(idx + 1)} aria-label={t('landing.gallery.next')}>→</button>
      </div>
    </div>
  );
}

/** Tarjeta flotante de la valoración: muestra el estado del simulador y permite agregar o quitar NaOH. */
function TitrationCard({ ml, manual, onStep, onAuto }: { ml: number; manual: boolean; onStep: (d: number) => void; onAuto: () => void }) {
  const { t } = useTranslation();
  const ph = titrationPH(ml);
  const pink = phenolphthaleinPink(ph);
  const color = pink < 0.05 ? t('landing.sim.colorless') : pink < 0.6 ? t('landing.sim.palePink') : t('landing.sim.pink');
  return (
    <aside className="lp-card" aria-label={t('landing.sim.card')}>
      <div className="lp-card-head">
        <strong>{t('landing.sim.card')}</strong>
        <span className="lp-swatch" style={{ background: `color-mix(in srgb, #e2408a ${Math.round(pink * 100)}%, #ffffff)` }} aria-hidden="true" />
      </div>
      <p className="lp-card-sub">{t('landing.sim.acid')}</p>
      <dl className="lp-card-data">
        <div><dt>{t('landing.sim.added')}</dt><dd>{fmt(ml, 1)} mL</dd></div>
        <div><dt>{t('landing.sim.ph')}</dt><dd>{fmt(ph, 2)}</dd></div>
      </dl>
      <div className="lp-meter" aria-hidden="true">
        <span style={{ width: `${(ml / TITRATION.maxMl) * 100}%`, background: pink > 0.05 ? '#e2408a' : '#2b8c88' }} />
        <i style={{ left: `${(EQUIVALENCE_ML / TITRATION.maxMl) * 100}%` }} title={t('landing.sim.eq')} />
      </div>
      <p className="sr-only" aria-live="polite">{t('landing.sim.live', { ml: fmt(ml, 1), ph: fmt(ph, 1), color })}</p>
      <p className="lp-card-color">{color}</p>
      <div className="lp-card-btns">
        <button type="button" className="lp-mini" onClick={() => onStep(-0.5)} aria-label={t('landing.sim.less')}>−</button>
        <button type="button" className="lp-mini" onClick={() => onStep(0.5)} aria-label={t('landing.sim.more')}>+</button>
        {manual && <button type="button" className="lp-mini lp-mini-text" onClick={onAuto}>{t('landing.sim.auto')}</button>}
      </div>
    </aside>
  );
}

export function Landing() {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const backdrop = useRef<LabBackdrop | null>(null);
  const [scrollMl, setScrollMl] = useState(0);
  const [manualMl, setManualMl] = useState<number | null>(null);
  const ml = manualMl ?? scrollMl;
  const features = objList<Item>('landing.features.items');
  const stats = objList<{ n: string; label: string }>('landing.value.stats');
  const steps = objList<Item>('landing.how.steps');

  // Escena 3D: se carga aparte (Three.js) y se omite si no hay WebGL.
  useEffect(() => {
    let disposed = false;
    let bd: LabBackdrop | null = null;
    const el = canvas.current;
    if (!el) return;
    // Vista de cámara según la sección centrada; mL de la valoración según el avance dentro de su sección.
    const update = () => {
      const b = backdrop.current;
      const vh = window.innerHeight;
      const marks = [...document.querySelectorAll<HTMLElement>('[data-cam]')].map((m) => {
        const r = m.getBoundingClientRect();
        return { key: m.dataset.cam as CamKey, c: r.top + r.height / 2 - vh / 2 };
      });
      if (marks.length === 0) return;
      let i = 0;
      while (i < marks.length - 1 && marks[i + 1].c <= 0) i++;
      const a = marks[i];
      const n = marks[Math.min(i + 1, marks.length - 1)];
      const tt = a === n || a.c > 0 ? 0 : -a.c / Math.max(1, n.c - a.c);
      b?.setView(a.key, n.key, tt);
      const tm = marks.filter((m) => m.key === 'titration');
      if (tm.length >= 2) {
        const f = Math.min(1, Math.max(0, -tm[0].c / Math.max(1, tm[tm.length - 1].c - tm[0].c)));
        setScrollMl(Math.round(f * TITRATION.maxMl * 10) / 10);
      }
    };
    void import('./scene/LabBackdrop').then(({ LabBackdrop }) => {
      if (disposed) return;
      try {
        bd = new LabBackdrop(el, reduced());
      } catch {
        el.dataset.failed = 'true';
        return;
      }
      backdrop.current = bd;
      bd.start();
      update();
    });
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    };
    const onResize = () => {
      backdrop.current?.resize();
      update();
    };
    const onPointer = (e: PointerEvent) => backdrop.current?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    const onVis = () => (document.hidden ? backdrop.current?.stop() : backdrop.current?.start());
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    update();
    return () => {
      disposed = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVis);
      bd?.dispose();
      backdrop.current = null;
    };
  }, []);

  useEffect(() => {
    backdrop.current?.setTitration(ml);
  }, [ml]);

  const scrollTo = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="lp">
      <canvas ref={canvas} className="lp-stage" aria-hidden="true" />
      <a className="lp-skip" href="#lp-main" onClick={scrollTo('lp-main')}>{t('landing.skip')}</a>
      <header className="lp-nav">
        <a className="lp-brand" href="#top" onClick={scrollTo('top')} aria-label={t('landing.brand')}>
          <svg className="lp-logo" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M15 4h10v3h-1.5v9.5l9.6 16a3 3 0 0 1-2.6 4.5H9.5a3 3 0 0 1-2.6-4.5l9.6-16V7H15z" fill="#f8f7f4" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <path className="lp-logo-liquid" d="M12 25h16l4.4 7.4a1.5 1.5 0 0 1-1.3 2.3H8.9a1.5 1.5 0 0 1-1.3-2.3z" />
          </svg>
          <span>{t('landing.brand')}</span>
        </a>
        <nav aria-label={t('landing.nav.label')} className="lp-nav-links">
          <a className="lp-chip" href="#labs" onClick={scrollTo('labs')}>{t('landing.nav.labs')}</a>
          <a className="lp-chip" href="#teachers" onClick={scrollTo('teachers')}>{t('landing.nav.teachers')}</a>
        </nav>
      </header>

      <main id="lp-main">
        <section className="lp-hero" id="top" data-cam="hero" aria-labelledby="lp-hero-title">
          <h1 id="lp-hero-title" className="lp-wordmark">
            {tList('landing.hero.wordmark').map((w) => <span key={w}>{w}</span>)}
          </h1>
          <p className="lp-hero-kicker">{t('landing.hero.kicker')}</p>
          <p className="lp-scroll-hint" aria-hidden="true">{t('landing.hero.scroll')} ↓</p>
        </section>

        <section className="lp-section lp-statement" data-cam="statement">
          <Pills k="landing.hero.statement" className="lp-xl" />
          <p className="lp-lead"><strong>{t('landing.hero.leadStrong')}</strong> {t('landing.hero.lead')}</p>
          <div className="lp-ctas">
            <a className="lp-btn lp-btn-teal" href="#labs" onClick={scrollTo('labs')}>{t('landing.hero.primary')} →</a>
            <a className="lp-btn" href="#how" onClick={scrollTo('how')}>{t('landing.hero.secondary')}</a>
          </div>
        </section>

        <section className="lp-section lp-gallery-sec" data-cam="gallery" aria-labelledby="lp-gal-title">
          <Pills k="landing.gallery.title" id="lp-gal-title" />
          <Gallery />
        </section>

        <section className="lp-titr" aria-labelledby="lp-sim-title">
          <div data-cam="titration" className="lp-mark" />
          <div className="lp-titr-sticky">
            <div className="lp-section lp-titr-text">
              <Pills k="landing.sim.title" id="lp-sim-title" />
              <p className="lp-lead">{t('landing.sim.lead')}</p>
            </div>
            <TitrationCard ml={ml} manual={manualMl !== null}
              onStep={(d) => setManualMl(Math.min(TITRATION.maxMl, Math.max(0, Math.round(((manualMl ?? scrollMl) + d) * 10) / 10)))}
              onAuto={() => setManualMl(null)} />
          </div>
          <div data-cam="titration" className="lp-mark lp-mark-end" />
        </section>

        <section className="lp-section lp-labs-sec" id="labs" data-cam="labs" aria-labelledby="lp-labs-title">
          <div className="lp-kicker">{t('landing.labs.kicker')}</div>
          <Pills k="landing.labs.title" id="lp-labs-title" />
          <p className="lp-lead">{t('landing.labs.lead')}</p>
          <div className="lp-labs">
            <h3 className="lp-labs-title">{t('menu.title')}</h3>
            <LabCards />
            <p className="lp-note">{t('menu.note')}</p>
          </div>
        </section>

        <section className="lp-section" data-cam="features" aria-labelledby="lp-feat-title">
          <div className="lp-kicker">{t('landing.features.kicker')}</div>
          <Pills k="landing.features.title" id="lp-feat-title" />
          <ol className="lp-features">
            {features.map((f, i) => (
              <li key={f.title}>
                <span className="lp-num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section" data-cam="value" aria-labelledby="lp-value-title">
          <Pills k="landing.value.title" id="lp-value-title" className="lp-xl" />
          <p className="lp-lead">{t('landing.value.text')}</p>
          <dl className="lp-stats">
            {stats.map((s) => (
              <div key={s.label}>
                <dt>{s.n}</dt>
                <dd>{s.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lp-section" id="how" data-cam="how" aria-labelledby="lp-how-title">
          <div className="lp-kicker">{t('landing.how.kicker')}</div>
          <Pills k="landing.how.title" id="lp-how-title" />
          <ol className="lp-steps">
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="lp-step-n" aria-hidden="true">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-teachers" id="teachers" data-cam="teachers" aria-labelledby="lp-teach-title">
          <div className="lp-teach-box">
            <div>
              <div className="lp-kicker">{t('landing.teachers.kicker')}</div>
              <Pills k="landing.teachers.title" id="lp-teach-title" />
              <p className="lp-lead">{t('landing.teachers.lead')}</p>
              <a className="lp-btn lp-btn-light" href="#labs" onClick={scrollTo('labs')}>{t('landing.teachers.cta')} →</a>
            </div>
            <ul className="lp-checks">
              {tList('landing.teachers.items').map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </section>
      </main>

      <footer className="lp-footer" data-cam="end">
        <div className="lp-brand"><span>{t('landing.brand')}</span></div>
        <p>{t('landing.footer.tagline')}</p>
        <p>{t('landing.footer.privacy')}</p>
        <p className="lp-copy">{t('landing.footer.copy', { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
