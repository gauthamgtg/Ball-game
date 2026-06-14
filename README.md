# Infinite Ball Roll 🟦

An endless 3D ball-rolling runner in the spirit of Temple Run — built once with
web tech and shipped to **both iOS and Android** through
[Capacitor](https://capacitorjs.com/). A glowing ball rolls forever down a
procedurally generated neon track; you steer, jump, dodge lasers, fly off ramps,
and try to go the distance as the speed keeps climbing.

> Tech stack: **Three.js** (3D rendering) · **Vite** (bundler / dev server) ·
> **Capacitor** (native iOS + Android wrapper). One JavaScript codebase, two app
> stores.

## Gameplay

- **Infinite, procedural track** — flats, sweeping curves, inclines, hills,
  jump gaps, and launch ramps, generated endlessly ahead of you and recycled
  behind you.
- **Obstacles**
  - **Laser beams** — full-width beams (jump over them) and side beams (steer
    around them through the open lane).
  - **Gaps** — jump across or you fall.
  - **Ramps** — fling the ball into the air, over a gap, and back down.
  - **Curves & inclines** — the road bends and rises; stay on it or roll off
    the edge.
- **Escalating speed** — the ball speeds up the further you go (like Temple
  Run), capping out around 2 km in.
- **Orbs** — collect glowing orbs for bonus score.
- **Continue after death** — once per run you can **watch an ad**, and once per
  run you can **spend coins** to revive. Reviving drops you on safe ground,
  clears nearby lasers, and grants brief invulnerability; your distance carries
  over.
- **Power-ups** — grab floating pickups: **🛡 Shield** (absorbs one laser hit),
  **🧲 Magnet** (pulls in nearby orbs), and **×2 Double** (orbs count double).
  Active power-ups show as timed chips in the HUD.
- **Milestones & daily reward** — every 500m flashes a banner and pays bonus
  coins, and a streak-based **daily reward** greets you on the menu once a day.
- **Coins & shop** — orbs collected during a run are banked into coins; spend
  them in the **shop** to buy and equip **ball skins** (including a hue-cycling
  "Plasma" skin).
- **Full menu system** — main menu, shop, settings, leaderboard, in-game pause.
- **Settings** (saved locally): Sound FX on/off, Music on/off, graphics quality
  (Low / Medium / High), and player name.
- **Leaderboard** — a local high-score table plus a global tab (see
  [Global leaderboard](#global-leaderboard) to connect a backend).
- **Audio** — synthesized sound effects and a procedural looping music track
  (no audio asset files).
- **High-end rendering** — Unreal-style **bloom**, filmic (ACES) tone mapping,
  correct colour management, soft shadows, a comet **trail**, particle bursts,
  speed-based FOV, and a death camera shake. Quality settings scale these for
  low-end devices.

### Losing conditions (there is no "win" — it's endless)

The run ends when the ball **falls off the side** of the track, **falls into a
gap**, or **hits a laser**. Speed only ever increases, so the goal is maximum
distance. Every ball state — grounded on flats/curves/hills/ramps, airborne
from jumps and ramp launches, landing, and reviving — is covered by the
headless audit in `test/sim.test.mjs` (`npm test`), which checks fairness and
physics invariants (no NaN, monotonic distance, ground-tracking) across runs.

## Controls

| Action | Touch (phone)          | Keyboard (desktop) |
| ------ | ---------------------- | ------------------ |
| Steer  | Drag left / right      | ← → or A / D       |
| Jump   | Swipe up, or quick tap | Space, ↑, or W     |

## Run it in a browser (fastest way to play / develop)

```bash
npm install
npm run dev
```

Open the printed URL. `npm run dev` also serves on your LAN, so you can open the
same URL on a phone connected to the same Wi-Fi to test touch controls.

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build
npm test          # headless gameplay simulation (verifies the track is fair)
```

## Build the native iOS & Android apps

The web build in `dist/` is wrapped natively by Capacitor. Native projects are
generated locally (they are intentionally **not** committed — see
`.gitignore`).

### Prerequisites

- Node 18+
- **Android:** Android Studio + an Android SDK
- **iOS:** a Mac with Xcode (+ CocoaPods)

### One-time setup

```bash
npm install
npm run build            # produce dist/
npx cap add android      # creates the android/ project
npx cap add ios          # creates the ios/ project   (macOS only)
```

### Build / run on a device

```bash
# Android — opens the project in Android Studio, then Run ▶
npm run cap:android

# iOS — opens the workspace in Xcode, then Run ▶  (macOS only)
npm run cap:ios
```

These scripts rebuild the web app, `cap sync` the assets into the native
project, and open the respective IDE. From there you Run on a simulator /
emulator or a connected device, and Archive for App Store / Play Store
submission as usual.

After changing any web/game code, re-sync with:

```bash
npm run cap:sync
```

## Ads & in-app purchases

The continue flow is fully playable in the browser using a **mock rewarded ad**
and an in-game coin revive, so nothing is stubbed out for the player. To ship
real monetization, set providers on the abstractions in `src/monetization.js`
(the calls are already shaped for native plugins):

- **Rewarded ads** → wire `Ads.setProvider({ showRewarded })` to
  [`@capacitor-community/admob`](https://github.com/capacitor-community/admob)
  (or your ad SDK). `showRewarded()` must resolve `true` once the reward is
  earned.
- **Coin packs (real money)** → wire `Purchases.setProvider({ buy })` to an IAP
  plugin (e.g. `@capacitor-community/in-app-purchases` or RevenueCat) if you
  want to sell coins. The coin **revive** itself only spends in-game coins, so
  IAP is optional.

The revive cost (coins) lives in `LIFE_COST` in `src/main.js`. Skins and prices
live in `src/skins.js`.

## Global leaderboard

Local scores work offline out of the box. The **Global** tab needs a backend.
Point the game at one by either:

- editing `LEADERBOARD_ENDPOINT` in `src/leaderboard.js`, or
- setting `window.IBR_LEADERBOARD_ENDPOINT = 'https://your-api.example'` at
  runtime (e.g. in `index.html`).

The endpoint must expose:

```
GET  {endpoint}/scores   ->  [{ "name": "Ada", "distance": 1234, "orbs": 12 }, ...]
POST {endpoint}/scores   <-  { "name": "Ada", "distance": 1234, "orbs": 12 }
```

`GET` should return the top scores (highest distance first); `POST` records a
new score. Until an endpoint is configured the Global tab simply says it isn't
connected — no scores are faked. Any small service (Firebase, Supabase, a Cloud
Function, a tiny Express app, etc.) that implements those two routes will work.

## Project layout

```
index.html              # app shell: canvas, HUD, start & game-over screens
capacitor.config.json   # native app id / name / web dir
vite.config.js          # bundler config (outputs to dist/)
src/
  main.js               # bootstrap: screens, menus, shop, continue flow
  game.js               # Three.js scene, rendering (bloom/FX), physics, skins
  track.js              # procedural track: curves, ramps, gaps, lasers, orbs
  input.js              # touch (drag/swipe/tap) + keyboard controls
  audio.js              # WebAudio sound effects (no asset files needed)
  music.js              # procedural looping background music
  settings.js           # persisted settings (sfx/music/quality/name)
  leaderboard.js        # local + pluggable global leaderboard
  economy.js            # persistent coins (banked from orbs)
  skins.js              # ball skins + ownership / equip persistence
  daily.js              # streak-based daily reward
  monetization.js       # ads + IAP abstraction (provider hooks)
  styles.css            # UI / HUD / menu styling
test/
  sim.test.mjs          # headless run that verifies the track stays fair
```

## Notes

- All art is generated in code (procedural canvas textures, geometry, and
  synthesized audio), so there are no binary asset files to manage.
- The default app id is `com.bizeract.infiniteballroll`; change `appId` /
  `appName` in `capacitor.config.json` before publishing.

## License

MIT
