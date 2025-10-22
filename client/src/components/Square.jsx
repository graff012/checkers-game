function isKing(piece) {
  if (!piece) return false;
  return piece === piece.toUpperCase();
}

export default function Square({ r, c, value, onClick, selected, isAllowed }) {
  const dark = (r + c) % 2 === 1;
  const cls = dark ? "square-dark" : "square-light";
  const extra = selected ? "ring-4 ring-yellow-300" : (isAllowed ? "ring-4 ring-green-400" : "");
  return (
    <div
      onClick={() => dark && onClick(r, c)}
      className={`${cls} w-16 h-16 flex items-center justify-center border ${extra}`}
    >
      {value && (
        <div className={`${value.toLowerCase() === "r" ? "piece-red" : "piece-black"} ${isKing(value) ? "piece-king" : ""}`}>
          {isKing(value) ? "K" : ""}
        </div>
      )}
    </div>
  );
}
