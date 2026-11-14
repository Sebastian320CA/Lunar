const STORAGE_KEY = 'lunar-games.blocks.best';

/** Cargo bay size in cells. Editable example values, not data of a real lander. */
export const COLS = 10;
export const ROWS = 16;

/**
 * Editable example limits (NOT real mission figures): each cell is 1 unit of volume
 * and weighs `CELL_MASS_KG`; the lander may carry at most `MAX_MASS_KG`.
 */
export const CELL_MASS_KG = 5;
export const MAX_MASS_KG = 600;

export type Cell = 0 | 1;
export type Board = Cell[][];
export type Shape = readonly (readonly Cell[])[];

export interface Piece {
  shape: Shape;
  row: number;
  col: number;
  label: string;
}

export const SHAPES: Readonly<Record<string, Shape>> = {
  'Tank (I)': [[1, 1, 1, 1]],
  'Box (O)': [
    [1, 1],
    [1, 1],
  ],
  'Rover (T)': [
    [1, 1, 1],
    [0, 1, 0],
  ],
  'Panel (L)': [
    [1, 0],
    [1, 0],
    [1, 1],
  ],
  'Antenna (S)': [
    [0, 1, 1],
    [1, 1, 0],
  ],
};

export function emptyBoard(rows = ROWS, cols = COLS): Board {
  return Array.from({ length: rows }, () => Array<Cell>(cols).fill(0));
}

export function rotate(shape: Shape): Shape {
  const h = shape.length;
  const w = shape[0]?.length ?? 0;
  const out: Cell[][] = Array.from({ length: w }, () => Array<Cell>(h).fill(0));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) out[c]![h - 1 - r] = shape[r]![c]!;
  }
  return out;
}

/** True if the shape at (row, col) leaves the board or overlaps a filled cell. */
export function collides(board: Board, shape: Shape, row: number, col: number): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r]!.length; c++) {
      if (!shape[r]![c]) continue;
      const br = row + r;
      const bc = col + c;
      if (bc < 0 || bc >= (board[0]?.length ?? 0) || br >= board.length) return true;
      if (br >= 0 && board[br]![bc]) return true;
    }
  }
  return false;
}

/** Returns a new board with the shape locked in place. */
export function lockPiece(board: Board, shape: Shape, row: number, col: number): Board {
  const next = board.map((line) => line.slice());
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r]!.length; c++) {
      if (shape[r]![c] && next[row + r]?.[col + c] !== undefined) next[row + r]![col + c] = 1;
    }
  }
  return next;
}

/** Removes full rows (a fully packed layer) and adds empty rows on top. */
export function clearLines(board: Board): { board: Board; cleared: number } {
  const cols = board[0]?.length ?? COLS;
  const kept = board.filter((line) => !line.every((v) => v === 1));
  const cleared = board.length - kept.length;
  const fresh = Array.from({ length: cleared }, () => Array<Cell>(cols).fill(0));
  return { board: [...fresh, ...kept.map((l) => l.slice())], cleared };
}

export function countCells(board: Board): number {
  return board.reduce((s, line) => s + line.reduce<number>((a, v) => a + v, 0), 0);
}

export function massOf(cells: number, cellMassKg = CELL_MASS_KG): number {
  return cells * cellMassKg;
}

/** Score for cleared lines in one drop: 100, 300, 500, 800 for 1..4 lines. */
export function lineScore(cleared: number): number {
  return [0, 100, 300, 500, 800][Math.min(4, Math.max(0, cleared))] ?? 0;
}

/** Packing efficiency: filled volume as a percentage of the bay. */
export function packingPercent(board: Board): number {
  const total = board.length * (board[0]?.length ?? 0);
  return total === 0 ? 0 : (countCells(board) / total) * 100;
}

export function loadBestScore(): number {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const n = raw === null || raw === undefined ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(Math.round(score)));
  } catch {
    /* storage unavailable: score is kept in memory only */
  }
}

/** What the game teaches (the example numbers are editable, see CELL_MASS_KG / MAX_MASS_KG). */
export const BLOCKS_LEARNED_LINES: readonly string[] = [
  'A lander has limits on both volume (space) and mass (kilograms).',
  'Every kilogram sent to the Moon costs fuel, so packing tightly saves launches.',
  'Gaps are wasted volume: full layers score, empty space does not.',
  'Block masses and limits here are editable examples, not real mission values.',
];

