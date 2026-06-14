// Durable storage on native platforms.
//
// All game state is stored synchronously in localStorage (see settings.js,
// economy.js, etc.). Inside a native WebView that store can be evicted, so on
// native we mirror every key into Capacitor Preferences (durable) and, on
// launch, hydrate localStorage back from it. The web build is unaffected.
const KEYS = [
  'ibr_settings',
  'ibr_coins',
  'ibr_owned_skins',
  'ibr_equipped_skin',
  'ibr_leaderboard',
  'ibr_daily_date',
  'ibr_daily_streak',
];

export async function initPersistence() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!cap?.isNativePlatform?.()) return; // web: localStorage is already durable
  const Pref = cap.Plugins?.Preferences;
  if (!Pref) return;

  // Write-through: every future localStorage write also lands in Preferences.
  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = (k, v) => {
    origSet(k, v);
    if (KEYS.includes(k)) Pref.set({ key: k, value: String(v) });
  };
  localStorage.removeItem = (k) => {
    origRemove(k);
    if (KEYS.includes(k)) Pref.remove({ key: k });
  };

  // Hydrate: if Preferences has a value localStorage lacks (e.g. it was
  // evicted), restore it and reload once so modules read the recovered state.
  let restored = false;
  for (const k of KEYS) {
    try {
      const { value } = await Pref.get({ key: k });
      if (value != null && localStorage.getItem(k) !== value) {
        origSet(k, value);
        restored = true;
      }
    } catch {
      /* ignore individual key failures */
    }
  }
  if (restored) window.location.reload();
}
