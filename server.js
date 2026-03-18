const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;

// ─── Determine local IP at startup ──────────────────────────────────────────
let localIP = 'localhost';
Object.values(os.networkInterfaces()).flat().forEach(iface => {
  if (iface && iface.family === 'IPv4' && !iface.internal) localIP = iface.address;
});

// ─── Static file server ─────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
};

function serveStatic(req, res) {
  if (req.url === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ip: localIP, port: PORT }));
    return;
  }

  // API: get room status (for homepage)
  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      active: room.captain !== null,
      sessionName: room.sessionName,
      crewCount: room.crew.length,
      phase: room.phase,
    }));
    return;
  }

  let filePath = path.join(__dirname, 'public', req.url === '/' ? '/index.html' : req.url.split('?')[0]);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
const wss = new WebSocket.Server({ server });

// ─── Control types & helpers ────────────────────────────────────────────────

const CONTROL_TYPES = [
  'toggle', 'button', 'dial', 'h-slider', 'v-slider',
  'multi-slider', 'number-wheel', 'stepper',
  'btn-sequence', 'sw-sequence', 'ring'
];

const DIAL_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];
const SLIDER_SNAPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const RING_SNAPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function generateTargetValue(type) {
  switch (type) {
    case 'toggle': return 'ON';
    case 'button': return 'PRESSED';
    case 'dial': return pick(DIAL_SNAPS.filter(v => v !== 0));
    case 'h-slider': case 'v-slider': return pick(SLIDER_SNAPS.filter(v => v !== 0));
    case 'multi-slider': return [1,2,3,4,5].map(() => Math.floor(Math.random() * 8) + 2);
    case 'number-wheel': return Math.floor(Math.random() * 99) + 1;
    case 'stepper': return Math.floor(Math.random() * 9) + 2;
    case 'btn-sequence': return shuffle([1, 2, 3, 4]);
    case 'sw-sequence': return shuffle(['SW1', 'SW2', 'SW3', 'SW4']);
    case 'ring': return pick(RING_SNAPS);
    default: return 0;
  }
}

function formatTaskInstruction(controlName, type, targetValue) {
  switch (type) {
    case 'toggle': return `Set ${controlName} to ${targetValue}`;
    case 'button': return `Activate ${controlName}`;
    case 'dial': return `Set ${controlName} to ${targetValue}°`;
    case 'h-slider': case 'v-slider': return `Set ${controlName} to ${targetValue}%`;
    case 'multi-slider': return `Set ${controlName} to ${targetValue.join(', ')}`;
    case 'number-wheel': return `Set ${controlName} to ${String(targetValue).padStart(2, '0')}`;
    case 'stepper': return `Set ${controlName} to ${targetValue}`;
    case 'btn-sequence': return `Enter ${controlName} sequence: ${targetValue.join('-')}`;
    case 'sw-sequence': return `Arm ${controlName} in order: ${targetValue.join(', ')}`;
    case 'ring': return `Charge ${controlName} to ${targetValue}%`;
    default: return `Set ${controlName} to ${targetValue}`;
  }
}

function valuesMatch(type, submitted, target) {
  if (type === 'multi-slider' || type === 'btn-sequence' || type === 'sw-sequence') {
    if (!Array.isArray(submitted) || !Array.isArray(target)) return false;
    if (submitted.length !== target.length) return false;
    return submitted.every((v, i) => String(v) === String(target[i]));
  }
  return String(submitted) === String(target);
}

