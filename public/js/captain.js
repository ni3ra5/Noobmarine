/**
 * NOOBMARINE — Captain UI Logic
 */

// ── Elements ──────────────────────────────────────────────────────────────────
const lobbyView     = document.getElementById('lobby-view');
const gameView      = document.getElementById('game-view');
const lobbyCrewGrid = document.getElementById('lobby-crew-grid');
const lobbyCount    = document.getElementById('lobby-count');
const btnStartGame  = document.getElementById('btn-start-game');
const qrCanvas      = document.getElementById('qr-canvas');

const levelLabel    = document.getElementById('level-label');
const roundLabel    = document.getElementById('round-label');
const hpBar         = document.getElementById('hp-bar');
const hpNumber      = document.getElementById('hp-number');
const timerDisplay  = document.getElementById('timer-display');
const taskList      = document.getElementById('task-list');
const tasksCount    = document.getElementById('tasks-count');

const btnNextRound        = document.getElementById('btn-next-round');
const btnEndGame          = document.getElementById('btn-end-game');
const roundEndOverlay     = document.getElementById('round-end-overlay');
const roundEndTitle       = document.getElementById('round-end-title');
const roundEndHpDelta     = document.getElementById('round-end-hp-delta');
const btnNextRoundOverlay = document.getElementById('btn-next-round-overlay');
const gameoverOverlay     = document.getElementById('gameover-overlay');
const intermissionOverlay  = document.getElementById('intermission-overlay');
const intermissionTitle    = document.getElementById('intermission-title');
const intermissionNextLevel = document.getElementById('intermission-next-level');
const intermissionCrewList = document.getElementById('intermission-crew-list');

const crewStrip = document.getElementById('crew-strip');

// ── State ─────────────────────────────────────────────────────────────────────
let crew = [];
let crewStatus = {}; // crewId → 'online' | 'offline'
let currentTasks = [];
let timerValue = 90;
let totalTimerValue = 90;
let clientTimerInterval = null;
let currentLevel = 1;
let lastLevelEndData = null; // { newHp, hpLost, failedTasks, totalTasks }
let crewUrl = `http://${location.hostname}:${location.port || 3000}`; // fallback
const timerRingProgress = document.getElementById('timer-ring-progress');
const RING_CIRCUMFERENCE = 2 * Math.PI * 42; // r=42 from SVG

// ── Fetch server info (local IP) ──────────────────────────────────────────────
function renderQR() {
  if (qrCanvas && crewUrl && typeof QRMini !== 'undefined') {
    try { QRMini.toCanvas(qrCanvas, crewUrl, 220, '#00FF88', '#001A0E'); } catch {}
  }
}

function loadServerInfo() {
  fetch('/api/info')
    .then(r => r.json())
    .then(info => {
      crewUrl = `http://${info.ip}:${info.port}/crew.html`;
      const urlText  = document.getElementById('crew-url-text');
      const topText  = document.getElementById('top-bar-url-text');
      const topChip  = document.getElementById('top-bar-url');
      if (urlText)  urlText.textContent = crewUrl;
      if (topText)  topText.textContent = crewUrl;
      if (topChip)  topChip.classList.remove('hidden');
      renderQR();
      // Retry QR after short delay in case canvas wasn't ready
      setTimeout(renderQR, 500);
    })
    .catch(() => {
      crewUrl = window.location.origin + '/crew.html';
      const urlText = document.getElementById('crew-url-text');
      if (urlText) urlText.textContent = crewUrl;
      renderQR();
      setTimeout(renderQR, 500);
    });
}

// ── Copy URL logic (works in both HTTP and HTTPS contexts) ────────────────────
async function copyUrl() {
  try {
    await navigator.clipboard.writeText(crewUrl);
  } catch {
    // Fallback for non-HTTPS / older mobile browsers
    const inp = document.createElement('input');
    inp.value = crewUrl;
    inp.style.position = 'fixed';
    inp.style.opacity = '0';
    document.body.appendChild(inp);
    inp.focus();
    inp.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(inp);
  }
  // Visual feedback on both copy buttons
  ['btn-copy-url', 'btn-copy-url-top'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = id === 'btn-copy-url' ? '✓ COPIED' : '✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
  });
}

