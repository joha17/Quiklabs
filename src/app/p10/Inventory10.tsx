import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { p10NameOf } from './describe';

const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'grav', ids: ['abalance', 'watch_glass', 'spatula', 'bicarb_jar'] },
  { key: 'vol', ids: ['beaker150', 'funnel', 'flask', 'pipette', 'propipette', 'wash', 'water_bottle'] },
  { key: 'reactor', ids: ['erlenmeyer', 'stopper', 'vinegar_bottle', 'cylinder', 'waste'] },
  { key: 'gas', ids: ['beaker600', 'tap_jug', 'burette', 'stand', 'u_tube', 'thermometer', 'barometer', 'ruler'] },
  { key: 'boyle', ids: ['sensor', 'datalogger', 'syringe'] },
  { key: 'sink', ids: ['sink'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§5.1). */
export function Inventory10() {
  const { t } = useTranslation();
  useP10((s) => s.version);
  const rt = useP10((s) => s.runtime);
  const stage = useP10((s) => s.stage);
  const selected = useP10((s) => s.selected);
  const select = useP10((s) => s.select);
  const toggle = useP10((s) => s.toggleInventory);
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
            <h3>{t(`p10.zone.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {p10NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
