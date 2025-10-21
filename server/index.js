// server/index.js
import express from 'express'
import http from 'http'
import { Server } from 'socket.io';
import cors from 'cors'

import { createRoom, getRoom, joinRoom, leaveRoom, sanitize, rooms } from "./room.js"
import * as game from "./game.js";

const app = express();
app.use(cors());
app.get("/", (req, res) => res.send("Checkers server alive"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.on("create-room", (payload, ack) => {
    const room = createRoom(socket.id);
    socket.join(room.id);
    if (ack) ack({ ok: true, roomId: room.id, color: "r", state: sanitize(room) });
    io.to(room.id).emit("room-state", sanitize(room));
    console.log(`room ${room.id} created`);
  });

  socket.on("join-room", ({ roomId }, ack) => {
    if (!roomId) return ack && ack({ ok: false, reason: "Invalid room id" });
    const res = joinRoom(roomId.toUpperCase(), socket.id);
    if (!res.ok) return ack && ack({ ok: false, reason: res.reason });
    socket.join(roomId.toUpperCase());
    if (ack) ack({ ok: true, color: res.color, state: sanitize(res.room) });
    io.to(roomId.toUpperCase()).emit("room-state", sanitize(res.room));
    console.log(`${socket.id} joined ${roomId.toUpperCase()} as ${res.color}`);
  });

  // ===== make-move: core of step 3 =====
  // payload: { roomId, from: [r,c], to: [r,c] }
  socket.on("make-move", (payload, ack) => {
    try {
      const { roomId, from, to } = payload || {};
      if (!roomId) return ack && ack({ ok: false, reason: "Missing roomId" });
      const room = getRoom(roomId.toUpperCase());
      if (!room) return ack && ack({ ok: false, reason: "Room not found" });

      const playerColor = room.players[socket.id];
      if (!playerColor) return ack && ack({ ok: false, reason: "You are not in the room" });

      if (room.turn !== playerColor) return ack && ack({ ok: false, reason: "Not your turn" });

      // validate move using game.validateMove
      const validation = game.validateMove(room.board, playerColor, from, to);
      if (!validation.ok) return ack && ack({ ok: false, reason: validation.reason });

      // Enforce forced capture: if player has any capture anywhere, require this move to be a capture.
      const mustCapture = game.playerHasCapture(room.board, playerColor);
      if (mustCapture && !validation.capture) {
        return ack && ack({ ok: false, reason: "You must capture when a capture is available" });
      }

      // apply move
      room.board = game.applyMove(room.board, from, to);

      // handle multi-jump: if capture happened and another capture is available from 'to' coordinate,
      // keep same player's turn to chain capture. Otherwise switch turn.
      let nextTurn = room.turn === "r" ? "b" : "r";
      if (validation.capture) {
        const jumpMoves = game.possibleMovesFor(room.board, to).filter(dest => Math.abs(dest[0] - to[0]) === 2);
        if (jumpMoves.length > 0) {
          nextTurn = playerColor; // allow chain capture
        }
      }
      room.turn = nextTurn;

      // check victory: if opponent has no moves -> current player wins
      const redHas = game.hasAnyMoves(room.board, game.RED);
      const blackHas = game.hasAnyMoves(room.board, game.BLACK);
      let winner = null;
      if (!redHas) winner = game.BLACK;
      if (!blackHas) winner = game.RED;

      // broadcast whole updated room state
      io.to(room.id).emit("room-state", { ...sanitize(room), winner });

      if (ack) ack({ ok: true });
    } catch (err) {
      console.error("make-move error", err);
      if (ack) ack({ ok: false, reason: "Server error" });
    }
  });

  // client requests allowed moves for a single piece (from=[r,c])
  // ack receives { ok: true, moves: [[r,c], ...] }
  socket.on("get-allowed-moves", ({ roomId, from }, ack) => {
    if (!roomId || !from) return ack && ack({ ok: false, reason: "Bad request" });
    const room = getRoom(roomId.toUpperCase());
    if (!room) return ack && ack({ ok: false, reason: "Room not found" });
    const playerColor = room.players[socket.id];
    if (!playerColor) return ack && ack({ ok: false, reason: "You are not in the room" });

    // get all possible moves for the piece (server authoritative)
    const moves = game.possibleMovesFor(room.board, from) || [];

    // If player has captures somewhere, filter to only capture moves (distance 2)
    const mustCapture = game.playerHasCapture(room.board, playerColor);
    const filtered = mustCapture ? moves.filter(([tr, tc]) => Math.abs(tr - from[0]) === 2) : moves;

    return ack && ack({ ok: true, moves: filtered });
  });

  socket.on("leave-room", ({ roomId }) => {
    leaveRoom(roomId, socket.id);
    socket.leave(roomId);
    const room = getRoom(roomId);
    if (room) io.to(roomId).emit("room-state", sanitize(room));
  });

  socket.on("disconnect", (reason) => {
    // remove from any rooms
    for (const rid in rooms) {
      const room = rooms[rid];
      if (room.players[socket.id]) {
        leaveRoom(rid, socket.id);
        io.to(rid).emit("room-state", sanitize(room));
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log("Server listening on", PORT));
