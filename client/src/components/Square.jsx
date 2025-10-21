
export default function Square({ r, c, value, onClick, selected, isAllowed }) {
  const dark = (r + c) % 2 === 1;
  const cls = dark ? "square-dark" : "square-light";
  const allowedCls = isAllowed ? "ring-4 ring-green-400" : "";
  return (
    <div
      onClick={() => dark && onClick(r, c)}
      className={`${cls} w-16 h-16 flex items-center justify-center border border-black/10 ${selected ? "ring-4 ring-yellow-300" : ""} ${allowedCls}`}
    >
      { /* piece rendering unchanged */}
    </div>
  );
}