document.getElementById('btn-copy-url')?.addEventListener('click', copyUrl);
document.getElementById('btn-copy-url-top')?.addEventListener('click', copyUrl);

// ── End Game button ───────────────────────────────────────────────────────────
btnEndGame?.addEventListener('click', () => {
  if (confirm('End the mission and return to lobby?')) {
    NM.send('end_game', {});
  }
});

document.getElementById('btn-end-game-roundend')?.addEventListener('click', () => {
  if (confirm('End the mission and return to lobby?')) {
    NM.send('end_game', {});
  }
});

document.getElementById('btn-end-game-gameover')?.addEventListener('click', () => {
  NM.send('end_game', {});
});

NM.on('room_reset', () => {
  gameView.classList.add('hidden');
  gameView.style.display = 'none';
  lobbyView.classList.remove('hidden');
  roundEndOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  intermissionOverlay.classList.add('hidden');
  btnEndGame.classList.add('hidden');
  crew = [];
  renderLobbyCrew();
});

// ── Auto-join as captain on connect ──────────────────────────────────────────
loadServerInfo();

function joinAsCaptain() {
  NM.send('join_game', { role: 'captain', playerName: 'CAPTAIN' });
}

NM.on('_connected', () => {
  loadServerInfo();
  joinAsCaptain();
});
// Race condition fix
if (NM.isConnected()) joinAsCaptain();

NM.on('joined', (msg) => {
  if (msg.role === 'captain') {
    // Show QR
    if (crewUrl) {
      const urlText = document.getElementById('crew-url-text');
      if (urlText) urlText.textContent = crewUrl;
      renderQR();
      setTimeout(renderQR, 500);
    }
  }
});

// ── Handle errors ────────────────────────────────────────────────────────────
NM.on('error', (msg) => {
  // Don't redirect if game is in progress — just ignore captain slot errors
  if (msg.message && msg.message.includes('Captain slot') && !gameView.classList.contains('hidden')) {
    return; // Already in game, ignore
  }
  if (msg.message && msg.message.includes('Captain slot')) {
    window.location.href = '/';
  }
});

// ── Lobby events ──────────────────────────────────────────────────────────────

NM.on('lobby_state', (msg) => {
  crew = msg.crew || [];
  renderLobbyCrew();
  if (msg.phase === 'playing') {
    // Game already in progress — shouldn't happen if captain just connected
  }
});

NM.on('player_joined', (msg) => {
  if (msg.role === 'crew') {
    crew.push({ name: msg.playerName, crewId: msg.crewId });
    renderLobbyCrew();
  }
});

NM.on('player_left', (msg) => {
  crew = crew.filter(s => s.crewId !== msg.crewId);
  delete crewStatus[msg.crewId];
  renderLobbyCrew();
  renderCrewStrip();
});

NM.on('player_disconnected', (msg) => {
  crewStatus[msg.crewId] = 'offline';
  renderCrewStrip();
});

NM.on('player_rejoined', (msg) => {
  crewStatus[msg.crewId] = 'online';
  renderCrewStrip();
});

function renderLobbyCrew() {
  lobbyCount.textContent = crew.length;
  if (!lobbyCrewGrid) return;

  if (crew.length === 0) {
    lobbyCrewGrid.innerHTML = '<div class="crew-card-empty">Scan the QR code to join the crew</div>';
    btnStartGame.disabled = true;
    btnStartGame.textContent = 'WAITING FOR CREW...';
  } else {
    lobbyCrewGrid.innerHTML = crew.map(s => `
      <div class="crew-card" data-sid="${s.crewId}">
        <span class="crew-card-icon">⚓</span>
        <div class="crew-card-info">
          <div class="crew-card-id">${s.crewId}</div>
          <div class="crew-card-name">${s.name}</div>
        </div>
        <span class="crew-card-dot"></span>
        <button class="crew-kick-btn" data-crew-id="${s.crewId}" title="Kick">✕</button>
      </div>
    `).join('');

    // Attach kick handlers
    lobbyCrewGrid.querySelectorAll('.crew-kick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.crewId;
        if (confirm(`Remove ${sid} from the crew?`)) {
          NM.send('kick_player', { crewId: sid });
        }
      });
    });

    btnStartGame.disabled = false;
    btnStartGame.textContent = `▶ LAUNCH MISSION (${crew.length} CREW)`;
  }
}

