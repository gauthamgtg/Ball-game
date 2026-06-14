// Daily login reward with a consecutive-day streak. Coins are granted by the
// caller (so it stays decoupled from the Economy).
const DATE_KEY = 'ibr_daily_date';
const STREAK_KEY = 'ibr_daily_streak';

const todayStr = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const dayStr = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export class DailyReward {
  constructor() {
    this.lastDate = localStorage.getItem(DATE_KEY) || '';
    this.streak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10) || 0;
  }

  available() {
    return this.lastDate !== todayStr();
  }

  // Preview the reward/streak the player would get if they claim now.
  preview() {
    const continuing = this.lastDate === dayStr(-1);
    const streak = continuing ? this.streak + 1 : 1;
    return { streak, reward: this._reward(streak) };
  }

  _reward(streak) {
    return Math.min(25 + (streak - 1) * 10, 100);
  }

  claim() {
    if (!this.available()) return null;
    const { streak, reward } = this.preview();
    this.streak = streak;
    this.lastDate = todayStr();
    try {
      localStorage.setItem(DATE_KEY, this.lastDate);
      localStorage.setItem(STREAK_KEY, String(this.streak));
    } catch {
      /* ignore */
    }
    return { streak, reward };
  }
}
