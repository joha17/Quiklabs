/**
 * Sonidos sintetizados con Web Audio API (sin archivos). Cada sonido tiene subtítulo (§14).
 */
import type { SoundName } from '../interaction/host';

export class LabAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<SoundName, number>();
  volume = 0.5;
  humGain: GainNode | null = null;
  boilGain: GainNode | null = null;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // Ruidos continuos (zumbido de la placa, ebullición) controlados por ganancia.
      this.humGain = this.ctx.createGain();
      this.humGain.gain.value = 0;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 100;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      osc.connect(lp).connect(this.humGain).connect(this.master);
      osc.start();
      this.boilGain = this.ctx.createGain();
      this.boilGain.gain.value = 0;
      const noise = this.noiseSource(2);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      noise.loop = true;
      noise.connect(bp).connect(this.boilGain).connect(this.master);
      noise.start();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private noiseSource(seconds: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.master!);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  private burst(dur: number, freq: number, gain = 0.2) {
    const ctx = this.ctx!;
    const src = this.noiseSource(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start();
  }

  play(name: SoundName) {
    if (this.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < 120) return;
    this.last.set(name, now);
    switch (name) {
      case 'glass':
        this.tone(2400, 0.15, 'triangle', 0.12);
        this.tone(3600, 0.1, 'sine', 0.06);
        break;
      case 'pour':
        this.burst(0.5, 700, 0.12);
        break;
      case 'drip':
        this.tone(900, 0.08, 'sine', 0.15);
        break;
      case 'stir':
        this.tone(2800, 0.05, 'triangle', 0.05);
        break;
      case 'ice':
        this.tone(1800, 0.08, 'square', 0.05);
        this.burst(0.15, 3000, 0.08);
        break;
      case 'break':
        this.burst(0.6, 4000, 0.35);
        this.tone(3000, 0.3, 'triangle', 0.15);
        break;
      case 'alert':
        this.tone(660, 0.15, 'square', 0.12);
        setTimeout(() => this.tone(520, 0.2, 'square', 0.12), 160);
        break;
      case 'click':
        this.tone(1200, 0.03, 'square', 0.05);
        break;
      case 'squeeze':
        this.burst(0.25, 1500, 0.08);
        break;
      default:
        break;
    }
  }

  /** Sonidos continuos: zumbido de la placa (potencia) y ebullición. */
  ambient(platePct: number, boiling: number) {
    if (!this.ctx || !this.humGain || !this.boilGain) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(platePct > 0 ? 0.015 + platePct * 0.0002 : 0, t, 0.2);
    this.boilGain.gain.setTargetAtTime(boiling * 0.06, t, 0.3);
  }
}