function renderCrewStrip() {
  if (!crewStrip) return;
  crewStrip.innerHTML = crew.map(s => {
    const status = crewStatus[s.crewId] || 'online';
    return `<div class="crew-chip ${status}"><span class="crew-dot"></span>⚓ ${s.crewId} · ${s.name}</div>`;
  }).join('');
}

// ── Timer setting ────────────────────────────────────────────────────────────
const DEFAULT_TIMER = 90;
let timerOffset = 0;
const timerSettingEl = document.getElementById('timer-setting');
const timerMinusBtn = document.getElementById('timer-minus');
const timerPlusBtn = document.getElementById('timer-plus');

function updateTimerSetting() {
  const val = DEFAULT_TIMER + timerOffset;
  if (timerSettingEl) {
    timerSettingEl.textContent = val + 's';
    const warn = timerOffset < -20 || timerOffset > 20;
    timerSettingEl.style.color = warn ? 'var(--amber)' : 'var(--green)';
    timerSettingEl.style.textShadow = warn ? '0 0 8px var(--amber)' : '0 0 8px var(--green)';
  }
}

timerMinusBtn?.addEventListener('click', () => {
  if (DEFAULT_TIMER + timerOffset - 5 >= 5) { timerOffset -= 5; updateTimerSetting(); }
});
timerPlusBtn?.addEventListener('click', () => {
  timerOffset += 5; updateTimerSetting();
});

btnStartGame.addEventListener('click', () => {
  NMAudio.init();
  NM.send('start_game', { timerOffset });
});

// ── Game events ───────────────────────────────────────────────────────────────
NM.on('game_state', (msg) => {
  // Only show game view if not in intermission (don't disrupt overlays)
  if (msg.phase === 'playing') {
    showGameView();
  }
  updateHUD(msg);
  if (msg.players) {
    crew = msg.players;
    crew.forEach(s => { if (!crewStatus[s.crewId]) crewStatus[s.crewId] = 'online'; });
    renderCrewStrip();
  }
  if (msg.tasks) {
    currentTasks = msg.tasks;
    renderTasks(msg.tasks);
  }
  if (msg.phase === 'playing') {
    startClientTimer(msg.timerRemaining);
    // Auto-start music on game start
    if (!musicOn && btnMusic) {
      NMAudio.init();
      musicOn = true;
      NMAudio.startMusic();
      btnMusic.innerHTML = '&#9835; ON';
      btnMusic.classList.add('active');
      NM.send('music_toggle', { on: true });
    }
  }
});

NM.on('level_start', (msg) => {
  currentLevel = msg.level;
  levelLabel.textContent = `LEVEL ${msg.level}`;
});

NM.on('timer_tick', (msg) => {
  setTimerDisplay(msg.remaining);
});

NM.on('task_completed', (msg) => {
  const { taskId } = msg;
  const item = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
  if (item) {
    item.classList.add('done');
    item.querySelector('.task-checkbox').textContent = '✓';
    // Flash success on that item
    item.style.borderLeftColor = 'var(--green)';
    item.style.boxShadow = '0 0 8px var(--green-glow)';
    setTimeout(() => { item.style.boxShadow = ''; }, 1200);
  }
  NMAudio.taskComplete();
  // Update count
  const done = document.querySelectorAll('.task-item.done').length;
  const total = currentTasks.length;
  tasksCount.textContent = `${done}/${total} COMPLETE`;
});

