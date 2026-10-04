/**
 * Texturas generadas por código (CanvasTexture): etiquetas, graduaciones, pantallas LCD, carteles,
 * azulejos, resina de la mesada, veta de madera. Sin imágenes externas (§3.5).
 */
import * as THREE from 'three';

const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Pictograma SGA de comburente. */
function drawOxidizer(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  g.save();
  g.translate(cx, cy);
  g.rotate(Math.PI / 4);
  g.fillStyle = '#fff';
  g.strokeStyle = '#d0021b';
  g.lineWidth = s * 0.14;
  g.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
  g.strokeRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
  g.restore();
  g.strokeStyle = '#000';
  g.lineWidth = s * 0.08;
  g.beginPath();
  g.arc(cx, cy + s * 0.25, s * 0.22, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#000';
  g.beginPath();
  g.moveTo(cx - s * 0.18, cy + s * 0.05);
  g.quadraticCurveTo(cx - s * 0.2, cy - s * 0.3, cx, cy - s * 0.5);
  g.quadraticCurveTo(cx + s * 0.2, cy - s * 0.3, cx + s * 0.18, cy + s * 0.05);
  g.fill();
}

function drawWarn(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  g.save();
  g.translate(cx, cy);
  g.rotate(Math.PI / 4);
  g.fillStyle = '#fff';
  g.strokeStyle = '#d0021b';
  g.lineWidth = s * 0.14;
  g.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
  g.strokeRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
  g.restore();
  g.fillStyle = '#000';
  g.fillRect(cx - s * 0.07, cy - s * 0.45, s * 0.14, s * 0.55);
  g.beginPath();
  g.arc(cx, cy + s * 0.32, s * 0.09, 0, Math.PI * 2);
  g.fill();
}

/** Etiqueta de papel con título, subtítulo y pictograma opcional. */
export function labelTexture(lines: string[], opts: { picto?: 'ox' | 'warn'; color?: string; band?: string; w?: number; h?: number } = {}): THREE.CanvasTexture {
  const W = opts.w ?? 256;
  const H = opts.h ?? 128;
  const [c, g] = canvas(W, H);
  g.fillStyle = opts.color ?? '#fffdf3';
  g.fillRect(0, 0, W, H);
  g.fillStyle = opts.band ?? '#2f7fd1';
  g.fillRect(0, 0, W, H * 0.12);
  g.strokeStyle = '#9a9a9a';
  g.lineWidth = 3;
  g.strokeRect(1, 1, W - 2, H - 2);
  const px = opts.picto ? H * 0.42 : 0;
  if (opts.picto === 'ox') drawOxidizer(g, H * 0.36, H * 0.56, H * 0.3);
  if (opts.picto === 'warn') drawWarn(g, H * 0.36, H * 0.56, H * 0.3);
  g.fillStyle = '#1d2329';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((l, i) => {
    const size = i === 0 ? H * 0.26 : H * 0.18;
    g.font = `${i === 0 ? 'bold' : 'normal'} ${size}px ${FONT}`;
    const y = H * 0.15 + ((H * 0.85) / (n + 1)) * (i + 1);
    g.fillText(l, W / 2 + px / 2, y, W - px - 12);
  });
  return tex(c);
}

/** Rótulo de cinta para tubo de ensayo (texto azul de marcador). */
export function tapeTexture(text: string): THREE.CanvasTexture {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#fffbe6';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#b8a77a';
  g.lineWidth = 3;
  g.strokeRect(1, 1, 126, 62);
  g.fillStyle = '#1b3a8a';
  g.font = `bold 34px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 34, 120);
  return tex(c);
}

/**
 * Graduaciones de un recipiente (textura envolvente, transparente).
 * `marks`: lista de [altura relativa 0–1 en la textura, mayor?, etiqueta?].
 */
export function graduationTexture(marks: Array<[number, boolean, string?]>, color = '#123a63', opts: { title?: string; sub?: string } = {}): THREE.CanvasTexture {
  const W = 256;
  const H = 1024;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  for (const [v, major, lab] of marks) {
    const y = H * (1 - v);
    g.lineWidth = major ? 5 : 3;
    g.beginPath();
    g.moveTo(40, y);
    g.lineTo(major ? 130 : 95, y);
    g.stroke();
    if (lab) {
      g.font = `bold 46px ${FONT}`;
      g.fillText(lab, 140, y);
    }
  }
  if (opts.title) {
    g.font = `bold 40px ${FONT}`;
    g.fillText(opts.title, 40, H * 0.04);
  }
  if (opts.sub) {
    g.font = `30px ${FONT}`;
    g.fillText(opts.sub, 40, H * 0.97);
  }
  const t = tex(c);
  return t;
}

/** Pantalla LCD (texto verde/ámbar sobre fondo oscuro). Devuelve la textura y una función para actualizarla. */
export function lcdTexture(w = 256, h = 96): { texture: THREE.CanvasTexture; set: (text: string, color?: string, small?: string) => void } {
  const [c, g] = canvas(w, h);
  const texture = tex(c);
  let last = '';
  const set = (text: string, color = '#6ef08a', small?: string) => {
    const key = `${text}|${color}|${small}`;
    if (key === last) return;
    last = key;
    g.fillStyle = '#0d1a12';
    g.fillRect(0, 0, w, h);
    g.fillStyle = color;
    g.font = `bold ${h * 0.58}px Consolas, ui-monospace, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h * 0.52, w - 10);
    if (small) {
      g.font = `${h * 0.18}px ${FONT}`;
      g.fillStyle = '#8892a0';
      g.textAlign = 'left';
      g.fillText(small, 6, h * 0.14);
    }
    texture.needsUpdate = true;
  };
  return { texture, set };
}

