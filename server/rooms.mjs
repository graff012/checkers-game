// server/rooms.mjs
import { nanoid } from "nanoid";
import * as game from "./game.mjs";

const rooms = {}; // in-memory store

function generateRoomCode() {
  return nanoid(6).toUpperCase();
}

function createRoom(creatorSocketId) {
  const id = generateRoomCode();
  const board = game.createBoard();
  const room = {
    id,
    board,
    players: {},         // socketId -> color
    socketsByColor: {},  // color -> socketId
    turn: "r",
    moves: [],
    rematchRequests: {}, // socketId -> true
    createdAt: Date.now()
  };
  room.players[creatorSocketId] = "r";
  room.socketsByColor["r"] = creatorSocketId;
  rooms[id] = room;
  return room;
}

function getRoom(roomId) {
  if (!roomId) return null;
  return rooms[String(roomId).toUpperCase()] || null;
}

function joinRoom(roomId, socketId) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, reason: "Room not found" };
  if (Object.keys(room.players).length >= 2) return { ok: false, reason: "Room full" };
  const colorToAssign = room.socketsByColor["r"] ? "b" : "r";
  room.players[socketId] = colorToAssign;
  room.socketsByColor[colorToAssign] = socketId;
  return { ok: true, color: colorToAssign, room };
}

function leaveRoom(roomId, socketId) {
  const room = getRoom(roomId);
  if (!room) return;
  if (room.players[socketId]) {
    const color = room.players[socketId];
    delete room.players[socketId];
    if (room.socketsByColor[color] === socketId) delete room.socketsByColor[color];
  }
  // reset rematch requests if someone leaves
  if (room.rematchRequests && Object.keys(room.rematchRequests).length) {
    room.rematchRequests = {};
  }
  if (Object.keys(room.players).length === 0 && Date.now() - room.createdAt > 1000 * 60 * 5) {
    delete rooms[roomId];
  }
}

function removePlayer(roomId, socketId) {
  // same as leaveRoom for now
  leaveRoom(roomId, socketId);
}

function resetRoom(room) {
  // Reset board to a new game while keeping the same players and sockets mapping
  room.board = game.createBoard();
  room.turn = "r";
  room.moves = [];
  room.rematchRequests = {};
  // keep createdAt unchanged
}

function setRematchRequest(room, socketId) {
  if (!room) return;
  room.rematchRequests = room.rematchRequests || {};
  room.rematchRequests[socketId] = true;
}

function clearRematchRequests(room) {
  if (!room) return;
  room.rematchRequests = {};
}

function sanitize(room) {
  if (!room) return null;

  // compute mustCapture only for the current player (room.turn)
  const mustCapture = [];
  const current = room.turn;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = room.board[r][c];
      if (!p) continue;
      if (p.toLowerCase() !== current) continue;
      const moves = game.possibleMovesFor(room.board, [r, c]);
      if (moves.some(([tr, tc]) => Math.abs(tr - r) === 2)) mustCapture.push([r, c]);
    }
  }

  // expose rematch status as list of players who requested rematch (socketIds)
  const rematchRequesters = room.rematchRequests ? Object.keys(room.rematchRequests) : [];

  return {
    id: room.id,
    board: room.board,
    playersCount: Object.keys(room.players).length,
    players: Object.values(room.players),
    turn: room.turn,
    moves: room.moves || [],
    mustCapture,
    rematchRequesters
  };
}

export {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  removePlayer,
  resetRoom,
  setRematchRequest,
  clearRematchRequests,
  sanitize,
  rooms
};
