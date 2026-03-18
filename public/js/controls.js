/**
 * NOOBMARINE — Control Renderers (all 11 types)
 *
 * Each control factory returns an object:
 *   { el, getValue, reset, setActive(bool), onSubmit(fn) }
 *
 * All interactions are single-finger touch (+ mouse fallback for testing).
 * Values snap to discrete steps matching server-side generation.
 */

// ─── Snap helpers ─────────────────────────────────────────────────────────────

function snapTo(value, step, min, max) {
  const snapped = Math.round(value / step) * step;
  return Math.max(min, Math.min(max, snapped));
}

function snapToArray(value, arr) {
  return arr.reduce((prev, cur) =>
    Math.abs(cur - value) < Math.abs(prev - value) ? cur : prev
  );
}

const DIAL_SNAPS   = [0, 45, 90, 135, 180, 225, 270, 315];
const SLIDER_SNAPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const RING_SNAPS   = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// ─── Touch/mouse unified event helpers ───────────────────────────────────────

function getPointer(e) {
  if (e.touches && e.touches.length > 0) return e.touches[0];
  if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0];
  return e;
}

function addDragListeners(el, onStart, onMove, onEnd) {
  // Touch — preventDefault keeps drag controls working without page scroll
  el.addEventListener('touchstart', e => { e.preventDefault(); onStart(getPointer(e)); }, { passive: false });
  el.addEventListener('touchmove',  e => { e.preventDefault(); onMove(getPointer(e));  }, { passive: false });
  el.addEventListener('touchend',   e => { e.preventDefault(); onEnd(getPointer(e));   }, { passive: false });

  // Mouse — attach window listeners ONLY during an active drag, then clean up.
  // (Permanent window.mousemove listeners were causing flickering with N controls.)
  el.addEventListener('mousedown', e => {
    onStart(e);
    const onMoveTemp = ev => { if (ev.buttons === 1) onMove(ev); };
    const onEndTemp  = ev => {
      onEnd(ev);
      window.removeEventListener('mousemove', onMoveTemp);
    };
    window.addEventListener('mousemove', onMoveTemp);
    window.addEventListener('mouseup', onEndTemp, { once: true });
  });
}

// ─── Shared success flash ─────────────────────────────────────────────────────

function flashSuccess(el) {
  el.classList.add('control-success');
  setTimeout(() => el.classList.remove('control-success'), 1200);
}

function flashError(el) {
  el.classList.add('control-error');
  setTimeout(() => el.classList.remove('control-error'), 600);
}

// ─── 1. Toggle Switch ─────────────────────────────────────────────────────────