const CONTROL_NAMES = [
  'MAIN BALLAST PUMP', 'DIVE PLANE ACTUATOR', 'STERN PLANE CONTROL',
  'RUDDER TRIM ADJUSTER', 'PROPULSION DRIVE CONTROL', 'SHAFT SPEED REGULATOR',
  'PORT THRUSTER OUTPUT', 'STARBOARD THRUSTER OUTPUT',
  'EMERGENCY PROPULSION SWITCH', 'TRIM TANK VALVE',
  'DEPTH PRESSURE GAUGE', 'HULL STRESS MONITOR', 'CRUSH DEPTH LIMITER',
  'BUOYANCY CONTROL VALVE', 'BALLAST TANK VENT', 'FLOOD CONTROL LEVER',
  'PRESSURE RELIEF VALVE', 'SEA CHEST INLET VALVE',
  'HYDROSTATIC SENSOR OVERRIDE', 'VARIABLE BALLAST INJECTOR',
  'REACTOR COOLANT VALVE', 'CORE TEMPERATURE DIAL', 'PRIMARY COOLANT FLOW',
  'SECONDARY LOOP BYPASS', 'REACTOR SCRAM SWITCH', 'POWER DISTRIBUTION BOARD',
  'AUXILIARY POWER BUS', 'BATTERY RESERVE TOGGLE',
  'VOLTAGE REGULATOR DIAL', 'EMERGENCY GENERATOR SWITCH',
  'TORPEDO TUBE FLOOD VALVE', 'TUBE PRESSURE EQUALIZER', 'FIRE CONTROL SELECTOR',
  'WARHEAD ARMING SWITCH', 'COUNTERMEASURE EJECTOR', 'DECOY LAUNCH CONTROL',
  'MINE RELEASE TOGGLE', 'TUBE DOOR ACTUATOR',
  'FIRING SOLUTION LOCK', 'WEAPONS BAY PRESSURE',
  'ACTIVE SONAR EMITTER', 'PASSIVE SONAR GAIN', 'SONAR FREQUENCY DIAL',
  'HYDROPHONE ARRAY SWITCH', 'TARGET TRACKING LOCK', 'BEARING RESOLUTION KNOB',
  'NOISE FILTER LEVEL', 'SONAR SWEEP RATE',
  'ECHO RETURN AMPLIFIER', 'TRANSDUCER DEPTH ADJUSTER',
  'OXYGEN PURGE VALVE', 'CO2 SCRUBBER CONTROL', 'AIR CIRCULATION FAN',
  'HUMIDITY REGULATOR', 'AIR FLOW RATE SLIDER', 'ATMOSPHERIC PRESSURE DIAL',
  'EMERGENCY O2 RELEASE', 'NITROGEN PURGE SWITCH',
  'CARBON FILTER BYPASS', 'CABIN PRESSURE EQUALIZER',
  'RADIO FREQUENCY SELECTOR', 'ELF TRANSMITTER TOGGLE', 'PERISCOPE ANTENNA RAISE',
  'BURST TRANSMIT CONTROL', 'COMM ARRAY POWER SWITCH', 'SIGNAL ENCRYPTION KEY',
  'ACOUSTIC MODEM GAIN', 'UHF BAND SELECTOR',
  'MESSAGE BUFFER FLUSH', 'IFF TRANSPONDER TOGGLE',
  'INERTIAL NAV RESET', 'GPS ANTENNA DEPLOY', 'CHART TABLE LIGHT',
  'COURSE CORRECTION DIAL', 'SPEED LOG CALIBRATION', 'MAGNETIC COMPASS ADJUST',
  'GYROCOMPASS SYNC', 'NAVAID SELECTOR',
  'WAYPOINT ENTRY DIAL', 'DEAD RECKONING OVERRIDE',
  'FLOOD ALARM ACKNOWLEDGE', 'FIRE SUPPRESSION ZONE', 'WATERTIGHT DOOR SEAL',
  'BILGE PUMP SWITCH', 'EMERGENCY BLOW VALVE', 'DAMAGE CONTROL PANEL RESET',
  'COMPARTMENT ISOLATE TOGGLE', 'HALON SYSTEM ARM',
  'SMOKE DETECTOR OVERRIDE', 'HULL BREACH ALERT SILENCE',
  'PERISCOPE RAISE CONTROL', 'MAST RETRACT SWITCH', 'EXTERNAL LIGHT TOGGLE',
  'PHOTONICS MAST PAN', 'SAIL PLANE ACTUATOR', 'ANCHOR RELEASE CONTROL',
  'TOWED ARRAY DEPLOY', 'KAPSTAN WINCH CONTROL',
  'DOCKING LIGHT SWITCH', 'EMERGENCY BEACON ARM',
];

// ─── Single room state ──────────────────────────────────────────────────────

let taskIdCounter = 0;