NM.on('task_uncompleted', (msg) => {
  const { taskId } = msg;
  const item = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
  if (item) {
    item.classList.remove('done');
    item.querySelector('.task-checkbox').textContent = '';
    item.style.borderLeftColor = 'var(--red)';
    item.style.boxShadow = '0 0 8px rgba(255,51,0,0.4)';
    setTimeout(() => { item.style.borderLeftColor = ''; item.style.boxShadow = ''; }, 1500);
  }
  const done = document.querySelectorAll('.task-item.done').length;
  const total = currentTasks.length;
  tasksCount.textContent = `${done}/${total} COMPLETE`;
});

NM.on('level_end', (msg) => {
  clearClientTimer();
  NMAudio.stopAlarm();
  // Update HP bar immediately on level end
  const hp = Math.max(0, msg.newHp);
  hpBar.style.width = `${hp}%`;
  hpNumber.textContent = `${hp} HP`;
  hpBar.className = 'health-bar-fill';
  if (hp <= 30) hpBar.classList.add('critical');
  else if (hp <= 60) hpBar.classList.add('warning');

  // Store for intermission display
  const totalTasks = currentTasks.length;
  const failedCount = msg.failedTasks ? msg.failedTasks.length : 0;
  lastLevelEndData = {
    newHp: msg.newHp,
    hpLost: msg.hpLost,
    failedCount,
    completedCount: totalTasks - failedCount,
    totalTasks,
  };

  if (failedCount > 0) {
    NMAudio.taskFailed();
  } else {
    NMAudio.roundSuccess();
  }
  showLevelEnd(msg);
});

NM.on('level_complete', (msg) => {
  clearClientTimer();
  currentLevel = msg.level;
  levelLabel.textContent = `LEVEL ${msg.level} COMPLETE`;
  roundEndOverlay.classList.add('hidden');

  intermissionTitle.textContent = `LEVEL ${msg.level} COMPLETE`;
  intermissionNextLevel.textContent = msg.nextLevel || (msg.level + 1);

  // Render stats (HP, completed, failed)
  const statsEl = document.getElementById('intermission-stats');
  if (statsEl && lastLevelEndData) {
    const d = lastLevelEndData;
    const hpColor = d.newHp <= 30 ? 'var(--red)' : d.newHp <= 60 ? 'var(--amber)' : 'var(--green)';
    statsEl.innerHTML = `
      <div class="intermission-stat">
        <div class="intermission-stat-label">HULL INTEGRITY</div>
        <div class="intermission-stat-value" style="color:${hpColor};text-shadow:0 0 8px ${hpColor};">${d.newHp} HP</div>
      </div>
      <div class="intermission-stat">
        <div class="intermission-stat-label">COMPLETED</div>
        <div class="intermission-stat-value" style="color:var(--green);text-shadow:0 0 8px var(--green);">${d.completedCount}/${d.totalTasks}</div>
      </div>
      <div class="intermission-stat">
        <div class="intermission-stat-label">FAILED</div>
        <div class="intermission-stat-value" style="color:${d.failedCount > 0 ? 'var(--red)' : 'var(--green)'};text-shadow:0 0 8px ${d.failedCount > 0 ? 'var(--red)' : 'var(--green)'};">${d.failedCount}</div>
      </div>
    `;
  }

  renderIntermissionCrew(msg.crew || crew);
  intermissionOverlay.classList.remove('hidden');
});

NM.on('game_over', (msg) => {
  clearClientTimer();
  NMAudio.stopAlarm();
  roundEndOverlay.classList.add('hidden');
  const levelEl = document.getElementById('gameover-level');
  if (levelEl) levelEl.textContent = `REACHED LEVEL ${currentLevel}`;
  gameoverOverlay.classList.remove('hidden');
});

NM.on('captain_left', () => {
  window.location.href = '/';
});

// ── HUD updates ───────────────────────────────────────────────────────────────
function updateHUD(state) {
  // HP bar
  const hpPct = Math.max(0, state.hp);
  hpBar.style.width = `${hpPct}%`;
  hpNumber.textContent = `${hpPct} HP`;
  hpBar.className = 'health-bar-fill';
  if (hpPct <= 30) hpBar.classList.add('critical');
  else if (hpPct <= 60) hpBar.classList.add('warning');

  // Level
  currentLevel = state.level;
  levelLabel.textContent = `LEVEL ${state.level}`;

  // Timer
  setTimerDisplay(state.timerRemaining);
}

