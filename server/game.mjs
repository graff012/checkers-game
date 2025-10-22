// server/game.mjs
const EMPTY = null;
const RED = "r";
const BLACK = "b";
const RED_KING = "R";
const BLACK_KING = "B";

function createBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = RED;
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = BLACK;
    }
  }
  return board;
}

function inBoard(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isKing(piece) {
  return piece === RED_KING || piece === BLACK_KING;
}

function ownerOf(piece) {
  if (!piece) return null;
  return piece.toLowerCase() === RED ? RED : BLACK;
}

// returns promoted piece if needed
function maybeKing(row, piece) {
  if (!piece) return piece;
  if (piece === RED && row === 7) return RED_KING;
  if (piece === BLACK && row === 0) return BLACK_KING;
  return piece;
}

// Validate a move and report whether it would become a king
// Returns { ok, reason?, capture?: [r,c], becomesKing?: bool }
function validateMove(board, player, from, to) {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) {
    return { ok: false, reason: "Bad coordinates" };
  }
  const [fr, fc] = from;
  const [tr, tc] = to;
  if (!inBoard(fr, fc) || !inBoard(tr, tc)) return { ok: false, reason: "Out of bounds" };

  const piece = board[fr][fc];
  if (!piece) return { ok: false, reason: "No piece at source" };
  if (ownerOf(piece) !== player) return { ok: false, reason: "Not your piece" };
  if (board[tr][tc] !== EMPTY) return { ok: false, reason: "Destination not empty" };

  const dr = tr - fr;
  const dc = tc - fc;
  if (Math.abs(dr) !== Math.abs(dc)) return { ok: false, reason: "Must move diagonally" };

  // Single step move
  if (Math.abs(dr) === 1) {
    if (isKing(piece)) {
      const becomes = maybeKing(tr, piece) !== piece;
      return { ok: true, capture: null, becomesKing: becomes };
    } else {
      const forward = piece.toLowerCase() === RED ? 1 : -1;
      if (dr === forward) {
        const becomes = maybeKing(tr, piece) !== piece;
        return { ok: true, capture: null, becomesKing: becomes };
      } else {
        return { ok: false, reason: "Piece must move forward (unless king)" };
      }
    }
  }

  // Jump capture
  if (Math.abs(dr) === 2) {
    const mr = (fr + tr) / 2;
    const mc = (fc + tc) / 2;
    const mid = board[mr][mc];
    if (!mid) return { ok: false, reason: "No piece to capture" };
    if (ownerOf(mid) === ownerOf(piece)) return { ok: false, reason: "Cannot capture own piece" };
    const becomes = maybeKing(tr, piece) !== piece;
    return { ok: true, capture: [mr, mc], becomesKing: becomes };
  }

  return { ok: false, reason: "Move too far" };
}

// returns NEW board (no mutation) and applies promotion
function applyMove(board, from, to) {
  const newBoard = board.map(r => r.slice());
  const [fr, fc] = from;
  const [tr, tc] = to;
  const piece = newBoard[fr][fc];
  newBoard[fr][fc] = EMPTY;
  newBoard[tr][tc] = maybeKing(tr, piece);

  // if jump capture, remove captured piece
  if (Math.abs(tr - fr) === 2) {
    const mr = (fr + tr) / 2;
    const mc = (fc + tc) / 2;
    newBoard[mr][mc] = EMPTY;
  }

  return newBoard;
}

// possible destinations for a piece (single-step + single jmp)
function possibleMovesFor(board, from) {
  const [fr, fc] = from;
  const piece = board[fr][fc];
  if (!piece) return [];
  const deltas = isKing(piece) ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] :
    (piece.toLowerCase() === RED ? [[1, 1], [1, -1]] : [[-1, 1], [-1, -1]]);
  const res = [];
  for (const [dr, dc] of deltas) {
    const nr = fr + dr, nc = fc + dc;
    if (inBoard(nr, nc) && board[nr][nc] === EMPTY) res.push([nr, nc]);
    const jr = fr + 2 * dr, jc = fc + 2 * dc;
    const mr = fr + dr, mc = fc + dc;
    if (inBoard(jr, jc) && board[jr][jc] === EMPTY && board[mr][mc] && ownerOf(board[mr][mc]) !== ownerOf(piece)) {
      res.push([jr, jc]);
    }
  }
  return res;
}

function hasAnyMoves(board, player) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (ownerOf(p) !== player) continue;
      const moves = possibleMovesFor(board, [r, c]);
      if (moves.length) return true;
    }
  }
  return false;
}

function playerHasCapture(board, player) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (ownerOf(p) !== player) continue;
      const moves = possibleMovesFor(board, [r, c]);
      if (moves.some(([tr, tc]) => Math.abs(tr - r) === 2)) return true;
    }
  }
  return false;
}

export {
  createBoard,
  validateMove,
  applyMove,
  possibleMovesFor,
  hasAnyMoves,
  playerHasCapture,
  EMPTY, RED, BLACK, RED_KING, BLACK_KING
};
