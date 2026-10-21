/**
 * Vista por el ocular (§15.4): visor gráfico separado de la cámara de sala, DERIVADO del estado físico. Recorte por la
 * platina (o la posición de la muestra) y el campo del objetivo/zoom, imagen invertida en el compuesto, desenfoque
 * según el error de foco, brillo y contraste según luz, diafragma y condensador, capas del montaje (burbujas, residuo,
 * vidrio roto) y campo oscuro si falta luz o el revólver no enclava. Solo presentación: nunca decide la evidencia.
 */
import { useEffect, useRef } from 'react';
import type { OpticalWorld } from '../../../simulation/optical-world/types';
import { microscopeView, stereoView } from '../../../simulation/optical-world/world';
import { assetById } from '../../../simulation/specimens/assets';
import { drawAsset } from './illustrations';

export interface EyepieceLabels {
  illustrative: string;
  mono: string;
  pair: string;
  dark: string;
  notLocked: string;
  noSample: string;
}

function render(ctx: CanvasRenderingContext2D, w: OpticalWorld, instrument: 'compound' | 'stereo', size: number, off: HTMLCanvasElement, labels: EyepieceLabels) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  const octx = off.getContext('2d')!;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, size, size);
  let note = '';
  if (instrument === 'compound') {
    const v = microscopeView(w);
    const lum = Math.min(1.2, v.luminance01 / 0.4);
    octx.fillStyle = '#f4f1e6';
    octx.fillRect(0, 0, size, size);
    if (v.assetId && v.locked) {
      // Imagen invertida: el sistema óptico del compuesto la gira 180°.
      octx.translate(size, size);
      octx.rotate(Math.PI);
      drawAsset(octx, { assetId: v.assetId, centerMm: v.centerMm, fovMm: v.fovMm, size });
      const m = v.slideId ? w.mounts[v.slideId] : null;
      if (m) {
        const k = size / v.fovMm;
        const center = [v.centerMm[0] + m.centerCm[0] * 10, v.centerMm[1] + m.centerCm[1] * 10];
        for (const b of m.bubbles) {
          const bx = m.coverOffsetCm[0] * 10 + b.x;
          const by = m.coverOffsetCm[1] * 10 + b.y;
          const px = size / 2 + (bx - center[0]) * k;
          const py = size / 2 + (by - center[1]) * k;
          octx.beginPath();
          octx.arc(px, py, b.r * k, 0, Math.PI * 2);
          octx.fillStyle = 'rgba(250,250,250,0.92)';
          octx.fill();
          octx.lineWidth = Math.max(2, b.r * k * 0.12);
          octx.strokeStyle = 'rgba(30,30,30,0.85)';
          octx.stroke();
        }
        if (m.contamination01 > 0.05) {
          octx.fillStyle = `rgba(80, 70, 50, ${Math.min(0.7, m.contamination01)})`;
          for (let i = 0; i < 40 * m.contamination01; i++) {
            octx.beginPath();
            octx.arc(((i * 97) % 100) / 100 * size, ((i * 53) % 100) / 100 * size, 1.5 + (i % 4), 0, Math.PI * 2);
            octx.fill();
          }
        }
        if (m.broken) {
          octx.strokeStyle = 'rgba(20,20,20,0.9)';
          octx.lineWidth = 3;
          octx.beginPath();
          octx.moveTo(0, size * 0.2);
          octx.lineTo(size * 0.6, size * 0.55);
          octx.lineTo(size, size * 0.4);
          octx.stroke();
        }
        if (m.hydrated01 < 0.6) {
          octx.fillStyle = 'rgba(180, 160, 110, 0.35)';
          octx.fillRect(0, 0, size, size);
        }
      }
      if (w.slides[v.slideId ?? '']?.faceDown) {
        octx.fillStyle = 'rgba(240, 238, 230, 0.6)';
        octx.fillRect(0, 0, size, size);
      }
    } else if (!v.slideId) note = labels.noSample;
    const blur = Math.min(14, (1 - v.sharpness01) * 14);
    ctx.filter = `blur(${blur.toFixed(1)}px) brightness(${(0.25 + 0.75 * lum).toFixed(2)}) contrast(${(0.4 + 0.6 * v.contrast01).toFixed(2)})`;
    ctx.drawImage(off, 0, 0);
    ctx.filter = 'none';
    if (!v.locked) {
      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(0, 0, size, size);
      note = labels.notLocked;
    } else if (v.luminance01 <= 0.001) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);
      note = labels.dark;
    } else if (v.luminance01 < 0.15) {
      ctx.fillStyle = `rgba(0,0,0,${0.85 - v.luminance01 * 4})`;
      ctx.fillRect(0, 0, size, size);
    }
  } else {
    const v = stereoView(w);
    const s = w.stereo;
    octx.fillStyle = s.transmitted01 > 0.2 && s.power ? '#efece2' : '#2b2b2b';
    octx.fillRect(0, 0, size, size);
    if (v.assetId) drawAsset(octx, { assetId: v.assetId, centerMm: v.centerMm, fovMm: v.fovMm, size });
    else note = labels.noSample;
    const a = v.assetId ? assetById(v.assetId) : undefined;
    const light = s.power ? Math.max(s.incident01, s.transmitted01 * (a?.opaque ? 0.35 : 1)) : 0;
    const blur = Math.min(14, (1 - v.sharpness01) * 14);
    ctx.filter = `blur(${blur.toFixed(1)}px) brightness(${(0.15 + 1.1 * light).toFixed(2)}) contrast(${(0.4 + 0.6 * v.contrast01).toFixed(2)})`;
    ctx.drawImage(off, 0, 0);
    ctx.filter = 'none';
    if (v.lightIssues.includes('GLARE')) {
      const g = ctx.createRadialGradient(size * 0.45, size * 0.4, 4, size * 0.45, size * 0.4, size * 0.35);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    if (!s.power || light <= 0.001) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);
      note = labels.dark;
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  if (note) {
    ctx.fillStyle = '#e9edf1';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(note, size / 2, size / 2);
  }
}

