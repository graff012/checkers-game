// server/index.mjs
import express from "express";
import http from "http";
import { Server } from "socket.io";
import crypto from "crypto";
import { createRoom, getRoom, joinRoom, leaveRoom, removePlayer, sanitize } from "./rooms.mjs";
import * as game from "./game.mjs";

const app = express();
app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); next(); });
app.get("/", (req, res) => res.send("Checkers server (ESM) alive"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// token -> { roomId, color }
const PLAYER_TOKENS = new Map();

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  // Create room
  socket.on("create-room", (payload, ack) => {
    const room = createRoom(socket.id);
    socket.join(room.id);
    const token = generateToken();
    PLAYER_TOKENS.set(token, { roomId: room.id, color: "r" });
    socket.data = { roomId: room.id, color: "r", token };

    // include color in ACK so client knows assigned color
    if (typeof ack === "function") ack({ ok: true, room: sanitize(room), token, color: "r" });

    io.to(room.id).emit("room-state", sanitize(room));
    console.log(`room ${room.id} created by ${socket.id}`);
  });

  // Join room
  socket.on("join-room", ({ roomId } = {}, ack) => {
    if (!roomId) return ack && ack({ ok: false, reason: "Missing roomId" });
    const res = joinRoom(roomId, socket.id);
    if (!res.ok) return ack && ack({ ok: false, reason: res.reason });
    socket.join(roomId.toUpperCase());
    const token = generateToken();
    PLAYER_TOKENS.set(token, { roomId: roomId.toUpperCase(), color: res.color });
    socket.data = { roomId: roomId.toUpperCase(), color: res.color, token };

    // include assigned color in the ACK so client can set it
    if (typeof ack === "function") ack({ ok: true, room: sanitize(res.room), token, color: res.color });

    io.to(roomId.toUpperCase()).emit("room-state", sanitize(res.room));
    console.log(`${socket.id} joined ${roomId.toUpperCase()} as ${res.color}`);
  });

  // Reconnect with token (client should call this on startup if token present)
  socket.on("reconnect-with-token", ({ token } = {}, ack) => {
    if (!token) return ack && ack({ ok: false, reason: "Missing token" });
    const session = PLAYER_TOKENS.get(token);
    if (!session) return ack && ack({ ok: false, reason: "Invalid token" });
    const room = getRoom(session.roomId);
    if (!room) return ack && ack({ ok: false, reason: "Room not found" });
    socket.join(session.roomId);
    socket.data = { roomId: session.roomId, color: session.color, token };
    // update socketsByColor mapping to this new socket (friendly reconnection)
    room.socketsByColor[session.color] = socket.id;
    room.players[socket.id] = session.color;
    if (typeof ack === "function") ack({ ok: true, room: sanitize(room), color: session.color });
    io.to(room.id).emit("room-state", sanitize(room));
    console.log(`socket ${socket.id} reconnected with token into room ${session.roomId} as ${session.color}`);
  });

  // Get allowed moves for a piece
  socket.on("get-allowed-moves", ({ roomId, from } = {}, ack) => {
    if (!roomId || !from) return ack && ack({ ok: false, reason: "Bad request" });
    const room = getRoom(roomId);
    if (!room) return ack && ack({ ok: false, reason: "Room not found" });
    const playerColor = room.players[socket.id];
    if (!playerColor) return ack && ack({ ok: false, reason: "You are not in the room" });

    const moves = game.possibleMovesFor(room.board, from) || [];
    const mustCapture = game.playerHasCapture(room.board, playerColor);
    const filtered = mustCapture ? moves.filter(([tr, tc]) => Math.abs(tr - from[0]) === 2) : moves;
    return ack && ack({ ok: true, moves: filtered });
  });

  // Make move (authoritative)
  socket.on("make-move", (payload, ack) => {
    try {
      const { from, to } = payload || {};
      const { roomId } = socket.data || {};
      if (!roomId) return ack && ack({ ok: false, reason: "You are not in a room" });
      const room = getRoom(roomId);
      if (!room) return ack && ack({ ok: false, reason: "Room not found" });

      const playerColor = room.players[socket.id];
      if (!playerColor) return ack && ack({ ok: false, reason: "You are not a player in this room" });
      if (room.turn !== playerColor) return ack && ack({ ok: false, reason: "Not your turn" });

      const validation = game.validateMove(room.board, playerColor, from, to);
      if (!validation.ok) return ack && ack({ ok: false, reason: validation.reason });

      // Forced-capture enforcement
      const mustCapture = game.playerHasCapture(room.board, playerColor);
      if (mustCapture && !validation.capture) {
        return ack && ack({ ok: false, reason: "You must capture when capture is available" });
      }

      // Apply move
      room.board = game.applyMove(room.board, from, to);

      // push move to history
      room.moves = room.moves || [];
      room.moves.push({
        player: playerColor,
        from,
        to,
        capture: validation.capture || null,
        becomesKing: !!validation.becomesKing,
        timestamp: Date.now()
      });

      // chaining logic: if we just captured and the landing square has further captures, same player's turn
      let nextTurn = playerColor === "r" ? "b" : "r";
      if (validation.capture) {
        const jumpsFromLanding = game.possibleMovesFor(room.board, to).filter(dest => Math.abs(dest[0] - to[0]) === 2);
        if (jumpsFromLanding.length > 0) nextTurn = playerColor;
      }
      room.turn = nextTurn;

      // winner check
      const redHas = game.hasAnyMoves(room.board, game.RED);
      const blackHas = game.hasAnyMoves(room.board, game.BLACK);
      let winner = null;
      if (!redHas) winner = game.BLACK;
      if (!blackHas) winner = game.RED;

      io.to(room.id).emit("room-state", { ...sanitize(room), winner });
      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      console.error("make-move error:", err);
      if (typeof ack === "function") ack({ ok: false, reason: "Server error" });
    }
  });

  socket.on("request-rematch", (payload, ack) => {
    try {
      const { roomId } = socket.data || {};
      if (!roomId) return ack && ack({ ok: false, reason: "Not in a room" });
      const room = getRoom(roomId);
      if (!room) return ack && ack({ ok: false, reason: "Room not found" });

      setRematchRequest(room, socket.id);

      // count unique players in room, and who requested rematch
      const playersSocketIds = Object.keys(room.players); // socketIds of players
      const requesters = Object.keys(room.rematchRequests || {});
      io.to(room.id).emit("room-state", sanitize(room)); // broadcast updated rematchRequesters

      // if both players requested rematch -> reset the room and broadcast fresh state
      const allRequested = playersSocketIds.length > 0 && playersSocketIds.every(id => room.rematchRequests && room.rematchRequests[id]);
      if (allRequested) {
        resetRoom(room);
        io.to(room.id).emit("room-state", sanitize(room));
      }

      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      console.error("request-rematch error:", err);
      if (typeof ack === "function") ack({ ok: false, reason: "Server error" });
    }
  });

  socket.on("cancel-rematch", (payload, ack) => {
    try {
      const { roomId } = socket.data || {};
      if (!roomId) return ack && ack({ ok: false, reason: "Not in a room" });
      const room = getRoom(roomId);
      if (!room) return ack && ack({ ok: false, reason: "Room not found" });
      if (room.rematchRequests) {
        delete room.rematchRequests[socket.id];
      }
      io.to(room.id).emit("room-state", sanitize(room));
      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      console.error("cancel-rematch error:", err);
      if (typeof ack === "function") ack({ ok: false, reason: "Server error" });
    }
  });

  // Leave room
  socket.on("leave-room", ({ roomId } = {}) => {
    leaveRoom(roomId, socket.id);
    socket.leave(roomId);
    const room = getRoom(roomId);
    if (room) io.to(roomId).emit("room-state", sanitize(room));
  });

  socket.on("disconnect", () => {
    const { roomId } = socket.data || {};
    if (roomId) {
      removePlayer(roomId, socket.id);
      const room = getRoom(roomId);
      if (room) io.to(roomId).emit("room-state", sanitize(room));
    }
    console.log("socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log("Server listening on", PORT));
