/**
 * Controlador de gestos de B03: el de B02 (microscopio, pinza, goteros, cubreobjetos) más los gestos de transporte
 * sobre lo que la mano tiene debajo (P / clic; Mayús = gesto brusco):
 * - membrana soltada sobre una cámara → se inserta en la junta con el desplazamiento real de la mano (centrado o no);
 *   soltada en el plato de remojo → se remoja; en la bandeja → vuelve a su lugar;
 * - frasco o probeta sobre un recipiente → empieza a verter (P otra vez o soltar: deja de verter; Mayús: inclinación
 *   brusca); el caudal y los derrames los decide el dominio;
 * - pipeta: vacía, aspira el volumen elegido con Q/E del recipiente de debajo; cargada, lo descarga; sobre el vaso de
 *   enjuague, se enjuaga;
 * - gotero de Biuret o de AgNO₃ sobre un tubo → una gota (Mayús: tres);
 * - termómetro sobre una cámara → lectura de temperatura;
 * - tubo soltado sobre los residuos químicos → se desecha (el dominio registra si se leyó antes).
 * La lectura de volumen usa el ángulo REAL de la cámara respecto del menisco (paralaje), no un valor ideal.
 */
import type { B01ObjKind, Pose } from '../../simulation/optical-world/types';
import type { PermCommand } from '../../simulation/perm-world/commands';
import type { PermInstrument } from '../../simulation/perm-world/commands';
import type { PermWorld } from '../../simulation/perm-world/types';
import { CELL_POS, CHEM_WASTE, GEO_B03, MEMBRANE_TRAY, RINSE_BEAKER, SOAK_DISH, TUBE_RACK, membranePos, tubePos } from '../../simulation/perm-world/geometry';
import { MEMBRANES_B03 } from '../../practices/practice-b03/definition';
import { TUBE_IDS } from '../../simulation/perm-world/world';
import { CellController } from './cellController';
import { meniscusAt } from './objects3dPerm';
import type { Spot } from './layout';

const POUR_KINDS = new Set<B01ObjKind>(['reagentBottle', 'gradCylinder']);
const PIPETTE_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

export class PermController extends CellController {
  /** Volumen que aspira la pipeta (mL), elegido con Q/E mientras se sostiene. */
  pipetteMl = 2;

  private get pw(): PermWorld {
    return this.w as PermWorld;
  }

  protected run(r: ReturnType<CellController['dispatch']> | undefined) {
    if (r && !r.ok && r.code) {
      const k = `b03.cmd.${r.code}`;
      if (this.host.t(k) !== k) {
        this.host.notify('warn', k);
        return r;
      }
    }
    return super.run(r);
  }

  perm(c: PermCommand) {
    return this.run(this.dispatch(c));
  }

  protected spots(kind: B01ObjKind): Spot[] {
    const out = super.spots(kind);
    if (kind === 'membrane') {
      out.push({ id: 'sk', x: SOAK_DISH.x, y: SOAK_DISH.y, z: SOAK_DISH.z, r: GEO_B03.soak.r });
      out.push({ id: 'mt', x: MEMBRANE_TRAY.x, y: MEMBRANE_TRAY.y, z: MEMBRANE_TRAY.z, r: GEO_B03.tray.w / 2 });
    }
    if (kind === 'testTube') out.push({ id: 'rk', x: TUBE_RACK.x, y: TUBE_RACK.y, z: 1, r: GEO_B03.rack.w / 2 });
    return out;
  }

  protected sharedSpot(id: string): boolean {
    return id === 'sk' || id === 'mt' || id === 'rk' || super.sharedSpot(id);
  }

  /** Cada membrana y cada tubo vuelve a su propio lugar de la bandeja o la gradilla. */
  protected spotPose(s: Spot, n: number): Pose {
    const id = this.held?.id ?? '';
    if (s.id === 'mt') {
      const p = membranePos(Math.max(0, MEMBRANES_B03.findIndex((m) => m.id === id)));
      return { x: p.x, y: p.y, z: p.z, rotationRad: 0 };
    }
    if (s.id === 'rk') {
      const p = tubePos(Math.max(0, (TUBE_IDS as readonly string[]).indexOf(id)));
      return { x: p.x, y: p.y, z: p.z, rotationRad: 0 };
    }
    if (s.id === 'sk') return { x: s.x - 2 + (n % 3) * 2, y: s.y - 1 + Math.floor(n / 3) * 2, z: s.z, rotationRad: 0 };
    return super.spotPose(s, n);
  }

  /** Cámara cuya junta queda bajo la mano (x, y en cm) y el desplazamiento lateral respecto de su centro. */
  private cellUnder(x: number, y: number): { id: string; offset: number } | null {
    for (const [id, p] of Object.entries(CELL_POS)) {
      const W = id === 'c3' ? GEO_B03.cellTall.w : GEO_B03.cell.w;
      if (Math.abs(x - p.x) <= W / 2 && Math.abs(y - p.y) <= GEO_B03.cell.d / 2 + 1) return { id, offset: Math.round((x - p.x) * 100) / 100 };
    }
    return null;
  }

  place(id: string, kind: B01ObjKind, p: Pose) {
    if (kind === 'membrane') {
      const c = this.cellUnder(p.x, p.y);
      if (c) {
        const r = this.perm({ type: 'insertMembrane', membraneId: id, cellId: c.id, offsetCm: c.offset });
        if (r?.ok) {
          this.host.sound('click');
          return;
        }
      }
    }
    if (kind === 'testTube' && Math.hypot(p.x - CHEM_WASTE.x, p.y - CHEM_WASTE.y) <= GEO_B03.waste.r + 1) {
      const r = this.perm({ type: 'disposeTube', tubeId: id });
      if (r?.ok) return;
    }
    super.place(id, kind, p);
  }

