/**
 * NOOBMARINE — Crew UI Logic
 */

// ── Elements ──────────────────────────────────────────────────────────────────
const crewIdBadge = document.getElementById('crew-id-badge');
const lobbyCrewIdEl = document.getElementById('lobby-crew-id');
const crewLobby  = document.getElementById('crew-lobby');
const controlGrid   = document.getElementById('control-grid');
const roundNotice   = document.getElementById('round-notice');
const headerTimer   = document.getElementById('header-timer');
const roundInfo     = document.getElementById('round-info');
const lobbyStatus   = document.getElementById('lobby-status');
const toastEl       = document.getElementById('toast');
const crewRoundEnd = document.getElementById('crew-round-end');
const crewLevelComplete = document.getElementById('crew-level-complete');

const nameScreen = document.getElementById('crew-name-screen');
const nameInput  = document.getElementById('name-input');
const btnJoin    = document.getElementById('btn-join-crew');
const nameStatus = document.getElementById('name-screen-status');

// ── State ─────────────────────────────────────────────────────────────────────
let myCrewId = localStorage.getItem('nm_crew_id') || null;
let myName      = localStorage.getItem('nm_name') || 'CREWMAN';
let controlInstances = {}; // controlId → control instance
let myTaskMap = {};        // taskId → { controlId, targetValue, type }
let clientTimerInterval = null;
let timerValue = 90;
let wsConnected = false;

// ── Init: always show name screen ────────────────────────────────────────────
nameScreen.classList.remove('hidden');
crewLobby.classList.add('hidden');

// Pre-fill name from previous session
if (myName && myName !== 'CREWMAN' && nameInput) {
  nameInput.value = myName;
}

// Join handler — simple, no room codes
let joinSent = false;
function doJoinCrew() {
  if (joinSent) return; // prevent double-join
  const name = (nameInput.value.trim().toUpperCase()) || 'CREWMAN';
  myName = name;
  localStorage.setItem('nm_name', name);
  if (NM.isConnected()) {
    joinSent = true;
    const joinMsg = { role: 'crew', playerName: myName };
    if (myCrewId) joinMsg.crewId = myCrewId;
    NM.send('join_game', joinMsg);
  }
}

btnJoin?.addEventListener('click', doJoinCrew);
nameInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoinCrew(); });

function onConnected() {
  wsConnected = true;
  if (nameStatus) nameStatus.textContent = 'CONNECTED TO VESSEL';
  lobbyStatus.textContent = 'CONNECTED TO VESSEL';
  if (connDot) connDot.className = 'conn-dot online';
}
NM.on('_connected', onConnected);
// Fix race condition: WS may already be connected before this script loaded
if (NM.isConnected()) onConnected();

NM.on('_disconnected', () => {
  wsConnected = false;
  if (nameStatus) nameStatus.textContent = 'SIGNAL LOST...';
  lobbyStatus.textContent = 'SIGNAL LOST — RECONNECTING...';
  if (connDot) connDot.className = 'conn-dot offline';
});

NM.on('joined', (msg) => {
  if (msg.role === 'crew') {
    myCrewId = msg.crewId;
    myName = msg.name;
    localStorage.setItem('nm_crew_id', myCrewId);
    localStorage.setItem('nm_name', myName);
    if (msg.roomCode) localStorage.setItem('nm_room_code', msg.roomCode);
    crewIdBadge.textContent   = myCrewId;
    lobbyCrewIdEl.textContent = myCrewId;
    // Transition: name screen → waiting lobby
    nameScreen.classList.add('hidden');
    crewLobby.classList.remove('hidden');
  }
});

NM.on('error', (msg) => {
  if (msg.message && msg.message.includes('already in progress')) {
    if (myCrewId) {
      // Have a stored ID — retry join as rejoin
      showToast('REJOINING MISSION...', 'warning', 2000);
      NM.send('join_game', { role: 'crew', playerName: myName, crewId: myCrewId });
    } else {
      showToast('MISSION IN PROGRESS — STANDBY', 'warning', 4000);
    }
  }
});

// ── Controls assigned ─────────────────────────────────────────────────────────
NM.on('controls_assigned', (msg) => {
  if (msg.crewId !== myCrewId) return;
  NMAudio.init();
  buildControlPanel(msg.controls);
  showGameView();
  roundNotice.textContent = '';
  roundNotice.classList.remove('show');
  crewRoundEnd.classList.add('hidden');
  crewLevelComplete.classList.add('hidden');
});

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleControlGrid() {
  const children = Array.from(controlGrid.children);
  const normal = children.filter(el => !el.classList.contains('ctrl-wide'));
  const wide = children.filter(el => el.classList.contains('ctrl-wide'));
  shuffleArray(normal);
  shuffleArray(wide);
  [...normal, ...wide].forEach(el => controlGrid.appendChild(el));
}

