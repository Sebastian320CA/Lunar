import { describe, it, expect } from 'vitest';
import {
  emptyBoard,
  collides,
  lockPiece,
  clearLines,
  rotate,
  lineScore,
  countCells,
  massOf,
  COLS,
  ROWS,
} from './blocks';

describe('blocks logic', () => {
  it('detects wall, floor and block collisions', () => {
    const b = emptyBoard();
    const box = [
      [1, 1],
      [1, 1],
    ] as const;
    expect(collides(b, box, 0, -1)).toBe(true);
    expect(collides(b, box, 0, COLS - 1)).toBe(true);
    expect(collides(b, box, ROWS - 1, 0)).toBe(true);
    expect(collides(b, box, ROWS - 2, 0)).toBe(false);
    const locked = lockPiece(b, box, ROWS - 2, 0);
    expect(collides(locked, box, ROWS - 3, 0)).toBe(true);
    expect(countCells(locked)).toBe(4);
  });

  it('clears full lines and shifts the rest down', () => {
    let b = emptyBoard();
    b = lockPiece(b, [Array(COLS).fill(1)] as never, ROWS - 1, 0);
    b = lockPiece(b, [[1]], ROWS - 2, 3);
    const res = clearLines(b);
    expect(res.cleared).toBe(1);
    expect(res.board[ROWS - 1]![3]).toBe(1);
    expect(countCells(res.board)).toBe(1);
    expect(res.board.length).toBe(ROWS);
  });

  it('rotates and scores', () => {
    expect(rotate([[1, 1, 1, 1]])).toEqual([[1], [1], [1], [1]]);
    expect(lineScore(2)).toBe(300);
    expect(massOf(4, 5)).toBe(20);
  });
});
