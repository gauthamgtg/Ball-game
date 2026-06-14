import './styles.css';
import { Game } from './game.js';
import { Settings } from './settings.js';
import { Leaderboard } from './leaderboard.js';
import { Economy } from './economy.js';
import { SkinStore, SKINS } from './skins.js';
import { Ads } from './monetization.js';
import { DailyReward } from './daily.js';
import { initPersistence } from './persistence.js';

// Mirror saved data to durable native storage (no-op on web). Self-reloads
// once if it recovers evicted data, so run it before reading any state.
initPersistence();

const $ = (id) => document.getElementById(id);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));
const hexCss = (n) => '#' + n.toString(16).padStart(6, '0');

const LIFE_COST = 75;
const MILESTONE_BONUS = 20;

const POWER_ICONS = { shield: '🛡', magnet: '🧲', double: '×2' };

const settings = new Settings();
const leaderboard = new Leaderboard();
const economy = new Economy();
const skins = new SkinStore();
const daily = new DailyReward();
const ads = new Ads();
ads.setProvider({ showRewarded: playMockAd });

// Per-run continue bookkeeping: one ad revive and one coin revive each.
let run = { adUsed: false, payUsed: false, banked: 0 };

const overlays = {
  menu: $('menu-screen'),
  settings: $('settings-screen'),
  leaderboard: $('leaderboard-screen'),
  shop: $('shop-screen'),
  pause: $('pause-screen'),
  gameover: $('gameover-screen'),
};
const hud = $('hud');

function showScreen(name) {
  for (const [key, el] of Object.entries(overlays)) {
    el.classList.toggle('hidden', key !== name);
  }
  hud.classList.toggle('hidden', name !== null);
}

const getBest = () => {
  const top = leaderboard.getLocal();
  return top.length ? top[0].distance : 0;
};

function refreshBest() {
  $('best-menu').textContent = getBest();
}

function refreshCoins() {
  const b = economy.balance;
  ['coins-menu', 'coins-shop', 'coins-go'].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = b;
  });
}

// ---------------------------------------------------------------------------
const game = new Game($('game'), settings, {
  onUpdate(dist, orbs, speedFrac) {
    $('distance').textContent = dist;
    $('orbs').textContent = orbs;
    $('speed-bar').style.width = `${Math.round(Math.max(0, Math.min(1, speedFrac)) * 100)}%`;
  },
  onPowers(list) {
    renderPowers(list);
  },
  onMilestone(meters) {
    economy.add(MILESTONE_BONUS);
    refreshCoins();
    showBanner(`${meters}m · +${MILESTONE_BONUS} ♦`);
  },
  onGameOver(reason, dist, orbs) {
    // Bank any newly collected orbs into coins (delta, so continues don't
    // double-count).
    economy.add(orbs - run.banked);
    run.banked = orbs;
    refreshCoins();

    const name = settings.get('name') || 'Player';
    const { top, rank } = leaderboard.addLocal({ name, distance: dist, orbs });
    leaderboard.submitGlobal({ name, distance: dist, orbs }); // fire and forget

    $('death-reason').textContent = reason;
    $('final-distance').textContent = dist;
    $('final-orbs').textContent = orbs;
    $('final-best').textContent = top.length ? top[0].distance : dist;

    const note = $('rank-note');
    if (rank === 1) {
      note.textContent = '🏆 NEW BEST!';
      note.classList.remove('hidden');
    } else if (rank && rank <= 10) {
      note.textContent = `NEW #${rank} LOCAL SCORE!`;
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }

    setupContinue();
    showScreen('gameover');
  },
});
game.setSkin(skins.equippedSkin);

// ---------------------------------------------------------------------------
// Audio unlocks on the first user gesture, which also starts the music.
let audioReady = false;
function unlockAudio() {
  if (audioReady) return;
  audioReady = true;
  game.ensureAudio();
}
window.addEventListener('pointerdown', unlockAudio, { once: true });

// ---------------------------------------------------------------------------
function startGame() {
  run = { adUsed: false, payUsed: false, banked: 0 };
  renderPowers([]);
  showScreen(null);
  game.start();
}