let timerWarningFired = false;

function setTimerDisplay(remaining) {
  if (remaining <= 10 && remaining > 0 && !timerWarningFired) {
    timerWarningFired = true;
    NMAudio.timerWarning();
  }
  if (remaining > 10) timerWarningFired = false;
  timerValue = remaining;
  timerDisplay.textContent = remaining;

  // Update SVG ring progress
  const pct = totalTimerValue > 0 ? remaining / totalTimerValue : 0;
  const offset = RING_CIRCUMFERENCE * (1 - pct);
  if (timerRingProgress) {
    timerRingProgress.style.strokeDashoffset = offset;
  }

  // Color classes: green (>30s), amber (11-30s), red (<=10s)
  let cls = '';
  if (remaining <= 10) cls = 'critical';
  else if (remaining <= 30) cls = 'warning';

  timerDisplay.className = 'timer-ring-text' + (cls ? ' ' + cls : '');
  if (timerRingProgress) {
    timerRingProgress.className.baseVal = 'timer-ring-progress' + (cls ? ' ' + cls : '');
  }
}

function startClientTimer(startValue) {
  clearClientTimer();
  totalTimerValue = startValue;
  timerValue = startValue;
  timerWarningFired = startValue <= 10;
  setTimerDisplay(timerValue);
  clientTimerInterval = setInterval(() => {
    if (timerValue > 0) {
      timerValue--;
      setTimerDisplay(timerValue);
    }
  }, 1000);
}

function clearClientTimer() {
  clearInterval(clientTimerInterval);
  clientTimerInterval = null;
}

// ── Task rendering ────────────────────────────────────────────────────────────
function renderTasks(tasks) {
  taskList.innerHTML = '';
  currentTasks = tasks;
  tasks.forEach(t => {
    const li = document.createElement('li');
    li.className = `task-item${t.done ? ' done' : ''}`;
    li.dataset.taskId = t.taskId;
    li.innerHTML = `
      <div class="task-checkbox">${t.done ? '✓' : ''}</div>
      <div class="task-content">
        <div class="task-crew-id">⚓ ${t.crewId}</div>
        <div class="task-text">${t.instruction}</div>
      </div>
    `;
    taskList.appendChild(li);
  });

  const done = tasks.filter(t => t.done).length;
  tasksCount.textContent = `${done}/${tasks.length} COMPLETE`;
  btnNextRound.classList.add('hidden');
}

// ── Round end display ─────────────────────────────────────────────────────────
function showLevelEnd(msg) {
  const allDone = msg.failedTasks.length === 0;

  roundEndTitle.textContent = allDone ? '✓ ALL ORDERS COMPLETE' : '⚠ LEVEL ENDED';
  roundEndTitle.style.color = allDone ? 'var(--green)' : 'var(--amber)';

  if (msg.hpLost > 0) {
    roundEndHpDelta.textContent = `−${msg.hpLost} HP — ${msg.newHp} HP REMAINING`;
    roundEndHpDelta.style.color = 'var(--red)';
  } else {
    roundEndHpDelta.textContent = `HULL INTEGRITY MAINTAINED — ${msg.newHp} HP`;
    roundEndHpDelta.style.color = 'var(--green)';
  }

  const missedEl = document.getElementById('round-end-missed');
  if (missedEl) {
    if (msg.failedTasks.length > 0) {
      const n = msg.failedTasks.length;
      missedEl.textContent = `${n} ORDER${n > 1 ? 'S' : ''} MISSED`;
      missedEl.style.color = 'var(--red)';
    } else {
      missedEl.textContent = '';
    }
  }

  roundEndOverlay.classList.remove('hidden');

  // Also show the next-round button in action bar (as backup)
  btnNextRound.classList.remove('hidden');
  btnNextRound.classList.add('pulse');
}

