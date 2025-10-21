
import React, { useState } from "react";

export default function Lobby({ socket, onJoined }) {
  const [roomInput, setRoomInput] = useState("");
  const [error, setError] = useState(null);

  function createRoom() {
    socket.emit("create-room", {}, (res) => {
      if (res && res.ok) {
        onJoined(res.roomId, res.color, res.state);
      } else {
        setError("Failed to create room");
      }
    });
  }

  function joinRoom() {
    setError(null);
    if (!roomInput) return setError("Enter room code");
    socket.emit("join-room", { roomId: roomInput.toUpperCase() }, (res) => {
      if (res && res.ok) {
        onJoined(roomInput.toUpperCase(), res.color, res.state);
      } else {
        setError(res ? res.reason : "Join failed");
      }
    });
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={createRoom}>Create Room</button>
      </div>
      <div className="flex items-center gap-2">
        <input className="border p-2 rounded" value={roomInput} onChange={(e) => setRoomInput(e.target.value)} placeholder="Room code" />
        <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={joinRoom}>Join</button>
      </div>
      {error && <div className="text-red-600 mt-2">{error}</div>}
    </div>
  );
}