const room = {
  sessionName: '',
  captain: null,
  crew: [],
  phase: 'lobby',
  hp: 100,
  level: 1,
  musicOn: false,
  timerSeconds: 90,
  timerInterval: null,
  timerRemaining: 90,
  tasks: [],
  controlLayouts: {},
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  if (room.captain) send(room.captain, obj);
  room.crew.forEach(s => send(s.ws, obj));
}

function broadcastGameState() {
  broadcast({
    type: 'game_state', phase: room.phase, hp: room.hp, level: room.level,
    timerRemaining: room.timerRemaining,
    tasks: room.tasks.map(t => ({ taskId: t.taskId, crewId: t.crewId, instruction: t.instruction, done: t.done })),
    players: room.crew.map(s => ({ name: s.name, crewId: s.crewId })),
    crewCount: room.crew.length,
  });
}

function sendLobbyState(ws) {
  send(ws, {
    type: 'lobby_state',
    captainConnected: room.captain !== null,
    sessionName: room.sessionName,
    crew: room.crew.map(s => ({ name: s.name, crewId: s.crewId })),
    phase: room.phase,
  });
}

function broadcastLobbyState() {
  const msg = {
    type: 'lobby_state',
    captainConnected: room.captain !== null,
    sessionName: room.sessionName,
    crew: room.crew.map(s => ({ name: s.name, crewId: s.crewId })),
    phase: room.phase,
  };
  broadcast(msg);
}

function nextCrewId() {
  const existing = room.crew.map(s => s.crewId);
  for (let i = 1; i <= 9; i++) { const id = `CREW-${i}`; if (!existing.includes(id)) return id; }
  return `CREW-${room.crew.length + 1}`;
}

// ─── Game logic ─────────────────────────────────────────────────────────────

function startGame(timerOffset) {
  if (room.crew.length === 0) { send(room.captain, { type: 'error', message: 'Need at least one crew member to start.' }); return; }
  room.hp = 100;
  room.phase = 'playing';
  room.timerOffset = timerOffset || 0;
  startLevel(1);
}

function startLevel(level) {
  room.level = level;
  const baseTimer = 90 + (room.timerOffset || 0);
  room.timerSeconds = Math.max(30, baseTimer - (level - 1) * 10);
  const shuffledNames = shuffle([...CONTROL_NAMES]);

  room.crew.forEach((member, si) => {
    const controls = [];
    for (let i = 0; i < 8; i++) {
      controls.push({
        controlId: `${member.crewId}-C${i}`,
        name: shuffledNames[(si * 8 + i) % shuffledNames.length],
        type: CONTROL_TYPES[(si * 8 + i) % CONTROL_TYPES.length],
      });
    }
    room.controlLayouts[member.crewId] = controls;
    send(member.ws, { type: 'controls_assigned', crewId: member.crewId, controls });
  });

  send(room.captain, { type: 'level_start', level });

  room.tasks = [];
  room.timerRemaining = room.timerSeconds;
  const tasksPerMember = Math.min(8, Math.max(2, Math.ceil(16 / room.crew.length)));

  room.crew.forEach(member => {
    shuffle([...room.controlLayouts[member.crewId]]).slice(0, tasksPerMember).forEach(ctrl => {
      const target = generateTargetValue(ctrl.type);
      room.tasks.push({
        taskId: `T${++taskIdCounter}`, crewId: member.crewId, controlId: ctrl.controlId,
        controlName: ctrl.name, type: ctrl.type, targetValue: target,
        instruction: formatTaskInstruction(ctrl.name, ctrl.type, target), done: false,
      });
    });
  });

  room.crew.forEach(member => {
    const myTasks = room.tasks.filter(t => t.crewId === member.crewId)
      .map(t => ({ taskId: t.taskId, controlId: t.controlId, targetValue: t.targetValue, type: t.type }));
    send(member.ws, { type: 'round_tasks', tasks: myTasks });
  });

  broadcastGameState();
  startTimer();
}

function startTimer() {
  clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    room.timerRemaining--;
    broadcast({ type: 'timer_tick', remaining: room.timerRemaining });
    if (room.timerRemaining <= 0) { clearInterval(room.timerInterval); endLevel(); }
  }, 1000);
}

