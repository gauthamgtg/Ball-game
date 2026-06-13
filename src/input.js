// Unified input: touch drag to steer, swipe-up / tap to jump, plus keyboard.
//
// `lateral` is the player's desired absolute world-X for the ball. The game
// reads it each frame and eases the ball toward it.
export class Input {
  constructor(bounds = 12) {
    this.bounds = bounds;
    this.lateral = 0;
    this._jumpQueued = false;

    // pointer drag state
    this._dragging = false;
    this._startX = 0;
    this._startY = 0;
    this._startLateral = 0;
    this._jumpedThisDrag = false;
    this._downTime = 0;

    // keyboard state
    this._keyLeft = false;
    this._keyRight = false;

    // Sensitivity: dragging ~half the screen width sweeps the full track.
    this._sens = (this.bounds * 2) / (window.innerWidth * 0.6);

    this._bind();
  }

  reset() {
    this.lateral = 0;
    this._jumpQueued = false;
    this._dragging = false;
  }

  consumeJump() {
    if (this._jumpQueued) {
      this._jumpQueued = false;
      return true;
    }
    return false;
  }

  // Keyboard steering is continuous, so advance it each frame.
  update(dt) {
    if (this._keyLeft) this.lateral -= 14 * dt;
    if (this._keyRight) this.lateral += 14 * dt;
    this.lateral = Math.max(-this.bounds, Math.min(this.bounds, this.lateral));
  }

  _queueJump() {
    this._jumpQueued = true;
  }

  _bind() {
    const canvas = document.getElementById('game');

    const onDown = (x, y) => {
      this._dragging = true;
      this._startX = x;
      this._startY = y;
      this._startLateral = this.lateral;
      this._jumpedThisDrag = false;
      this._downTime = performance.now();
    };
    const onMove = (x, y) => {
      if (!this._dragging) return;
      const dx = x - this._startX;
      const dy = y - this._startY;
      this.lateral = Math.max(
        -this.bounds,
        Math.min(this.bounds, this._startLateral + dx * this._sens)
      );
      // Swipe up to jump.
      if (!this._jumpedThisDrag && dy < -42) {
        this._queueJump();
        this._jumpedThisDrag = true;
      }
    };
    const onUp = (x, y) => {
      if (!this._dragging) return;
      const dt = performance.now() - this._downTime;
      const dist = Math.hypot(x - this._startX, y - this._startY);
      // A quick, stationary touch counts as a tap-to-jump.
      if (!this._jumpedThisDrag && dt < 250 && dist < 16) this._queueJump();
      this._dragging = false;
    };

    canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        onDown(t.clientX, t.clientY);
      },
      { passive: false }
    );
    canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        onMove(t.clientX, t.clientY);
      },
      { passive: false }
    );
    canvas.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      onUp(t.clientX, t.clientY);
    });

    // Mouse fallback for desktop browsers.
    canvas.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', (e) => onUp(e.clientX, e.clientY));

    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this._keyLeft = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this._keyRight = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        this._queueJump();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this._keyLeft = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this._keyRight = false;
    });

    window.addEventListener('resize', () => {
      this._sens = (this.bounds * 2) / (window.innerWidth * 0.6);
    });
  }
}
