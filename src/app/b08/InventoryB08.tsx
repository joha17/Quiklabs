import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { b08NameOf } from './describe';

/** Grupos por estación. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['ppeTray', 'board', 'glassBin', 'bioWaste', 'trashBin'] },
  { key: 'D', ids: ['sprigTray', 'el1', 'el2', 'el3', 'el4', 'gasRack', 'gL', 'gD', 'tank', 'coverG', 'lampG'] },
  { key: 'E', ids: ['btbRack', 'bN', 'bL', 'bD', 'elB1', 'elB2', 'coverB', 'btbDrop', 'co2', 'lampB', 'mic', 'case'] },
  { key: 'B', ids: ['hood', 'bA', 'bW', 'bH', 'bE', 'balance', 'leaf', 'mortar', 'sep', 'vial'] },
  { key: 'C', ids: ['stand', 'paper', 'devTube'] },
  { key: 'F', ids: ['organicWaste', 'drain'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§13). */
export function InventoryB08() {
  const { t } = useTranslation();
  useB08((s) => s.version);
  const rt = useB08((s) => s.runtime);
  const stage = useB08((s) => s.stage);
  const selected = useB08((s) => s.selected);
  const select = useB08((s) => s.select);
  const toggle = useB08((s) => s.toggleInventory);
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
            <h3>{t(`b08.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {b08NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
