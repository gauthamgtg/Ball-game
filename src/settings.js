// Persisted player settings (localStorage).
const KEY = 'ibr_settings';

const DEFAULTS = {
  sfxOn: true,
  musicOn: true,
  quality: 'auto', // 'auto' | 'low' | 'medium' | 'high'
  name: 'Player',
};

export class Settings {
  constructor() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      saved = {};
    }
    this.values = { ...DEFAULTS, ...saved };
  }

  get(k) {
    return this.values[k];
  }

  set(k, v) {
    this.values[k] = v;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* storage may be unavailable; settings just won't persist */
    }
  }
}
