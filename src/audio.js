// Tiny WebAudio synth so the game ships with no audio asset files.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  // Must be called from a user gesture (tap/click) to unlock audio on iOS.
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        this.enabled = false;
        return;
      }
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone(freq, dur, type = 'sine', gain = 0.2, slideTo = null) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  jump() {
    this._tone(420, 0.18, 'square', 0.12, 760);
  }

  orb() {
    this._tone(880, 0.12, 'triangle', 0.16, 1320);
  }

  land() {
    this._tone(160, 0.1, 'sine', 0.12);
  }

  death() {
    this._tone(320, 0.5, 'sawtooth', 0.22, 70);
  }
}
