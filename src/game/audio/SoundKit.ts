/**
 * SoundKit — komplett prozedurale Sounds über die Web-Audio-API.
 *
 * Warum prozedural? Kein Asset-Download, keine Lizenzfragen, und es zeigt
 * das Minimum, aus dem ein Soundscape besteht: Oszillatoren (Ton) +
 * Rausch-Buffer (Schlag) + Filter (Klangfarbe) + Hüllkurven (Dynamik).
 *
 * Wichtig: Ein AudioContext darf erst nach einer Nutzer-Interaktion starten
 * (Autoplay-Policy der Browser) — deshalb resume() beim Spielstart.
 */
export class SoundKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  // Triebwerk (dauerhaft laufende Stimme, Parameter werden moduliert)
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  init(): void {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      // 1 s weißes Rauschen — die Rohsubstanz für Knall & Explosion
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null; // Audio nicht verfügbar → Spiel läuft stumm weiter
    }
  }

  /** Bei Spielstart aufrufen (User-Geste!). */
  resume(): void {
    this.init();
    void this.ctx?.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  /** Dauerhafte Triebwerks-Stimme starten (Jet). */
  startEngine(): void {
    this.init();
    if (!this.ctx || !this.master || this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth'; // "scharfes" Grundbrummen
    this.engineOsc.frequency.value = 60;
    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = 'triangle'; // Sub-Oktove = Brustkorb-Dröhnen
    this.engineSub.frequency.value = 30;
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start(t);
    this.engineSub.start(t);
  }

  stopEngine(): void {
    try {
      this.engineOsc?.stop();
      this.engineSub?.stop();
    } catch { /* schon gestoppt */ }
    this.engineOsc = null;
    this.engineSub = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  /** Triebwerk pro Frame modulieren: Frequenz & Lautstärke ∝ Schub. */
  updateEngine(throttle: number, speedFrac: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter || !this.engineSub) return;
    const t = this.ctx.currentTime;
    // Pitch: 55 Hz Leerlauf → 160 Hz Nachbrenner; Filter öffnet mit
    this.engineOsc.frequency.setTargetAtTime(55 + throttle * 105, t, 0.1);
    this.engineSub.frequency.setTargetAtTime(28 + throttle * 46, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(220 + throttle * 900, t, 0.1);
    // Lautstärke: Schub dominiert, Fahrt adds etwas Wind
    this.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.22 + speedFrac * 0.08, t, 0.1);
  }

  /** Kurzer Kanonen-Schlag (Noise-Burst durch Bandpass). */
  gun(volume = 0.5): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.6;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5, 0.12);
  }

  /** Explosion: tieffrequentes Rauschen mit langem Zerfall + Sub-Thump. */
  explosion(volume = 0.9): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.35; // tiefziehen = "groß"
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 0.9);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.3, 1.2);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(volume * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.6);
  }

  /** Raketenstart: aufschwellendes Rauschen. */
  missileLaunch(): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.01, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.4, 1.0);
  }

  /** Lock-Piepen: double-Beep beim Suchen, Dauerton wenn eingerastet. */
  lockBeep(locked: boolean): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = locked ? 1050 : 780;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(locked ? 0.16 : 0.1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (locked ? 0.25 : 0.09));
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.3);
  }

  dispose(): void {
    this.stopEngine();
    void this.ctx?.close();
    this.ctx = null;
  }
}
