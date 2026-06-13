import './styles.css';
import { Game } from './game.js';
import { Settings } from './settings.js';
import { Leaderboard } from './leaderboard.js';

const $ = (id) => document.getElementById(id);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

const settings = new Settings();
const leaderboard = new Leaderboard();

const overlays = {
  menu: $('menu-screen'),
  settings: $('settings-screen'),
  leaderboard: $('leaderboard-screen'),
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

// ---------------------------------------------------------------------------
const game = new Game($('game'), settings, {
  onUpdate(dist, orbs, speedFrac) {
    $('distance').textContent = dist;
    $('orbs').textContent = orbs;
    $('speed-bar').style.width = `${Math.round(Math.max(0, Math.min(1, speedFrac)) * 100)}%`;
  },
  onGameOver(reason, dist, orbs) {
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
    refreshBest();
    showScreen('gameover');
  },
});

// ---------------------------------------------------------------------------
// Audio must unlock on a user gesture; the first interaction also starts music.
let audioReady = false;
function unlockAudio() {
  if (audioReady) return;
  audioReady = true;
  game.ensureAudio();
}
window.addEventListener('pointerdown', unlockAudio, { once: true });

// ---------------------------------------------------------------------------
function startGame() {
  showScreen(null);
  game.start();
}

function toMenu() {
  game.toMenu();
  refreshBest();
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
function entryRow(rank, e, isMe) {
  const li = document.createElement('li');
  if (isMe) li.classList.add('me');
  li.innerHTML = `
    <span class="rank">${rank}</span>
    <span class="name">${escapeHtml(e.name || 'Player')}</span>
    <span class="dist">${e.distance} m</span>`;
  return li;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function renderList(entries, emptyMsg) {
  const list = $('lb-list');
  list.innerHTML = '';
  if (!entries || entries.length === 0) {
    $('lb-note').textContent = emptyMsg;
    return;
  }
  entries.slice(0, 25).forEach((e, i) => list.appendChild(entryRow(i + 1, e, false)));
}

async function selectTab(tab) {
  qsa('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('lb-note').textContent = '';
  if (tab === 'local') {
    renderList(leaderboard.getLocal(), 'No scores yet — take a roll!');
    return;
  }
  // global
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
    $('lb-note').textContent = 'Could not reach the global leaderboard. Showing nothing.';
  }
}

qsa('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

// ---------------------------------------------------------------------------
refreshBest();
showScreen('menu');
