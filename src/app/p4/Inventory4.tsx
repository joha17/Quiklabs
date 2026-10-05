import { useTranslation } from 'react-i18next';
import { useP4 } from './store';
import { p4NameOf } from './describe';

const GROUPS: Array<{ key: string; kinds: string[]; ids?: string[] }> = [
  { key: 'neutral', kinds: [], ids: ['bottle_hcl', 'bottle_naoh10', 'pheno', 'dropper_pheno', 'beaker', 'cyl10', 'cyl25', 'rod', 'probe'] },
  { key: 'precip', kinds: ['tube', 'tubeTongs'], ids: ['db_na2co3', 'dropper_na2co3', 'db_cacl2', 'dropper_cacl2', 'db_fecl3', 'dropper_fecl3', 'db_naoh15', 'dropper_naoh15'] },
  { key: 'redox', kinds: ['nail', 'alStrip', 'sandpaper'], ids: ['bottle_cuso4'] },
  { key: 'mg', kinds: ['mgRibbon', 'crucibleTongs', 'capsule', 'shield'], ids: ['burner', 'gas_tap', 'hose', 'lighter'] },
  { key: 'waste', kinds: ['waste', 'sink', 'towel', 'phPaper', 'washBottle'] },
  { key: 'safety', kinds: [], ids: ['extinguisher', 'blanket', 'estop', 'extractor', 'co_detector'] },
];

/** Estante lateral: lista accesible de todo el material, agrupado por estación (§4.1). */
export function Inventory4() {
  const { t } = useTranslation();
  useP4((s) => s.version);
  const rt = useP4((s) => s.runtime);
  const stage = useP4((s) => s.stage);
  const selected = useP4((s) => s.selected);
  const select = useP4((s) => s.select);
  const toggle = useP4((s) => s.toggleInventory);
  if (!rt) return null;
  const w = rt.world;
  const objs = Object.values(w.objects).filter((o) => !o.support.startsWith('disposed:'));
  return (
    <aside className="drawer left" aria-label={t('inv.title')}>
      <div className="drawer-head">
        <h2>{t('inv.title')}</h2>
        <span className="grow" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        {GROUPS.map((g) => {
          const ids = [...(g.ids ?? []), ...objs.filter((o) => g.kinds.includes(o.kind)).map((o) => o.id)].filter((id, i, a) => a.indexOf(id) === i && (w.objects[id] || w.gas.objects[id] || id === 'hose'));
          return (
            <div key={g.key} className="inv-group">
              <h3>{t(`p4.zone.${g.key}`)}</h3>
              {ids.map((id) => (
                <button key={id} className="inv-item" aria-current={selected === id} onClick={() => { select(id); stage?.focusObject(id); }}>
                  {p4NameOf(w, id)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
