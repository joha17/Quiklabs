/**
 * Controlador de gestos de B05: el de B02 (microscopio, pinza, goteros, cubreobjetos, raspado de papa) más los gestos
 * enzimáticos sobre lo que la mano tiene debajo (P / clic; Mayús = gesto brusco):
 * - tubo soltado en un baño → entra con la inmersión del gesto (lo decide el dominio: tubo caliente sin pinza, etc.);
 *   beaker soltado en una placa; bote en la balanza; cubeta en el fotómetro; tubo en su gradilla;
 * - frasco, beaker o probeta sobre un recipiente → empieza a verter (P otra vez o soltar: deja de verter; Mayús:
 *   inclinación brusca); el caudal y los derrames los decide el dominio;
 * - pipeta: vacía, aspira el volumen elegido con Q/E del recipiente de debajo (Mayús: émbolo brusco); cargada, lo
 *   descarga; sobre el vaso de enjuague, se enjuaga;
 * - gotero de Lugol, Benedict, HCl, NaOH o agua sobre un tubo → una gota (Mayús: tres);
 * - espátula sobre un frasco de polvo → carga Q/E gramos; sobre el bote o un beaker → descarga;
 * - bisturí sobre el hígado → corta Q/E gramos a la tabla; sobre la tabla → pica;
 * - termómetro sobre un recipiente o un baño → lectura; pinza sobre un tubo → lo lleva al baño o a la gradilla;
 * - tubo o beaker soltado sobre un contenedor de residuos → se descarta (el dominio decide si la clase es correcta).
 * La lectura de volumen usa el ángulo REAL de la cámara respecto del menisco (paralaje), no un valor ideal.
 */
import type { B01ObjKind, Pose } from '../../simulation/optical-world/types';
import type { EnzCommand } from '../../simulation/enz-world/commands';
import type { EnzInstrument, EnzWorld } from '../../simulation/enz-world/types';
import {
  BALANCE_POS, BATH_POS, BEAKER_HOME, GEO_B05, LIVER_BOARD, PLATE_POS, RACK_POS, RINSE_POS, UV_POS, WASTE_POS, bathSlot, rackOfTube, tubeHome,
} from '../../simulation/enz-world/geometry';
import { CellController } from './cellController';
import { meniscusAtEnz } from './objects3dEnz';
import type { Spot } from './layout';

const POUR_KINDS = new Set<B01ObjKind>(['enzBottle', 'enzCylinder', 'enzBeaker']);
const VESSEL_R: Partial<Record<B01ObjKind, number>> = { enzTube: 1.3, enzBeaker: 3.4, enzCylinder: 2.2, enzBottle: GEO_B05.bottle.r, enzWaste: GEO_B05.waste.r, enzCuvette: 1, enzRinse: 3.2 };
const PIPETTE_STEPS: Record<string, number[]> = { p1: [0.1, 0.2, 0.25, 0.5, 1], p5: [0.5, 1, 2, 3, 4, 5], p10: [1, 2, 5, 10] };
const MASS_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15];

export class EnzController extends CellController {
  /** Volumen que aspira cada pipeta (mL) y gramos de la espátula o del bisturí, elegidos con Q/E. */
  pipetteMl: Record<string, number> = { p1: 1, p5: 2, p10: 10 };
  massG = 1;

  private get ew(): EnzWorld {
    return this.w as EnzWorld;
  }

  protected run(r: ReturnType<CellController['dispatch']> | undefined) {
    if (r && !r.ok && r.code) {
      const k = `b05.cmd.${r.code}`;
      if (this.host.t(k) !== k) {
        this.host.notify('warn', k);
        return r;
      }
    }
    return super.run(r);
  }

  enz(c: EnzCommand) {
    // El controlador base tipa los comandos de B01–B03; el mundo enzimático acepta además los suyos.
    return this.run(this.dispatch(c as never));
  }

