// Leaderboard service.
//
// Local scores always work offline. "Global" scores require a backend: set
// LEADERBOARD_ENDPOINT (or window.IBR_LEADERBOARD_ENDPOINT at runtime) to a
// base URL that exposes:
//   GET  {endpoint}/scores       -> [{ name, distance, orbs }, ...]
//   POST {endpoint}/scores       <- { name, distance, orbs }
// Until then, the global tab reports that it isn't connected.
const LEADERBOARD_ENDPOINT = '';

const LOCAL_KEY = 'ibr_leaderboard';
const MAX_LOCAL = 25;

function endpoint() {
  return (typeof window !== 'undefined' && window.IBR_LEADERBOARD_ENDPOINT) || LEADERBOARD_ENDPOINT;
}

export class Leaderboard {
  getLocal() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    } catch {
      return [];
    }
  }

  addLocal(entry) {
    const stamped = { ...entry, ts: Date.now() };
    const list = this.getLocal();
    list.push(stamped);
    list.sort((a, b) => b.distance - a.distance);
    const top = list.slice(0, MAX_LOCAL);
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(top));
    } catch {
      /* ignore */
    }
    // Rank (1-based) this entry achieved in the saved list, or null if it
    // didn't make the cut.
    const idx = top.findIndex((e) => e.ts === stamped.ts);
    return { top, rank: idx >= 0 ? idx + 1 : null };
  }

  isGlobalConfigured() {
    return !!endpoint();
  }

  async getGlobal() {
    const base = endpoint();
    if (!base) throw new Error('not-configured');
    const res = await fetch(`${base.replace(/\/$/, '')}/scores`);
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : data.scores || [];
  }

  async submitGlobal(entry) {
    const base = endpoint();
    if (!base) return false;
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
