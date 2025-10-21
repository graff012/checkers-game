
// server/rooms.js
// Small helper to manage in-memory rooms

import { createBoard } from './game.js'
import { nanoid } from 'nanoid';

const rooms = {}; // in-memory store

function generateRoomCode() {
  return nanoid(6).toUpperCase();
}

function createRoom(creatorSocketId) {
  const id = generateRoomCode();
  const room = {
    id,
    board: createBoard(),
    players: {}, // socketId -> color
    socketsByColor: {}, // color -> socketId
    turn: "r",
    createdAt: Date.now()
  };
  room.players[creatorSocketId] = "r";
  room.socketsByColor["r"] = creatorSocketId;
  rooms[id] = room;
  return room;
}

function getRoom(id) {
  return rooms[id];
}

function joinRoom(id, socketId) {
  const room = rooms[id];
  if (!room) return { ok: false, reason: "Room not found" };
  if (Object.keys(room.players).length >= 2) return { ok: false, reason: "Room full" };
  const assign = room.socketsByColor["r"] ? "b" : "r";
  room.players[socketId] = assign;
  room.socketsByColor[assign] = socketId;
  return { ok: true, room, color: assign };
}

function leaveRoom(id, socketId) {
  const room = rooms[id];
  if (!room) return;
  if (room.players[socketId]) {
    const color = room.players[socketId];
    delete room.players[socketId];
    if (room.socketsByColor[color] === socketId) delete room.socketsByColor[color];
  }
  // optional cleanup of empty old rooms
  if (Object.keys(room.players).length === 0 && Date.now() - room.createdAt > 1000 * 60 * 5) {
    delete rooms[id];
  }
}

function sanitize(room) {
  if (!room) return null;
  return {
    id: room.id,
    board: room.board,
    playersCount: Object.keys(room.players).length,
    players: Object.values(room.players),
    turn: room.turn
  };
}

export { createRoom, getRoom, joinRoom, leaveRoom, sanitize, rooms };