function endLevel() {
  clearInterval(room.timerInterval);
  const failedTasks = room.tasks.filter(t => !t.done);
  const hpLost = failedTasks.length * 10;
  room.hp = Math.max(0, room.hp - hpLost);

  broadcast({
    type: 'level_end',
    failedTasks: failedTasks.map(t => ({ taskId: t.taskId, instruction: t.instruction, crewId: t.crewId })),
    hpLost, newHp: room.hp, level: room.level,
  });

  if (room.hp <= 0) {
    room.phase = 'gameover';
    broadcast({ type: 'game_over', reason: 'hull_breach', finalHp: 0 });
  } else {
    room.phase = 'level_intermission';
    broadcast({ type: 'level_complete', level: room.level, nextLevel: room.level + 1, crew: room.crew.map(s => ({ name: s.name, crewId: s.crewId })) });
    broadcastLobbyState();
  }
}

// ─── WebSocket handlers ─────────────────────────────────────────────────────

function handleJoin(ws, msg) {
  const { role, playerName, sessionName } = msg;

  if (role === 'captain') {
    if (room.captain !== null) { send(ws, { type: 'error', message: 'Captain slot already taken.' }); return; }
    room.captain = ws;
    room.sessionName = sessionName || 'GAME';
    send(ws, { type: 'joined', role: 'captain' });
    broadcastLobbyState();

  } else if (role === 'crew') {
    // Rejoin check
    if (msg.crewId) {
      const existing = room.crew.find(s => s.crewId === msg.crewId);
      if (existing) {
        if (existing.ws !== null && existing.ws !== ws) { try { existing.ws.close(); } catch {} }
        existing.ws = ws;
        send(ws, { type: 'joined', role: 'crew', crewId: existing.crewId, name: existing.name });
        broadcast({ type: 'player_rejoined', crewId: existing.crewId, name: existing.name });
        const layout = room.controlLayouts[existing.crewId];
        if (layout) send(ws, { type: 'controls_assigned', crewId: existing.crewId, controls: layout });
        if (room.phase === 'playing') {
          const myTasks = room.tasks.filter(t => t.crewId === existing.crewId)
            .map(t => ({ taskId: t.taskId, controlId: t.controlId, targetValue: t.targetValue, type: t.type }));
          send(ws, { type: 'round_tasks', tasks: myTasks });
        }
        // Send game state only to the rejoining crew member (not broadcast — would disrupt captain's overlay)
        send(ws, {
          type: 'game_state', phase: room.phase, hp: room.hp, level: room.level,
          timerRemaining: room.timerRemaining,
          tasks: room.tasks.map(t => ({ taskId: t.taskId, crewId: t.crewId, instruction: t.instruction, done: t.done })),
          players: room.crew.map(s => ({ name: s.name, crewId: s.crewId })),
          crewCount: room.crew.length,
        });
        // Restore music state
        if (room.musicOn) send(ws, { type: 'music_toggle', on: true });
        return;
      }
    }

    if (room.phase !== 'lobby' && room.phase !== 'level_intermission') {
      send(ws, { type: 'error', message: 'Game already in progress. Wait for next session.' }); return;
    }
    if (room.crew.length >= 9) { send(ws, { type: 'error', message: 'Crew is full (max 9 members).' }); return; }
    const crewId = nextCrewId();
    const member = { ws, name: playerName || crewId, crewId };
    room.crew.push(member);
    send(ws, { type: 'joined', role: 'crew', crewId, name: member.name });
    broadcast({ type: 'player_joined', playerName: member.name, role: 'crew', crewId });
    broadcastLobbyState();

    if (room.phase === 'level_intermission') {
      if (room.captain) {
        send(room.captain, { type: 'intermission_crew_update', crew: room.crew.map(s => ({ name: s.name, crewId: s.crewId })) });
      }
      send(ws, { type: 'level_intermission_wait' });
    }
  }
}

function resetRoom() {
  clearInterval(room.timerInterval);
  room.crew = [];
  room.phase = 'lobby';
  room.hp = 100;
  room.level = 1;
  room.tasks = [];
  room.controlLayouts = {};
  room.sessionName = '';
  room.musicOn = false;
  taskIdCounter = 0;
}