function sendNextLevel() {
  roundEndOverlay.classList.add('hidden');
  btnNextRound.classList.add('hidden');
  btnNextRound.classList.remove('pulse');
  btnEndGame.classList.remove('hidden');
  NM.send('continue_level', {});
}

btnNextRoundOverlay.addEventListener('click', sendNextLevel);
btnNextRound.addEventListener('click', sendNextLevel);

// ── View switching ────────────────────────────────────────────────────────────
function showGameView() {
  lobbyView.classList.add('hidden');
  intermissionOverlay.classList.add('hidden');
  gameView.classList.remove('hidden');
  gameView.style.display = 'flex';
  btnEndGame.classList.remove('hidden');
}

// ── Level intermission ───────────────────────────────────────────────────────
function renderIntermissionCrew(crewList) {
  if (!crewList || crewList.length === 0) {
    intermissionCrewList.innerHTML = '<li style="color:var(--text-muted);border:none;">No crew aboard</li>';
    return;
  }
  intermissionCrewList.innerHTML = crewList.map(s => `
    <li>
      <span>${s.crewId} — ${s.name}</span>
      <button class="kick-btn" data-crew-id="${s.crewId}">KICK</button>
    </li>
  `).join('');

  intermissionCrewList.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const crewId = btn.dataset.crewId;
      if (confirm(`Remove ${crewId} from the crew?`)) {
        NM.send('kick_player', { crewId });
      }
    });
  });
}

NM.on('intermission_crew_update', (msg) => {
  crew = msg.crew || [];
  renderIntermissionCrew(crew);
});

NM.on('player_kicked', (msg) => {
  crew = crew.filter(s => s.crewId !== msg.crewId);
  renderIntermissionCrew(crew);
});

document.getElementById('btn-continue-level')?.addEventListener('click', () => {
  intermissionOverlay.classList.add('hidden');
  NM.send('continue_level', {});
});

document.getElementById('btn-end-game-intermission')?.addEventListener('click', () => {
  if (confirm('End the mission and return to lobby?')) {
    NM.send('end_game', {});
  }
});

// ── Background music toggle ──────────────────────────────────────────────────
const btnMusic = document.getElementById('btn-music');
let musicOn = false;

if (btnMusic) {
  btnMusic.addEventListener('click', () => {
    NMAudio.init();
    musicOn = !musicOn;
    if (musicOn) {
      NMAudio.startMusic();
      btnMusic.innerHTML = '&#9835; ON';
      btnMusic.classList.add('active');
    } else {
      NMAudio.stopMusic();
      btnMusic.innerHTML = '&#9835; OFF';
      btnMusic.classList.remove('active');
    }
    NM.send('music_toggle', { on: musicOn });
  });
}

// ── Dashboard decorations: mini waveforms ────────────────────────────────────
const miniWave1 = document.getElementById('mini-wave-1');
const rcWaveLine = document.getElementById('rc-wave-line');
const MW_PTS = 20;
const mwData1 = Array.from({ length: MW_PTS }, () => 8);
const mwData2 = Array.from({ length: MW_PTS }, () => 7);

setInterval(() => {
  mwData1.shift();
  mwData1.push(8 + (Math.random() * 2 - 1) * 6);
  const pts1 = mwData1.map((y, i) => `${(i / (MW_PTS - 1)) * 50},${y}`).join(' ');
  if (miniWave1) miniWave1.setAttribute('points', pts1);

  mwData2.shift();
  mwData2.push(7 + (Math.random() * 2 - 1) * 5);
  const pts2 = mwData2.map((y, i) => `${(i / (MW_PTS - 1)) * 60},${y}`).join(' ');
  if (rcWaveLine) rcWaveLine.setAttribute('points', pts2);
}, 250);

// ── Spectrum analyzer animation ───────────────────────────────────────────────
const specBars = document.querySelectorAll('#spectrum-bars .spec-bar');
setInterval(() => {
  specBars.forEach(bar => {
    bar.style.setProperty('--h', (25 + Math.random() * 70) + '%');
  });
}, 1200);

