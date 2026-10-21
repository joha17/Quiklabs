import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import { p09NameOf } from './describe';

/** Grupos por estación. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['ppeTray', 'smp1', 'cyl10'] },
  { key: 'B', ids: ['hood01', 'emitter01', 'loop01', 'clean01', 'ctlSr', 'ctlK', 'ctlNa', 'ctlLi', 'ctlCa', 'ctlBlank', 'ctlNaK', 'spec01'] },
  { key: 'C', ids: ['wgFlame', 'cupFlame'] },
  { key: 'D', ids: ['rack01', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'dbSO4', 'dbOH', 'dbH2O', 'washBottle', 'pip', 'bk1', 'cf01', 'turb01', 'balance01'] },
  { key: 'F', ids: ['wasteLiq', 'wasteSol'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§13). */
export function Inventory09() {
  const { t } = useTranslation();
  useP09((s) => s.version);
  const rt = useP09((s) => s.runtime);
  const stage = useP09((s) => s.stage);
  const selected = useP09((s) => s.selected);
  const select = useP09((s) => s.select);
  const toggle = useP09((s) => s.toggleInventory);
  if (!rt) return null;
  const w = rt.world;
  return (
    <aside className="drawer left" aria-label={t('inv.title')}>
      <div className="drawer-head">
        <h2>{t('inv.title')}</h2>
        <span className="grow" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        {GROUPS.map((g) => (
          <div key={g.key} className="inv-group">
            <h3>{t(`p9.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {p09NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
