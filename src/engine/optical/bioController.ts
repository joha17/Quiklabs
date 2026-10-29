/**
 * Controlador de gestos de B04: el de B02 (microscopio, pinza, caja de láminas) más los gestos bioquímicos sobre lo
 * que la mano tiene debajo (P / clic; Mayús = gesto brusco):
 * - espátula sobre un frasco de polvo → carga la masa elegida con Q/E; sobre el bote o un beaker → deposita; sobre la
 *   papelera → se seca y limpia; el bote sobre un beaker → se vacía (sobre la papelera → se limpia);
 * - bisturí sobre el hígado en la tabla → corte fino (Mayús: trozos grandes); el hígado soltado en un beaker → al agua;
 * - frasco, probeta o beaker sobre un recipiente → vierte (P otra vez o soltar: deja de verter; Mayús: inclinación brusca);
 * - pipeta: vacía, aspira el volumen elegido con Q/E (Mayús: émbolo brusco); cargada, descarga escurriendo (Mayús:
 *   sopla la aforada o retira sin esperar la graduada); sobre el vaso de enjuague, se enjuaga;
 * - gotero de Lugol, NaOH o CuSO₄ sobre un tubo → una gota (Mayús: tres);
 * - pinza de tubos sobre un tubo → lo toma; sobre un baño → lo sumerge (Mayús: poco profundo); sobre su gradilla → lo devuelve;
 * - termómetro sobre un recipiente o un baño → lectura; barra magnética soltada en un beaker → se inserta;
 * - tubo o beaker soltado sobre un contenedor de residuos → se desecha (el dominio decide si la corriente es correcta).
 * La lectura de volumen usa el ángulo REAL de la cámara respecto del menisco (paralaje), no un valor ideal.
 */
import type { B01ObjKind, Pose } from '../../simulation/optical-world/types';
import type { BioCommand } from '../../simulation/bio-world/commands';
import type { BioInstrument, BioWorld } from '../../simulation/bio-world/types';
import { ALL_TUBES, BALANCE_POS, BATH_POS, BEAKER_POS, BOARD_B04, CHEM_WASTE_B04, GEO_B04, PLATE_POS, RACK_POS, RINSE_POS_B04, rackOfTube, tubeSlotPos } from '../../simulation/bio-world/geometry';
import { BIO_WASTE } from '../../simulation/optical-world/geometry';
import { TRASH_BIN } from '../../simulation/cell-world/geometry';
import { CellController } from './cellController';
import { meniscusAtBio } from './objects3dBio';
import type { Spot } from './layout';

const POUR_KINDS = new Set<B01ObjKind>(['bioBottle', 'bioCylinder', 'bioBeaker']);
const PIPETTE_STEPS = [0.1, 0.2, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
const SCOOP_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5];
const WASTE: Record<string, { x: number; y: number }> = { cw: CHEM_WASTE_B04, bw: BIO_WASTE, tr: TRASH_BIN };

export class BioController extends CellController {
  /** Volumen que aspira la pipeta (mL) y masa que carga la espátula (g), elegidos con Q/E mientras se sostienen. */
  pipetteMl = 2;
  scoopG = 1;
  /** Tubo que sostiene la pinza de tubos. */
  tongsTube: string | null = null;

  private get bw(): BioWorld {
    return this.w as BioWorld;
  }

  protected run(r: ReturnType<CellController['dispatch']> | undefined) {
    if (r && !r.ok && r.code) {
      const k = `b04.cmd.${r.code}`;
      if (this.host.t(k) !== k) {
        this.host.notify('warn', k);
        return r;
      }
    }
    return super.run(r);
  }

  bio(c: BioCommand) {
    return this.run(this.dispatch(c as never));
  }

