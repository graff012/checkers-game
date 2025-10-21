import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Lobby from "./components/Lobby";
import Board from "./components/Board";

const SERVER = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
const socket = io(SERVER);

export default function App() {
  const [status, setStatus] = useState("connecting...");
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [color, setColor] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [allowedMoves, setAllowedMoves] = useState([]);

  useEffect(() => {
    socket.on("connect", () => setStatus("connected: " + socket.id));
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("room-state", (s) => {
      setRoomState(s);
    });
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("room-state");
    };
  }, []);

  function handleJoined(rid, myColor, state) {
    setJoined(true);
    setRoomId(rid);
    setColor(myColor);
    setRoomState(state);
  }

  // in App.jsx
  function onSquareClick(r, c) {
    if (!roomState || !roomState.board) return; // safety

    const piece = roomState.board[r][c];

    // 1) No piece selected yet -> attempt to select one (ask server for allowed moves)
    if (!selected) {
      if (!piece) {
        setMessage("Select your piece");
        return;
      }
      if (piece.toLowerCase() !== color) {
        setMessage("That's not your piece");
        return;
      }

      // Ask server for allowed moves for this piece (authoritative)
      socket.emit("get-allowed-moves", { roomId, from: [r, c] }, (res) => {
        if (!res || !res.ok) {
          setMessage("Error getting allowed moves: " + (res ? res.reason : "no response"));
          return;
        }
        // res.moves is an array of [r,c] pairs
        const moveStrings = res.moves.map(m => m.join(","));
        setAllowedMoves(moveStrings); // e.g. ["2,3", "4,5"]
        setSelected([r, c]);
        setMessage("");
        // helpful debug:
        console.log("allowed moves for", [r, c], "=>", res.moves);
      });

      return;
    }

    // 2) A piece is already selected -> this click is a destination attempt
    // clicking the same square toggles selection off
    if (selected[0] === r && selected[1] === c) {
      setSelected(null);
      setAllowedMoves([]);
      setMessage("");
      return;
    }

    // Check that the clicked square is allowed
    const destKey = `${r},${c}`;
    if (!allowedMoves || !allowedMoves.includes(destKey)) {
      setMessage("That move is not allowed. Click a highlighted square.");
      // deselect for clarity
      setSelected(null);
      setAllowedMoves([]);
      return;
    }

    // Valid UI-level destination — emit to server
    socket.emit("make-move", { roomId, from: selected, to: [r, c] }, (res) => {
      if (!res || !res.ok) {
        setMessage("Move rejected: " + (res ? res.reason : "no response"));
      } else {
        setMessage("");
        // server will broadcast new room-state; UI will update from socket 'room-state' event
      }
    });

    // clear selection & allowed moves immediately (UI will update after server state)
    setSelected(null);
    setAllowedMoves([]);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Checkers — Learn Socket.IO</h1>
          <div className="text-sm text-gray-600">{status}</div>
        </header>

        {!joined ? (
          <Lobby socket={socket} onJoined={handleJoined} />
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="mb-2"><strong>Room:</strong> {roomId} <span className="ml-4">You: {color}</span></div>
              <Board
                board={roomState ? roomState.board : null}
                onSquareClick={onSquareClick}
                selected={selected}
                allowedMoves={allowedMoves}
              />
            </div>
            <div>
              <div className="mb-2"><strong>Turn:</strong> {roomState ? roomState.turn : "-"}</div>
              {roomState && roomState.winner && <div className="text-green-600">Winner: {roomState.winner}</div>}
              <div className="mt-4 text-red-600">{message}</div>
              <div className="mt-4">
                <button className="px-3 py-2 bg-gray-200 rounded" onClick={() => {
                  socket.emit("leave-room", { roomId });
                  setJoined(false);
                  setRoomId(null);
                  setColor(null);
                  setRoomState(null);
                  setSelected(null);
                }}>Leave</button>
              </div>
              <pre className="mt-6 p-3 bg-white border rounded text-xs">{JSON.stringify(roomState, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