// HUD chips for active power-ups (rebuilt only when the set/seconds change).
let lastPowerHtml = '';
function renderPowers(list) {
  const html = list
    .map((p) => {
      const secs = p.t != null ? ` ${Math.ceil(p.t)}s` : '';
      return `<span class="power-chip ${p.kind}"><span class="ico">${POWER_ICONS[p.kind]}</span>${secs}</span>`;
    })
    .join('');
  if (html !== lastPowerHtml) {
    $('power-hud').innerHTML = html;
    lastPowerHtml = html;
  }
}

let bannerTimer = null;
function showBanner(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('hidden', 'show');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), 1800);
}

function toMenu() {
  game.toMenu();
  refreshBest();
  refreshCoins();
  showScreen('menu');
}

$('play-btn').addEventListener('click', startGame);
$('retry-btn').addEventListener('click', startGame);
$('go-menu-btn').addEventListener('click', toMenu);
$('pause-menu-btn').addEventListener('click', toMenu);

$('settings-btn').addEventListener('click', () => {
  syncSettingsUI();
  showScreen('settings');
});
$('leaderboard-btn').addEventListener('click', () => {
  selectTab('local');
  showScreen('leaderboard');
});
$('shop-btn').addEventListener('click', () => {
  renderShop();
  showScreen('shop');
});

$('pause-btn').addEventListener('click', () => {
  game.pause();
  showScreen('pause');
});
$('resume-btn').addEventListener('click', () => {
  showScreen(null);
  game.resume();
});

qsa('[data-back]').forEach((b) => b.addEventListener('click', () => showScreen('menu')));

// ---------------------------------------------------------------------------
// Continue flow (watch ad OR spend coins — each usable once per run).
function setupContinue() {
  const box = $('continue-box');
  const adBtn = $('continue-ad');
  const payBtn = $('continue-pay');
  $('pay-cost').textContent = LIFE_COST;

  adBtn.classList.toggle('hidden', run.adUsed);
  payBtn.classList.toggle('hidden', run.payUsed);
  payBtn.classList.toggle('disabled', !economy.canAfford(LIFE_COST));

  const anything = !run.adUsed || !run.payUsed;
  box.classList.toggle('hidden', !anything);
}

$('continue-ad').addEventListener('click', async () => {
  if (run.adUsed) return;
  const ok = await ads.showRewarded();
  if (ok) {
    run.adUsed = true;
    showScreen(null);
    game.continueRun();
  }
});

$('continue-pay').addEventListener('click', () => {
  if (run.payUsed || !economy.canAfford(LIFE_COST)) return;
  if (economy.spend(LIFE_COST)) {
    run.payUsed = true;
    refreshCoins();
    showScreen(null);
    game.continueRun();
  }
});

// A placeholder rewarded ad so the flow works in the browser. Swap for a real
// rewarded ad via the Ads provider (see monetization.js).
function playMockAd() {
  return new Promise((resolve) => {
    const screen = $('ad-screen');
    const cnt = $('ad-count');
    let t = 5;
    cnt.textContent = t;
    screen.classList.remove('hidden');
    const iv = setInterval(() => {
      t -= 1;
      cnt.textContent = Math.max(0, t);
      if (t <= 0) {
        clearInterval(iv);
        screen.classList.add('hidden');
        resolve(true);
      }
    }, 1000);
  });
}

// ---------------------------------------------------------------------------
// Shop
function renderShop() {
  $('coins-shop').textContent = economy.balance;
  const grid = $('shop-grid');
  grid.innerHTML = '';
  for (const s of SKINS) {
    const card = document.createElement('div');
    card.className = 'skin-card';
    const owned = skins.isOwned(s.id);
    const equipped = skins.equipped === s.id;
    if (equipped) card.classList.add('equipped');

    const sw = document.createElement('div');
    sw.className = 'skin-swatch';
    sw.style.background = `radial-gradient(circle at 35% 30%, ${hexCss(s.emissive)}, ${hexCss(s.color)})`;
    sw.style.color = hexCss(s.emissive);

    const nm = document.createElement('div');
    nm.className = 'skin-name';
    nm.textContent = s.name;

    const btn = document.createElement('button');
    btn.className = 'skin-action';
    if (equipped) {
      btn.textContent = 'EQUIPPED';
      btn.classList.add('equipped-tag');
    } else if (owned) {
      btn.textContent = 'EQUIP';
      btn.classList.add('owned');
      btn.addEventListener('click', () => {
        skins.equip(s.id);
        game.setSkin(s);
        renderShop();
      });
    } else {
      btn.textContent = `♦ ${s.price}`;
      btn.classList.add('locked');
      if (!economy.canAfford(s.price)) btn.classList.add('cant');
      btn.addEventListener('click', () => {
        if (economy.spend(s.price)) {
          skins.unlock(s.id);
          skins.equip(s.id);
          game.setSkin(s);
          refreshCoins();
          renderShop();
        }
      });
    }

    card.append(sw, nm, btn);
    grid.appendChild(card);
  }
}