  protected spots(kind: B01ObjKind): Spot[] {
    const out = super.spots(kind);
    if (kind === 'weighBoat' || kind === 'liverSample') out.push({ id: 'bal', x: BALANCE_POS.x, y: BALANCE_POS.y - 1.5, z: GEO_B04.balance.h + 0.3, r: 4 });
    if (kind === 'liverSample') out.push({ id: 'cb', x: BOARD_B04.x, y: BOARD_B04.y, z: BOARD_B04.z, r: GEO_B04.board.w / 2 });
    if (kind === 'bioBeaker') for (const [id, p] of Object.entries(PLATE_POS)) out.push({ id, x: p.x, y: p.y - 1.5, z: GEO_B04.hotplate.h + 0.4, r: 5 });
    if (kind === 'bioTube') for (const [id, p] of Object.entries(RACK_POS)) out.push({ id, x: p.x, y: p.y, z: 1, r: GEO_B04.rack.w / 2 });
    return out;
  }

  protected sharedSpot(id: string): boolean {
    return id.startsWith('rk') || super.sharedSpot(id);
  }

  /** Cada tubo vuelve a su propio lugar de la gradilla (si se suelta en otra, al primer hueco libre). */
  protected spotPose(s: Spot, n: number): Pose {
    const id = this.held?.id ?? '';
    if (s.id.startsWith('rk')) {
      const own = rackOfTube(id) === s.id;
      const i = own ? (ALL_TUBES.filter((t) => rackOfTube(t) === s.id).indexOf(id)) : n;
      const p = tubeSlotPos(s.id, Math.max(0, i));
      return { x: p.x, y: p.y, z: p.z, rotationRad: 0 };
    }
    return super.spotPose(s, n);
  }

  private wasteUnder(x: number, y: number): string | null {
    for (const [id, p] of Object.entries(WASTE)) if (Math.hypot(x - p.x, y - p.y) <= 6.5) return id;
    return null;
  }

  private beakerUnder(x: number, y: number): string | null {
    for (const id of Object.keys(BEAKER_POS)) {
      const o = this.bw.objects[id];
      if (o && Math.hypot(x - o.pose.x, y - o.pose.y) <= 4.2) return id;
    }
    return null;
  }

  private bathUnder(x: number, y: number): string | null {
    for (const [id, p] of Object.entries(BATH_POS)) if (Math.abs(x - p.x) <= GEO_B04.bath.w / 2 && Math.abs(y - p.y) <= GEO_B04.bath.d / 2) return id;
    return null;
  }

  beginDrag(id: string, keyboard: boolean): boolean {
    // La barra magnética se saca del beaker (con el agitador detenido) antes de tomarla.
    if (this.bw.bio?.bars[id] && !this.bio({ type: 'retrieveStirBar', barId: id })?.ok) return false;
    return super.beginDrag(id, keyboard);
  }

  place(id: string, kind: B01ObjKind, p: Pose) {
    const w = this.bw;
    const waste = this.wasteUnder(p.x, p.y);
    if (waste && (kind === 'bioTube' || kind === 'bioBeaker' || kind === 'cuvette')) {
      const r = this.bio({ type: 'disposeVessel', vesselId: id, wasteId: waste });
      if (r?.ok) return void this.host.sound('glass');
    }
    if (kind === 'stirBar') {
      const b = this.beakerUnder(p.x, p.y);
      if (b && this.bio({ type: 'insertStirBar', barId: id, vesselId: b })?.ok) return void this.host.sound('click');
    }
    if (kind === 'liverSample') {
      const b = this.beakerUnder(p.x, p.y);
      if (b && this.bio({ type: 'addTissue', sampleId: id, vesselId: b })?.ok) return void this.host.sound('drip');
    }
    void w;
    super.place(id, kind, p);
  }

  release() {
    const h = this.held;
    if (h && this.bw.bio?.pours[h.id]) this.bio({ type: 'stopPour', sourceId: h.id });
    if (h?.kind === 'tongs') this.tongsTube = null;
    super.release();
  }

  cancel() {
    const h = this.held;
    if (h && this.bw.bio?.pours[h.id]) this.bio({ type: 'stopPour', sourceId: h.id });
    if (h?.kind === 'tongs') this.tongsTube = null;
    super.cancel();
  }

