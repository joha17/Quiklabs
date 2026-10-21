import { useTranslation } from 'react-i18next';
import { useB01 } from './store';
import { b01NameOf } from './describe';

/** Grupos por estación. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['ppeTray', 'glassBin', 'bioWaste'] },
  { key: 'B', ids: ['prepBoard', 'el', 'sl1', 'sl2', 'cvBox', 'dw', 'iod', 'fc', 'sc', 'pp', 'lp', 'tw'] },
  { key: 'C', ids: ['mic'] },
  { key: 'D', ids: ['case', 'fx1', 'fx2', 'fx3', 'fx4'] },
  { key: 'E', ids: ['ste', 'stTray', 'leaf1', 'ins1'] },
  { key: 'F', ids: ['cleanTray'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§13). */
export function InventoryB01() {
  const { t } = useTranslation();
  useB01((s) => s.version);
  const rt = useB01((s) => s.runtime);
  const stage = useB01((s) => s.stage);
  const selected = useB01((s) => s.selected);
  const select = useB01((s) => s.select);
  const toggle = useB01((s) => s.toggleInventory);
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
            <h3>{t(`b01.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {b01NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
