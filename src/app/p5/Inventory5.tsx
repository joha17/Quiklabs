import { useTranslation } from 'react-i18next';
import { useP5 } from './store';
import { p5NameOf } from './describe';

const GROUPS: Array<{ key: string; ids: string[] }> = [
  { key: 'weigh', ids: ['balance', 'weigh_paper', 'brush'] },
  { key: 'reagents', ids: ['bottle_kclo3', 'spatula_kclo3', 'bottle_mno2', 'spatula_mno2', 'tray', 'stopper', 'pestle', 'sugar'] },
  { key: 'cool', ids: ['rack', 'tube', 'tongs', 'ir'] },
  { key: 'heat', ids: ['stand', 'shield', 'burner', 'gas_tap', 'hose', 'lighter'] },
  { key: 'waste', ids: ['waste', 'wash'] },
  { key: 'safety', ids: ['extinguisher', 'blanket', 'estop', 'extractor', 'co_detector'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§4.1). */
export function Inventory5() {
  const { t } = useTranslation();
  useP5((s) => s.version);
  const rt = useP5((s) => s.runtime);
  const stage = useP5((s) => s.stage);
  const selected = useP5((s) => s.selected);
  const select = useP5((s) => s.select);
  const toggle = useP5((s) => s.toggleInventory);
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
            <h3>{t(`p5.zone.${g.key}`)}</h3>
            {g.ids.filter((id) => w.objects[id] || w.gas.objects[id] || id === 'hose').map((id) => (
              <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                {p5NameOf(w, id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
