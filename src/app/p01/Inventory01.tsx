import { useTranslation } from 'react-i18next';
import { useP01 } from './store';
import { p01NameOf } from './describe';

const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'A', ids: ['rec_analytical', 'rec_burette', 'rec_tubes', 'rec_beaker', 'rec_funnel', 'rec_filter', 'rec_spatula', 'rec_ruler'] },
  { key: 'B', ids: ['balance01', 'washBottle', 'waterRoom01', 'waterCold01', 'iceBath01', 'pipette25', 'pipetteFiller', 'thermometer01', 'erlenmeyer150', 'erlenmeyer150b', 'waste01'] },
  { key: 'C', ids: ['nailsBatch01', 'weighBoat01', 'cylinder50', 'spillTray01'] },
  { key: 'D', ids: ['watchGlass01', 'solidCylinder01', 'caliper01'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§15). */
export function Inventory01() {
  const { t } = useTranslation();
  useP01((s) => s.version);
  const rt = useP01((s) => s.runtime);
  const stage = useP01((s) => s.stage);
  const selected = useP01((s) => s.selected);
  const select = useP01((s) => s.select);
  const toggle = useP01((s) => s.toggleInventory);
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
            <h3>{t(`p01.station.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id]).map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {p01NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
