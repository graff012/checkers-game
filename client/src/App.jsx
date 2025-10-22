import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Lobby from "./components/Lobby";
import Board from "./components/Board";

const SERVER = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
// create a single socket instance
const socket = io(SERVER, { autoConnect: true });

export default function App() {
  const [status, setStatus] = useState("connecting...");
  const [roomState, setRoomState] = useState(null);
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [color, setColor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [allowedMoves, setAllowedMoves] = useState([]); // ["r,c", ...]
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(localStorage.getItem("checkersToken") || null);
  const [rematchRequested, setRematchRequested] = useState(false);

  useEffect(() => {
    socket.on("connect", () => setStatus("connected: " + socket.id));
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("room-state", (s) => {
      setRoomState(s);

      try {
        const myId = socket.id;
        const reqs = s?.rematchRequesters || []
        setRematchRequested(reqs.includes(myId));
      } catch (err) {
        setRematchRequested(false)
        console.log('rematchRequested: ', err)
      }
    });

    // Attempt reconnect-with-token on startup if token exists
    if (token) {
      socket.emit("reconnect-with-token", { token }, (res) => {
        if (!res || !res.ok) {
          console.warn("reconnect-with-token failed:", res);
          localStorage.removeItem("checkersToken");
          setToken(null);
        } else {
          setRoomState(res.room);
          setColor(res.color);
          setRoomId(res.room.id);
          setJoined(true);
          console.log("reconnected with token as", res.color);
        }
      });
    }

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("room-state");
    };
  }, []); // run once

  function requestRematch() {
    socket.emit("request-rematch", {}, (res) => {
      if (!res || !res.ok) {
        setMessage("Rematch request failed: " + (res ? res.reason : "no response"));
        return;
      }
      setRematchRequested(true);
      setMessage("Rematch requested. Waiting for opponent...");
    });
  }

  function cancelRematch() {
    socket.emit("cancel-rematch", {}, (res) => {
      setRematchRequested(false);
      if (!res || !res.ok) {
        setMessage("Cancel rematch failed: " + (res ? res.reason : "no response"));
        return;
      }
      setMessage("Rematch canceled");
    });
  }

  // Helper to persist token and state after create/join
  function saveSession(tokenValue, room, assignedColor) {
    localStorage.setItem("checkersToken", tokenValue);
    setToken(tokenValue);
    setRoomState(room);
    setColor(assignedColor);
    setRoomId(room.id);
    setJoined(true);
  }

  // Create room (server returns { ok, room, token })
  function handleCreateRoom() {
    setMessage("");
    socket.emit("create-room", {}, (res) => {
      if (!res || !res.ok) {
        setMessage("Failed to create room");
        return;
      }
      saveSession(res.token, res.room, "r");
      setMessage("Room created. Share code: " + res.room.id);
    });
  }

  // Join room by id
  function handleJoinRoom(roomIdInput) {
    setMessage("");
    socket.emit("join-room", { roomId: roomIdInput.toUpperCase() }, (res) => {
      if (!res || !res.ok) {
        setMessage(res ? res.reason : "Join failed");
        return;
      }
      saveSession(res.token, res.room, res.color);
      setMessage("Joined room " + res.room.id);
    });
  }

  function handleLeave() {
    if (!roomId) return;
    socket.emit("leave-room", { roomId });
    localStorage.removeItem("checkersToken");
    setToken(null);
    setRoomState(null);
    setRoomId(null);
    setColor(null);
    setJoined(false);
    setSelected(null);
    setAllowedMoves([]);
    setMessage("");
  }

  function onSquareClick(r, c) {
    if (!roomState || !roomState.board) return;
    // guard: only allow interaction on your turn
    if (roomState.turn !== color) {
      setMessage("Wait for your turn");
      return;
    }

    const piece = roomState.board[r][c];

    // 1) selecting a piece
    if (!selected) {
      if (!piece) {
        setMessage("Select your piece");
        return;
      }
      if (piece.toLowerCase() !== color) {
        setMessage("That's not your piece");
        return;
      }
      // request allowed moves from server (authoritative)
      socket.emit("get-allowed-moves", { roomId: roomState.id, from: [r, c] }, (res) => {
        if (!res || !res.ok) {
          setMessage("Error getting allowed moves: " + (res ? res.reason : "no response"));
          return;
        }
        const moveStrings = res.moves.map(m => m.join(","));
        setAllowedMoves(moveStrings);
        setSelected([r, c]);
        setMessage("");
        console.log("allowed moves for", [r, c], "=>", res.moves);
      });
      return;
    }

    // 2) clicking same square -> deselect
    if (selected[0] === r && selected[1] === c) {
      setSelected(null);
      setAllowedMoves([]);
      setMessage("");
      return;
    }

    // 3) clicked destination, ensure it's allowed
    const destKey = `${r},${c}`;
    if (!allowedMoves.includes(destKey)) {
      setMessage("That move is not allowed. Click a highlighted square.");
      setSelected(null);
      setAllowedMoves([]);
      return;
    }

    // 4) send make-move to server (server re-validates)
    socket.emit("make-move", { from: selected, to: [r, c] }, (res) => {
      if (!res || !res.ok) {
        setMessage("Move rejected: " + (res ? res.reason : "no response"));
      } else {
        setMessage("");
      }
    });

    setSelected(null);
    setAllowedMoves([]);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Checkers — Learn Socket.IO</h1>
          <div className="text-sm text-gray-600">{status}</div>
        </header>

        {!joined ? (
          <Lobby onCreate={handleCreateRoom} onJoin={handleJoinRoom} />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <strong>Room:</strong> {roomId} &nbsp; <strong>You:</strong> {color}
              </div>
              <div>
                <button className="px-3 py-1 bg-gray-200 rounded" onClick={handleLeave}>Leave</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded ${roomState && roomState.turn === "r" ? "bg-red-600 text-white" : "bg-gray-200"}`}>
                      RED {roomState && roomState.turn === "r" ? "← turn" : ""}
                    </div>
                    <div className={`px-3 py-1 rounded ${roomState && roomState.turn === "b" ? "bg-gray-900 text-white" : "bg-gray-200"}`}>
                      BLACK {roomState && roomState.turn === "b" ? "← turn" : ""}
                    </div>
                    <div className="ml-4 text-sm text-gray-600">You: {color}</div>
                    {roomState && roomState.mustCapture && roomState.mustCapture.length > 0 && (
                      <div className="ml-4 text-sm text-red-600">Must capture: {roomState.mustCapture.map(p => `[${p.join(",")}]`).join(" ")}</div>
                    )}
                  </div>
                </div>

                {/* Board */}
                <Board
                  board={roomState ? roomState.board : null}
                  onSquareClick={onSquareClick}
                  selected={selected}
                  allowedMoves={allowedMoves}
                />

                {/* Rematch UI: shown when there's a winner */}
                {roomState && roomState.winner && (
                  <div className="mt-4">
                    <div className="text-lg font-bold">Game over — Winner: {roomState.winner}</div>
                    <div className="mt-2">
                      {!rematchRequested ? (
                        <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={requestRematch}>Request Rematch</button>
                      ) : (
                        <button className="px-3 py-2 bg-gray-300 rounded" onClick={cancelRematch}>Cancel Rematch</button>
                      )}
                      <div className="mt-2 text-sm text-gray-600">
                        {roomState.rematchRequesters && roomState.rematchRequesters.length > 0 && (
                          <div>Rematch requested by {roomState.rematchRequesters.length} player(s)</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-2"><strong>Turn:</strong> {roomState ? roomState.turn : "-"}</div>
                  {roomState && roomState.winner && <div className="text-green-600">Winner: {roomState.winner}</div>}
                  <div className="mt-4 text-red-600">{message}</div>

                  <div className="mt-6">
                    <h4 className="font-semibold mb-2">Moves</h4>
                    <ol className="list-decimal pl-5 max-h-64 overflow-auto text-sm bg-white p-2 border rounded">
                      {roomState && roomState.moves && roomState.moves.length > 0 ? (
                        roomState.moves.map((m, idx) => (
                          <li key={idx}>
                            <strong>{m.player}</strong>: [{m.from.join(",")}] → [{m.to.join(",")}] {m.capture ? `x [${m.capture.join(",")}]` : ""} {m.becomesKing ? " (king!)" : ""}
                          </li>
                        ))
                      ) : (
                        <li>No moves yet</li>
                      )}
                    </ol>
                  </div>

                  <div className="mt-6 text-xs text-gray-500">
                    <div>Tip: click your piece to select, click highlighted square to move. Server enforces rules.</div>
                  </div>
                </div>
              </div>
            </>
        )}
          </div>
      </div>
      );
}