/** Cartel de seguridad (título en banda de color, icono y texto). */
export function posterTexture(title: string, lines: string[], band: string, icon: 'goggles' | 'eye' | 'nofood' | 'ox'): THREE.CanvasTexture {
  const W = 256;
  const H = 352;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = band;
  g.fillRect(0, 0, W, 70);
  g.fillStyle = '#fff';
  g.font = `bold 34px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, W / 2, 36, W - 16);
  const cx = W / 2;
  const cy = 170;
  const s = 62;
  g.lineWidth = 10;
  if (icon === 'goggles') {
    g.fillStyle = band;
    g.beginPath();
    g.arc(cx, cy, s * 1.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(cx - s * 0.5, cy, s * 0.42, s * 0.3, 0, 0, Math.PI * 2);
    g.ellipse(cx + s * 0.5, cy, s * 0.42, s * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  } else if (icon === 'eye') {
    g.fillStyle = band;
    g.fillRect(cx - s * 1.3, cy - s * 1.3, s * 2.6, s * 2.6);
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(cx, cy, s * 0.9, s * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = band;
    g.beginPath();
    g.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
    g.fill();
  } else if (icon === 'nofood') {
    g.strokeStyle = '#d0021b';
    g.beginPath();
    g.arc(cx, cy, s * 1.2, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#333';
    g.fillRect(cx - s * 0.3, cy - s * 0.6, s * 0.6, s * 1.2);
    g.beginPath();
    g.moveTo(cx - s * 0.85, cy + s * 0.85);
    g.lineTo(cx + s * 0.85, cy - s * 0.85);
    g.stroke();
  } else drawOxidizer(g, cx, cy, s * 1.2);
  g.fillStyle = '#1d2329';
  g.font = `26px ${FONT}`;
  lines.forEach((l, i) => g.fillText(l, W / 2, 290 + i * 30, W - 16));
  return tex(c);
}

/** Azulejos tipo «subway» para la pared. */
export function tileTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#d5dad9';
  g.fillRect(0, 0, 256, 128);
  const tile = (x: number, y: number) => {
    g.fillStyle = '#f7f8f8';
    g.fillRect(x + 2, y + 2, 124, 60);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(x + 8, y + 6, 80, 4);
  };
  tile(0, 0);
  tile(128, 0);
  tile(-64, 64);
  tile(64, 64);
  tile(192, 64);
  return tex(c, [1, 1]);
}

/** Resina epoxi moteada de la mesada. */
export function epoxyTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#2c3237';
  g.fillRect(0, 0, 512, 512);
  let h = 12345;
  const rnd = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(90,100,110,0.55)' : 'rgba(20,24,28,0.6)';
    g.fillRect(rnd() * 512, rnd() * 512, 1.5, 1.5);
  }
  return tex(c, [8, 1]);
}

/** Veta de madera. */
export function woodTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c8a27a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(150,105,60,${0.15 + (i % 5) * 0.05})`;
    g.lineWidth = 1 + (i % 3);
    g.beginPath();
    const y = i * 6.5;
    g.moveTo(0, y);
    g.bezierCurveTo(80, y + 6, 170, y - 6, 256, y + 2);
    g.stroke();
  }
  return tex(c, [1, 1]);
}

