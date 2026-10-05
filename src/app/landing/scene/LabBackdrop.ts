/**
 * Fondo 3D de la página de inicio: un laboratorio minimalista en «dibujo lineal» que la cámara recorre con el scroll.
 *
 * Estaciones (a lo largo de x):
 *   hero (x≈0)      matraz gigante vertiendo en un beaker, círculos, puntos y cruces;
 *   titration (x≈95) bureta sobre su soporte goteando NaOH en un Erlenmeyer con HCl y fenolftaleína: el color sale
 *                   del pH calculado (titration.ts) con los mL que marca el scroll o los botones de la tarjeta;
 *   bench (x≈150)   mesada isométrica con mechero encendido, gradilla con tubos de colores y beaker rosa;
 *   molecules (x≈230) moléculas de bolas y varillas (H₂O, CO₂, NaCl) girando.
 * No usa React: la página le pasa la vista (dos estaciones y la mezcla), el puntero y los mL de NaOH.
 */
import * as THREE from 'three';
import { DARK_PALETTE, InkKit, LIGHT_PALETTE, lathe, liquidProfile, type Palette } from './ink';
import { phenolphthaleinPink, titrationPH, TITRATION } from './titration';

export type CamKey = 'hero' | 'statement' | 'gallery' | 'titration' | 'labs' | 'features' | 'value' | 'how' | 'teachers' | 'end';

interface View {
  pos: THREE.Vector3;
  tgt: THREE.Vector3;
  fov: number;
}
const V = (pos: [number, number, number], tgt: [number, number, number], fov = 30): View => ({ pos: new THREE.Vector3(...pos), tgt: new THREE.Vector3(...tgt), fov });

/** Vistas de escritorio (los objetos quedan a la derecha del texto). */
const WIDE: Record<CamKey, View> = {
  hero: V([-6, 4, 62], [-6, 4, 0]),
  statement: V([-4, -10, 58], [-4, -10, 0]),
  gallery: V([2, -18, 70], [2, -18, 0]),
  titration: V([75, 19, 84], [83, 18, 0]),
  labs: V([206, 58, 62], [152, 2, 0], 24),
  features: V([214, 14, 62], [222, 11, 0]),
  value: V([232, 4, 46], [228, 8, 0]),
  how: V([96, 52, 66], [150, 2, 0], 24),
  teachers: V([238, 12, 80], [236, 10, 0]),
  end: V([238, 12, 90], [236, 10, 0]),
};
/** Vistas angostas (móvil): objetos centrados y más lejos; el texto lleva fondo propio. */
const NARROW: Record<CamKey, View> = {
  hero: V([4, 0, 92], [4, 2, 0]),
  statement: V([2, -12, 96], [2, -12, 0]),
  gallery: V([2, -18, 100], [2, -18, 0]),
  titration: V([95, 12, 104], [95, 13, 0]),
  labs: V([200, 62, 80], [150, 4, 0], 26),
  features: V([230, 12, 82], [230, 10, 0]),
  value: V([232, 8, 70], [230, 8, 0]),
  how: V([100, 58, 82], [150, 4, 0], 26),
  teachers: V([236, 12, 96], [236, 10, 0]),
  end: V([236, 12, 100], [236, 10, 0]),
};

const ease = (t: number) => t * t * (3 - 2 * t);

interface Drop {
  mesh: THREE.Object3D;
  vy: number;
  y0: number;
}

