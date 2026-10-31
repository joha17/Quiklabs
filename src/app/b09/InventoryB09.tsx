import { useTranslation } from 'react-i18next';
import { useB09 } from './store';
import { b09NameOf } from './describe';

/** Grupos por estación. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['ppeTray', 'glassBin', 'bioWaste', 'trashBin'] },
  { key: 'B', ids: ['bean', 'maize', 'branch', 'ste', 'tray', 'leafNet', 'leafPar'] },
  { key: 'C', ids: ['prepBoard', 'board', 'cel', 'pea', 'lea', 'sl1', 'sl2', 'sl3', 'sl4', 'sl5', 'sl6', 'cvBox', 'dw', 'fc', 'sc', 'pp', 'lp', 'tw'] },
  { key: 'D', ids: ['mic', 'case', 'oil', 'fxRT', 'fxRE', 'fxRM', 'fxSE', 'fxSM', 'fxW'] },
  { key: 'E', ids: ['prep2', 'flo', 'hcl', 'fxLE', 'fxLM', 'fxO'] },
  { key: 'F', ids: ['cleanTray'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§13). */
export function InventoryB09() {
  const { t } = useTranslation();
  useB09((s) => s.version);
  const rt = useB09((s) => s.runtime);
  const stage = useB09((s) => s.stage);
  const selected = useB09((s) => s.selected);
  const select = useB09((s) => s.select);
  const toggle = useB09((s) => s.toggleInventory);
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
            <h3>{t(`b09.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {b09NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
