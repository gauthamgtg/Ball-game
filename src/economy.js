// Persistent soft-currency ("coins"). Orbs collected during a run are banked
// into coins at the end of the run; coins buy ball skins and extra lives.
const KEY = 'ibr_coins';

export class Economy {
  constructor() {
    this.coins = this._load();
  }

  _load() {
    const n = parseInt(localStorage.getItem(KEY) || '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  _save() {
    try {
      localStorage.setItem(KEY, String(this.coins));
    } catch {
      /* storage may be unavailable */
    }
  }

  get balance() {
    return this.coins;
  }

  add(n) {
    if (n > 0) {
      this.coins += Math.floor(n);
      this._save();
    }
    return this.coins;
  }

  canAfford(cost) {
    return this.coins >= cost;
  }

  spend(cost) {
    if (this.coins < cost) return false;
    this.coins -= cost;
    this._save();
    return true;
  }
}