  protected spots(kind: B01ObjKind): Spot[] {
    const out = super.spots(kind);
    if (kind === 'enzTube') {
      for (const id of ['rk1', 'rk2']) out.push({ id, x: RACK_POS[id].x, y: RACK_POS[id].y, z: 1.2, r: GEO_B05.rack.w / 2 });
      for (const id of ['wb1', 'wb2']) out.push({ id, x: BATH_POS[id].x, y: BATH_POS[id].y, z: 2, r: GEO_B05.bath.w / 2 });
    }
    if (kind === 'enzBeaker') for (const id of ['hp1', 'hp2']) out.push({ id, x: PLATE_POS[id].x, y: PLATE_POS[id].y, z: GEO_B05.plate.h, r: GEO_B05.plate.w / 2 });
    if (kind === 'enzBoat') out.push({ id: 'bal', x: BALANCE_POS.x, y: BALANCE_POS.y, z: GEO_B05.balance.h, r: GEO_B05.balance.w / 2 });
    if (kind === 'enzCuvette') out.push({ id: 'uv', x: UV_POS.x + GEO_B05.photometer.w * 0.28, y: UV_POS.y, z: GEO_B05.photometer.h, r: 3 });
    return out;
  }

  protected sharedSpot(id: string): boolean {
    return id === 'rk1' || id === 'rk2' || id === 'wb1' || id === 'wb2' || super.sharedSpot(id);
  }

  /** Cada tubo vuelve a su lugar de la gradilla; en un baño, al siguiente puesto libre. */
  protected spotPose(s: Spot, n: number): Pose {
    const id = this.held?.id ?? '';
    if ((s.id === 'rk1' || s.id === 'rk2') && rackOfTube(id) === s.id) {
      const p = tubeHome(id);
      return { x: p.x, y: p.y, z: p.z, rotationRad: 0 };
    }
    if (s.id === 'wb1' || s.id === 'wb2') {
      const p = bathSlot(s.id, n);
      return { x: p.x, y: p.y, z: p.z, rotationRad: 0 };
    }
    return super.spotPose(s, n);
  }

  protected floorAt(x: number, y: number): number {
    let floor = super.floorAt(x, y);
    for (const p of Object.values(PLATE_POS)) if (Math.hypot(x - p.x, y - p.y) < GEO_B05.plate.w / 2) floor = Math.max(floor, GEO_B05.plate.h + 0.2);
    if (Math.hypot(x - BALANCE_POS.x, y - BALANCE_POS.y) < GEO_B05.balance.w / 2) floor = Math.max(floor, GEO_B05.balance.h + 0.2);
    if (Math.hypot(x - LIVER_BOARD.x, y - LIVER_BOARD.y) < 5) floor = Math.max(floor, LIVER_BOARD.z + 0.2);
    return floor;
  }

  /** Contenedor de residuos bajo la mano (o null). */
  private wasteUnder(x: number, y: number): string | null {
    for (const [id, p] of Object.entries(WASTE_POS)) if (Math.hypot(x - p.x, y - p.y) <= GEO_B05.waste.r + 1) return id;
    return null;
  }

  place(id: string, kind: B01ObjKind, p: Pose) {
    if (kind === 'enzTube' || kind === 'enzBeaker' || kind === 'enzCuvette') {
      const waste = this.wasteUnder(p.x, p.y);
      if (waste) {
        this.enz({ type: 'discardLiquid', vesselId: id, wasteId: waste });
        // Vacío o no, el recipiente vuelve a la mesada junto al contenedor.
        const home = kind === 'enzTube' ? tubeHome(id) : kind === 'enzBeaker' ? { ...BEAKER_HOME[id], z: 0 } : null;
        if (home) {
          const r = this.dispatch({ type: 'setPose', id, pose: { x: home.x, y: home.y, z: home.z, rotationRad: 0 }, support: kind === 'enzTube' ? rackOfTube(id) : 'bench' });
          if (r.ok) return;
        }
      }
    }
    super.place(id, kind, p);
  }