export interface BlocksGameHandle {
  destroy(): void;
}

const CELL = 20;
const W = 420;
const H = ROWS * CELL;

/** Mounts the game. Keys: arrows move/soft-drop, Up or X rotate, Space hard drop, L learning screen, R restart. */
export function mountBlocksGame(container: HTMLElement): BlocksGameHandle {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Payload packing blocks game');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const names = Object.keys(SHAPES);
  const spawn = (): Piece => {
    const label = names[Math.floor(Math.random() * names.length)]!;
    const shape = SHAPES[label]!;
    return { shape, label, row: 0, col: Math.floor((COLS - shape[0]!.length) / 2) };
  };

  let board = emptyBoard();
  let piece = spawn();
  let score = 0;
  let best = loadBestScore();
  let over = false;
  let showLearned = false;
  let acc = 0;
  let prev = 0;
  let raf = 0;

  const restart = (): void => {
    board = emptyBoard();
    piece = spawn();
    score = 0;
    over = false;
  };

  const settle = (): void => {
    board = lockPiece(board, piece.shape, piece.row, piece.col);
    const res = clearLines(board);
    board = res.board;
    score += lineScore(res.cleared);
    piece = spawn();
    const heavy = massOf(countCells(board)) > MAX_MASS_KG;
    if (collides(board, piece.shape, piece.row, piece.col) || heavy) {
      over = true;
      if (score > best) {
        best = score;
        saveBestScore(best);
      }
    }
  };

  const step = (): void => {
    if (over) return;
    if (collides(board, piece.shape, piece.row + 1, piece.col)) settle();
    else piece.row += 1;
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'l' || e.key === 'L') showLearned = !showLearned;
    else if (e.key === 'r' || e.key === 'R') restart();
    else if (over) return;
    else if (e.key === 'ArrowLeft') {
      if (!collides(board, piece.shape, piece.row, piece.col - 1)) piece.col -= 1;
    } else if (e.key === 'ArrowRight') {
      if (!collides(board, piece.shape, piece.row, piece.col + 1)) piece.col += 1;
    } else if (e.key === 'ArrowDown') step();
    else if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') {
      const rot = rotate(piece.shape);
      if (!collides(board, rot, piece.row, piece.col)) piece.shape = rot;
    } else if (e.key === ' ') {
      while (!collides(board, piece.shape, piece.row + 1, piece.col)) piece.row += 1;
      settle();
    } else return;
    e.preventDefault();
  };
  canvas.addEventListener('keydown', onKey);

  const draw = (): void => {
    if (!ctx) return;
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#8a8a8a';
    board.forEach((line, r) =>
      line.forEach((v, c) => {
        if (v) ctx.fillRect(c * CELL, r * CELL, CELL - 1, CELL - 1);
      }),
    );
    ctx.fillStyle = '#4aa3ff';
    piece.shape.forEach((line, r) =>
      line.forEach((v, c) => {
        if (v) ctx.fillRect((piece.col + c) * CELL, (piece.row + r) * CELL, CELL - 1, CELL - 1);
      }),
    );
    const x = COLS * CELL + 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    const lines = [
      `Score ${score}`,
      `Best ${best}`,
      `Mass ${massOf(countCells(board))}/${MAX_MASS_KG} kg`,
      `Packed ${packingPercent(board).toFixed(0)}%`,
      `Next: ${piece.label}`,
      '',
      'Arrows: move',
      'Up/X: rotate',
      'Space: drop',
      'L: learned',
      'R: restart',
    ];
    lines.forEach((t, i) => ctx.fillText(t, x, 20 + i * 18));
    if (over) ctx.fillText('MISSION FULL - press R', x, 20 + lines.length * 18);
    if (showLearned) {
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      BLOCKS_LEARNED_LINES.forEach((t, i) => ctx.fillText(t, 10, 40 + i * 24));
    }
  };

  const frame = (now: number): void => {
    const dt = prev ? Math.min(0.25, (now - prev) / 1000) : 0;
    prev = now;
    if (!showLearned) acc += dt;
    while (acc >= 0.6) {
      acc -= 0.6;
      step();
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy(): void {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('keydown', onKey);
      canvas.remove();
    },
  };
}