function buildControlPanel(controls) {
  controlGrid.innerHTML = '';
  controlInstances = {};
  myTaskMap = {};

  // Sort: normal controls first, wide controls last (avoids empty gap cells)
  const WIDE_TYPES = ['multi-slider', 'btn-sequence', 'sw-sequence'];
  const sorted = [...controls].sort((a, b) => {
    const aWide = WIDE_TYPES.includes(a.type) ? 1 : 0;
    const bWide = WIDE_TYPES.includes(b.type) ? 1 : 0;
    return aWide - bWide;
  });

  sorted.forEach(ctrl => {
    const instance = createControl(ctrl);
    controlInstances[ctrl.controlId] = instance;
    controlGrid.appendChild(instance.el);

    instance.onSubmit((value) => {
      // Find task for this control
      const taskEntry = Object.entries(myTaskMap).find(([tid, t]) => t.controlId === ctrl.controlId);
      if (!taskEntry) return;
      const [taskId, task] = taskEntry;
      NM.send('submit_control', { taskId, value, crewId: myCrewId });
    });
  });
}

// ── Round tasks ───────────────────────────────────────────────────────────────
NM.on('round_tasks', (msg) => {
  myTaskMap = {};
  crewRoundEnd.classList.add('hidden');
  crewLevelComplete.classList.add('hidden');
  roundNotice.classList.remove('show');

  // Reset all controls to inactive
  Object.values(controlInstances).forEach(inst => {
    inst.setActive(false);
    inst.reset();
  });

  // Mark active controls
  msg.tasks.forEach(task => {
    myTaskMap[task.taskId] = task;
    const inst = controlInstances[task.controlId];
    if (inst) {
      inst.setActive(true);
    }
  });

  // Shuffle control grid positions (keeping wide controls at end)
  shuffleControlGrid();
});

// ── Task completed ────────────────────────────────────────────────────────────
NM.on('task_completed', (msg) => {
  const { taskId } = msg;
  const task = myTaskMap[taskId];
  if (task) {
    const inst = controlInstances[task.controlId];
    if (inst) {
      flashSuccess(inst.el);
      inst.setDone();
    }
    NMAudio.taskComplete();

    // Check if all MY tasks are done
    const allDone = Object.keys(myTaskMap).every(tid => {
      const t = myTaskMap[tid];
      const el = controlInstances[t.controlId]?.el;
      return el && el.classList.contains('control-done');
    });
    if (allDone) {
      showToast('ALL YOUR ORDERS COMPLETE', 'success', 2500);
    }
  }
});

// ── Task uncompleted (crew changed value away from target) ─────────────────
NM.on('task_uncompleted', (msg) => {
  const { taskId } = msg;
  const task = myTaskMap[taskId];
  if (task) {
    const inst = controlInstances[task.controlId];
    if (inst) {
      inst.setActive(true);
      inst.el.classList.remove('control-done');
      flashError(inst.el);
    }
    showToast('ORDER REVERTED', 'warning', 2000);
  }
});

// ── Game state ────────────────────────────────────────────────────────────────
NM.on('game_state', (msg) => {
  if (msg.level) {
    roundInfo.textContent = `LEVEL ${msg.level}`;
  }
  startClientTimer(msg.timerRemaining);
  // If game is playing but we have no tasks, request them (PWA reconnect fix)
  if (msg.phase === 'playing' && Object.keys(myTaskMap).length === 0 && Object.keys(controlInstances).length > 0) {
    NM.send('request_tasks', { crewId: myCrewId });
  }
  // Restore level-complete overlay on rejoin during intermission
  if (msg.phase === 'level_intermission') {
    showIntermission(msg.level, msg.level + 1, msg.intermissionStats);
  }
});

NM.on('timer_tick', (msg) => {
  setTimerDisplay(msg.remaining);
});

// ── Level end ─────────────────────────────────────────────────────────────────
NM.on('level_end', (msg) => {
  clearClientTimer();
  NMAudio.stopAlarm();
  setTimerDisplay(0);
  headerTimer.className = 'timer-inline';

  // Disable all controls
  Object.values(controlInstances).forEach(inst => inst.setActive(false));

  // Hide control grid, show level-end overlay
  controlGrid.classList.add('hidden');
  showCrewLevelEnd(msg);

  myTaskMap = {};
});