function createToggle(control) {
  let value = 'OFF';
  let submitFn = null;
  let active = false;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-toggle';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="toggle-track">
        <div class="toggle-thumb"></div>
        <span class="toggle-label-off">OFF</span>
        <span class="toggle-label-on">ON</span>
      </div>
      <div class="ctrl-value-display">OFF</div>
    </div>
  `;

  const track = el.querySelector('.toggle-track');
  const display = el.querySelector('.ctrl-value-display');

  track.addEventListener('click', () => {
    value = value === 'OFF' ? 'ON' : 'OFF';
    update();
    if (active && submitFn) submitFn(value);
  });
  track.addEventListener('touchend', (e) => {
    e.preventDefault();
    value = value === 'OFF' ? 'ON' : 'OFF';
    update();
    if (active && submitFn) submitFn(value);
  });

  function update() {
    track.classList.toggle('on', value === 'ON');
    display.textContent = value;
  }

  return {
    el,
    getValue: () => value,
    reset: () => { value = 'OFF'; update(); el.classList.remove('control-success', 'control-error', 'control-done'); },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 2. Button ────────────────────────────────────────────────────────────────

function createButton(control) {
  let pressed = false;
  let submitFn = null;
  let active = false;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-button';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <button class="big-btn" type="button">ACTIVATE</button>
      <div class="ctrl-value-display">READY</div>
    </div>
  `;

  const btn = el.querySelector('.big-btn');
  const display = el.querySelector('.ctrl-value-display');

  function press() {
    if (pressed) return;
    pressed = true;
    btn.classList.add('pressed');
    display.textContent = 'PRESSED';
    if (active && submitFn) submitFn('PRESSED');
  }

  btn.addEventListener('click', press);
  btn.addEventListener('touchend', (e) => { e.preventDefault(); press(); });

  return {
    el,
    getValue: () => pressed ? 'PRESSED' : 'READY',
    reset: () => {
      pressed = false;
      btn.classList.remove('pressed');
      display.textContent = 'READY';
      el.classList.remove('control-success', 'control-error', 'control-done');
    },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 3. Dial / Rotary Knob ───────────────────────────────────────────────────

function createDial(control) {
  let angleDeg = 0;
  let submitFn = null;
  let active = false;
  let dragging = false;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-dial';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="dial-outer">
        <div class="dial-knob">
          <div class="dial-pointer"></div>
        </div>
        <div class="dial-ticks"></div>
      </div>
      <div class="ctrl-value-display">0°</div>
    </div>
  `;

  const knob = el.querySelector('.dial-knob');
  const display = el.querySelector('.ctrl-value-display');
  const outer = el.querySelector('.dial-outer');

  // Draw tick marks
  const ticks = el.querySelector('.dial-ticks');
  DIAL_SNAPS.forEach(deg => {
    const tick = document.createElement('div');
    tick.className = 'dial-tick';
    tick.style.transform = `rotate(${deg}deg) translateY(-28px)`;
    ticks.appendChild(tick);
  });

  function getCenter() {
    const r = outer.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function updateDisplay() {
    knob.style.transform = `rotate(${angleDeg}deg)`;
    display.textContent = `${angleDeg}°`;
  }

  addDragListeners(outer,
    (p) => { dragging = true; },
    (p) => {
      if (!dragging) return;
      const c = getCenter();
      const rawAngle = Math.atan2(p.clientY - c.y, p.clientX - c.x) * 180 / Math.PI + 90;
      const normalized = ((rawAngle % 360) + 360) % 360;
      angleDeg = snapToArray(normalized, DIAL_SNAPS);
      updateDisplay();
    },
    (p) => {
      if (!dragging) return;
      dragging = false;
      if (active && submitFn) submitFn(angleDeg);
    }
  );

  updateDisplay();

  return {
    el,
    getValue: () => angleDeg,
    reset: () => { angleDeg = 0; updateDisplay(); el.classList.remove('control-success', 'control-error', 'control-done'); },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 4. Horizontal Slider ────────────────────────────────────────────────────

function createHSlider(control) {
  let value = 0;
  let submitFn = null;
  let active = false;
  let dragging = false;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-h-slider';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="h-slider-track">
        <div class="h-slider-fill"></div>
        <div class="h-slider-thumb"></div>
      </div>
      <div class="ctrl-value-display">0%</div>
    </div>
  `;

  const track = el.querySelector('.h-slider-track');
  const fill = el.querySelector('.h-slider-fill');
  const thumb = el.querySelector('.h-slider-thumb');
  const display = el.querySelector('.ctrl-value-display');

  function updateDisplay() {
    fill.style.width = `${value}%`;
    thumb.style.left = `${value}%`;
    display.textContent = `${value}%`;
  }

  function calcValue(clientX) {
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
    return snapTo(pct, 10, 0, 100);
  }

  addDragListeners(track,
    (p) => { dragging = true; value = calcValue(p.clientX); updateDisplay(); },
    (p) => { if (!dragging) return; value = calcValue(p.clientX); updateDisplay(); },
    (p) => { if (!dragging) return; dragging = false; if (active && submitFn) submitFn(value); }
  );

  updateDisplay();

  return {
    el,
    getValue: () => value,
    reset: () => { value = 0; updateDisplay(); el.classList.remove('control-success', 'control-error', 'control-done'); },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 5. Vertical Slider ──────────────────────────────────────────────────────

function createVSlider(control) {
  let value = 0;
  let submitFn = null;
  let active = false;
  let dragging = false;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-v-slider';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="v-slider-track">
        <div class="v-slider-fill"></div>
        <div class="v-slider-thumb"></div>
      </div>
      <div class="ctrl-value-display">0%</div>
    </div>
  `;

  const track = el.querySelector('.v-slider-track');
  const fill = el.querySelector('.v-slider-fill');
  const thumb = el.querySelector('.v-slider-thumb');
  const display = el.querySelector('.ctrl-value-display');

  function updateDisplay() {
    fill.style.height = `${value}%`;
    thumb.style.bottom = `${value}%`;
    display.textContent = `${value}%`;
  }

  function calcValue(clientY) {
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, 100 - (clientY - rect.top) / rect.height * 100));
    return snapTo(pct, 10, 0, 100);
  }

  addDragListeners(track,
    (p) => { dragging = true; value = calcValue(p.clientY); updateDisplay(); },
    (p) => { if (!dragging) return; value = calcValue(p.clientY); updateDisplay(); },
    (p) => { if (!dragging) return; dragging = false; if (active && submitFn) submitFn(value); }
  );

  updateDisplay();

  return {
    el,
    getValue: () => value,
    reset: () => { value = 0; updateDisplay(); el.classList.remove('control-success', 'control-error', 'control-done'); },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 6. Multi-Slider (Equalizer) ─────────────────────────────────────────────

function createMultiSlider(control) {
  const NUM_BARS = 5;
  let values = [1, 1, 1, 1, 1];
  let submitFn = null;
  let active = false;
  let draggingBar = -1;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-multi-slider ctrl-wide';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="ctrl-value-display">1,1,1,1,1</div>
      <div class="eq-container"></div>
    </div>
  `;

  const container = el.querySelector('.eq-container');
  const display = el.querySelector('.ctrl-value-display');

  const bars = [];
  const fills = [];

  for (let i = 0; i < NUM_BARS; i++) {
    const barEl = document.createElement('div');
    barEl.className = 'eq-bar-wrap';
    barEl.innerHTML = `
      <div class="eq-track">
        <div class="eq-fill"></div>
        <div class="eq-thumb"></div>
      </div>
      <div class="eq-bar-label">${i + 1}</div>
    `;
    container.appendChild(barEl);
    bars.push(barEl.querySelector('.eq-track'));
    fills.push({ fill: barEl.querySelector('.eq-fill'), thumb: barEl.querySelector('.eq-thumb') });
  }

  function updateDisplay() {
    fills.forEach((f, i) => {
      const pct = ((values[i] - 1) / 8) * 100;
      f.fill.style.height = `${pct}%`;
      f.thumb.style.bottom = `${pct}%`;
    });
    display.textContent = values.join(',');
  }

  function calcBarValue(barIndex, clientY) {
    const rect = bars[barIndex].getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, 100 - (clientY - rect.top) / rect.height * 100));
    return Math.max(1, Math.min(9, Math.round(pct / 100 * 8) + 1));
  }

  bars.forEach((bar, i) => {
    addDragListeners(bar,
      (p) => { draggingBar = i; values[i] = calcBarValue(i, p.clientY); updateDisplay(); },
      (p) => { if (draggingBar === i) { values[i] = calcBarValue(i, p.clientY); updateDisplay(); } },
      (p) => { if (draggingBar === i) { draggingBar = -1; if (active && submitFn) submitFn([...values]); } }
    );
  });

  updateDisplay();

  return {
    el,
    getValue: () => [...values],
    reset: () => { values = [1,1,1,1,1]; updateDisplay(); el.classList.remove('control-success', 'control-error', 'control-done'); },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 7. Number Wheel (Drum Roller) ───────────────────────────────────────────

function createNumberWheel(control) {
  let value = 0; // 0-99
  let submitFn = null;
  let active = false;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-number-wheel';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="drum-container">
        <div class="drum" data-drum="tens">
          <div class="drum-peek drum-peek-top">9</div>
          <div class="drum-display">0</div>
          <div class="drum-peek drum-peek-bot">1</div>
        </div>
        <div class="drum-sep">.</div>
        <div class="drum" data-drum="units">
          <div class="drum-peek drum-peek-top">9</div>
          <div class="drum-display">0</div>
          <div class="drum-peek drum-peek-bot">1</div>
        </div>
      </div>
      <div class="ctrl-value-display">00</div>
    </div>
  `;

  const display = el.querySelector('.ctrl-value-display');
  const drums = el.querySelectorAll('.drum');

  function getTens()  { return Math.floor(value / 10); }
  function getUnits() { return value % 10; }

  function updateDisplay() {
    const t = getTens(), u = getUnits();
    drums[0].querySelector('.drum-display').textContent = t;
    drums[1].querySelector('.drum-display').textContent = u;
    drums[0].querySelector('.drum-peek-top').textContent = (t + 9) % 10;
    drums[0].querySelector('.drum-peek-bot').textContent = (t + 1) % 10;
    drums[1].querySelector('.drum-peek-top').textContent = (u + 9) % 10;
    drums[1].querySelector('.drum-peek-bot').textContent = (u + 1) % 10;
    display.textContent = String(value).padStart(2, '0');
  }

  function makeDrumInteractive(drum, isUnits) {
    let startY = null;
    let startValue = 0;

    addDragListeners(drum,
      (p) => { startY = p.clientY; startValue = isUnits ? getUnits() : getTens(); },
      (p) => {
        if (startY === null) return;
        const delta = Math.round((startY - p.clientY) / 15);
        const newDigit = ((startValue + delta) % 10 + 10) % 10;
        if (isUnits) value = getTens() * 10 + newDigit;
        else value = newDigit * 10 + getUnits();
        updateDisplay();
      },
      (p) => {
        startY = null;
        if (active && submitFn) submitFn(value);
      }
    );
  }

  makeDrumInteractive(drums[0], false); // tens
  makeDrumInteractive(drums[1], true);  // units
  updateDisplay();

  return {
    el,
    getValue: () => value,
    reset: () => { value = 0; updateDisplay(); el.classList.remove('control-success', 'control-error', 'control-done'); },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 8. Up/Down Stepper ──────────────────────────────────────────────────────

function createStepper(control) {
  let value = 1;
  let submitFn = null;
  let active = false;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-stepper';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="stepper-row">
        <button class="stepper-btn" data-dir="-1" type="button">−</button>
        <div class="stepper-display">1</div>
        <button class="stepper-btn" data-dir="1" type="button">+</button>
      </div>
      <div class="ctrl-value-display">1</div>
    </div>
  `;

  const stepDisplay = el.querySelector('.stepper-display');
  const valueDisplay = el.querySelector('.ctrl-value-display');
  const btns = el.querySelectorAll('.stepper-btn');

  function updateDisplay() {
    stepDisplay.textContent = value;
    valueDisplay.textContent = value;
  }

  function step(dir) {
    value = Math.max(1, Math.min(10, value + dir));
    updateDisplay();
    if (active && submitFn) submitFn(value);
  }

  btns.forEach(btn => {
    const dir = parseInt(btn.dataset.dir);
    btn.addEventListener('click', () => step(dir));
    btn.addEventListener('touchend', (e) => { e.preventDefault(); step(dir); });
  });

  return {
    el,
    getValue: () => value,
    reset: () => { value = 1; updateDisplay(); el.classList.remove('control-success', 'control-error', 'control-done'); },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 9. Button Sequence ──────────────────────────────────────────────────────

function createBtnSequence(control) {
  const BUTTONS = [1, 2, 3, 4];
  let sequence = [];
  let submitFn = null;
  let active = false;
  // Shuffle button positions for visual chaos
  const displayOrder = [...BUTTONS].sort(() => Math.random() - 0.5);

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-btn-sequence ctrl-wide';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="seq-progress-row">
        <div class="seq-progress"></div>
        <button class="seq-reset-btn" type="button" title="Reset">&#x21BB;</button>
      </div>
      <div class="seq-pad"></div>
      <div class="ctrl-value-display">—</div>
    </div>
  `;

  const pad = el.querySelector('.seq-pad');
  const progress = el.querySelector('.seq-progress');
  const display = el.querySelector('.ctrl-value-display');

  displayOrder.forEach(num => {
    const btn = document.createElement('button');
    btn.className = 'seq-btn';
    btn.type = 'button';
    btn.textContent = num;

    function press() {
      sequence.push(num);
      updateDisplay();
      if (sequence.length === 4 && active && submitFn) {
        submitFn([...sequence]);
        sequence = [];
        updateDisplay();
      }
    }

    btn.addEventListener('click', press);
    btn.addEventListener('touchend', (e) => { e.preventDefault(); press(); });
    pad.appendChild(btn);
  });

  const resetBtn = el.querySelector('.seq-reset-btn');
  resetBtn.addEventListener('click', (e) => { e.stopPropagation(); sequence = []; updateDisplay(); });
  resetBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); sequence = []; updateDisplay(); });

  function updateDisplay() {
    progress.textContent = sequence.length > 0 ? sequence.join(' → ') : '· · · ·';
    display.textContent = sequence.length > 0 ? sequence.join('-') : '—';
  }

  updateDisplay();

  return {
    el,
    getValue: () => [...sequence],
    reset: () => { sequence = []; updateDisplay(); el.classList.remove('control-success', 'control-error', 'control-done'); },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 10. Switch Sequence ─────────────────────────────────────────────────────

function createSwSequence(control) {
  const SWITCHES = ['SW1', 'SW2', 'SW3', 'SW4'];
  let sequence = [];
  let switchStates = { SW1: false, SW2: false, SW3: false, SW4: false };
  let submitFn = null;
  let active = false;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-sw-sequence ctrl-wide';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="seq-progress-row"><div class="sw-seq-progress"></div><button class="seq-reset-btn" type="button">↻</button></div>
      <div class="sw-seq-panel"></div>
      <div class="ctrl-value-display">—</div>
    </div>
  `;

  const panel = el.querySelector('.sw-seq-panel');
  const progress = el.querySelector('.sw-seq-progress');
  const display = el.querySelector('.ctrl-value-display');
  el.querySelector('.seq-reset-btn').addEventListener('click', () => {
    sequence = [];
    SWITCHES.forEach(s => { switchStates[s] = false; switchEls[s]?.classList.remove('on'); });
    updateDisplay();
  });

  const switchEls = {};

  SWITCHES.forEach(sw => {
    const wrap = document.createElement('div');
    wrap.className = 'sw-seq-item';
    wrap.innerHTML = `
      <div class="sw-seq-label">${sw}</div>
      <div class="sw-seq-toggle ${switchStates[sw] ? 'on' : ''}"></div>
    `;
    const toggle = wrap.querySelector('.sw-seq-toggle');
    switchEls[sw] = toggle;

    function flip() {
      if (switchStates[sw]) return; // already flipped — can't un-flip mid sequence
      switchStates[sw] = true;
      toggle.classList.add('on');
      sequence.push(sw);
      updateDisplay();
      if (sequence.length === 4 && active && submitFn) {
        submitFn([...sequence]);
        // reset after submit
        setTimeout(() => {
          sequence = [];
          SWITCHES.forEach(s => { switchStates[s] = false; switchEls[s].classList.remove('on'); });
          updateDisplay();
        }, 500);
      }
    }

    toggle.addEventListener('click', flip);
    toggle.addEventListener('touchend', (e) => { e.preventDefault(); flip(); });
    panel.appendChild(wrap);
  });

  function updateDisplay() {
    progress.textContent = sequence.length > 0 ? sequence.join(' → ') : '· · · ·';
    display.textContent = sequence.length > 0 ? sequence.join(', ') : '—';
  }

  updateDisplay();

  return {
    el,
    getValue: () => [...sequence],
    reset: () => {
      sequence = [];
      SWITCHES.forEach(sw => { switchStates[sw] = false; switchEls[sw].classList.remove('on'); });
      updateDisplay();
      el.classList.remove('control-success', 'control-error', 'control-done');
    },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 11. Circular Progress Ring ──────────────────────────────────────────────

function createRing(control) {
  let value = 0;
  let submitFn = null;
  let active = false;
  let dragging = false;

  const el = document.createElement('div');
  el.className = 'ctrl ctrl-ring';
  el.innerHTML = `
    <div class="ctrl-label">${control.name}</div>
    <div class="ctrl-body">
      <div class="ring-container">
        <svg class="ring-svg" viewBox="0 0 80 80">
          <circle class="ring-bg" cx="40" cy="40" r="32"/>
          <circle class="ring-fill" cx="40" cy="40" r="32"
            stroke-dasharray="201" stroke-dashoffset="201"
            transform="rotate(-90 40 40)"/>
        </svg>
        <div class="ring-value-inner">0%</div>
      </div>
      <div class="ctrl-value-display">0%</div>
    </div>
  `;

  const ringFill = el.querySelector('.ring-fill');
  const innerText = el.querySelector('.ring-value-inner');
  const display = el.querySelector('.ctrl-value-display');
  const container = el.querySelector('.ring-container');

  const CIRCUMFERENCE = 201; // 2π × 32 ≈ 201

  function updateDisplay() {
    const offset = CIRCUMFERENCE - (value / 100) * CIRCUMFERENCE;
    ringFill.style.strokeDashoffset = offset;
    innerText.textContent = `${value}%`;
    display.textContent = `${value}%`;
  }

  function getCenter() {
    const r = container.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function angleToValue(angle) {
    // angle: 0 = top, clockwise. Convert to 0-100 pct
    const normalized = ((angle % 360) + 360) % 360;
    const pct = normalized / 360 * 100;
    // Snap to RING_SNAPS
    return snapToArray(pct, RING_SNAPS);
  }

  addDragListeners(container,
    (p) => { dragging = true; },
    (p) => {
      if (!dragging) return;
      const c = getCenter();
      const rawAngle = Math.atan2(p.clientX - c.x, -(p.clientY - c.y)) * 180 / Math.PI;
      const angle = ((rawAngle % 360) + 360) % 360;
      value = angleToValue(angle);
      updateDisplay();
    },
    (p) => {
      if (!dragging) return;
      dragging = false;
      if (active && submitFn) submitFn(value);
    }
  );

  updateDisplay();

  return {
    el,
    getValue: () => value,
    reset: () => { value = 0; updateDisplay(); el.classList.remove('control-success', 'control-error', 'control-done'); },
    setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); },
    setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); },
    onSubmit: (fn) => { submitFn = fn; },
  };
}

// ─── 12. Keypad (4-digit code entry) ────────────────────────────────────────
function createKeypad(control) {
  let code = []; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-keypad ctrl-wide';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body">
    <div class="seq-progress-row"><div class="seq-progress">· · · ·</div><button class="seq-reset-btn" type="button">↻</button></div>
    <div class="keypad-grid"></div><div class="ctrl-value-display">—</div></div>`;
  const grid = el.querySelector('.keypad-grid');
  const progress = el.querySelector('.seq-progress');
  const display = el.querySelector('.ctrl-value-display');
  el.querySelector('.seq-reset-btn').addEventListener('click', () => { code = []; updateDisplay(); });
  for (let i = 1; i <= 9; i++) {
    const btn = document.createElement('button'); btn.className = 'seq-btn'; btn.type = 'button'; btn.textContent = i;
    btn.addEventListener('click', () => { if (code.length < 4) { code.push(i); updateDisplay(); if (code.length === 4 && active && submitFn) { submitFn([...code]); code = []; updateDisplay(); } } });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
    grid.appendChild(btn);
  }
  function updateDisplay() { progress.textContent = code.length > 0 ? code.join(' ') : '· · · ·'; display.textContent = code.length > 0 ? code.join('') : '—'; }
  updateDisplay();
  return { el, getValue: () => [...code], reset: () => { code = []; updateDisplay(); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 13. Directional (4-way selector) ──────────────────────────────────────
function createDirectional(control) {
  let value = ''; let submitFn = null; let active = false;
  const DIRS = ['UP','RIGHT','DOWN','LEFT']; const ARROWS = ['↑','→','↓','←'];
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-directional';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="dir-pad"></div><div class="ctrl-value-display">—</div></div>`;
  const pad = el.querySelector('.dir-pad');
  const display = el.querySelector('.ctrl-value-display');
  DIRS.forEach((d, i) => {
    const btn = document.createElement('button'); btn.className = 'dir-btn dir-' + d.toLowerCase(); btn.type = 'button'; btn.textContent = ARROWS[i];
    btn.addEventListener('click', () => { value = d; pad.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); display.textContent = d; if (active && submitFn) submitFn(d); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
    pad.appendChild(btn);
  });
  return { el, getValue: () => value, reset: () => { value = ''; display.textContent = '—'; pad.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('selected')); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 14. Rapid Tap (tap counter) ───────────────────────────────────────────
function createRapidTap(control) {
  let count = 0; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-rapid-tap';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="tap-count">0</div><div style="display:flex;gap:6px;"><button class="big-btn" type="button" style="flex:1;">TAP</button><button class="seq-reset-btn" type="button">↻</button></div><div class="ctrl-value-display">0</div></div>`;
  const countEl = el.querySelector('.tap-count');
  const display = el.querySelector('.ctrl-value-display');
  const btn = el.querySelector('.big-btn');
  const resetBtn = el.querySelector('.seq-reset-btn');
  btn.addEventListener('click', () => { count++; countEl.textContent = count; display.textContent = count; if (active && submitFn) submitFn(count); });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
  resetBtn.addEventListener('click', () => { count = 0; countEl.textContent = 0; display.textContent = '0'; });
  resetBtn.addEventListener('touchend', (e) => { e.preventDefault(); resetBtn.click(); });
  return { el, getValue: () => count, reset: () => { count = 0; countEl.textContent = 0; display.textContent = '0'; el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 15. Color Picker (4 colors, radio) ────────────────────────────────────
function createColorPicker(control) {
  let value = ''; let submitFn = null; let active = false;
  const COLORS = ['RED','GREEN','BLUE','YELLOW']; const CSS = ['#FF3300','#00FF88','#3399FF','#FFAA00'];
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-color-picker';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="color-row"></div><div class="ctrl-value-display">—</div></div>`;
  const row = el.querySelector('.color-row');
  const display = el.querySelector('.ctrl-value-display');
  COLORS.forEach((c, i) => {
    const btn = document.createElement('button'); btn.className = 'color-btn'; btn.type = 'button'; btn.style.background = CSS[i]; btn.title = c; btn.textContent = c[0];
    btn.addEventListener('click', () => { value = c; row.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); display.textContent = c; if (active && submitFn) submitFn(c); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
    row.appendChild(btn);
  });
  return { el, getValue: () => value, reset: () => { value = ''; display.textContent = '—'; row.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected')); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 16. Level Select (1-5 radio) ──────────────────────────────────────────
function createLevelSelect(control) {
  let value = 0; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-level-select';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="level-row"></div><div class="ctrl-value-display">—</div></div>`;
  const row = el.querySelector('.level-row');
  const display = el.querySelector('.ctrl-value-display');
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button'); btn.className = 'level-btn'; btn.type = 'button'; btn.textContent = i;
    btn.addEventListener('click', () => { value = i; row.querySelectorAll('.level-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); display.textContent = i; if (active && submitFn) submitFn(i); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
    row.appendChild(btn);
  }
  return { el, getValue: () => value, reset: () => { value = 0; display.textContent = '—'; row.querySelectorAll('.level-btn').forEach(b => b.classList.remove('selected')); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 17. Compass (8-direction selector) ────────────────────────────────────
function createCompass(control) {
  let value = ''; let submitFn = null; let active = false;
  const DIRS = ['N','NE','E','SE','S','SW','W','NW'];
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-compass';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="compass-grid"></div><div class="ctrl-value-display">—</div></div>`;
  const grid = el.querySelector('.compass-grid');
  const display = el.querySelector('.ctrl-value-display');
  // 3x3 grid: NW N NE / W · E / SW S SE
  const layout = ['NW','N','NE','W','','E','SW','S','SE'];
  layout.forEach(d => {
    const btn = document.createElement('button'); btn.className = 'compass-btn'; btn.type = 'button'; btn.textContent = d;
    if (!d) { btn.disabled = true; btn.style.visibility = 'hidden'; }
    else { btn.addEventListener('click', () => { value = d; grid.querySelectorAll('.compass-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); display.textContent = d; if (active && submitFn) submitFn(d); }); btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); }); }
    grid.appendChild(btn);
  });
  return { el, getValue: () => value, reset: () => { value = ''; display.textContent = '—'; grid.querySelectorAll('.compass-btn').forEach(b => b.classList.remove('selected')); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 18. Clock Set (1-12 selector) ─────────────────────────────────────────
function createClockSet(control) {
  let value = 0; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-clock-set';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="clock-grid"></div><div class="ctrl-value-display">—</div></div>`;
  const grid = el.querySelector('.clock-grid');
  const display = el.querySelector('.ctrl-value-display');
  for (let i = 1; i <= 12; i++) {
    const btn = document.createElement('button'); btn.className = 'clock-btn'; btn.type = 'button'; btn.textContent = i;
    btn.addEventListener('click', () => { value = i; grid.querySelectorAll('.clock-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); display.textContent = i + " o'clock"; if (active && submitFn) submitFn(i); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
    grid.appendChild(btn);
  }
  return { el, getValue: () => value, reset: () => { value = 0; display.textContent = '—'; grid.querySelectorAll('.clock-btn').forEach(b => b.classList.remove('selected')); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 19. Icon Match (pick 1 of 4 icons) ────────────────────────────────────
function createIconMatch(control) {
  let value = ''; let submitFn = null; let active = false;
  const ICONS = [{s:'⚓',n:'ANCHOR'},{s:'⚙',n:'GEAR'},{s:'⚡',n:'BOLT'},{s:'☢',n:'HAZARD'}];
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-icon-match';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="icon-row"></div><div class="ctrl-value-display">—</div></div>`;
  const row = el.querySelector('.icon-row');
  const display = el.querySelector('.ctrl-value-display');
  ICONS.forEach(ic => {
    const btn = document.createElement('button'); btn.className = 'icon-btn'; btn.type = 'button'; btn.textContent = ic.s; btn.title = ic.n;
    btn.addEventListener('click', () => { value = ic.n; row.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); display.textContent = ic.n; if (active && submitFn) submitFn(ic.n); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
    row.appendChild(btn);
  });
  return { el, getValue: () => value, reset: () => { value = ''; display.textContent = '—'; row.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected')); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 20. Valve Turn (stepper 0-5) ──────────────────────────────────────────
function createValveTurn(control) {
  let value = 0; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-valve-turn';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="stepper-row"><button class="stepper-btn" type="button">−</button><div class="stepper-display">0</div><button class="stepper-btn" type="button">+</button></div><div class="ctrl-value-display">0 turns</div></div>`;
  const btns = el.querySelectorAll('.stepper-btn');
  const disp = el.querySelector('.stepper-display');
  const display = el.querySelector('.ctrl-value-display');
  btns[0].addEventListener('click', () => { if (value > 0) { value--; update(); } });
  btns[1].addEventListener('click', () => { if (value < 5) { value++; update(); } });
  function update() { disp.textContent = value; display.textContent = value + ' turns'; if (active && submitFn) submitFn(value); }
  return { el, getValue: () => value, reset: () => { value = 0; update(); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 21. Pattern Grid (3x3 toggle) ─────────────────────────────────────────
function createPatternGrid(control) {
  let cells = [0,0,0,0,0,0,0,0,0]; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-pattern-grid ctrl-wide';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="pattern-grid"></div><div class="ctrl-value-display">000000000</div></div>`;
  const grid = el.querySelector('.pattern-grid');
  const display = el.querySelector('.ctrl-value-display');
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('button'); cell.className = 'pattern-cell'; cell.type = 'button';
    cell.addEventListener('click', () => { cells[i] = cells[i] ? 0 : 1; cell.classList.toggle('on', !!cells[i]); display.textContent = cells.join(''); if (active && submitFn) submitFn([...cells]); });
    cell.addEventListener('touchend', (e) => { e.preventDefault(); cell.click(); });
    grid.appendChild(cell);
  }
  return { el, getValue: () => [...cells], reset: () => { cells = [0,0,0,0,0,0,0,0,0]; grid.querySelectorAll('.pattern-cell').forEach(c => c.classList.remove('on')); display.textContent = '000000000'; el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 22. Color Sequence (4-color tap order) ────────────────────────────────
function createColorSequence(control) {
  let seq = []; let submitFn = null; let active = false;
  const COLORS = ['RED','GREEN','BLUE','YELLOW']; const CSS = ['#FF3300','#00FF88','#3399FF','#FFAA00'];
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-color-sequence ctrl-wide';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="seq-progress-row"><div class="seq-progress">· · · ·</div><button class="seq-reset-btn" type="button">↻</button></div><div class="color-row"></div><div class="ctrl-value-display">—</div></div>`;
  const row = el.querySelector('.color-row');
  const progress = el.querySelector('.seq-progress');
  const display = el.querySelector('.ctrl-value-display');
  el.querySelector('.seq-reset-btn').addEventListener('click', () => { seq = []; updateDisp(); });
  COLORS.forEach((c, i) => {
    const btn = document.createElement('button'); btn.className = 'color-btn'; btn.type = 'button'; btn.style.background = CSS[i]; btn.textContent = c[0];
    btn.addEventListener('click', () => { if (seq.length < 4) { seq.push(c); updateDisp(); if (seq.length === 4 && active && submitFn) { submitFn([...seq]); seq = []; updateDisp(); } } });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
    row.appendChild(btn);
  });
  function updateDisp() { progress.textContent = seq.length > 0 ? seq.join(' → ') : '· · · ·'; display.textContent = seq.length > 0 ? seq.join(',') : '—'; }
  updateDisp();
  return { el, getValue: () => [...seq], reset: () => { seq = []; updateDisp(); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 23. Binary Row (8 toggles) ────────────────────────────────────────────
function createBinaryRow(control) {
  let bits = [0,0,0,0,0,0,0,0]; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-binary-row ctrl-wide';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="binary-row"></div><div class="ctrl-value-display">00000000</div></div>`;
  const row = el.querySelector('.binary-row');
  const display = el.querySelector('.ctrl-value-display');
  for (let i = 0; i < 8; i++) {
    const btn = document.createElement('button'); btn.className = 'binary-bit'; btn.type = 'button'; btn.textContent = '0';
    btn.addEventListener('click', () => { bits[i] = bits[i] ? 0 : 1; btn.textContent = bits[i]; btn.classList.toggle('on', !!bits[i]); display.textContent = bits.join(''); if (active && submitFn) submitFn([...bits]); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
    row.appendChild(btn);
  }
  return { el, getValue: () => [...bits], reset: () => { bits = [0,0,0,0,0,0,0,0]; row.querySelectorAll('.binary-bit').forEach(b => { b.textContent = '0'; b.classList.remove('on'); }); display.textContent = '00000000'; el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 24. Triple Stepper (3 digits) ─────────────────────────────────────────
function createTripleStepper(control) {
  let vals = [0,0,0]; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-triple-stepper';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="triple-row"></div><div class="ctrl-value-display">0-0-0</div></div>`;
  const row = el.querySelector('.triple-row');
  const display = el.querySelector('.ctrl-value-display');
  for (let d = 0; d < 3; d++) {
    const wrap = document.createElement('div'); wrap.className = 'stepper-row';
    wrap.innerHTML = `<button class="stepper-btn" type="button">−</button><div class="stepper-display">0</div><button class="stepper-btn" type="button">+</button>`;
    const btns = wrap.querySelectorAll('.stepper-btn');
    const disp = wrap.querySelector('.stepper-display');
    btns[0].addEventListener('click', () => { if (vals[d] > 0) { vals[d]--; disp.textContent = vals[d]; display.textContent = vals.join('-'); if (active && submitFn) submitFn([...vals]); } });
    btns[1].addEventListener('click', () => { if (vals[d] < 9) { vals[d]++; disp.textContent = vals[d]; display.textContent = vals.join('-'); if (active && submitFn) submitFn([...vals]); } });
    row.appendChild(wrap);
  }
  return { el, getValue: () => [...vals], reset: () => { vals = [0,0,0]; row.querySelectorAll('.stepper-display').forEach(d => d.textContent = '0'); display.textContent = '0-0-0'; el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 25. Symbol Grid (2x2 rotating arrows) ─────────────────────────────────
function createSymbolGrid(control) {
  const DIRS = ['UP','RIGHT','DOWN','LEFT']; const ARROWS = ['↑','→','↓','←'];
  let vals = [0,0,0,0]; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-symbol-grid ctrl-wide';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="symbol-grid"></div><div class="ctrl-value-display">UP,UP,UP,UP</div></div>`;
  const grid = el.querySelector('.symbol-grid');
  const display = el.querySelector('.ctrl-value-display');
  for (let i = 0; i < 4; i++) {
    const btn = document.createElement('button'); btn.className = 'symbol-cell'; btn.type = 'button'; btn.textContent = ARROWS[0];
    btn.addEventListener('click', () => { vals[i] = (vals[i] + 1) % 4; btn.textContent = ARROWS[vals[i]]; display.textContent = vals.map(v => DIRS[v]).join(','); if (active && submitFn) submitFn(vals.map(v => DIRS[v])); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
    grid.appendChild(btn);
  }
  return { el, getValue: () => vals.map(v => DIRS[v]), reset: () => { vals = [0,0,0,0]; grid.querySelectorAll('.symbol-cell').forEach(b => b.textContent = ARROWS[0]); display.textContent = 'UP,UP,UP,UP'; el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 26. Waveform (5 columns × 3 levels) ──────────────────────────────────
function createWaveform(control) {
  const LEVELS = ['LOW','MID','HIGH'];
  let vals = [0,0,0,0,0]; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-waveform ctrl-wide';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="waveform-cols"></div><div class="ctrl-value-display">LOW,LOW,LOW,LOW,LOW</div></div>`;
  const cols = el.querySelector('.waveform-cols');
  const display = el.querySelector('.ctrl-value-display');
  for (let c = 0; c < 5; c++) {
    const col = document.createElement('div'); col.className = 'wf-col';
    for (let r = 2; r >= 0; r--) {
      const btn = document.createElement('button'); btn.className = 'wf-btn'; btn.type = 'button'; btn.textContent = LEVELS[r][0];
      btn.addEventListener('click', () => { vals[c] = r; col.querySelectorAll('.wf-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); display.textContent = vals.map(v => LEVELS[v]).join(','); if (active && submitFn) submitFn(vals.map(v => LEVELS[v])); });
      btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.click(); });
      col.appendChild(btn);
    }
    cols.appendChild(col);
  }
  return { el, getValue: () => vals.map(v => LEVELS[v]), reset: () => { vals = [0,0,0,0,0]; cols.querySelectorAll('.wf-btn').forEach(b => b.classList.remove('selected')); display.textContent = 'LOW,LOW,LOW,LOW,LOW'; el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 27. Combination Lock (3 drums) ────────────────────────────────────────
function createCombinationLock(control) {
  let vals = [0,0,0]; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-combination-lock';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="combo-row"></div><div class="ctrl-value-display">0-0-0</div></div>`;
  const row = el.querySelector('.combo-row');
  const display = el.querySelector('.ctrl-value-display');
  for (let d = 0; d < 3; d++) {
    const wrap = document.createElement('div'); wrap.className = 'combo-drum';
    wrap.innerHTML = `<button class="stepper-btn" type="button">▲</button><div class="combo-digit">0</div><button class="stepper-btn" type="button">▼</button>`;
    const btns = wrap.querySelectorAll('.stepper-btn');
    const digit = wrap.querySelector('.combo-digit');
    btns[0].addEventListener('click', () => { vals[d] = (vals[d] + 1) % 10; digit.textContent = vals[d]; display.textContent = vals.join('-'); if (active && submitFn) submitFn([...vals]); });
    btns[1].addEventListener('click', () => { vals[d] = (vals[d] + 9) % 10; digit.textContent = vals[d]; display.textContent = vals.join('-'); if (active && submitFn) submitFn([...vals]); });
    row.appendChild(wrap);
  }
  return { el, getValue: () => [...vals], reset: () => { vals = [0,0,0]; row.querySelectorAll('.combo-digit').forEach(d => d.textContent = '0'); display.textContent = '0-0-0'; el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 28. Fine Tuner (decimal slider) ───────────────────────────────────────
function createFineTuner(control) {
  let value = 100.0; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-fine-tuner';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div class="stepper-row"><button class="stepper-btn" type="button">−</button><div class="stepper-display" style="min-width:50px">100.0</div><button class="stepper-btn" type="button">+</button></div><div class="ctrl-value-display">100.0</div></div>`;
  const btns = el.querySelectorAll('.stepper-btn');
  const disp = el.querySelector('.stepper-display');
  const display = el.querySelector('.ctrl-value-display');
  btns[0].addEventListener('click', () => { if (value > 80) { value = Math.round((value - 0.2) * 10) / 10; update(); } });
  btns[1].addEventListener('click', () => { if (value < 120) { value = Math.round((value + 0.2) * 10) / 10; update(); } });
  function update() { disp.textContent = value.toFixed(1); display.textContent = value.toFixed(1); if (active && submitFn) submitFn(value); }
  return { el, getValue: () => value, reset: () => { value = 100.0; update(); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 29. Dual Slider (two h-sliders) ───────────────────────────────────────
function createDualSlider(control) {
  let valA = 0, valB = 0; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-dual-slider ctrl-wide';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body">
    <div style="width:100%;padding:0 4px;"><div class="h-slider-track" data-idx="0"><div class="h-slider-fill"></div><div class="h-slider-thumb"></div></div><div style="font-size:0.55rem;color:var(--text-muted);text-align:center;">A: <span class="dual-val-a">0%</span></div></div>
    <div style="width:100%;padding:0 4px;"><div class="h-slider-track" data-idx="1"><div class="h-slider-fill"></div><div class="h-slider-thumb"></div></div><div style="font-size:0.55rem;color:var(--text-muted);text-align:center;">B: <span class="dual-val-b">0%</span></div></div>
    <div class="ctrl-value-display">0%,0%</div></div>`;
  const display = el.querySelector('.ctrl-value-display');
  const valAEl = el.querySelector('.dual-val-a');
  const valBEl = el.querySelector('.dual-val-b');
  el.querySelectorAll('.h-slider-track').forEach((track, idx) => {
    const fill = track.querySelector('.h-slider-fill');
    const thumb = track.querySelector('.h-slider-thumb');
    addDragListeners(track,
      (p) => { calc(p); }, (p) => { calc(p); },
      (p) => { calc(p); if (active && submitFn) submitFn([valA, valB]); }
    );
    function calc(p) {
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((p.clientX - rect.left) / rect.width) * 100));
      const snapped = snapTo(pct, 10, 0, 100);
      if (idx === 0) { valA = snapped; valAEl.textContent = snapped + '%'; } else { valB = snapped; valBEl.textContent = snapped + '%'; }
      fill.style.width = snapped + '%'; thumb.style.left = snapped + '%';
      display.textContent = valA + '%,' + valB + '%';
    }
  });
  return { el, getValue: () => [valA, valB], reset: () => { valA = 0; valB = 0; el.querySelectorAll('.h-slider-fill').forEach(f => f.style.width = '0%'); el.querySelectorAll('.h-slider-thumb').forEach(t => t.style.left = '0%'); valAEl.textContent = '0%'; valBEl.textContent = '0%'; display.textContent = '0%,0%'; el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── 30. Range Slider (min/max) ────────────────────────────────────────────
function createRangeSlider(control) {
  let lo = 20, hi = 80; let submitFn = null; let active = false;
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-range-slider ctrl-wide';
  el.innerHTML = `<div class="ctrl-label">${control.name}</div><div class="ctrl-body"><div style="width:100%;display:flex;gap:8px;align-items:center;"><div style="font-size:0.6rem;color:var(--text-muted);">MIN</div><div class="stepper-row"><button class="stepper-btn" type="button">−</button><div class="stepper-display" id="rs-lo">20</div><button class="stepper-btn" type="button">+</button></div><div style="font-size:0.6rem;color:var(--text-muted);">MAX</div><div class="stepper-row"><button class="stepper-btn" type="button">−</button><div class="stepper-display" id="rs-hi">80</div><button class="stepper-btn" type="button">+</button></div></div><div class="ctrl-value-display">20-80</div></div>`;
  const display = el.querySelector('.ctrl-value-display');
  const stepperRows = el.querySelectorAll('.stepper-row');
  const loDisp = stepperRows[0].querySelector('.stepper-display');
  const hiDisp = stepperRows[1].querySelector('.stepper-display');
  const loBtns = stepperRows[0].querySelectorAll('.stepper-btn');
  const hiBtns = stepperRows[1].querySelectorAll('.stepper-btn');
  function update() { loDisp.textContent = lo; hiDisp.textContent = hi; display.textContent = lo + '-' + hi; if (active && submitFn) submitFn([lo, hi]); }
  loBtns[0].addEventListener('click', () => { if (lo > 0) { lo -= 10; update(); } });
  loBtns[1].addEventListener('click', () => { if (lo < hi - 10) { lo += 10; update(); } });
  hiBtns[0].addEventListener('click', () => { if (hi > lo + 10) { hi -= 10; update(); } });
  hiBtns[1].addEventListener('click', () => { if (hi < 100) { hi += 10; update(); } });
  return { el, getValue: () => [lo, hi], reset: () => { lo = 20; hi = 80; update(); el.classList.remove('control-success','control-error','control-done'); }, setActive: (a) => { active = a; el.classList.toggle('ctrl-active', a); }, setDone: () => { el.classList.remove('ctrl-active'); el.classList.add('control-done'); }, onSubmit: (fn) => { submitFn = fn; } };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createControl(control) {
  switch (control.type) {
    case 'toggle':          return createToggle(control);
    case 'button':          return createButton(control);
    case 'dial':            return createDial(control);
    case 'h-slider':        return createHSlider(control);
    case 'v-slider':        return createVSlider(control);
    case 'multi-slider':    return createMultiSlider(control);
    case 'number-wheel':    return createNumberWheel(control);
    case 'stepper':         return createStepper(control);
    case 'btn-sequence':    return createBtnSequence(control);
    case 'sw-sequence':     return createSwSequence(control);
    case 'ring':            return createRing(control);
    case 'keypad':          return createKeypad(control);
    case 'directional':     return createDirectional(control);
    case 'rapid-tap':       return createRapidTap(control);
    case 'color-picker':    return createColorPicker(control);
    case 'level-select':    return createLevelSelect(control);
    case 'compass':         return createCompass(control);
    case 'clock-set':       return createClockSet(control);
    case 'icon-match':      return createIconMatch(control);
    case 'valve-turn':      return createValveTurn(control);
    case 'pattern-grid':    return createPatternGrid(control);
    case 'color-sequence':  return createColorSequence(control);
    case 'binary-row':      return createBinaryRow(control);
    case 'triple-stepper':  return createTripleStepper(control);
    case 'symbol-grid':     return createSymbolGrid(control);
    case 'waveform':        return createWaveform(control);
    case 'combination-lock':return createCombinationLock(control);
    case 'fine-tuner':      return createFineTuner(control);
    case 'dual-slider':     return createDualSlider(control);
    case 'range-slider':    return createRangeSlider(control);
    default:                return createButton(control);
  }
}
