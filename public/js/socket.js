/**
 * NOOBMARINE — Shared WebSocket Client
 * Handles connection, reconnection, and event dispatch.
 */

const NM = (() => {
  let ws = null;
  let reconnectDelay = 1000;
  const handlers = {};
  let isConnected = false;
  let lastMessageAt = 0;
  let heartbeatTimer = null;

  function connect() {
    // Prevent double-connect: if a WS is already connecting/open, skip
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}`;
    console.log('[NM] Connecting to:', url);
    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      console.log('[NM] Connected!');
      isConnected = true;
      reconnectDelay = 1000;
      lastMessageAt = Date.now();
      startHeartbeat();
      dispatch('_connected', {});
    });

    ws.addEventListener('message', evt => {
      lastMessageAt = Date.now();
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      dispatch(msg.type, msg);
    });

    ws.addEventListener('close', (e) => {
      console.log('[NM] Closed:', e.code, e.reason);
      isConnected = false;
      stopHeartbeat();
      dispatch('_disconnected', {});
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 8000);
    });

    ws.addEventListener('error', (e) => {
      console.log('[NM] Error:', e);
      ws.close();
    });
  }

  // Heartbeat: if no message received for 15s, assume dead and reconnect
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      // If no message in 15s, probe with a ping. If still no response in 5s, reconnect.
      if (Date.now() - lastMessageAt > 15000) {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
        setTimeout(() => {
          if (Date.now() - lastMessageAt > 20000) {
            // Dead connection
            isConnected = false;
            stopHeartbeat();
            try { ws.close(); } catch {}
            dispatch('_disconnected', {});
            reconnectDelay = 1000;
            connect();
          }
        }, 5000);
      }
    }, 10000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function dispatch(type, msg) {
    (handlers[type] || []).forEach(fn => fn(msg));
    (handlers['*'] || []).forEach(fn => fn(msg));
  }

  function send(type, payload = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  function on(type, fn) {
    if (!handlers[type]) handlers[type] = [];
    handlers[type].push(fn);
  }

  function off(type, fn) {
    if (handlers[type]) {
      handlers[type] = handlers[type].filter(h => h !== fn);
    }
  }

  connect();

  // PWA fix: when app returns from background, WebSocket may be dead without close event
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Force reconnect if WS is not open
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        isConnected = false;
        dispatch('_disconnected', {});
        reconnectDelay = 1000;
        connect();
      } else {
        // WS appears open but may be stale — send a ping to verify
        lastMessageAt = Date.now() - 14000; // will trigger heartbeat check soon
      }
    }
  });

  return { send, on, off, isConnected: () => isConnected };
})();