  release() {
    const h = this.held;
    if (h && this.ew.enz?.pours[h.id]) this.enz({ type: 'stopPour', sourceId: h.id });
    super.release();
  }

  cancel() {
    const h = this.held;
    if (h && this.ew.enz?.pours[h.id]) this.enz({ type: 'stopPour', sourceId: h.id });
    super.cancel();
  }

  /** Recipiente bajo la boca de lo que se sostiene: tubo, beaker, probeta, frasco, cubeta o residuos. */
  vesselUnder(): string | null {
    const h = this.held;
    if (!h) return null;
    const w = this.ew;
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of Object.keys(w.enz.vessels)) {
      const o = w.objects[id];
      if (!o || id === h.id || o.support === 'hand') continue;
      const r = VESSEL_R[o.kind] ?? 0;
      const d = Math.hypot(h.x - o.pose.x, h.y - o.pose.y);
      if (d <= r && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  /** Objeto de B05 cercano a la mano entre los ids dados. */
  private near(ids: string[], r: number): string | null {
    const h = this.held;
    if (!h) return null;
    return ids.find((id) => {
      const o = this.w.objects[id];
      return o && Math.hypot(h.x - o.pose.x, h.y - o.pose.y) <= r;
    }) ?? null;
  }

  targetUnder(): string | null {
    const h = this.held;
    if (!h) return null;
    if (POUR_KINDS.has(h.kind) || h.kind === 'enzPipette' || h.kind === 'enzDropper' || h.kind === 'enzThermo' || h.kind === 'enzStrips') return this.vesselUnder();
    if (h.kind === 'enzSpatula') return this.near(['jS', 'jA', 'wb'], 3) ?? this.vesselUnder();
    if (h.kind === 'enzKnife') return this.near(Object.keys(this.ew.enz.liver), 4) ?? this.near(['bdL'], 5);
    if (h.kind === 'enzTongs') return this.near(Object.keys(this.ew.enz.tubes), 1.6);
    return super.targetUnder();
  }

  primary(strong: boolean) {
    const h = this.held;
    if (!h) return;
    const w = this.ew;
    if (POUR_KINDS.has(h.kind)) {
      if (w.enz.pours[h.id]) return void this.enz({ type: 'stopPour', sourceId: h.id });
      const t = this.vesselUnder();
      if (!t) return void this.hintOnce('b05.hint.pourOver');
      this.enz({ type: 'startPour', sourceId: h.id, targetId: t, tiltDeg: strong ? 110 : 55 });
      return void this.host.sound('pour');
    }
    if (h.kind === 'enzPipette') {
      if (Math.hypot(h.x - RINSE_POS.x, h.y - RINSE_POS.y) <= 3.2) return void this.enz({ type: 'rinseTool', toolId: h.id });
      const t = this.vesselUnder();
      if (!t) return void this.hintOnce('b05.hint.pipetteOver');
      const loaded = w.enz.vessels[h.id].volumeMl > (w.params.enz?.pipettes[h.id]?.filmMl ?? 0.02) + 1e-6;
      if (loaded) this.enz({ type: 'dispense', toolId: h.id, targetId: t });
      else this.enz({ type: 'aspirate', toolId: h.id, sourceId: t, volumeMl: this.pipetteMl[h.id] ?? 1, speed01: strong ? 0.95 : 0.4 });
      return void this.host.sound('drip');
    }
    if (h.kind === 'enzDropper') {
      const t = this.vesselUnder();
      if (!t) return void this.hintOnce('b05.hint.dropOnTube');
      for (let i = 0; i < (strong ? 3 : 1); i++) this.enz({ type: 'squeezeDropper', dispenserId: h.id, targetId: t, force01: 0.5, dxCm: 0, dyCm: 0 });
      return void this.host.sound('drip');
    }
    if (h.kind === 'enzSpatula') {
      const t = this.targetUnder();
      if (t === 'jS' || t === 'jA') return void this.enz({ type: 'scoop', toolId: 'sp2', sourceId: t, massG: this.massG });
      if (t) return void this.enz({ type: 'transferSolid', fromId: 'sp2', toId: t });
      return void this.hintOnce('b05.hint.spatula');
    }
    if (h.kind === 'enzKnife') {
      const t = this.targetUnder();
      if (t === 'bdL') return void this.enz({ type: 'mince', toolId: 'ls', strokes: strong ? 4 : 2 });
      if (t) return void this.enz({ type: 'cutTissue', sourceId: t, toolId: 'ls', massG: this.massG });
      return void this.hintOnce('b05.hint.knife');
    }
    if (h.kind === 'enzThermo') {
      const bath = Object.entries(BATH_POS).find(([, p]) => Math.hypot(h.x - p.x, h.y - p.y) <= GEO_B05.bath.w / 2);
      const t = this.vesselUnder() ?? bath?.[0] ?? null;
      if (t) return void this.read('thermo', t);
      return void this.hintOnce('b05.hint.thermo');
    }
    if (h.kind === 'enzStrips') {
      const t = this.vesselUnder();
      if (t) return void this.enz({ type: 'dipStrip', targetId: t, reuse: strong });
      return void this.hintOnce('b05.hint.strip');
    }
    if (h.kind === 'enzTongs') {
      const t = this.targetUnder();
      if (!t) return void this.hintOnce('b05.hint.tongs');
      const tube = w.enz.tubes[t];
      return void this.enz({ type: 'tongs', tubeId: t, to: tube.bath ? 'rack' : 'wb1', depth01: 1 });
    }
    super.primary(strong);
  }

  onKeyDown(key: string, shift: boolean): boolean {
    const h = this.held;
    const k = key.toLowerCase();
    if (h?.kind === 'enzPipette' && (k === 'q' || k === 'e')) {
      const steps = PIPETTE_STEPS[h.id] ?? [1];
      const i = steps.indexOf(this.pipetteMl[h.id]);
      this.pipetteMl[h.id] = steps[Math.max(0, Math.min(steps.length - 1, (i < 0 ? 0 : i) + (k === 'e' ? 1 : -1)))];
      this.host.notify('info', 'b05.hint.pipetteVolume', { ml: String(this.pipetteMl[h.id]).replace('.', ',') });
      return true;
    }
    if ((h?.kind === 'enzSpatula' || h?.kind === 'enzKnife') && (k === 'q' || k === 'e')) {
      const i = MASS_STEPS.indexOf(this.massG);
      this.massG = MASS_STEPS[Math.max(0, Math.min(MASS_STEPS.length - 1, (i < 0 ? 4 : i) + (k === 'e' ? 1 : -1)))];
      this.host.notify('info', 'b05.hint.massStep', { g: String(this.massG).replace('.', ',') });
      return true;
    }
    return super.onKeyDown(key, shift);
  }

  /**
   * Ángulo de la mirada respecto del menisco (°, positivo desde arriba) con la cámara actual: es lo que el dominio usa
   * para el error de paralaje (M11). A la altura del ojo (botón 👁) queda cerca de cero.
   */
  eyeDegFor(target: string): number {
    const m = target === 'gc' ? { x: this.w.objects.gc.pose.x, y: this.w.objects.gc.pose.y, z: GEO_B05.collector.h * 0.6 } : meniscusAtEnz(this.w, target);
    const cam = this.lab.camera?.position();
    if (!m || !cam) return 0;
    const horiz = Math.hypot(cam.x - m.x, cam.y - m.y);
    return Math.round(((Math.atan2(cam.z - m.z, Math.max(1e-3, horiz)) * 180) / Math.PI) * 10) / 10;
  }

  read(instrument: EnzInstrument, targetId: string) {
    const eyeDeg = instrument === 'scale' || instrument === 'collector' ? this.eyeDegFor(targetId) : undefined;
    const r = this.enz({ type: 'readInstrument', instrument, targetId, eyeDeg });
    if (r?.ok && r.id) this.host.notify('info', 'b05.hint.readingTaken', { id: r.id });
    return r;
  }
}
