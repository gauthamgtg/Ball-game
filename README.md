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
- **Best distance** is saved locally between runs.

## Controls

| Action | Touch (phone)            | Keyboard (desktop)      |
| ------ | ------------------------ | ----------------------- |
| Steer  | Drag left / right        | ← → or A / D            |
| Jump   | Swipe up, or quick tap   | Space, ↑, or W          |

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

## Project layout

```
index.html              # app shell: canvas, HUD, start & game-over screens
capacitor.config.json   # native app id / name / web dir
vite.config.js          # bundler config (outputs to dist/)
src/
  main.js               # bootstrap: wires the DOM UI to the game
  game.js               # Three.js scene, ball physics, camera, collisions
  track.js              # procedural track: curves, ramps, gaps, lasers, orbs
  input.js              # touch (drag/swipe/tap) + keyboard controls
  audio.js              # WebAudio sound effects (no asset files needed)
  styles.css            # UI / HUD styling
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