// ---------------------------------------------------------------------------
// Settings UI
function syncSettingsUI() {
  qsa('[data-toggle]').forEach((btn) => {
    btn.classList.toggle('on', !!settings.get(btn.dataset.toggle));
  });
  qsa('#quality-seg button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.quality === settings.get('quality'));
  });
  $('name-input').value = settings.get('name');
}

qsa('[data-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.toggle;
    const val = !settings.get(key);
    settings.set(key, val);
    btn.classList.toggle('on', val);
    unlockAudio();
    game.applyAudioSettings();
  });
});

qsa('#quality-seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const q = btn.dataset.quality;
    settings.set('quality', q);
    game.setQuality(q);
    qsa('#quality-seg button').forEach((b) => b.classList.toggle('active', b === btn));
  });
});

$('name-input').addEventListener('input', (e) => {
  const v = e.target.value.trim() || 'Player';
  settings.set('name', v);
});

// ---------------------------------------------------------------------------
// Leaderboard UI
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function entryRow(rank, e) {
  const li = document.createElement('li');
  li.innerHTML = `
    <span class="rank">${rank}</span>
    <span class="name">${escapeHtml(e.name || 'Player')}</span>
    <span class="dist">${e.distance} m</span>`;
  return li;
}

function renderList(entries, emptyMsg) {
  const list = $('lb-list');
  list.innerHTML = '';
  if (!entries || entries.length === 0) {
    $('lb-note').textContent = emptyMsg;
    return;
  }
  entries.slice(0, 25).forEach((e, i) => list.appendChild(entryRow(i + 1, e)));
}

async function selectTab(tab) {
  qsa('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('lb-note').textContent = '';
  if (tab === 'local') {
    renderList(leaderboard.getLocal(), 'No scores yet — take a roll!');
    return;
  }
  $('lb-list').innerHTML = '';
  if (!leaderboard.isGlobalConfigured()) {
    $('lb-note').textContent =
      'Global leaderboard isn’t connected yet. See the README to point it at your backend.';
    return;
  }
  $('lb-note').textContent = 'Loading global scores…';
  try {
    const data = await leaderboard.getGlobal();
    renderList(data, 'No global scores yet.');
  } catch {
    $('lb-note').textContent = 'Could not reach the global leaderboard.';
  }
}

qsa('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

// ---------------------------------------------------------------------------
// Daily reward (shown over the menu once per day).
function maybeShowDaily() {
  if (!daily.available()) return;
  const { streak, reward } = daily.preview();
  $('daily-reward').textContent = reward;
  $('daily-streak').textContent = streak;
  $('daily-screen').classList.remove('hidden');
}

$('daily-claim').addEventListener('click', () => {
  const res = daily.claim();
  if (res) {
    economy.add(res.reward);
    refreshCoins();
    showBanner(`+${res.reward} ♦ · Day ${res.streak}`);
  }
  $('daily-screen').classList.add('hidden');
});

// ---------------------------------------------------------------------------
// App lifecycle: pause the game + audio when backgrounded.
function onBackground() {
  if (game.state === 'playing') {
    game.pause();
    showScreen('pause');
  }
  game.suspendAudio();
}
function onForeground() {
  game.resumeAudio();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) onBackground();
  else onForeground();
});
window.Capacitor?.Plugins?.App?.addListener?.('appStateChange', ({ isActive }) => {
  if (isActive) onForeground();
  else onBackground();
});

// Hide the loading screen once the first frame (with compiled shaders) is up.
function hideLoading() {
  const el = $('loading');
  if (el) {
    el.classList.add('gone');
    setTimeout(() => el.remove(), 600);
  }
  window.Capacitor?.Plugins?.SplashScreen?.hide?.();
}

// ---------------------------------------------------------------------------
refreshBest();
refreshCoins();
showScreen('menu');
maybeShowDaily();
requestAnimationFrame(() => requestAnimationFrame(hideLoading));