  release() {
    const h = this.held;
    // Soltar el frasco corta el chorro.
    if (h && this.pw.perm?.pours[h.id]) this.perm({ type: 'stopPour', sourceId: h.id });
    super.release();
  }

  cancel() {
    const h = this.held;
    if (h && this.pw.perm?.pours[h.id]) this.perm({ type: 'stopPour', sourceId: h.id });
    super.cancel();
  }

  /** Recipiente bajo la boca de lo que se sostiene: lado de cámara, tubo, probeta, vaso, frasco o residuos. */
  vesselUnder(): string | null {
    const h = this.held;
    if (!h) return null;
    const w = this.pw;
    const c = this.cellUnder(h.x, h.y);
    if (c) return `${c.id}:${c.offset < 0 ? 'A' : 'B'}`;
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of Object.keys(w.perm.vessels)) {
      const o = w.objects[id];
      if (!o || id === h.id || o.support === 'cw' || o.support === 'hand') continue;
      const r = o.kind === 'testTube' ? 1.3 : o.kind === 'beaker' ? GEO_B03.beaker.r : o.kind === 'chemWaste' ? GEO_B03.waste.r : o.kind === 'gradCylinder' ? 2.2 : o.kind === 'reagentBottle' ? GEO_B03.bottle.r : 0;
      const d = Math.hypot(h.x - o.pose.x, h.y - o.pose.y);
      if (d <= r && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  targetUnder(): string | null {
    const h = this.held;
    if (h && (POUR_KINDS.has(h.kind) || h.kind === 'pipette' || h.kind === 'thermometer' || h.id === 'dBi' || h.id === 'dAg')) return this.vesselUnder();
    return super.targetUnder();
  }

  primary(strong: boolean) {
    const h = this.held;
    if (!h) return;
    const w = this.pw;
    if (POUR_KINDS.has(h.kind)) {
      if (w.perm.pours[h.id]) return void this.perm({ type: 'stopPour', sourceId: h.id });
      const t = this.vesselUnder();
      if (!t) return void this.hintOnce('b03.hint.pourOver');
      this.perm({ type: 'startPour', sourceId: h.id, targetId: t, tiltDeg: strong ? 110 : 55 });
      return void this.host.sound('pour');
    }
    if (h.kind === 'pipette') {
      const t = this.vesselUnder();
      if (Math.hypot(h.x - RINSE_BEAKER.x, h.y - RINSE_BEAKER.y) <= GEO_B03.beaker.r) return void this.perm({ type: 'rinseTool', toolId: h.id });
      if (!t) return void this.hintOnce('b03.hint.pipetteOver');
      const loaded = w.perm.vessels[h.id].volumeMl > (w.params.perm?.pipetteFilmMl ?? 0.02) + 1e-6;
      if (loaded) this.perm({ type: 'dispense', toolId: h.id, targetId: t });
      else this.perm({ type: 'aspirate', toolId: h.id, sourceId: t, volumeMl: this.pipetteMl });
      return void this.host.sound('drip');
    }
    if (h.id === 'dBi' || h.id === 'dAg') {
      const t = this.vesselUnder();
      if (!t || !w.perm.tubes[t]) return void this.hintOnce('b03.hint.dropOnTube');
      for (let i = 0; i < (strong ? 3 : 1); i++) this.perm({ type: 'squeezeDropper', dispenserId: h.id, targetId: t, force01: 0.5, dxCm: 0, dyCm: 0 });
      return void this.host.sound('drip');
    }
    if (h.kind === 'thermometer') {
      const c = this.cellUnder(h.x, h.y);
      if (c) return void this.read('thermo', c.id);
      return void this.hintOnce('b03.hint.thermoInCell');
    }
    super.primary(strong);
  }

  onKeyDown(key: string, shift: boolean): boolean {
    const h = this.held;
    const k = key.toLowerCase();
    if (h?.kind === 'pipette' && (k === 'q' || k === 'e')) {
      const i = PIPETTE_STEPS.indexOf(this.pipetteMl);
      this.pipetteMl = PIPETTE_STEPS[Math.max(0, Math.min(PIPETTE_STEPS.length - 1, (i < 0 ? 3 : i) + (k === 'e' ? 1 : -1)))];
      this.host.notify('info', 'b03.hint.pipetteVolume', { ml: String(this.pipetteMl).replace('.', ',') });
      return true;
    }
    return super.onKeyDown(key, shift);
  }

  /**
   * Ángulo de la mirada respecto del menisco (°, positivo desde arriba) con la cámara actual: es lo que el dominio usa
   * para el error de paralaje (PERM40). A la altura del ojo (botón 👁) queda cerca de cero.
   */
  eyeDegFor(target: string): number {
    const m = meniscusAt(this.w, target);
    const cam = this.lab.camera?.position();
    if (!m || !cam) return 0;
    const horiz = Math.hypot(cam.x - m.x, cam.y - m.y);
    return Math.round(((Math.atan2(cam.z - m.z, Math.max(1e-3, horiz)) * 180) / Math.PI) * 10) / 10;
  }

  read(instrument: PermInstrument, targetId: string) {
    const eyeDeg = instrument === 'scale' ? this.eyeDegFor(targetId) : undefined;
    const r = this.perm({ type: 'readInstrument', instrument, targetId, eyeDeg });
    if (r?.ok && r.id) this.host.notify('info', 'b03.hint.readingTaken', { id: r.id });
    return r;
  }
}
