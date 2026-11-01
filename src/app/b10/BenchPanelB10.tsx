import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB10 } from './store';
import type { AnimalCommand } from '../../simulation/animal-world/commands';
import type { MaterialClass, MaterialInstrument } from '../../simulation/animal-world/types';
import { MATERIALS } from '../../simulation/animal-world/materials';

const CLASSES: MaterialClass[] = ['slide', 'specimen', 'model', 'track'];
const INSTRUMENTS: MaterialInstrument[] = ['microscope', 'stereo', 'viewer'];

/**
 * Mesa de orientación de B10 (§5, etapa 1): el estudiante decide qué es cada material y con qué se observa antes de tocar los instrumentos.
 * Cada selector envía su decisión; el resultado no se muestra aquí, se evalúa con los demás hechos del intento.
 */
export function BenchPanelB10() {
  const { t } = useTranslation();
  useB10((s) => s.version);
  const rt = useB10((s) => s.runtime);
  const sel = useB10((s) => s.selected);
  const dispatch = useB10((s) => s.dispatch);
  const toast = useB10((s) => s.toast);
  const demo = useB10((s) => !!s.demo);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (sel === 'orient') setOpen(true);
  }, [sel]);
  if (!rt || !open) return null;
  const a = rt.world.animal;
  const D = (c: AnimalCommand) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k = `b10.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b10.cmd.FAILED'));
    }
  };
  return (
    <section className={demo ? 'bench-panel in-demo' : 'bench-panel'} role="dialog" aria-label={t('b10.bench.title')} data-testid="b10-bench" style={{ position: 'absolute', left: '0.6rem', bottom: '3.6rem', zIndex: 13, width: 'min(460px, calc(100% - 1.2rem))', maxHeight: '60%', overflow: 'auto', background: 'var(--panel)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: '0.5rem 0.7rem', fontSize: '0.84rem' }}>
      <div className="row">
        <strong style={{ flex: 1 }}>{t('b10.bench.title')}</strong>
        <button className="btn small ghost" aria-label={t('common.close')} onClick={() => setOpen(false)}>✕</button>
      </div>
      <p className="hint">{t('b10.bench.help')}</p>
      <table className="nb-table">
        <thead><tr><th>{t('b10.bench.material')}</th><th>{t('b10.bench.class')}</th><th>{t('b10.bench.instrument')}</th></tr></thead>
        <tbody>
          {Object.keys(MATERIALS).map((id) => {
            const c = a.cards[id];
            const label = t(`b10.material.${id}`);
            return (
              <tr key={id}>
                <td>{label}</td>
                <td>
                  <select aria-label={`${t('b10.bench.class')}: ${label}`} value={c?.materialClass ?? ''} onChange={(e) => e.target.value && D({ type: 'classifyMaterial', materialId: id, materialClass: e.target.value as MaterialClass, instrument: c?.instrument ?? 'microscope' })}>
                    <option value="">{t('nb.choose')}</option>
                    {CLASSES.map((x) => <option key={x} value={x}>{t(`b10.materialClass.${x}`)}</option>)}
                  </select>
                </td>
                <td>
                  <select aria-label={`${t('b10.bench.instrument')}: ${label}`} value={c?.instrument ?? ''} disabled={!c} onChange={(e) => e.target.value && D({ type: 'classifyMaterial', materialId: id, materialClass: c!.materialClass, instrument: e.target.value as MaterialInstrument })}>
                    <option value="">{t('nb.choose')}</option>
                    {INSTRUMENTS.map((x) => <option key={x} value={x}>{t(`b10.materialInstrument.${x}`)}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {a.videoAssigned && <button className="btn small" onClick={() => D({ type: 'requestVideo', subject: 'daphnia' })}>▶ {t('b10.bench.video')}</button>}
    </section>
  );
}
