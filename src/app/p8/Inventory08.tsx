import { useTranslation } from 'react-i18next';
import { useP08 } from './store';
import { p08NameOf } from './describe';

/** Grupos por estación; solo se listan los objetos de la ruta del intento. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['ppeTray'] },
  { key: 'B', ids: ['btIAA', 'btAcOH', 'btAcOH30', 'btAA', 'btMeOH', 'btMeOH70', 'btH2SO4', 'btH3PO4', 'jarSA', 'balance01', 'wg1', 'spatula', 'cyl10', 'cyl25', 'dp1', 'washBottle', 'plasticCup', 'wasteOrg', 'wasteAq', 'wasteAcid', 'wasteSolid'] },
  { key: 'C', ids: ['plate01', 'bath01', 'cork01', 'rf', 'th01', 'condenser01', 'burner01'] },
  { key: 'D', ids: ['ice01', 'bkIce', 'ring01', 'sf', 'bkAq', 'erDry', 'btNaHCO3', 'jarNa2SO4', 'jarNa2SO4used', 'frac01', 'fracPot', 'fracHead', 'vialP', 'kitasato', 'buchner', 'fpFine', 'fpCoarse', 'pump01', 'oven01'] },
  { key: 'E', ids: ['analyzer01', 'mp01'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§15.1). */
export function Inventory08() {
  const { t } = useTranslation();
  useP08((s) => s.version);
  const rt = useP08((s) => s.runtime);
  const stage = useP08((s) => s.stage);
  const selected = useP08((s) => s.selected);
  const select = useP08((s) => s.select);
  const toggle = useP08((s) => s.toggleInventory);
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
            <h3>{t(`p8.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {p08NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
