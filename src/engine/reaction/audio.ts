/**
 * Sonidos de la Práctica 4 sintetizados con Web Audio (sin archivos), con subtítulos en la interfaz (§26):
 * los del mechero son los de la Práctica 3 (siseo del gas, encendido, rumor de la llama, alarmas) y se añaden
 * vertido, gota, efervescencia, tintineo de vidrio, agitación, lijado, piseta, rotura y el chisporroteo del Mg.
 */
import { FlameAudio } from '../flame/audio';
import type { FlameSound } from '../flame/host';
import type { ReactionSound } from './host';

const FLAME_SOUNDS = new Set<string>(['spark', 'ignite', 'click', 'sizzle', 'metal', 'porcelain', 'glass', 'alert', 'spray', 'hiss', 'flashback']);

export class ReactionAudio {
  readonly burner = new FlameAudio();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pourGain: GainNode | null = null;
  private burnGain: GainNode | null = null;
  private last = new Map<string, number>();
  volume = 0.5;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
      // Vertido continuo (ruido de banda media) y chisporroteo del Mg (ruido agudo modulado).
      this.pourGain = ctx.createGain();
      this.pourGain.gain.value = 0;
      const n1 = this.noise(2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.8;
      n1.loop = true;
      n1.connect(bp).connect(this.pourGain).connect(this.master);
      n1.start();
      this.burnGain = ctx.createGain();
      this.burnGain.gain.value = 0;
      const n2 = this.noise(2);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      n2.loop = true;
      n2.connect(hp).connect(this.burnGain).connect(this.master);
      n2.start();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    this.burner.setVolume(v);
    if (this.master) this.master.gain.value = v;
  }

  private noise(seconds: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, slide?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.master!);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  private burst(dur: number, freq: number, gain = 0.2, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx!;
    const src = this.noise(dur);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start();
  }

  play(name: ReactionSound) {
    if (FLAME_SOUNDS.has(name)) {
      this.burner.play(name as FlameSound);
      return;
    }
    if (this.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < 80) return;
    this.last.set(name, now);
    switch (name) {
      case 'drip':
        this.tone(1400, 0.08, 'sine', 0.08, 700);
        break;
      case 'pour':
        this.burst(0.35, 900, 0.08);
        break;
      case 'fizz':
        this.burst(0.8, 6000, 0.05, 'highpass');
        break;
      case 'clink':
        this.tone(3100, 0.12, 'triangle', 0.07);
        break;
      case 'stir':
        this.tone(2700, 0.05, 'triangle', 0.03);
        break;
      case 'sand':
        this.burst(0.18, 2600, 0.06, 'highpass');
        break;
      case 'squeeze':
        this.burst(0.25, 700, 0.06);
        break;
      case 'break':
        this.burst(0.35, 4200, 0.2, 'highpass');
        this.tone(2900, 0.2, 'triangle', 0.1);
        break;
      case 'paper':
        this.burst(0.2, 1500, 0.05);
        break;
      case 'mgBurn':
        this.burst(0.9, 2400, 0.12);
        break;
    }
  }

  /** Sonidos continuos: mechero (Práctica 3), vertido y chisporroteo de la cinta de Mg. */
  ambient(s: { unlitFlow: number; lit: boolean; blueness: number; flow: number; abnormal: number; alarm: boolean; pouring: number; mgBurning: boolean }) {
    this.burner.ambient(s);
    if (!this.ctx && !(s.pouring > 0 || s.mgBurning)) return;
    if (!this.ensure() || !this.pourGain || !this.burnGain) return;
    const t = this.ctx!.currentTime;
    this.pourGain.gain.setTargetAtTime(Math.min(0.06, s.pouring * 0.03), t, 0.1);
    this.burnGain.gain.setTargetAtTime(s.mgBurning ? 0.07 + 0.03 * Math.random() : 0, t, 0.05);
  }
}
