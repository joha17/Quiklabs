import { useTranslation } from 'react-i18next';
import { useP07 } from './store';
import { p07NameOf } from './describe';

/** Grupos por estación; los que no estén en la mesada (escenarios) se omiten. Las incógnitas, solo con su código. */
const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['ppeBoard'] },
  { key: 'B', ids: ['btWater', 'btHeptane', 'btEthanol', 'btIsopropanol', 'btGlycerol', 'btMineralOil', 'btAcetone', 'btPetEther', 'jarNaCl', 'jarSucrose', 'jarKCl', 'jarCuSO4', 'jarNaHCO3', 'jarParaffin', 'jarNaphthalene', 'jarNaOH', 'jarDamaged', 'jarExcess', 'cyl10', 'rackB', 'tube1', 'tube2', 'tube3', 'tube4', 'tube5', 'tube6', 'tube7', 'tube8', 'dp1', 'dp2', 'spatula', 'sr1', 'washBottle', 'wasteAq', 'wasteOrg', 'wasteSolid'] },
  { key: 'C', ids: ['det01', 'tipA', 'tipB', 'spCu', 'spGraphite', 'spNaCl', 'spAl', 'spParaffin', 'spSucrose', 'spFe', 'spBronze', 'balance01', 'wg1', 'wg2', 'wg3'] },
  { key: 'D', ids: ['cond01', 'probe01', 'std1413', 'std12880', 'stdUnknown', 'btAcetic', 'fl1', 'fl2', 'bk1', 'bk2', 'bk3', 'bk4', 'bk5'] },
  { key: 'E', ids: ['unkX', 'unkY', 'spX', 'spY', 'rackE', 'tube9', 'tube10', 'tube11', 'tube12', 'bk6', 'bk7'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§15.1). */
export function Inventory07() {
  const { t } = useTranslation();
  useP07((s) => s.version);
  const rt = useP07((s) => s.runtime);
  const stage = useP07((s) => s.stage);
  const selected = useP07((s) => s.selected);
  const select = useP07((s) => s.select);
  const toggle = useP07((s) => s.toggleInventory);
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
            <h3>{t(`p7.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {p07NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
