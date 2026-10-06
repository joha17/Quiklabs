import { useTranslation } from 'react-i18next';
import { useP6 } from './store';
import { p6NameOf } from './describe';

const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'prep', ids: ['balance', 'cylinder', 'water_bottle', 'wash', 'jar_fe', 'jar_x', 'spatula', 'tube_fe', 'tube_x', 'rack'] },
  { key: 'cal', ids: ['cup', 'therm_cal', 'stirrer', 'towel'] },
  { key: 'bath', ids: ['hotplate', 'beaker', 'therm_bath', 'tongs'] },
  { key: 'bomb', ids: ['bomb', 'bomb_unit', 'oxygen', 'abalance', 'food_dish'] },
  { key: 'sink', ids: ['sink'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§4.1). */
export function Inventory6() {
  const { t } = useTranslation();
  useP6((s) => s.version);
  const rt = useP6((s) => s.runtime);
  const stage = useP6((s) => s.stage);
  const selected = useP6((s) => s.selected);
  const select = useP6((s) => s.select);
  const toggle = useP6((s) => s.toggleInventory);
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
            <h3>{t(`p6.zone.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id] && (g.key !== 'bomb' || w.params.bombEnabled)).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {p6NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