// ── Dot matrix animation ─────────────────────────────────────────────────────
const dmDots = document.querySelectorAll('#dot-matrix-1 .dm-dot');
setInterval(() => {
  dmDots.forEach(dot => {
    dot.classList.toggle('on', Math.random() > 0.45);
  });
}, 2000);

// ── Data ticker animation ────────────────────────────────────────────────────
const tickerEls = [
  document.getElementById('ticker-1'),
  document.getElementById('ticker-2'),
  document.getElementById('ticker-3'),
  document.getElementById('ticker-4'),
];
const tickerPrefixes = ['0x', 'CHK:', 'SYN:', 'BUF:'];
setInterval(() => {
  tickerEls.forEach((el, i) => {
    if (!el) return;
    if (i === 0) el.textContent = '0x' + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    else if (i === 1) el.textContent = 'CHK:' + (Math.random() > 0.1 ? 'OK' : 'ERR');
    else if (i === 2) el.textContent = 'SYN:' + Math.floor(30 + Math.random() * 60);
    else el.textContent = 'BUF:' + Math.floor(70 + Math.random() * 30);
  });
}, 1500);

// ── Mini arc gauge fluctuation ───────────────────────────────────────────────
const miniArcPwr = document.getElementById('mini-arc-pwr');
setInterval(() => {
  const offset = 6 + Math.random() * 12;
  if (miniArcPwr) miniArcPwr.style.strokeDashoffset = offset;
}, 2000);

// ── HUD Row 2: fluctuating readout values ────────────────────────────────────
const fluctConfig = {
  depth:   { base: -240, range: 3, fmt: v => `${Math.round(v)}m` },
  o2:      { base: 92,   range: 1.5, fmt: v => `${Math.round(v)}%` },
  temp:    { base: 4.2,  range: 0.2, fmt: v => `${v.toFixed(1)}°C` },
  heading: { base: 47,   range: 4,   fmt: v => `${String(Math.round(v)).padStart(3,'0')}°` },
  reactor: { base: 98.2, range: 0.4, fmt: v => `${v.toFixed(1)}%` },
};

setInterval(() => {
  Object.entries(fluctConfig).forEach(([key, cfg]) => {
    const el = document.querySelector(`[data-fluct="${key}"]`);
    if (!el) return;
    el.textContent = cfg.fmt(cfg.base + (Math.random() * 2 - 1) * cfg.range);
  });
}, 1200);

// ── HUD Row 2: pressure graph + O2 arc ──────────────────────────────────────
const pressGraph = document.getElementById('pressure-graph');
const PRESS_PTS = 30;
let pressVal = 17;
const pressData = Array.from({ length: PRESS_PTS }, () => 17);

setInterval(() => {
  pressVal += (Math.random() * 2 - 1) * 3;
  pressVal = Math.max(4, Math.min(30, pressVal));
  pressData.shift();
  pressData.push(pressVal);
  const pts = pressData.map((y, i) => `${(i / (PRESS_PTS - 1)) * 80},${y}`).join(' ');
  if (pressGraph) pressGraph.setAttribute('points', pts);
}, 400);

// ── UI Scale control ───────────────────────────────────────────────────────────
(function () {
  const STEPS = [60, 70, 80, 90, 100, 110, 120, 130, 150];
  let idx = STEPS.indexOf(130);
  const label = document.getElementById('scale-label');

  function applyScale() {
    const pct = STEPS[idx];
    gameView.style.zoom = pct / 100;
    label.textContent = pct + '%';
  }

  applyScale();

  document.getElementById('btn-scale-down').addEventListener('click', () => {
    if (idx > 0) { idx--; applyScale(); }
  });
  document.getElementById('btn-scale-up').addEventListener('click', () => {
    if (idx < STEPS.length - 1) { idx++; applyScale(); }
  });
})();

// O2 arc fluctuation
const o2Arc = document.getElementById('o2-arc');
setInterval(() => {
  const pct = 0.88 + (Math.random() * 0.08);
  const offset = 125.66 * (1 - pct);
  if (o2Arc) o2Arc.style.strokeDashoffset = offset;
}, 2000);