  /** Recipiente bajo la boca de lo que se sostiene (tubo, beaker, probeta, frasco, cubeta, pipeta o gotero). */
  vesselUnder(): string | null {
    const h = this.held;
    if (!h) return null;
    const w = this.bw;
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of Object.keys(w.bio.vessels)) {
      const o = w.objects[id];
      if (!o || id === h.id || o.support === 'hand' || o.support === 'cw' || o.support === 'bw' || o.support === 'tr') continue;
      const r = o.kind === 'bioTube' || o.kind === 'cuvette' ? 1.3 : o.kind === 'bioBeaker' ? 4 : o.kind === 'rinseBeaker' ? GEO_B04.rinse.r : o.kind === 'bioCylinder' ? 2.2 : o.kind === 'bioBottle' ? GEO_B04.bottle.r : 0;
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
    if (!h) return null;
    if (POUR_KINDS.has(h.kind) || h.kind === 'bioPipette' || h.kind === 'bioDropper' || h.kind === 'bioThermo') return this.vesselUnder() ?? this.bathUnder(h.x, h.y);
    if (h.kind === 'tongs') return this.bathUnder(h.x, h.y) ?? this.vesselUnder();
    if (h.kind === 'spatula' || h.kind === 'weighBoat') {
      for (const jar of ['jSt', 'jAm']) {
        const o = this.bw.objects[jar];
        if (o && Math.hypot(h.x - o.pose.x, h.y - o.pose.y) <= GEO_B04.jar.r + 0.6) return jar;
      }
      const bt = this.bw.objects.bt;
      if (h.kind === 'spatula' && bt && Math.hypot(h.x - bt.pose.x, h.y - bt.pose.y) <= 3) return 'bt';
      return this.beakerUnder(h.x, h.y) ?? this.wasteUnder(h.x, h.y);
    }
    if (h.kind === 'scalpel') {
      const lv = this.bw.objects.liv;
      if (lv && Math.hypot(h.x - lv.pose.x, h.y - lv.pose.y) <= 3.5) return 'liv';
    }
    return super.targetUnder();
  }

  primary(strong: boolean) {
    const h = this.held;
    if (!h) return;
    const w = this.bw;
    if (POUR_KINDS.has(h.kind)) {
      if (w.bio.pours[h.id]) return void this.bio({ type: 'stopPour', sourceId: h.id });
      const t = this.vesselUnder();
      if (!t) return void this.hintOnce('b04.hint.pourOver');
      this.bio({ type: 'startPour', sourceId: h.id, targetId: t, tiltDeg: strong ? 110 : 55 });
      return void this.host.sound('pour');
    }
    if (h.kind === 'bioPipette') {
      if (Math.hypot(h.x - RINSE_POS_B04.x, h.y - RINSE_POS_B04.y) <= GEO_B04.rinse.r) return void this.bio({ type: 'rinseTool', toolId: h.id });
      const t = this.vesselUnder();
      if (!t) return void this.hintOnce('b04.hint.pipetteOver');
      const loaded = w.bio.vessels[h.id].volumeMl > (w.params.bio?.pipetteFilmMl ?? 0.02) + 1e-6;
      if (loaded) this.bio({ type: 'dispense', toolId: h.id, targetId: t, mode: strong ? (h.id === 'pv' ? 'blow' : 'quick') : 'drain' });
      else this.bio({ type: 'aspirate', toolId: h.id, sourceId: t, volumeMl: this.pipetteMl, speed01: strong ? 0.95 : 0.3 });
      return void this.host.sound('drip');
    }
    if (h.kind === 'bioDropper') {
      const t = this.vesselUnder();
      if (!t || !w.bio.tubes[t]) return void this.hintOnce('b04.hint.dropOnTube');
      for (let i = 0; i < (strong ? 3 : 1); i++) this.bio({ type: 'squeezeDropper', dispenserId: h.id, targetId: t, force01: 0.5, dxCm: 0, dyCm: 0 });
      return void this.host.sound('drip');
    }
    if (h.kind === 'bioThermo') {
      const t = this.targetUnder();
      if (t) return void this.read('thermo', t);
      return void this.hintOnce('b04.hint.thermoInLiquid');
    }
    if (h.kind === 'tongs') {
      const bath = this.bathUnder(h.x, h.y);
      if (this.tongsTube && bath) {
        const r = this.bio({ type: 'tongs', tubeId: this.tongsTube, to: bath, depth01: strong ? 0.4 : 1 });
        if (r?.ok) this.tongsTube = null;
        return;
      }
      if (this.tongsTube) {
        const r = this.bio({ type: 'tongs', tubeId: this.tongsTube, to: 'home' });
        if (r?.ok) this.tongsTube = null;
        return;
      }
      const t = this.vesselUnder();
      if (t && w.bio.tubes[t]) {
        this.tongsTube = t;
        return void this.host.notify('info', 'b04.hint.tongsHolding', { id: t });
      }
      return void this.hintOnce('b04.hint.tongs');
    }
    if (h.kind === 'spatula') {
      const t = this.targetUnder();
      if (t === 'jSt' || t === 'jAm') return void this.bio({ type: 'scoopSolid', toolId: 'spa', sourceId: t, massG: this.scoopG });
      if (t === 'tr') return void this.bio({ type: 'dryTool', toolId: 'spa' });
      if (t) return void this.bio({ type: 'depositSolid', toolId: 'spa', targetId: t });
      return void this.hintOnce('b04.hint.spatula');
    }
    if (h.kind === 'weighBoat') {
      const t = this.targetUnder();
      if (t === 'tr') return void this.bio({ type: 'dryTool', toolId: 'bt' });
      if (t && w.bio.vessels[t]) return void this.bio({ type: 'emptyBoat', targetId: t });
      return void this.hintOnce('b04.hint.boat');
    }
    if (h.kind === 'scalpel' && this.targetUnder() === 'liv') return void this.bio({ type: 'cutTissue', sampleId: 'liv', toolId: 'sc', cutSizeCm: strong ? 2 : 0.5 });
    super.primary(strong);
  }

