import { useTranslation } from 'react-i18next';
import { useB05 } from './store';
import { b05NameTag } from './describe';
import { TUBE_IDS_B05 } from '../../simulation/enz-world/geometry';

/** Grupos por estación. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['ppeTray', 'wAq', 'wCu', 'wBio', 'glassBin', 'bioWaste', 'trashBin'] },
  { key: 'B', ids: ['bal', 'wb', 'jS', 'jA', 'sp2', 'liv', 'livB', 'livH', 'bdL', 'ls', 'hp1', 'hp2', 'sb1', 'sb2', 'bk1', 'bk2', 'bk3', 'g100', 'g25', 'g10', 'bW'] },
  { key: 'C', ids: ['wb1', 'wb2', 'tg', 'th'] },
  { key: 'D', ids: ['hp', 'hpOld', 'rk1', ...TUBE_IDS_B05.slice(0, 8), 'p1', 'p5', 'p10', 'gc', 'sw1', 'rb'] },
  { key: 'E', ids: ['st1', 'naoh', 'rk2', ...TUBE_IDS_B05.slice(8), 'dL', 'dB', 'dH', 'dN', 'dw2', 'ps', 'sw2'] },
  { key: 'F', ids: ['prepBoard', 'board', 'pot', 'dw', 'iod', 'sl1', 'sl2', 'sl3', 'cvBox', 'fc', 'sc', 'sp', 'pp', 'lp', 'mic', 'cleanTray'] },
  { key: 'G', ids: ['uv', 'cq', 'cs', 'cp', 'nad', 'eth', 'eth2', 'meth', 'adh', 'bn'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§14). */
export function InventoryB05() {
  const { t } = useTranslation();
  useB05((s) => s.version);
  const rt = useB05((s) => s.runtime);
  const stage = useB05((s) => s.stage);
  const selected = useB05((s) => s.selected);
  const select = useB05((s) => s.select);
  const toggle = useB05((s) => s.toggleInventory);
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
            <h3>{t(`b05.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {b05NameTag(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
