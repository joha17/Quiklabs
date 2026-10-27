import { useTranslation } from 'react-i18next';
import { useB02 } from './store';
import { b02NameOf } from './describe';

/** Grupos por estación. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['ppeTray', 'glassBin', 'bioWaste', 'trashBin'] },
  { key: 'B', ids: ['prepBoard', 'board', 'el', 'pot', 'tom', 'pep', 'car', 'pea', 'gua', 'app', 'sl1', 'sl2', 'sl3', 'sl4', 'sl5', 'sl6', 'cvBox', 'dw', 'iod', 'mb', 'eo', 'fc', 'sc', 'sp', 'pp', 'lp', 'ctl1', 'ctl2', 'ctl3', 'ctl4'] },
  { key: 'C', ids: ['mic'] },
  { key: 'D', ids: ['prep2', 'swb', 'sw1', 'sw2', 'sw3', 'bucc', 'case', 'fx1', 'fx2'] },
  { key: 'E', ids: ['ste', 'stTray', 'leaf1', 'ins1'] },
  { key: 'F', ids: ['cleanTray'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§13). */
export function InventoryB02() {
  const { t } = useTranslation();
  useB02((s) => s.version);
  const rt = useB02((s) => s.runtime);
  const stage = useB02((s) => s.stage);
  const selected = useB02((s) => s.selected);
  const select = useB02((s) => s.select);
  const toggle = useB02((s) => s.toggleInventory);
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
            <h3>{t(`b02.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {b02NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
