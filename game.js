// ==========================================================
// MINI FARM GAME - base sencilla estilo Stardew Valley
// ==========================================================

// --- Configuración del grid ---
const TILE_SIZE = 32;       // tamaño de cada casilla en píxeles
const COLS = 15;            // columnas del mapa
const ROWS = 10;            // filas del mapa

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// --- Estados posibles de una casilla ---
// 'grass'   -> hierba normal, no se puede plantar aún
// 'tilled'  -> tierra labrada, lista para plantar
// 'planted' -> hay una semilla plantada, con una etapa de crecimiento
// 'watered' -> se puede combinar con planted (ver growthStage y watered)
const TILE_TYPES = {
  GRASS: 'grass',
  TILLED: 'tilled',
  PLANTED: 'planted',
};

// Cuántos "días" tarda un cultivo en estar listo
const DAYS_TO_GROW = 3;

// --- Estructura del mapa ---
// Creamos una matriz de objetos, uno por casilla
function createMap() {
  const map = [];
  for (let row = 0; row < ROWS; row++) {
    const rowArr = [];
    for (let col = 0; col < COLS; col++) {
      rowArr.push({
        type: TILE_TYPES.GRASS,
        watered: false,
        growthStage: 0, // 0 = recién plantado, DAYS_TO_GROW = listo para cosechar
      });
    }
    map.push(rowArr);
  }
  return map;
}

let map = createMap();

// --- Estado del jugador ---
const player = {
  x: 5,          // posición en columnas
  y: 5,          // posición en filas
  facing: 'down', // hacia dónde mira: 'up' | 'down' | 'left' | 'right'
};

// --- Estado general del juego ---
let day = 1;
let seedCount = 5;
let cropCount = 0;

const dayCounterEl = document.getElementById('day-counter');
const seedCountEl = document.getElementById('seed-count');
const cropCountEl = document.getElementById('crop-count');

function updateHUD() {
  dayCounterEl.textContent = `Día ${day}`;
  seedCountEl.textContent = seedCount;
  cropCountEl.textContent = cropCount;
}

// ==========================================================
// INPUT: mover jugador e interactuar
// ==========================================================
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowUp':
    case 'w':
      movePlayer(0, -1, 'up');
      break;
    case 'ArrowDown':
    case 's':
      movePlayer(0, 1, 'down');
      break;
    case 'ArrowLeft':
    case 'a':
      movePlayer(-1, 0, 'left');
      break;
    case 'ArrowRight':
    case 'd':
      movePlayer(1, 0, 'right');
      break;
    case ' ':
      e.preventDefault();
      interactWithTile();
      break;
    case 'n':
    case 'N':
      nextDay();
      break;
  }
  draw();
});

function movePlayer(dx, dy, direction) {
  player.facing = direction;
  const newX = player.x + dx;
  const newY = player.y + dy;

  // Comprobamos límites del mapa antes de mover
  if (newX >= 0 && newX < COLS && newY >= 0 && newY < ROWS) {
    player.x = newX;
    player.y = newY;
  }
}

// Devuelve la casilla a la que el jugador está mirando
function getFacingTile() {
  let tx = player.x;
  let ty = player.y;

  if (player.facing === 'up') ty -= 1;
  if (player.facing === 'down') ty += 1;
  if (player.facing === 'left') tx -= 1;
  if (player.facing === 'right') tx += 1;

  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return null;
  return map[ty][tx];
}

// Acción principal: labrar / plantar / regar / cosechar
// según en qué estado esté la casilla a la que miramos
function interactWithTile() {
  const tile = getFacingTile();
  if (!tile) return;

  if (tile.type === TILE_TYPES.GRASS) {
    // Labrar tierra
    tile.type = TILE_TYPES.TILLED;
    return;
  }

  if (tile.type === TILE_TYPES.TILLED) {
    // Plantar semilla (si tenemos alguna)
    if (seedCount > 0) {
      tile.type = TILE_TYPES.PLANTED;
      tile.growthStage = 0;
      tile.watered = false;
      seedCount--;
      updateHUD();
    }
    return;
  }

  if (tile.type === TILE_TYPES.PLANTED) {
    if (tile.growthStage >= DAYS_TO_GROW) {
      // Cosechar
      cropCount++;
      tile.type = TILE_TYPES.GRASS;
      tile.growthStage = 0;
      tile.watered = false;
      updateHUD();
    } else {
      // Regar (solo afecta si aún no está lista)
      tile.watered = true;
    }
    return;
  }
}

// Avanza un día: las plantas regadas crecen, y se "resetea" el riego
function nextDay() {
  day++;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const tile = map[row][col];
      if (tile.type === TILE_TYPES.PLANTED && tile.watered) {
        tile.growthStage = Math.min(tile.growthStage + 1, DAYS_TO_GROW);
      }
      tile.watered = false; // hay que regar cada día para seguir creciendo
    }
  }
  updateHUD();
}

// ==========================================================
// DIBUJADO
// ==========================================================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      drawTile(map[row][col], col, row);
    }
  }

  drawPlayer();
}

function drawTile(tile, col, row) {
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;

  // Color base según el tipo de casilla
  let color = '#7cb342'; // hierba
  if (tile.type === TILE_TYPES.TILLED) color = '#8d6e63';
  if (tile.type === TILE_TYPES.PLANTED) color = '#8d6e63';

  ctx.fillStyle = color;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  // Rejilla sutil para distinguir casillas
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

  // Si está regada, un tinte azulado encima
  if (tile.watered) {
    ctx.fillStyle = 'rgba(33, 150, 243, 0.25)';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  }

  // Dibujar la planta según su etapa de crecimiento
  if (tile.type === TILE_TYPES.PLANTED) {
    const progress = tile.growthStage / DAYS_TO_GROW; // 0 a 1
    const plantSize = TILE_SIZE * 0.2 + TILE_SIZE * 0.6 * progress;

    ctx.fillStyle = tile.growthStage >= DAYS_TO_GROW ? '#ff9800' : '#4caf50';
    ctx.beginPath();
    ctx.arc(
      x + TILE_SIZE / 2,
      y + TILE_SIZE / 2,
      plantSize / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawPlayer() {
  const x = player.x * TILE_SIZE;
  const y = player.y * TILE_SIZE;

  ctx.fillStyle = '#e53935';
  ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);

  // Pequeño indicador de hacia dónde mira el jugador
  ctx.fillStyle = '#000';
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const r = 4;

  if (player.facing === 'up') ctx.fillRect(cx - r / 2, y + 2, r, r);
  if (player.facing === 'down') ctx.fillRect(cx - r / 2, y + TILE_SIZE - 6, r, r);
  if (player.facing === 'left') ctx.fillRect(x + 2, cy - r / 2, r, r);
  if (player.facing === 'right') ctx.fillRect(x + TILE_SIZE - 6, cy - r / 2, r, r);
}

// ==========================================================
// INICIO
// ==========================================================
updateHUD();
draw();