function handleDisconnect(ws) {
  if (ws === room.captain) {
    broadcast({ type: 'captain_left' });
    resetRoom();
    room.captain = null;
  } else {
    const idx = room.crew.findIndex(s => s.ws === ws);
    if (idx !== -1) {
      const member = room.crew[idx];
      if (room.phase === 'playing' || room.phase === 'level_intermission') {
        member.ws = null;
        broadcast({ type: 'player_disconnected', crewId: member.crewId, name: member.name });
      } else {
        room.crew.splice(idx, 1);
        broadcast({ type: 'player_left', crewId: member.crewId, name: member.name });
        if (room.phase === 'lobby') broadcastLobbyState();
      }
    }
  }
}

// ─── Connection entry ───────────────────────────────────────────────────────

wss.on('connection', ws => {
  // Send current lobby state to every new connection
  sendLobbyState(ws);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'ping': send(ws, { type: 'pong' }); break;
      case 'join_game': handleJoin(ws, msg); break;

      case 'start_game':
        if (ws !== room.captain || room.phase !== 'lobby') break;
        startGame(msg.timerOffset);
        break;

      case 'submit_control': {
        if (room.phase !== 'playing') break;
        const { taskId, value } = msg;
        const task = room.tasks.find(t => t.taskId === taskId);
        if (!task) break;
        const member = room.crew.find(s => s.ws === ws);
        if (!member || member.crewId !== task.crewId) break;
        const matches = valuesMatch(task.type, value, task.targetValue);
        if (matches && !task.done) {
          task.done = true;
          broadcast({ type: 'task_completed', taskId, crewId: task.crewId });
          if (room.tasks.every(t => t.done)) { clearInterval(room.timerInterval); endLevel(); }
        } else if (!matches && task.done) {
          task.done = false;
          broadcast({ type: 'task_uncompleted', taskId, crewId: task.crewId });
        }
        break;
      }

      case 'next_round':
      case 'continue_level':
        if (ws !== room.captain || room.phase !== 'level_intermission') break;
        if (room.crew.length === 0) { send(ws, { type: 'error', message: 'Need at least one crew member.' }); break; }
        room.phase = 'playing';
        startLevel(room.level + 1);
        break;

      case 'end_game':
        if (ws !== room.captain) break;
        broadcast({ type: 'captain_left' });
        resetRoom();
        room.captain = ws;
        send(ws, { type: 'room_reset' });
        broadcastLobbyState();
        break;

      case 'kick_player': {
        if (ws !== room.captain) break;
        if (room.phase !== 'level_intermission' && room.phase !== 'lobby') break;
        const { crewId } = msg;
        const idx = room.crew.findIndex(s => s.crewId === crewId);
        if (idx === -1) break;
        const kicked = room.crew[idx];
        room.crew.splice(idx, 1);
        delete room.controlLayouts[crewId];
        send(kicked.ws, { type: 'kicked' });
        broadcast({ type: 'player_kicked', crewId, name: kicked.name });
        broadcastLobbyState();
        break;
      }

      case 'music_toggle':
        if (ws === room.captain) {
          room.musicOn = msg.on;
          room.crew.forEach(s => send(s.ws, { type: 'music_toggle', on: msg.on }));
        }
        break;

      case 'request_tasks': {
        const member = room.crew.find(s => s.ws === ws);
        if (!member || room.phase !== 'playing') break;
        const myTasks = room.tasks.filter(t => t.crewId === member.crewId)
          .map(t => ({ taskId: t.taskId, controlId: t.controlId, targetValue: t.targetValue, type: t.type }));
        send(ws, { type: 'round_tasks', tasks: myTasks });
        // Send game state only to requesting crew (not broadcast — would disrupt captain's view)
        send(ws, {
          type: 'game_state', phase: room.phase, hp: room.hp, level: room.level,
          timerRemaining: room.timerRemaining,
          tasks: room.tasks.map(t => ({ taskId: t.taskId, crewId: t.crewId, instruction: t.instruction, done: t.done })),
          players: room.crew.map(s => ({ name: s.name, crewId: s.crewId })),
          crewCount: room.crew.length,
        });
        break;
      }
    }
  });

  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => handleDisconnect(ws));
});

server.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║         NOOBMARINE SERVER             ║`);
  console.log(`╠═══════════════════════════════════════╣`);
  console.log(`║  Captain : http://localhost:${PORT}      ║`);
  console.log(`║  Crew    : http://${localIP}:${PORT}  ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
});
