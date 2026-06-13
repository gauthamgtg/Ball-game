import './styles.css';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);

const els = {
  hud: $('hud'),
  distance: $('distance'),
  orbs: $('orbs'),
  speedBar: $('speed-bar'),
  start: $('start-screen'),
  gameover: $('gameover-screen'),
  playBtn: $('play-btn'),
  retryBtn: $('retry-btn'),
  deathReason: $('death-reason'),
  finalDistance: $('final-distance'),
  finalOrbs: $('final-orbs'),
  finalBest: $('final-best'),
  bestStart: $('best-start'),
};

const BEST_KEY = 'ibr_best_distance';
const getBest = () => parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
const setBest = (v) => localStorage.setItem(BEST_KEY, String(v));

els.bestStart.textContent = getBest();

const game = new Game($('game'), {
  onUpdate(dist, orbs, speedFrac) {
    els.distance.textContent = dist;
    els.orbs.textContent = orbs;
    els.speedBar.style.width = `${Math.round(Math.max(0, Math.min(1, speedFrac)) * 100)}%`;
  },
  onGameOver(reason, dist, orbs) {
    const best = Math.max(getBest(), dist);
    setBest(best);
    els.deathReason.textContent = reason;
    els.finalDistance.textContent = dist;
    els.finalOrbs.textContent = orbs;
    els.finalBest.textContent = best;
    els.hud.classList.add('hidden');
    els.gameover.classList.remove('hidden');
  },
});

function startGame() {
  els.start.classList.add('hidden');
  els.gameover.classList.add('hidden');
  els.hud.classList.remove('hidden');
  game.start();
}

els.playBtn.addEventListener('click', startGame);
els.retryBtn.addEventListener('click', startGame);