/** Baldosa del suelo. */
export function floorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c7cdd1';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#aab2b7';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = 'rgba(120,130,135,0.25)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  return tex(c, [20, 6]);
}

/** Esfera de reloj. */
export function clockTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2b3238';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = i % 3 ? 4 : 9;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
    g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112);
    g.stroke();
  }
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(178, 92);
  g.stroke();
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(112, 44);
  g.stroke();
  return tex(c);
}

/** Textura de texto para sprites flotantes (etiquetas de acción). */
export function textSpriteTexture(text: string, color = '#ffffff'): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.font = `bold 64px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 14;
  g.strokeStyle = '#1d2329';
  g.strokeText(text, 256, 64, 500);
  g.fillStyle = color;
  g.fillText(text, 256, 64, 500);
  return tex(c);
}

/** Etiqueta de nombre (píldora oscura con texto claro; borde ámbar si el objeto está seleccionado). Ancho según el texto. */
export function nameTagTexture(text: string, selected = false): THREE.CanvasTexture {
  const H = 64;
  const font = `600 38px ${FONT}`;
  const [, mg] = canvas(8, 8);
  mg.font = font;
  const W = Math.ceil(Math.min(900, mg.measureText(text).width + 36));
  const [c, g] = canvas(W, H);
  g.fillStyle = 'rgba(22, 28, 34, 0.82)';
  g.strokeStyle = selected ? '#ffb000' : 'rgba(255, 255, 255, 0.35)';
  g.lineWidth = selected ? 6 : 3;
  g.beginPath();
  g.roundRect(3, 3, W - 6, H - 6, (H - 6) / 2);
  g.fill();
  g.stroke();
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = selected ? '#ffe2a0' : '#f4f7fa';
  g.fillText(text, W / 2, H / 2 + 1, W - 30);
  return tex(c);
}

/** Puntero de la demostración (flecha con contorno; al pulsar, un anillo marca el clic). */
export function demoPointerTexture(down: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  if (down) {
    g.strokeStyle = 'rgba(255, 176, 0, 0.9)';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(30, 30, 24, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(30, 30);
  g.lineTo(30, 104);
  g.lineTo(48, 86);
  g.lineTo(62, 116);
  g.lineTo(76, 110);
  g.lineTo(62, 80);
  g.lineTo(88, 80);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1d2329';
  g.lineWidth = 6;
  g.lineJoin = 'round';
  g.stroke();
  g.fill();
  return tex(c);
}

/** Mano (abanicar) y cara tachada (oler directo), dibujadas con formas simples. */
export function ghostTexture(kind: 'hand' | 'face'): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  if (kind === 'hand') {
    g.fillStyle = '#f1c9a5';
    g.strokeStyle = '#b98a64';
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect(70, 110, 120, 110, 40);
    g.fill();
    g.stroke();
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.roundRect(72 + i * 30, 30 + (i === 0 || i === 3 ? 20 : 0), 26, 100, 13);
      g.fill();
      g.stroke();
    }
    g.beginPath();
    g.roundRect(180, 130, 60, 26, 13);
    g.fill();
    g.stroke();
  } else {
    g.fillStyle = '#f1c9a5';
    g.strokeStyle = '#b98a64';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(128, 128, 80, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#1d2329';
    g.beginPath();
    g.arc(100, 110, 9, 0, Math.PI * 2);
    g.arc(156, 110, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d0021b';
    g.lineWidth = 16;
    g.beginPath();
    g.arc(128, 128, 112, 0, Math.PI * 2);
    g.moveTo(48, 208);
    g.lineTo(208, 48);
    g.stroke();
  }
  return tex(c);
}

/** Textura radial suave para vapor y destellos. */
export function softDotTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return tex(c);
}
