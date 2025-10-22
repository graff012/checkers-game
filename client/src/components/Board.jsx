import Square from "./Square";

export default function Board({ board, onSquareClick, selected, allowedMoves = [] }) {
  const allowedSet = new Set(allowedMoves); // strings "r,c"
  if (!board) return <div className="p-4">Waiting for game...</div>;

  return (
    <div className="board">
      {board.map((row, r) =>
        row.map((cell, c) => (
          <Square
            key={`${r}-${c}`}
            r={r}
            c={c}
            value={cell}
            onClick={onSquareClick}
            selected={selected && selected[0] === r && selected[1] === c}
            isAllowed={allowedSet.has(`${r},${c}`)}
          />
        ))
      )}
    </div>
  );
}