function showCrewLevelEnd(msg) {
  const failCount = msg.failedTasks ? msg.failedTasks.length : 0;
  const allDone = failCount === 0;
  const hpPct = Math.max(0, msg.newHp);
  const hpColor = hpPct <= 30 ? '#FF3300' : hpPct <= 60 ? '#FFAA00' : '#00FF88';
  const titleColor = allDone ? '#00FF88' : '#FFAA00';

  crewRoundEnd.innerHTML = `
    <div style="
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      width:100%;max-width:400px;gap:0;
    ">
      <!-- Title -->
      <div style="
        font-size:clamp(1.6rem,6vw,2.2rem);
        color:${titleColor};
        text-shadow:0 0 30px ${titleColor};
        letter-spacing:0.15em;
        margin-bottom:8px;
      ">
        LEVEL ${msg.level} ${allDone ? 'COMPLETE' : 'ENDED'}
      </div>

      <!-- Next level -->
      <div style="font-size:0.85rem;color:var(--text-dim);letter-spacing:0.1em;margin-bottom:24px;">
        NEXT: LEVEL ${msg.level + 1}
      </div>

      <!-- HP Section -->
      <div style="
        width:100%;padding:16px 20px;
        border:1px solid var(--border-dim);background:rgba(0,26,14,0.6);
        margin-bottom:16px;
      ">
        <div style="font-size:0.6rem;color:var(--text-muted);letter-spacing:0.15em;margin-bottom:10px;">HULL INTEGRITY</div>
        <div style="width:100%;height:14px;background:var(--bg-raised);border:1px solid var(--border-dim);">
          <div style="width:${hpPct}%;height:100%;background:${hpColor};transition:width 1s ease;box-shadow:0 0 10px ${hpColor};"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;">
          <div style="font-size:1.4rem;color:${hpColor};text-shadow:0 0 10px ${hpColor};">${msg.newHp} HP</div>
          <div style="font-size:1rem;color:${msg.hpLost > 0 ? '#FF3300' : '#00FF88'};">
            ${msg.hpLost > 0 ? `−${msg.hpLost} HP` : 'NO DAMAGE'}
          </div>
        </div>
      </div>

      <!-- Failed tasks -->
      ${failCount > 0 ? `
        <div style="
          width:100%;padding:10px 16px;
          border:1px solid rgba(255,51,0,0.3);background:rgba(255,51,0,0.06);
          margin-bottom:16px;text-align:center;
        ">
          <div style="font-size:0.95rem;color:#FF3300;text-shadow:0 0 8px rgba(255,51,0,0.5);">
            ${failCount} ORDER${failCount > 1 ? 'S' : ''} MISSED
          </div>
        </div>
      ` : `
        <div style="
          width:100%;padding:10px 16px;
          border:1px solid rgba(0,255,136,0.2);background:rgba(0,255,136,0.04);
          margin-bottom:16px;text-align:center;
        ">
          <div style="font-size:0.85rem;color:#00FF88;">✓ ALL ORDERS EXECUTED</div>
        </div>
      `}

      <!-- Waiting -->
      <div style="
        margin-top:12px;font-size:0.65rem;color:var(--text-muted);
        letter-spacing:0.3em;animation:blink 1.5s step-end infinite;
      ">
        AWAITING CAPTAIN'S ORDERS
      </div>
    </div>
  `;
  crewRoundEnd.classList.remove('hidden');

  if (failCount > 0) {
    NMAudio.taskFailed();
  } else {
    NMAudio.roundSuccess();
  }
}

// ── Level complete (intermission) ─────────────────────────────────────────────
function showIntermission(level, nextLevel, stats) {
  controlGrid.classList.add('hidden');
  crewRoundEnd.classList.add('hidden');
  roundNotice.classList.remove('show');

  const titleEl = document.getElementById('crew-intermission-title');
  const nextEl = document.getElementById('crew-intermission-next');
  if (titleEl) titleEl.textContent = `LEVEL ${level} COMPLETE`;
  if (nextEl) nextEl.textContent = `NEXT: LEVEL ${nextLevel}`;

  if (stats) {
    const hpEl = document.getElementById('crew-stat-hp');
    const compEl = document.getElementById('crew-stat-completed');
    const failEl = document.getElementById('crew-stat-failed');
    if (hpEl) hpEl.textContent = `${stats.hp} HP`;
    if (compEl) compEl.textContent = `${stats.completed}/${stats.total}`;
    if (failEl) failEl.textContent = stats.failed;
  }

  crewLevelComplete.classList.remove('hidden');
  Object.values(controlInstances).forEach(inst => inst.setActive(false));
}

NM.on('level_complete', (msg) => {
  clearClientTimer();
  NMAudio.stopAmbient();
  showIntermission(msg.level, msg.nextLevel || msg.level + 1, { hp: msg.hp, completed: msg.completed, total: msg.total, failed: msg.failed });
  myTaskMap = {};
});

// ── Level start ───────────────────────────────────────────────────────────────
NM.on('level_start', (msg) => {
  roundNotice.classList.remove('show');
  crewLevelComplete.classList.add('hidden');
  showToast(`LEVEL ${msg.level} — BRACE FOR ORDERS`, 'warning', 2000);
});

