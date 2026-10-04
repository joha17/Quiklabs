/**
 * Sonidos de la Práctica 3 sintetizados con Web Audio (sin archivos), con subtítulos en la interfaz (§23.1):
 * flujo de gas antes de la ignición, chispa, encendido suave, llama amarilla casi silenciosa, llama azul con
 * rumor más definido, retroceso/llama levantada con sonido anormal, alarmas y chisporroteo.
 */
import type { FlameSound } from './host';

export class FlameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<FlameSound, number>();
  volume = 0.5;
  private hiss: GainNode | null = null;
  private roar: GainNode | null = null;
  private roarFilter: BiquadFilterNode | null = null;
  private whine: GainNode | null = null;
  private whineOsc: OscillatorNode | null = null;
  private alarmAt = 0;

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
      // Siseo del gas (ruido agudo), rumor de la llama (ruido grave filtrado) y silbido de retroceso.
      this.hiss = ctx.createGain();
      this.hiss.gain.value = 0;
      const n1 = this.noise(2);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500;
      n1.loop = true;
      n1.connect(hp).connect(this.hiss).connect(this.master);
      n1.start();
      this.roar = ctx.createGain();
      this.roar.gain.value = 0;
      const n2 = this.noise(2);
      this.roarFilter = ctx.createBiquadFilter();
      this.roarFilter.type = 'lowpass';
      this.roarFilter.frequency.value = 300;
      n2.loop = true;
      n2.connect(this.roarFilter).connect(this.roar).connect(this.master);
      n2.start();
      this.whine = ctx.createGain();
      this.whine.gain.value = 0;
      this.whineOsc = ctx.createOscillator();
      this.whineOsc.type = 'sawtooth';
      this.whineOsc.frequency.value = 420;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 800;
      this.whineOsc.connect(bp).connect(this.whine).connect(this.master);
      this.whineOsc.start();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
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

  play(name: FlameSound) {
    if (this.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < 90) return;
    this.last.set(name, now);
    switch (name) {
      case 'spark':
        this.burst(0.04, 5000, 0.25, 'highpass');
        this.tone(3200, 0.03, 'square', 0.05);
        break;
      case 'ignite':
        this.burst(0.5, 400, 0.18, 'lowpass');
        break;
      case 'click':
        this.tone(1200, 0.03, 'square', 0.05);
        break;
      case 'sizzle':
        this.burst(0.6, 3500, 0.12);
        break;
      case 'metal':
        this.tone(900, 0.25, 'triangle', 0.12);
        this.tone(1450, 0.18, 'sine', 0.06);
        break;
      case 'porcelain':
        this.tone(2100, 0.12, 'triangle', 0.1);
        break;
      case 'glass':
        this.tone(2600, 0.15, 'triangle', 0.1);
        break;
      case 'alert':
        this.tone(660, 0.15, 'square', 0.12);
        setTimeout(() => this.tone(520, 0.2, 'square', 0.12), 160);
        break;
      case 'spray':
        this.burst(0.25, 2400, 0.12);
        break;
      case 'hiss':
        this.burst(0.3, 3000, 0.08, 'highpass');
        break;
      case 'flashback':
        this.burst(0.3, 250, 0.2, 'lowpass');
        break;
    }
  }

  /**
   * Sonidos continuos: siseo del gas sin llama, rumor de la llama (la azul suena más definida y aguda),
   * silbido anormal de retroceso o llama levantada, y pitido de alarma.
   */
  ambient(s: { unlitFlow: number; lit: boolean; blueness: number; flow: number; abnormal: number; alarm: boolean }) {
    if (!this.ctx || !this.hiss || !this.roar || !this.roarFilter || !this.whine) return;
    const t = this.ctx.currentTime;
    this.hiss.gain.setTargetAtTime(Math.min(0.08, s.unlitFlow * 0.1), t, 0.15);
    const roar = s.lit ? (0.01 + 0.07 * s.blueness) * (0.4 + s.flow) : 0;
    this.roar.gain.setTargetAtTime(roar, t, 0.25);
    this.roarFilter.frequency.setTargetAtTime(220 + 520 * s.blueness, t, 0.3);
    this.whine.gain.setTargetAtTime(s.abnormal * 0.05, t, 0.2);
    if (s.alarm && performance.now() - this.alarmAt > 1400) {
      this.alarmAt = performance.now();
      this.tone(1850, 0.18, 'square', 0.06);
      setTimeout(() => this.tone(1850, 0.18, 'square', 0.06), 260);
    }
  }
}
