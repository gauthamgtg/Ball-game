// Procedural background music — a looping synth groove built with WebAudio,
// so the game ships with no audio files. Shares the AudioContext with Sfx.
export class Music {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.playing = false;
    this.timer = null;
    this.step = 0;
    this.volume = 0.12;

    // 4 bars of a minor-key progression (semitone offsets from A2).
    this.chords = [
      [0, 7, 12, 15], // Am
      [-2, 5, 8, 12], // G
      [-4, 3, 7, 12], // F
      [-4, 3, 7, 10], // F (var)
    ];
    this.stepDur = 0.16; // sixteenth-ish notes
    this.stepsPerChord = 8;
  }

  init(ctx) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
  }

  _freq(semi) {
    return 110 * Math.pow(2, semi / 12); // A2 = 110Hz
  }

  start() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.volume, now + 1.2);
    this.next = now + 0.05;
    this._scheduler();
  }

  stop() {
    if (!this.ctx) return;
    this.playing = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.4);
    clearTimeout(this.timer);
  }

  _scheduler() {
    if (!this.playing) return;
    while (this.next < this.ctx.currentTime + 0.2) {
      this._playStep(this.step, this.next);
      this.next += this.stepDur;
      this.step++;
    }
    this.timer = setTimeout(() => this._scheduler(), 40);
  }

  _playStep(step, time) {
    const chordIdx = Math.floor(step / this.stepsPerChord) % this.chords.length;
    const chord = this.chords[chordIdx];
    const inChord = step % this.stepsPerChord;

    // Bass on the downbeat of each chord.
    if (inChord === 0) {
      this._note(this._freq(chord[0] - 12), time, 0.5, 'sine', 0.5);
    }
    // Arpeggiated lead.
    const note = chord[inChord % chord.length];
    this._note(this._freq(note + 12), time, 0.18, 'triangle', 0.28);
    // Sparse high shimmer.
    if (inChord % 4 === 2) {
      this._note(this._freq(note + 24), time, 0.12, 'sine', 0.12);
    }
  }

  _note(freq, time, dur, type, gain) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(this.master);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }
}
