const ROWS = 6;
const COLS = 7;
let grid;
let player;
let over;
let activeMove;
let confettiTimeout;
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');

function setCheckerColor(checker, color) {
  document.documentElement.style.setProperty(`--checker-${checker}`, color);
  localStorage.setItem(`connect4-${checker}-color`, color);
}

function loadCheckerColors() {
  document.querySelectorAll('[data-checker]').forEach(input => {
    const checker = input.dataset.checker;
    const savedColor = localStorage.getItem(`connect4-${checker}-color`);
    if (savedColor) input.value = savedColor;
    setCheckerColor(checker, input.value);
    input.addEventListener('input', () => setCheckerColor(checker, input.value));
  });
}

function reset() {
  clearConfetti();
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  player = 'red';
  over = false;
  activeMove = null;
  render();
}

function render(animatedMove) {
  boardEl.innerHTML = '';
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLS; column++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + (grid[row][column] ? ' ' + grid[row][column] : '');
      cell.onclick = () => drop(column);
      boardEl.appendChild(cell);

      if (animatedMove && row === animatedMove.row && column === animatedMove.column) {
        animateDrop(cell, animatedMove);
      }
    }
  }
  if (!over) statusEl.textContent = player + "'s turn";
}

function drop(column) {
  if (over || activeMove) return;

  for (let row = ROWS - 1; row >= 0; row--) {
    if (grid[row][column]) continue;

    grid[row][column] = player;
    activeMove = { row, column, player };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      completeMove(activeMove);
    } else {
      render(activeMove);
    }
    return;
  }
}

function animateDrop(cell, move) {
  const cellSize = cell.getBoundingClientRect().height;
  const gap = parseFloat(getComputedStyle(boardEl).rowGap);
  cell.style.setProperty('--drop-distance', `${(move.row + 1) * (cellSize + gap)}px`);
  cell.style.setProperty('--drop-duration', `${.2 + (move.row + 1) * .06}s`);
  cell.classList.add('dropping');
  cell.addEventListener('animationend', () => completeMove(move), { once: true });
}

function completeMove(move) {
  if (activeMove !== move) return;

  const didWin = wins(move.row, move.column, move.player);
  if (didWin) {
    over = true;
    statusEl.textContent = move.player + ' wins!';
  } else if (grid.every(rowCells => rowCells.every(Boolean))) {
    over = true;
    statusEl.textContent = 'Draw!';
  } else {
    player = move.player === 'red' ? 'yellow' : 'red';
  }
  activeMove = null;
  render();
  if (didWin) celebrate(move.player);
}

function celebrate(checker) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  clearConfetti();
  const confetti = document.createElement('div');
  confetti.id = 'confetti';
  confetti.setAttribute('aria-hidden', 'true');
  confetti.style.setProperty('--confetti-primary', getComputedStyle(document.documentElement).getPropertyValue(`--checker-${checker}`));

  const pieces = document.createDocumentFragment();
  for (let pieceNumber = 0; pieceNumber < 100; pieceNumber++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.setProperty('--left', `${Math.random() * 100}vw`);
    piece.style.setProperty('--drift', `${-12 + Math.random() * 24}vw`);
    piece.style.setProperty('--rotation', `${360 + Math.random() * 720}deg`);
    piece.style.setProperty('--duration', `${1.8 + Math.random() * 1.5}s`);
    piece.style.setProperty('--delay', `${Math.random() * .45}s`);
    piece.style.setProperty('--piece-color', pieceNumber % 5 === 0 ? 'var(--aqua-bright)' : 'var(--confetti-primary)');
    pieces.appendChild(piece);
  }
  confetti.appendChild(pieces);
  document.body.appendChild(confetti);
  confettiTimeout = window.setTimeout(clearConfetti, 4000);
}

function clearConfetti() {
  window.clearTimeout(confettiTimeout);
  document.getElementById('confetti')?.remove();
}

function wins(row, column, checker) {
  return [[0, 1], [1, 0], [1, 1], [1, -1]].some(([rowStep, columnStep]) => {
    let count = 1;
    for (const direction of [1, -1]) {
      let currentRow = row + rowStep * direction;
      let currentColumn = column + columnStep * direction;
      while (grid[currentRow] && grid[currentRow][currentColumn] === checker) {
        count++;
        currentRow += rowStep * direction;
        currentColumn += columnStep * direction;
      }
    }
    return count >= 4;
  });
}

document.getElementById('reset').onclick = reset;
loadCheckerColors();
reset();
