import { useTranslation } from 'react-i18next';
import { useP3 } from './store';
import { p3NameOf } from './describe';

const GROUPS: Array<{ key: string; kinds: string[] }> = [
  { key: 'burner', kinds: ['burner', 'gasTap', 'lighter', 'ruler', 'soapBottle', 'backdrop'] },
  { key: 'capsule', kinds: ['capsule', 'tongs', 'tile', 'cloth'] },
  { key: 'cations', kinds: ['tube', 'loop', 'glass', 'atomizer'] },
  { key: 'cleaning', kinds: ['rinseBeaker', 'hclVial', 'waste'] },
  { key: 'safety', kinds: ['extinguisher', 'blanket', 'emergencyStop', 'extractor', 'coDetector'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por zona (§4.2). */
export function Inventory3() {
  const { t } = useTranslation();
  useP3((s) => s.version);
  const rt = useP3((s) => s.runtime);
  const stage = useP3((s) => s.stage);
  const selected = useP3((s) => s.selected);
  const select = useP3((s) => s.select);
  const toggle = useP3((s) => s.toggleInventory);
  if (!rt) return null;
  const w = rt.world;
  const objs = Object.values(w.objects);
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
            <h3>{t(`p3.zone.${g.key}`)}</h3>
            {g.key === 'burner' && (
              <button className="inv-item" aria-current={selected === 'hose'} onClick={() => { select('hose'); stage?.focusObject('hose'); }}>{p3NameOf(w, 'hose')}</button>
            )}
            {objs.filter((o) => g.kinds.includes(o.kind)).map((o) => (
              <button key={o.id} className="inv-item" aria-current={selected === o.id} onClick={() => { select(o.id); stage?.focusObject(o.id); }}>
                {p3NameOf(w, o.id)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
