import React, { useState } from "react";

export default function Lobby({ onCreate, onJoin }) {
  const [roomInput, setRoomInput] = useState("");
  const [error, setError] = useState(null);

  function handleCreate() {
    setError(null);
    onCreate();
  }

  function handleJoinClick() {
    setError(null);
    if (!roomInput) {
      setError("Enter room code");
      return;
    }
    onJoin(roomInput);
  }

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex gap-3 mb-4">
        <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={handleCreate}>Create Room</button>
        <div className="flex items-center gap-2">
          <input className="border p-2 rounded" placeholder="Room code (e.g. A3Z9Q2)" value={roomInput} onChange={e => setRoomInput(e.target.value)} />
          <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={handleJoinClick}>Join</button>
        </div>
      </div>
      {error && <div className="text-red-600">{error}</div>}
      <div className="text-sm text-gray-500">You will get a reconnection token saved in localStorage so you can reload and rejoin automatically.</div>
    </div>
  );
}
