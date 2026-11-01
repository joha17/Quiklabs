import { useTranslation } from 'react-i18next';
import { useB10 } from './store';
import { b10NameOf } from './describe';

/** Grupos por estación. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['ppeTray', 'orient', 'glassBin', 'bioWaste', 'trashBin'] },
  { key: 'B', ids: ['mic', 'case', 'oil', 'fxSK', 'fxCA', 'fxSM', 'fxEP', 'fxCT', 'fxNE', 'fxSP', 'fxCO', 'fxME', 'fxPL', 'fxFL', 'fxNM', 'fxCE', 'fxEW', 'fxDA', 'fxLO', 'fxMS', 'fxLS', 'fxO'] },
  { key: 'C', ids: ['ste', 'tray', 'stDaphnia', 'stLouse'] },
  { key: 'D', ids: ['prepBoard', 'board', 'mus', 'sl1', 'sl2', 'cvBox', 'dw', 'fc', 'sc', 'pp', 'lp', 'tw'] },
  { key: 'E', ids: ['invRack', 'verRack', 'birdRack'] },
  { key: 'F', ids: ['skullRack', 'trackBox', 'cleanTray'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§13). */
export function InventoryB10() {
  const { t } = useTranslation();
  useB10((s) => s.version);
  const rt = useB10((s) => s.runtime);
  const stage = useB10((s) => s.stage);
  const selected = useB10((s) => s.selected);
  const select = useB10((s) => s.select);
  const toggle = useB10((s) => s.toggleInventory);
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
            <h3>{t(`b10.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {b10NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
