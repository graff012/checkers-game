
import Square from "./Square";

export default function Board({ board, onSquareClick, selected, allowedMoves }) {
  if (!board) return <div className="p-4">Waiting for game...</div>;
  const allowedSet = new Set(allowedMoves || []); // allowedMoves stored as "r,c" strings

  return (
    <div className="board">
      {board.map((row, r) =>
        row.map((cell, c) => (
          <Square
            key={`${r}-${c}`}
            r={r} c={c}
            value={cell}
            onClick={onSquareClick}
            selected={selected && selected[0] === r && selected[1] === c}
            isAllowed={allowedSet.has(`${r}, ${c}`)}
          />
        ))
      )}
    </div>
  );
}
