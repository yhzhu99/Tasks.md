const { WebSocketServer } = require("ws");
const Y = require("yjs");
const sync = require("y-protocols/sync");
const awareness = require("y-protocols/awareness");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");
const { fail } = require("./store");

function message(type, write) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, type); write(encoder);
  return encoding.toUint8Array(encoder);
}
function send(socket, data) {
  if (socket.readyState === 1) {
    if (socket.bufferedAmount > 4_000_000) socket.close(4503, "Connection is too slow; reconnect");
    else socket.send(data);
  }
}

function createRealtime(server, store, auth, basePath, originAllowed) {
  const rooms = new Map();
  const events = new Set();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2_500_000 });
  function notify() {
    for (const client of events) {
      if (!auth.session(client.cookie)) { client.res.end(); events.delete(client); continue; }
      client.res.write("event: change\ndata: {}\n\n");
    }
  }
  function roomFor(id) {
    if (rooms.has(id)) return rooms.get(id);
    const row = store.byId(id);
    if (!row?.state) fail(404, "Card no longer exists");
    const doc = new Y.Doc(); Y.applyUpdate(doc, row.state);
    const presence = new awareness.Awareness(doc); presence.setLocalState(null);
    const room = { doc, presence, sockets: new Set() };
    doc.on("update", (update) => {
      const data = message(0, (encoder) => sync.writeUpdate(encoder, update));
      for (const socket of room.sockets) send(socket, data);
    });
    presence.on("update", ({ added, updated, removed }) => {
      const data = message(1, (encoder) => encoding.writeVarUint8Array(encoder, awareness.encodeAwarenessUpdate(presence, [...added, ...updated, ...removed])));
      for (const socket of room.sockets) send(socket, data);
    });
    rooms.set(id, room); return room;
  }
  function edit(id, content, actor, action = "edit") {
    const room = roomFor(id);
    const candidate = new Y.Doc(); Y.applyUpdate(candidate, Y.encodeStateAsUpdate(room.doc));
    const text = candidate.getText("content");
    const previous = text.toString();
    let from = 0, to = previous.length, nextTo = content.length;
    while (from < to && from < nextTo && previous[from] === content[from]) from++;
    while (to > from && nextTo > from && previous[to - 1] === content[nextTo - 1]) { to--; nextTo--; }
    candidate.transact(() => { text.delete(from, to - from); text.insert(from, content.slice(from, nextTo)); });
    try {
      const row = store.saveDocument(id, candidate, actor, action);
      Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(candidate));
      notify(); return row;
    } finally {
      candidate.destroy();
      if (!room.sockets.size) { room.presence.destroy(); room.doc.destroy(); rooms.delete(id); }
    }
  }
  function activeUnder(value, username) {
    return [...rooms].some(([id, room]) => {
      const row = store.byId(id);
      return row && (row.path === value || row.path.startsWith(`${value}/`)) && [...room.sockets].some((socket) => socket.user.username !== username);
    });
  }
  function closeDeleted() {
    for (const [id, room] of rooms) {
      if (!store.byId(id)) for (const socket of room.sockets) socket.close(4404, "Card was deleted");
    }
  }
  auth.onRevoke = (username) => {
    for (const socket of wss.clients) if (socket.user?.username === username) socket.close(4401, "Please sign in again");
    for (const client of events) if (client.username === username) { client.res.end(); events.delete(client); }
  };
  server.on("upgrade", (req, socket, head) => {
    const user = auth.session(req.headers.cookie);
    const pathname = new URL(req.url, "http://localhost").pathname;
    const prefix = `${basePath}/_api/collab/`;
    if (!pathname.startsWith(prefix) || !originAllowed(req.headers.origin) || !user || user.must_change) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); return;
    }
    const id = pathname.slice(prefix.length);
    if (!store.byId(id)?.state) { socket.end("HTTP/1.1 404 Not Found\r\n\r\n"); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user; ws.cookie = req.headers.cookie; ws.alive = true; ws.awarenessIds = new Set();
      const room = roomFor(id); room.sockets.add(ws);
      ws.on("error", () => ws.close());
      ws.on("pong", () => { ws.alive = true; });
      ws.on("message", (data) => {
        try {
          if (!auth.session(ws.cookie) || !store.byId(id)) { ws.close(4401, "Session or card no longer available"); return; }
          const decoder = decoding.createDecoder(new Uint8Array(data));
          const type = decoding.readVarUint(decoder);
          if (type === 0) {
            const subtype = decoding.readVarUint(decoder);
            if (subtype === 0) {
              send(ws, message(0, (encoder) => sync.readSyncStep1(decoder, encoder, room.doc)));
            } else if (subtype === 1 || subtype === 2) {
              const update = decoding.readVarUint8Array(decoder);
              // Persist a candidate before broadcasting. Failed writes never enter the live document.
              const candidate = new Y.Doc();
              try {
                Y.applyUpdate(candidate, Y.encodeStateAsUpdate(room.doc));
                Y.applyUpdate(candidate, update);
                store.saveDocument(id, candidate, user.username);
                Y.applyUpdate(room.doc, update, ws);
              } finally { candidate.destroy(); }
              notify();
            } else fail(400, "Invalid sync message");
          } else if (type === 1) {
            const input = decoding.createDecoder(decoding.readVarUint8Array(decoder));
            const count = decoding.readVarUint(input);
            if (count > 8) fail(400, "Too many presence states");
            const accepted = [];
            for (let i = 0; i < count; i++) {
              const clientId = decoding.readVarUint(input);
              const clock = decoding.readVarUint(input);
              const state = JSON.parse(decoding.readVarString(input));
              // Providers also relay other clients' awareness. Ignore those echoes;
              // only this connection's own presence may claim its authenticated identity.
              if ([...room.sockets].some((other) => other !== ws && other.awarenessIds.has(clientId))) continue;
              if (!ws.awarenessIds.has(clientId)) {
                if (ws.awarenessIds.size || state?.user?.name !== user.username) continue;
                ws.awarenessIds.add(clientId);
              }
              if (state) state.user = { name: user.username, color: "#527cce", colorLight: "#527cce33" };
              accepted.push({ clientId, clock, state });
            }
            const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, accepted.length);
            for (const { clientId, clock, state } of accepted) {
              encoding.writeVarUint(encoder, clientId); encoding.writeVarUint(encoder, clock); encoding.writeVarString(encoder, JSON.stringify(state));
            }
            awareness.applyAwarenessUpdate(room.presence, encoding.toUint8Array(encoder), ws);
          } else if (type === 3) {
            send(ws, message(1, (encoder) => encoding.writeVarUint8Array(encoder, awareness.encodeAwarenessUpdate(room.presence, [...room.presence.getStates().keys()]))));
          } else if (type === 4) {
            const sequence = decoding.readVarUint(decoder);
            send(ws, message(4, (encoder) => {
              encoding.writeVarUint(encoder, sequence);
              encoding.writeVarString(encoder, store.etag(store.byId(id)));
            }));
          } else fail(400, "Invalid message");
        } catch (error) {
          console.error("Collaboration update rejected:", error.message);
          ws.close(error.status && error.status < 500 ? 4400 : 4500, "Update not saved; download your draft and reconnect");
        }
      });
      ws.on("close", () => {
        awareness.removeAwarenessStates(room.presence, [...ws.awarenessIds], ws);
        room.sockets.delete(ws);
        if (!room.sockets.size) { room.presence.destroy(); room.doc.destroy(); rooms.delete(id); }
      });
      send(ws, message(0, (encoder) => sync.writeSyncStep1(encoder, room.doc)));
      send(ws, message(1, (encoder) => encoding.writeVarUint8Array(encoder, awareness.encodeAwarenessUpdate(room.presence, [...room.presence.getStates().keys()]))));
    });
  });
  const timer = setInterval(() => {
    store.flushExports();
    for (const ws of wss.clients) {
      if (!ws.alive || !auth.session(ws.cookie)) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
    for (const client of events) {
      if (!auth.session(client.cookie)) { client.res.end(); events.delete(client); }
      else client.res.write(": heartbeat\n\n");
    }
  }, 15000);
  timer.unref();
  return {
    edit, notify, activeUnder, closeDeleted,
    subscribe(ctx) {
      ctx.respond = false;
      ctx.res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      ctx.res.write(": connected\n\n");
      const client = { res: ctx.res, cookie: ctx.headers.cookie, username: ctx.state.user.username };
      events.add(client); ctx.res.on("close", () => events.delete(client));
    },
  };
}

module.exports = { createRealtime };