export class LabBackdrop {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.5, 1200);
  private pal: Palette;
  private kit: InkKit;
  private timer = new THREE.Timer();
  private raf = 0;
  private running = false;
  private dirty = true;
  private narrow = false;
  private view: { from: CamKey; to: CamKey; t: number } = { from: 'hero', to: 'hero', t: 0 };
  private pointer = new THREE.Vector2();
  private pointerS = new THREE.Vector2();
  private ml = 0;
  private mlShown = 0;
  private drops: Drop[] = [];
  private ripples: Array<{ obj: THREE.Object3D; age: number }> = [];
  private spin: THREE.Object3D[] = [];
  private bob: Array<{ obj: THREE.Object3D; y: number; amp: number; speed: number; phase: number }> = [];
  private flames: THREE.Object3D[] = [];
  private streamDrops: Array<{ obj: THREE.Object3D; u: number }> = [];
  private streamCurve!: THREE.CatmullRomCurve3;
  private heroLiquid!: { mesh: THREE.Mesh; inner: Array<[number, number]> };
  private flaskLiquid!: { mat: THREE.MeshToonMaterial; meshes: THREE.Mesh[]; inner: Array<[number, number]> };
  private buretteLiquid!: THREE.Group;
  private buretteTipY = 0;
  private flaskSurfaceY = 0;
  private titrX = 95;

  constructor(private canvas: HTMLCanvasElement, private reducedMotion: boolean, private dark = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.pal = dark ? DARK_PALETTE : LIGHT_PALETTE;
    this.kit = new InkKit(this.pal);
    this.build();
    this.resize();
  }

  // ───────────────────────────── API ─────────────────────────────

  setView(from: CamKey, to: CamKey, t: number) {
    this.view = { from, to, t };
    this.dirty = true;
  }

  setPointer(nx: number, ny: number) {
    this.pointer.set(nx, ny);
    this.dirty = true;
  }

  /** mL de NaOH añadidos en la valoración (0…35). */
  setTitration(ml: number) {
    this.ml = THREE.MathUtils.clamp(ml, 0, TITRATION.maxMl);
    this.dirty = true;
  }

  /** Cambia entre papel crema (claro) y plano técnico (oscuro): se rehace la escena; la valoración conserva sus mL. */
  setTheme(dark: boolean) {
    if (dark === this.dark) return;
    this.dark = dark;
    this.clearScene();
    this.pal = dark ? DARK_PALETTE : LIGHT_PALETTE;
    this.kit = new InkKit(this.pal);
    this.build();
    this.resize();
  }

  private clearScene() {
    this.disposeTree();
    this.scene.clear();
    this.drops = [];
    this.ripples = [];
    this.spin = [];
    this.bob = [];
    this.flames = [];
    this.streamDrops = [];
  }

  private disposeTree() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.kit.setResolution(w, h);
    this.narrow = w / h < 0.9;
    this.dirty = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer.reset();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.timer.update();
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.disposeTree();
    this.timer.dispose();
    this.renderer.dispose();
  }

  // ───────────────────────────── Cuadro ─────────────────────────────

  private frame() {
    const dt = Math.min(0.05, this.timer.getDelta());
    const t = this.timer.getElapsed();
    const animate = !this.reducedMotion;
    // Puntero suavizado (paralaje leve).
    this.pointerS.lerp(this.pointer, animate ? 0.06 : 1);
    // Bureta: el volumen mostrado sigue al pedido y cada 0,25 mL cae una gota.
    const before = this.mlShown;
    this.mlShown += (this.ml - this.mlShown) * (animate ? Math.min(1, dt * 4) : 1);
    if (Math.abs(this.ml - this.mlShown) < 1e-3) this.mlShown = this.ml;
    if (animate && this.mlShown > before) {
      const n = Math.floor(this.mlShown / 0.25) - Math.floor(before / 0.25);
      for (let i = 0; i < Math.min(n, 3); i++) this.spawnDrop(i * 0.6);
    }
    if (animate || this.dirty || this.mlShown !== before) {
      this.updateTitration();
      if (animate) this.animate(dt, t);
      this.placeCamera();
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  }

  private placeCamera() {
    const keys = this.narrow ? NARROW : WIDE;
    const a = keys[this.view.from];
    const b = keys[this.view.to];
    const k = ease(THREE.MathUtils.clamp(this.view.t, 0, 1));
    const pos = a.pos.clone().lerp(b.pos, k);
    const tgt = a.tgt.clone().lerp(b.tgt, k);
    pos.x += this.pointerS.x * 2.2;
    pos.y += this.pointerS.y * 1.4;
    this.camera.position.copy(pos);
    this.camera.fov = THREE.MathUtils.lerp(a.fov, b.fov, k);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(tgt);
  }

  private animate(dt: number, t: number) {
    for (const o of this.spin) o.rotation.y += dt * 0.35;
    for (const b of this.bob) b.obj.position.y = b.y + Math.sin(t * b.speed + b.phase) * b.amp;
    for (const f of this.flames) {
      f.scale.set(1 + Math.sin(t * 17) * 0.025, 1 + Math.sin(t * 11.3) * 0.06 + Math.sin(t * 23) * 0.03, 1);
    }
    // Chorro del matraz gigante: gotitas que recorren la curva.
    for (const s of this.streamDrops) {
      s.u = (s.u + dt * 0.55) % 1;
      s.obj.position.copy(this.streamCurve.getPointAt(s.u));
    }
    // El beaker del inicio se llena y se vacía despacio (ciclo de 14 s).
    const lvl = 2.2 + 2.6 * (0.5 - 0.5 * Math.cos((t / 14) * Math.PI * 2));
    this.setHeroLevel(lvl);
    // Gotas de la bureta.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.y0 > 0) {
        d.y0 -= dt;
        continue;
      }
      d.mesh.visible = true;
      d.vy -= 60 * dt;
      d.mesh.position.y += d.vy * dt;
      if (d.mesh.position.y <= this.flaskSurfaceY) {
        this.scene.remove(d.mesh);
        this.drops.splice(i, 1);
        this.ripple();
      }
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      const s = 0.3 + r.age * 2.4;
      r.obj.scale.set(s, 1, s);
      if (r.age > 0.7) {
        this.scene.remove(r.obj);
        this.ripples.splice(i, 1);
      }
    }
  }

  // ───────────────────────────── Valoración ─────────────────────────────

  private updateTitration() {
    const pink = phenolphthaleinPink(titrationPH(this.mlShown));
    const c = new THREE.Color(this.pal.white).lerp(new THREE.Color(this.pal.pink), pink);
    this.flaskLiquid.mat.color.copy(c);
    // Bureta: baja el nivel de NaOH (35 mL ≈ 24 cm de tubo).
    const frac = 1 - this.mlShown / TITRATION.maxMl;
    this.buretteLiquid.scale.y = Math.max(0.02, 0.15 + 0.85 * frac);
  }

  private spawnDrop(delay: number) {
    const m = this.kit.solid(new THREE.SphereGeometry(0.32, 14, 10), this.pal.white, { outline: 0.05, edges: false });
    m.position.set(this.titrX, this.buretteTipY, 0);
    m.visible = false;
    this.scene.add(m);
    this.drops.push({ mesh: m, vy: 0, y0: delay });
  }

  private ripple() {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const ring = this.kit.polyline(pts, 2, phenolphthaleinPink(titrationPH(this.mlShown + 0.6)) > 0.2 ? this.pal.pink : this.pal.ink, true);
    ring.position.set(this.titrX, this.flaskSurfaceY + 0.05, 0);
    this.scene.add(ring);
    this.ripples.push({ obj: ring, age: 0 });
  }

  private setHeroLevel(level: number) {
    const geo = lathe(liquidProfile(this.heroLiquid.inner, level), 40);
    this.heroLiquid.mesh.geometry.dispose();
    this.heroLiquid.mesh.geometry = geo;
    const hull = this.heroLiquid.mesh.userData.hull as THREE.Mesh | undefined;
    if (hull) hull.geometry = geo;
  }

  // ───────────────────────────── Construcción ─────────────────────────────

  private build() {
    this.scene.add(new THREE.HemisphereLight(this.pal.sky, this.pal.ground, this.dark ? 1.25 : 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, this.dark ? 1.1 : 1.4);
    sun.position.set(-30, 60, 40);
    this.scene.add(sun);
    this.buildHero();
    this.buildTitration(this.titrX);
    this.buildBench(150);
    this.buildMolecules(232);
  }

  /** Matraz Erlenmeyer de vidrio (perfil exterior) y su perfil interior para el líquido. */
  private erlenmeyer(scale = 1) {
    const outer: Array<[number, number]> = [[0.001, 0], [3.5, 0], [3.75, 0.25], [3.75, 0.7], [1.15, 6.9], [1.15, 9.6], [1.42, 9.8], [1.42, 10.1], [1.15, 10.1]];
    const inner: Array<[number, number]> = [[0.001, 0.18], [3.5, 0.18], [3.58, 0.7], [1.02, 6.9], [1.02, 10]];
    const g = new THREE.Group();
    const geo = lathe(outer, 56);
    g.add(new THREE.Mesh(geo, this.kit.glass()));
    g.add(this.kit.edges(geo, 25));
    g.scale.setScalar(scale);
    return { group: g, inner };
  }

  private beaker(scale = 1) {
    const outer: Array<[number, number]> = [[0.001, 0], [3, 0], [3.08, 0.12], [3.08, 7.4], [3.3, 7.6], [3.3, 7.75], [3.05, 7.75]];
    const inner: Array<[number, number]> = [[0.001, 0.16], [2.92, 0.16], [2.95, 0.3], [2.95, 7.6]];
    const g = new THREE.Group();
    const geo = lathe(outer, 56);
    g.add(new THREE.Mesh(geo, this.kit.glass()));
    g.add(this.kit.edges(geo, 25));
    // Graduaciones al frente.
    for (let i = 1; i <= 5; i++) {
      const y = 1.1 * i;
      const w = i % 2 ? 0.9 : 0.55;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI / 2 - w / 2 / 3.1 + (k / 6) * (w / 3.1);
        pts.push(new THREE.Vector3(Math.cos(a) * 3.12, y, Math.sin(a) * 3.12));
      }
      g.add(this.kit.polyline(pts, 1.5));
    }
    g.scale.setScalar(scale);
    return { group: g, inner };
  }

  private testTube() {
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      prof.push([0.001 + Math.sin(a) * 0.75, 0.75 - Math.cos(a) * 0.75]);
    }
    prof.push([0.75, 12.5], [0.88, 12.7], [0.75, 12.7]);
    const inner = prof.slice(0, 10).map(([r, y]) => [Math.max(0.001, r - 0.08), y + 0.06] as [number, number]);
    inner.push([0.67, 12.4]);
    const g = new THREE.Group();
    const geo = lathe(prof, 32);
    g.add(new THREE.Mesh(geo, this.kit.glass()));
    g.add(this.kit.edges(geo, 25));
    return { group: g, inner };
  }

  private liquid(inner: Array<[number, number]>, level: number, color: number, seg = 48) {
    const geo = lathe(liquidProfile(inner, level), seg);
    const mat = this.kit.fill(color);
    const mesh = new THREE.Mesh(geo, mat);
    const hull = new THREE.Mesh(geo, this.kit.hull(0.035));
    mesh.userData.hull = hull;
    const g = new THREE.Group();
    g.add(mesh, hull);
    return { group: g, mesh, mat };
  }

  private disc(r: number, x: number, y: number, z: number, color: number = this.pal.disc) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  /** Cuadrícula de puntos y cruces «×» (decoración de la referencia). */
  private dots(x: number, y: number, z: number, cols: number, rows: number, step = 1.1, color: number = this.pal.grey) {
    const pos: number[] = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (((i * 7 + j * 3) % 5) !== 0) pos.push(x + i * step, y - j * step, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 5, sizeAttenuation: false }));
    this.scene.add(pts);
  }

  private cross(x: number, y: number, z: number, s = 0.5, color: number = this.pal.teal) {
    const g = new THREE.Group();
    g.add(this.kit.polyline([new THREE.Vector3(-s, -s, 0), new THREE.Vector3(s, s, 0)], 2, color));
    g.add(this.kit.polyline([new THREE.Vector3(-s, s, 0), new THREE.Vector3(s, -s, 0)], 2, color));
    g.position.set(x, y, z);
    this.scene.add(g);
    this.bob.push({ obj: g, y, amp: 0.4, speed: 0.7 + Math.random() * 0.5, phase: Math.random() * 6 });
  }

  private ring(x: number, y: number, z: number, r: number, color: number = this.pal.ink) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    const l = this.kit.polyline(pts, 2, color, true);
    l.position.set(x, y, z);
    this.scene.add(l);
    this.bob.push({ obj: l, y, amp: 0.6, speed: 0.5 + Math.random() * 0.4, phase: Math.random() * 6 });
    return l;
  }

  private buildHero() {
    // Círculos blancos grandes al fondo y decoración.
    this.disc(9, -20, -8, -14);
    this.disc(6.5, 22, -22, -10);
    this.disc(4, 30, 14, -16);
    this.dots(8, 12, -6, 6, 9);
    this.dots(-24, -18, -6, 4, 6);
    this.cross(14, 6, -2);
    this.cross(19, -4, -3);
    this.cross(-16, 14, -4, 0.45, this.pal.coral);
    this.cross(26, 2, -5);
    this.ring(17, 10, -3, 0.7);
    this.ring(24, -10, -4, 1.1, this.pal.teal);
    // Matraz gigante que entra por la esquina y vierte (como el brazo robótico de la referencia).
    const flask = this.erlenmeyer(3.2);
    flask.group.position.set(24, 22, -4);
    flask.group.rotation.z = 2.25;
    flask.group.rotation.y = -0.25;
    // Un poco de líquido dentro, junto a la boca.
    const fl = this.liquid([[0.001, 6.4], [1.02, 6.9], [1.02, 9.9]], 9.9, this.pal.teal);
    fl.group.position.y = 0;
    flask.group.add(fl.group);
    this.scene.add(flask.group);
    // Boca del matraz en coordenadas del mundo, para empezar el chorro ahí.
    flask.group.updateMatrixWorld(true);
    const mouth = new THREE.Vector3(0, 10.1, 0).applyMatrix4(flask.group.matrixWorld);
    // Beaker abajo, que recibe el chorro.
    const bk = this.beaker(2.1);
    bk.group.position.set(6, -26, 0);
    this.scene.add(bk.group);
    const liq = this.liquid(bk.inner, 3, this.pal.teal);
    liq.group.scale.setScalar(2.1);
    liq.group.position.copy(bk.group.position);
    this.scene.add(liq.group);
    this.heroLiquid = { mesh: liq.mesh, inner: bk.inner };
    this.streamCurve = new THREE.CatmullRomCurve3([
      mouth,
      mouth.clone().add(new THREE.Vector3(-1.2, -3, 0)),
      new THREE.Vector3(6.4, -10, 0),
      new THREE.Vector3(6, -24.5, 0),
    ]);
    const tube = new THREE.TubeGeometry(this.streamCurve, 64, 0.32, 10, false);
    this.scene.add(this.kit.solid(tube, this.pal.teal, { outline: 0.05, edges: false }));
    for (let i = 0; i < 6; i++) {
      const d = this.kit.solid(new THREE.SphereGeometry(0.42, 14, 10), this.pal.tealLight, { outline: 0.05, edges: false });
      this.scene.add(d);
      this.streamDrops.push({ obj: d, u: i / 6 });
    }
  }

  private buildTitration(x: number) {
    const g = new THREE.Group();
    g.position.x = x;
    this.scene.add(g);
    // Soporte universal: base, varilla y pinza.
    g.add(this.place(this.kit.solid(new THREE.BoxGeometry(18, 1, 10), this.pal.steel, { outline: 0.06 }), -3, 0.5, 0));
    g.add(this.place(this.kit.solid(new THREE.CylinderGeometry(0.4, 0.4, 46, 20), this.pal.steel, { outline: 0.05, edges: false }), -9, 23.5, -2));
    g.add(this.place(this.kit.solid(new THREE.BoxGeometry(9.4, 1.2, 1.4), this.pal.teal, { outline: 0.05 }), -4.4, 34, -1.2));
    g.add(this.place(this.kit.solid(new THREE.BoxGeometry(1.6, 1.6, 1.6), this.pal.teal, { outline: 0.05 }), -9, 34, -2));
    // Bureta de 50 mL: tubo de vidrio, NaOH incoloro adentro, llave coral y punta.
    const burette = new THREE.Group();
    burette.position.set(0, 18, 0);
    const tubeGeo = lathe([[0.62, 0], [0.62, 26], [0.75, 26.2], [0.62, 26.2]], 32);
    burette.add(new THREE.Mesh(tubeGeo, this.kit.glass()));
    burette.add(this.kit.edges(tubeGeo, 25));
    for (let i = 0; i <= 20; i++) {
      const y = 2 + i * 1.15;
      const w = i % 5 === 0 ? 0.7 : 0.35;
      burette.add(this.kit.polyline([new THREE.Vector3(-w / 2, y, 0.64), new THREE.Vector3(w / 2, y, 0.64)], 1.4));
    }
    const nl = new THREE.Group();
    const naoh = this.liquid([[0.001, 0], [0.5, 0], [0.5, 24]], 24, this.pal.white, 24);
    nl.add(naoh.group);
    nl.position.y = 0.6;
    burette.add(nl);
    this.buretteLiquid = nl;
    // Llave y punta.
    burette.add(this.place(this.kit.solid(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 20), this.pal.coral, { outline: 0.05, edges: false }), 0, -0.6, 0, [0, 0, Math.PI / 2]));
    burette.add(this.place(this.kit.solid(new THREE.BoxGeometry(0.5, 2.2, 0.5), this.pal.coral, { outline: 0.04 }), 1.6, -0.6, 0));
    const tipGeo = lathe([[0.12, -3.2], [0.5, -1.2], [0.62, 0]], 24);
    burette.add(new THREE.Mesh(tipGeo, this.kit.glass()));
    burette.add(this.kit.edges(tipGeo, 25));
    g.add(burette);
    this.buretteTipY = 18 - 3.3;
    // Erlenmeyer con HCl + fenolftaleína.
    const fl = this.erlenmeyer(1.25);
    fl.group.position.set(0, 1, 0);
    g.add(fl.group);
    const level = 2.6;
    const liq = this.liquid(fl.inner, level, this.pal.white);
    liq.group.scale.setScalar(1.25);
    liq.group.position.set(0, 1, 0);
    g.add(liq.group);
    this.flaskLiquid = { mat: liq.mat, meshes: [liq.mesh], inner: fl.inner };
    this.flaskSurfaceY = 1 + level * 1.25;
    // Decoración.
    this.disc(10, x + 12, 24, -14);
    this.disc(5, x - 20, 8, -12);
    this.dots(x + 9, 40, -6, 5, 7);
    this.cross(x + 8, 12, -2);
    this.cross(x - 14, 30, -3, 0.45, this.pal.coral);
    this.ring(x + 14, 6, -3, 0.9, this.pal.teal);
  }

  private buildBench(x: number) {
    const g = new THREE.Group();
    g.position.x = x;
    this.scene.add(g);
    // Piso cuadriculado (como la planta isométrica de la referencia).
    const pos: number[] = [];
    for (let i = -40; i <= 40; i += 5) {
      pos.push(i, 0, -40, i, 0, 40, -40, 0, i, 40, 0, i);
    }
    const gl = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)), new THREE.LineBasicMaterial({ color: this.pal.grey }));
    g.add(gl);
    // Mesada.
    g.add(this.place(this.kit.solid(new THREE.BoxGeometry(46, 1.6, 18), this.pal.white, { outline: 0.07 }), 0, 9.2, 0));
    for (const [px, pz] of [[-21, -7], [21, -7], [-21, 7], [21, 7]]) g.add(this.place(this.kit.solid(new THREE.BoxGeometry(1.4, 8.4, 1.4), this.pal.steel, { outline: 0.05 }), px, 4.2, pz));
    const top = 10;
    // Mechero de Bunsen encendido.
    const bun = new THREE.Group();
    bun.position.set(-12, top, -2);
    bun.add(this.kit.solid(lathe([[0.001, 0], [3, 0], [3, 0.5], [1, 1.4], [0.001, 1.4]], 40), this.pal.steel, { outline: 0.05, edges: 30 }));
    bun.add(this.place(this.kit.solid(new THREE.CylinderGeometry(0.6, 0.6, 9, 24), this.pal.steel, { outline: 0.05, edges: false }), 0, 5.6, 0));
    bun.add(this.place(this.kit.solid(new THREE.CylinderGeometry(0.78, 0.78, 1.3, 24), this.pal.teal, { outline: 0.05, edges: false }), 0, 2.6, 0));
    const flame = new THREE.Group();
    flame.position.y = 10.1;
    const outer = new THREE.Mesh(lathe([[0.001, 0], [0.62, 0.5], [0.72, 2.4], [0.45, 5], [0.001, 7.2]], 32), new THREE.MeshBasicMaterial({ color: this.pal.flame, transparent: true, opacity: 0.55, depthWrite: false }));
    const inner = new THREE.Mesh(lathe([[0.001, 0], [0.44, 0.3], [0.3, 1.7], [0.001, 2.6]], 24), new THREE.MeshBasicMaterial({ color: this.pal.flameCore, transparent: true, opacity: 0.9, depthWrite: false }));
    flame.add(outer, inner, this.kit.edges(outer.geometry, 80, 1.5));
    bun.add(flame);
    this.flames.push(flame);
    // Manguera coral.
    const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(0.6, 1.2, 0), new THREE.Vector3(4, 1.4, 1), new THREE.Vector3(7, 0.6, 5), new THREE.Vector3(9, 0.6, 9)]);
    bun.add(this.kit.solid(new THREE.TubeGeometry(hose, 40, 0.4, 10, false), this.pal.coral, { outline: 0.05, edges: false }));
    g.add(bun);
    // Gradilla con tubos de colores: CaCO₃ blanco, Fe(OH)₃ pardo, Cu²⁺ azul, Fe³⁺ amarillo, fenolftaleína rosa.
    const rack = new THREE.Group();
    rack.position.set(6, top, -1);
    rack.add(this.place(this.kit.solid(new THREE.BoxGeometry(17, 0.8, 4.4), this.pal.yellow, { outline: 0.05 }), 0, 0.4, 0));
    rack.add(this.place(this.kit.solid(new THREE.BoxGeometry(17, 0.6, 4.4), this.pal.yellow, { outline: 0.05 }), 0, 6.2, 0));
    rack.add(this.place(this.kit.solid(new THREE.BoxGeometry(0.6, 6.2, 4.4), this.pal.yellow, { outline: 0.05 }), -8.2, 3.3, 0));
    rack.add(this.place(this.kit.solid(new THREE.BoxGeometry(0.6, 6.2, 4.4), this.pal.yellow, { outline: 0.05 }), 8.2, 3.3, 0));
    const colors = [0xf2f0ea, 0xb5642a, 0x3d8fe0, 0xf3c13a, this.pal.pink];
    colors.forEach((c, i) => {
      const tt = this.testTube();
      const tg = new THREE.Group();
      tg.position.set(-6 + i * 3, 0.8, 0);
      tg.add(tt.group);
      const lq = this.liquid(tt.inner, 4.5 + (i % 2) * 0.8, c, 28);
      tg.add(lq.group);
      if (i === 1) tg.add(this.liquid(tt.inner, 1.2, 0x7a3a12, 28).group);
      rack.add(tg);
    });
    g.add(rack);
    // Beaker rosa y matraz con Cu²⁺.
    const bk = this.beaker(1);
    bk.group.position.set(17, top, 4);
    g.add(bk.group);
    const bl = this.liquid(bk.inner, 3.4, this.pal.pink);
    bl.group.position.copy(bk.group.position);
    g.add(bl.group);
    const er = this.erlenmeyer(0.9);
    er.group.position.set(-3, top, 5);
    g.add(er.group);
    const el = this.liquid(er.inner, 2.6, 0x3d8fe0);
    el.group.scale.setScalar(0.9);
    el.group.position.copy(er.group.position);
    g.add(el.group);
    // Moléculas flotando sobre la mesada.
    const w = this.water(0.9);
    w.position.set(-2, top + 16, -4);
    g.add(w);
    this.spin.push(w);
    this.bob.push({ obj: w, y: w.position.y, amp: 0.8, speed: 0.6, phase: 0 });
    const co2 = this.co2(0.8);
    co2.position.set(14, top + 14, -6);
    g.add(co2);
    this.spin.push(co2);
    this.bob.push({ obj: co2, y: co2.position.y, amp: 0.7, speed: 0.75, phase: 2 });
  }

  private buildMolecules(x: number) {
    const w = this.water(2.4);
    w.position.set(x - 6, 14, 0);
    this.scene.add(w);
    this.spin.push(w);
    this.bob.push({ obj: w, y: 14, amp: 1, speed: 0.5, phase: 0 });
    const c = this.co2(2);
    c.position.set(x + 10, 4, -4);
    this.scene.add(c);
    this.spin.push(c);
    this.bob.push({ obj: c, y: 4, amp: 0.9, speed: 0.6, phase: 1.6 });
    const na = this.nacl(1.6);
    na.position.set(x + 9, 18, -8);
    this.scene.add(na);
    this.spin.push(na);
    this.bob.push({ obj: na, y: 18, amp: 0.8, speed: 0.45, phase: 3 });
    this.disc(11, x + 4, 8, -20);
    this.disc(5, x - 16, -2, -12);
    this.dots(x - 18, 26, -8, 5, 6);
    this.cross(x - 10, 2, -2);
    this.cross(x + 18, 14, -3, 0.5, this.pal.coral);
    this.ring(x + 2, 24, -3, 0.9, this.pal.teal);
    this.ring(x - 14, 10, -2, 0.6);
  }

  // ───────────────────────────── Moléculas ─────────────────────────────

  private atom(r: number, color: number) {
    return this.kit.solid(new THREE.SphereGeometry(r, 28, 20), color, { outline: Math.max(0.05, r * 0.06), edges: false });
  }

  private bond(a: THREE.Vector3, b: THREE.Vector3, r = 0.2) {
    const len = a.distanceTo(b);
    const m = this.kit.solid(new THREE.CylinderGeometry(r, r, len, 14), this.pal.atomH, { outline: 0.04, edges: false });
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }

  private water(s: number) {
    const g = new THREE.Group();
    const o = new THREE.Vector3(0, 0, 0);
    const half = (104.5 / 2) * (Math.PI / 180);
    const h1 = new THREE.Vector3(Math.sin(half), -Math.cos(half), 0).multiplyScalar(1.9);
    const h2 = new THREE.Vector3(-Math.sin(half), -Math.cos(half), 0).multiplyScalar(1.9);
    g.add(this.bond(o, h1), this.bond(o, h2));
    g.add(this.atom(1, this.pal.coral));
    for (const h of [h1, h2]) {
      const a = this.atom(0.62, this.pal.atomH);
      a.position.copy(h);
      g.add(a);
    }
    g.scale.setScalar(s);
    return g;
  }

  private co2(s: number) {
    const g = new THREE.Group();
    const l = new THREE.Vector3(-2.1, 0, 0);
    const r = new THREE.Vector3(2.1, 0, 0);
    g.add(this.bond(l, r, 0.24));
    g.add(this.atom(0.9, this.pal.carbon));
    for (const p of [l, r]) {
      const a = this.atom(0.85, this.pal.coral);
      a.position.copy(p);
      g.add(a);
    }
    g.scale.setScalar(s);
    return g;
  }

  private nacl(s: number) {
    const g = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push(new THREE.Vector3(x, y, z).multiplyScalar(1.3));
    const lines: Array<[THREE.Vector3, THREE.Vector3]> = [];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.abs(pts[i].distanceTo(pts[j]) - 2.6) < 0.01) lines.push([pts[i], pts[j]]);
    for (const [a, b] of lines) g.add(this.bond(a, b, 0.14));
    // Na⁺ (pequeño, verde azulado) y Cl⁻ (grande, amarillo) alternan en los vértices del cubo.
    for (const p of pts) {
      const na = [p.x, p.y, p.z].filter((v) => v > 0).length % 2 === 0;
      const a = this.atom(na ? 0.55 : 0.85, na ? this.pal.teal : this.pal.yellow);
      a.position.copy(p);
      g.add(a);
    }
    g.rotation.set(0.5, 0.4, 0);
    g.scale.setScalar(s);
    return g;
  }

  private place<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rot?: [number, number, number]): T {
    o.position.set(x, y, z);
    if (rot) o.rotation.set(...rot);
    return o;
  }
}
