import { useTranslation } from 'react-i18next';
import { useLab } from '../store';
import { STATIONS, stationOf } from '../../practices/practice-02/definition';
import { nameOf } from '../describe';
import { SPARE_KINDS } from '../../simulation/world/commands';

/** Estante lateral: lista accesible de todo el material, agrupado por estación. */
export function Inventory() {
  const { t } = useTranslation();
  useLab((s) => s.version);
  const rt = useLab((s) => s.runtime);
  const stage = useLab((s) => s.stage);
  const selected = useLab((s) => s.selected);
  const select = useLab((s) => s.select);
  const dispatch = useLab((s) => s.dispatch);
  const toggle = useLab((s) => s.toggleInventory);
  const toast = useLab((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  const items = [
    ...Object.values(w.vessels).filter((v) => v.support !== 'glass_waste' && v.support !== 'funnel').map((v) => ({ id: v.id, x: v.pose.x })),
    ...Object.values(w.props).filter((p) => p.kind !== 'tray' && p.support !== 'glass_waste').map((p) => ({ id: p.id, x: p.pose.x })),
  ];
  return (
    <aside className="drawer left" aria-label={t('inv.title')}>
      <div className="drawer-head">
        <h2>{t('inv.title')}</h2>
        <span className="grow" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        {STATIONS.map((s) => (
          <div key={s.id} className="inv-group">
            <h3>{s.id} · {t(`station.${s.id}`)}</h3>
            {items.filter((i) => stationOf(i.x) === s.id).sort((a, b) => a.x - b.x).map((i) => (
              <button key={i.id} className="inv-item" aria-current={selected === i.id} onClick={() => { select(i.id); stage?.focusObject(i.id); }}>
                {nameOf(w, i.id)}
              </button>
            ))}
          </div>
        ))}
        <div className="inv-group">
          <h3>{t('inv.spare')}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
            {SPARE_KINDS.map((k) => (
              <button key={k} className="btn small" onClick={() => {
                const r = dispatch({ type: 'requestSpare', kind: k });
                if (r.id) { select(r.id); stage?.focusObject(r.id); }
                else if (r.code) toast('warn', t(`cmd.${r.code}`));
              }}>+ {t(`inv.spare${k}`)}</button>
            ))}
          </div>
          <p className="hint">{t('inv.spareNote')}</p>
        </div>
      </div>
    </aside>
  );
}