/** Clave de la vista: solo se redibuja cuando cambia algo visible. */
function viewKey(w: OpticalWorld, instrument: 'compound' | 'stereo') {
  if (instrument === 'compound') {
    const v = microscopeView(w);
    const m = v.slideId ? w.mounts[v.slideId] : null;
    return JSON.stringify([v.assetId, v.locked, v.centerMm.map((x) => Math.round(x * 1000)), Math.round(v.fovMm * 100), Math.round(v.sharpness01 * 50), Math.round(v.luminance01 * 50), Math.round(v.contrast01 * 50), m?.bubbles.length, m?.broken, Math.round((m?.contamination01 ?? 0) * 20), Math.round((m?.hydrated01 ?? 1) * 10), w.slides[v.slideId ?? '']?.faceDown]);
  }
  const v = stereoView(w);
  const s = w.stereo;
  return JSON.stringify([v.assetId, v.centerMm.map((x) => Math.round(x * 100)), Math.round(v.fovMm * 10), Math.round(v.sharpness01 * 50), s.power, Math.round(s.incident01 * 50), Math.round(s.transmitted01 * 50), v.lightIssues.join()]);
}

export function OpticalEyepiece({ world, instrument, size = 340, labels, version }: { world: OpticalWorld; instrument: 'compound' | 'stereo'; size?: number; labels: EyepieceLabels; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const off = useRef<HTMLCanvasElement | null>(null);
  const last = useRef('');
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (!off.current) {
      off.current = document.createElement('canvas');
      off.current.width = size;
      off.current.height = size;
    }
    const key = viewKey(world, instrument);
    if (key === last.current) return;
    last.current = key;
    const ctx = c.getContext('2d');
    if (ctx) render(ctx, world, instrument, size, off.current, labels);
  });
  void version;
  const mono = instrument === 'stereo' && world.stereo.channelMode === 'stereo-pair' ? labels.pair : labels.mono;
  return (
    <figure className="eyepiece-figure">
      <canvas ref={ref} width={size} height={size} className="eyepiece-canvas" aria-hidden="true" />
      <figcaption className="eyepiece-note">{labels.illustrative} · {mono}</figcaption>
    </figure>
  );
}
