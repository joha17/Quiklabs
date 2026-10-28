import { useTranslation } from 'react-i18next';
import { useB03 } from './store';
import { b03NameOf } from './describe';

/** Grupos por estación. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['mt', 'md1', 'md2', 'md3', 'md4', 'mdx', 'mwp', 'mce', 'mpf', 'sk', 'c1', 'bW', 'bI', 'co'] },
  { key: 'B', ids: ['c2', 'bE', 'bN', 'g1', 'pi', 'rb', 'rk', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 'dBi', 'dAg', 'cw'] },
  { key: 'C', ids: ['c3', 'bS', 'bSc', 'bL', 'g2', 'th'] },
  { key: 'D', ids: ['prepBoard', 'el', 'dw', 'n09', 'n5', 'sl1', 'sl2', 'sl3', 'sl4', 'cvBox', 'fc', 'pp', 'lp'] },
  { key: 'E', ids: ['mic', 'cleanTray'] },
  { key: 'F', ids: ['ppeTray', 'glassBin', 'bioWaste', 'trashBin'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§13). */
export function InventoryB03() {
  const { t } = useTranslation();
  useB03((s) => s.version);
  const rt = useB03((s) => s.runtime);
  const stage = useB03((s) => s.stage);
  const selected = useB03((s) => s.selected);
  const select = useB03((s) => s.select);
  const toggle = useB03((s) => s.toggleInventory);
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
            <h3>{t(`b03.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {b03NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