// ── Level intermission wait (for mid-game joiners) ───────────────────────────
NM.on('level_intermission_wait', () => {
  showToast('JOINED — AWAITING NEXT LEVEL', 'warning', 3000);
});

// ── Music toggle (from captain) ──────────────────────────────────────────────
NM.on('music_toggle', (msg) => {
  NMAudio.init();
  if (msg.on) NMAudio.startMusic();
  else NMAudio.stopMusic();
});

// ── Kicked ───────────────────────────────────────────────────────────────────
NM.on('kicked', () => {
  clearClientTimer();
  localStorage.removeItem('nm_crew_id');
  localStorage.removeItem('nm_name');
  document.body.insertAdjacentHTML('beforeend', `
    <div style="
      position:fixed;inset:0;background:rgba(0,0,0,0.96);
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;z-index:1000;text-align:center;
      padding:24px;gap:16px;
    ">
      <div style="font-size:1.5rem;color:var(--red);text-shadow:0 0 12px var(--red);">DISMISSED</div>
      <div style="color:var(--text-dim);">You have been removed from the crew.</div>
    </div>
  `);
  setTimeout(() => { window.location.href = '/'; }, 2500);
});

// ── Game over ─────────────────────────────────────────────────────────────────
NM.on('game_over', () => {
  clearClientTimer();
  NMAudio.stopAlarm();
  NMAudio.stopAmbient();
  crewRoundEnd.classList.add('hidden');
  controlGrid.classList.add('hidden');

  // Full screen overlay
  document.body.insertAdjacentHTML('beforeend', `
    <div style="
      position:fixed;inset:0;background:rgba(0,0,0,0.96);
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;z-index:1000;text-align:center;
      padding:24px;gap:16px;
    ">
      <div style="font-size:2.5rem;color:var(--red);text-shadow:0 0 20px var(--red);">HULL BREACH</div>
      <div style="color:var(--text-dim);">THE VESSEL HAS BEEN LOST</div>
      <div style="color:var(--text-muted);font-size:0.75rem;margin-top:8px;">
        Await the Captain's signal for a new mission.
      </div>
    </div>
  `);
});

// ── Mission ended (return to lobby) ──────────────────────────────────────────
NM.on('mission_ended', () => {
  clearClientTimer();
  NMAudio.stopAlarm();
  NMAudio.stopAmbient();
  NMAudio.stopMusic();
  controlGrid.classList.add('hidden');
  crewRoundEnd.classList.add('hidden');
  crewLevelComplete.classList.add('hidden');
  roundNotice.classList.remove('show');
  // Remove any game-over overlay
  document.querySelectorAll('[style*="position:fixed"][style*="z-index:1000"]').forEach(el => el.remove());
  crewLobby.classList.remove('hidden');
  Object.values(controlInstances).forEach(inst => inst.setActive(false));
  controlInstances = {};
  myTaskMap = {};
  lobbyStatus.textContent = 'MISSION ENDED — AWAITING NEW ORDERS';
});

// ── Captain left ──────────────────────────────────────────────────────────────
NM.on('captain_left', () => {
  clearClientTimer();
  localStorage.removeItem('nm_crew_id');
  localStorage.removeItem('nm_name');
  window.location.href = '/';
});

// ── Timer ─────────────────────────────────────────────────────────────────────
let timerWarningFired = false;

function startClientTimer(startVal) {
  clearClientTimer();
  timerValue = startVal;
  timerWarningFired = startVal <= 10;
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

function setTimerDisplay(val) {
  if (val <= 10 && val > 0 && !timerWarningFired) {
    timerWarningFired = true;
    NMAudio.timerWarning();
  }
  if (val > 10) timerWarningFired = false;
  timerValue = val;
  headerTimer.textContent = val;
  headerTimer.className = 'timer-inline' + (val <= 10 && val > 0 ? ' critical' : '');
}

// ── View helpers ──────────────────────────────────────────────────────────────
function showGameView() {
  crewLobby.classList.add('hidden');
  controlGrid.classList.remove('hidden');
}

// ── Flash helpers (for controls) ──────────────────────────────────────────────
function flashSuccess(el) {
  el.classList.add('control-success');
  setTimeout(() => el.classList.remove('control-success'), 1200);
}

// ── Connection status dot ─────────────────────────────────────────────────────
const connDot = document.getElementById('conn-dot');

// ── Refresh button ───────────────────────────────────────────────────────────
document.getElementById('btn-refresh')?.addEventListener('click', () => {
  location.reload();
});

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimeout = null;
function showToast(text, type = 'success', duration = 2000) {
  toastEl.textContent = text;
  toastEl.className = `show ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.className = type;
  }, duration);
}