  onKeyDown(key: string, shift: boolean): boolean {
    const h = this.held;
    const k = key.toLowerCase();
    if (h?.kind === 'bioPipette' && (k === 'q' || k === 'e')) {
      const i = PIPETTE_STEPS.indexOf(this.pipetteMl);
      this.pipetteMl = PIPETTE_STEPS[Math.max(0, Math.min(PIPETTE_STEPS.length - 1, (i < 0 ? 5 : i) + (k === 'e' ? 1 : -1)))];
      this.host.notify('info', 'b04.hint.pipetteVolume', { ml: String(this.pipetteMl).replace('.', ',') });
      return true;
    }
    if (h?.kind === 'spatula' && (k === 'q' || k === 'e')) {
      const i = SCOOP_STEPS.indexOf(this.scoopG);
      this.scoopG = SCOOP_STEPS[Math.max(0, Math.min(SCOOP_STEPS.length - 1, (i < 0 ? 4 : i) + (k === 'e' ? 1 : -1)))];
      this.host.notify('info', 'b04.hint.scoopMass', { g: String(this.scoopG).replace('.', ',') });
      return true;
    }
    return super.onKeyDown(key, shift);
  }

  /** Ángulo de la mirada respecto del menisco (°, positivo desde arriba) con la cámara actual (paralaje). */
  eyeDegFor(target: string): number {
    const m = meniscusAtBio(this.w, target);
    const cam = this.lab.camera?.position();
    if (!m || !cam) return 0;
    const horiz = Math.hypot(cam.x - m.x, cam.y - m.y);
    return Math.round(((Math.atan2(cam.z - m.z, Math.max(1e-3, horiz)) * 180) / Math.PI) * 10) / 10;
  }

  read(instrument: BioInstrument, targetId: string) {
    const eyeDeg = instrument === 'scale' ? this.eyeDegFor(targetId) : undefined;
    const r = this.bio({ type: 'readInstrument', instrument, targetId, eyeDeg });
    if (r?.ok && r.id) this.host.notify('info', 'b04.hint.readingTaken', { id: r.id });
    return r;
  }
}
