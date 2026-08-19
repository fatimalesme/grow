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
        decoration: null, // 'tree' | 'rock' | null
      });
    }
    map.push(rowArr);
  }

  scatterDecorations(map);
  return map;
}

// Reparte árboles y piedras al azar sobre la hierba, dejando libre
// una zona alrededor del punto de inicio del jugador para que no
// aparezcas encerrada
function scatterDecorations(map) {
  const safeZone = 2; // radio libre alrededor de (5,5), la posición inicial

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const nearStart =
        Math.abs(col - 5) <= safeZone && Math.abs(row - 5) <= safeZone;
      if (nearStart) continue;

      const roll = Math.random();
      if (roll < 0.08) {
        map[row][col].decoration = 'tree';
      } else if (roll < 0.13) {
        map[row][col].decoration = 'rock';
      }
    }
  }
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
let coins = 10;

// Precio de una semilla y cuánto vale cada zanahoria cosechada
const SEED_PRICE = 3;
const CROP_VALUE = 4;

// ==========================================================
// GUARDADO / CARGA
// ==========================================================
// Todo el estado del juego se agrupa aquí en UN solo objeto.
// Eso es lo importante: el día que cambiemos localStorage por una
// base de datos real (Firebase, Supabase...), esta es la única
// función que hay que tocar, el resto del juego no se entera.
const SAVE_KEY = 'grow-farm-save';

function getGameStateAsObject() {
  return {
    map,
    player,
    day,
    seedCount,
    cropCount,
    coins,
  };
}

function saveGame() {
  const state = getGameStateAsObject();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false; // no había partida guardada

  try {
    const state = JSON.parse(raw);

    // Restauramos cada pieza del estado global
    map = state.map;
    player.x = state.player.x;
    player.y = state.player.y;
    player.facing = state.player.facing;
    day = state.day;
    seedCount = state.seedCount;
    cropCount = state.cropCount;
    coins = state.coins ?? 10; // ?? por si la partida guardada es de antes de tener monedas

    return true;
  } catch (err) {
    console.error('No se pudo cargar la partida guardada:', err);
    return false;
  }
}const dayCounterEl = document.getElementById('day-number');
const timeIconEl = document.getElementById('time-icon');
const seedCountEl = document.getElementById('seed-count');
const cropCountEl = document.getElementById('crop-count');
const coinCountEl = document.getElementById('coin-count');
const buySeedBtn = document.getElementById('buy-seed-btn');

function updateHUD() {
  dayCounterEl.textContent = day;
  seedCountEl.textContent = seedCount;
  cropCountEl.textContent = cropCount;
  coinCountEl.textContent = coins;

  // Desactivamos el botón de compra si no llegan las monedas
  buySeedBtn.disabled = coins < SEED_PRICE;
}

// ==========================================================
// CICLO DE DÍA Y NOCHE (visual, en tiempo real)
// ==========================================================
// Un ciclo completo (amanecer -> mediodía -> atardecer -> noche) dura
// DAY_CYCLE_MS milisegundos reales. Es solo ambientación: no tiene que
// ver con el contador de "Día X" (ese avanza al pulsar N y hace crecer
// los cultivos). Esto es puramente para que se vea "vivo".
const DAY_CYCLE_MS = 30000; // 30 segundos = un ciclo completo

// Devuelve cuánto de "noche" hay ahora mismo: 1 = noche cerrada, 0 = pleno día
function getNightAmount() {
  const phase = (performance.now() % DAY_CYCLE_MS) / DAY_CYCLE_MS; // 0 a 1
  // coseno para que la transición sea suave (no lineal, más natural)
  return (Math.cos(phase * Math.PI * 2) + 1) / 2;
}

// Dibuja el "cielo" encima de todo: un tinte oscuro/azulado de noche,
// y uno anaranjado suave en las transiciones (amanecer/atardecer)
function drawSkyOverlay() {
  const night = getNightAmount(); // 0 a 1

  // Tinte azul oscuro de noche
  ctx.fillStyle = `rgba(20, 24, 60, ${night * 0.55})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Tinte anaranjado en las transiciones (más fuerte cuando "night"
  // ronda 0.5, o sea ni de día ni de noche del todo)
  const dawnDusk = 1 - Math.abs(night - 0.5) * 2; // pico en night=0.5
  ctx.fillStyle = `rgba(255, 140, 60, ${dawnDusk * 0.15})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Icono del HUD según si es de noche o de día
  timeIconEl.textContent = night > 0.5 ? '🌙' : '☀️';
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

  // Comprobamos límites del mapa
  if (newX < 0 || newX >= COLS || newY < 0 || newY >= ROWS) return;

  // No se puede caminar sobre árboles ni piedras
  const targetTile = map[newY][newX];
  if (targetTile.decoration) return;

  player.x = newX;
  player.y = newY;
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

  // Si hay un árbol o piedra, esa casilla no se puede labrar
  if (tile.decoration) return;

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
      saveGame();
    }
    return;
  }

  if (tile.type === TILE_TYPES.PLANTED) {
    if (tile.growthStage >= DAYS_TO_GROW) {
      // Cosechar
      cropCount++;
      coins += CROP_VALUE;
      tile.type = TILE_TYPES.GRASS;
      tile.growthStage = 0;
      tile.watered = false;
      updateHUD();
      saveGame();
    } else {
      // Regar (solo afecta si aún no está lista)
      tile.watered = true;
      saveGame();
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
  saveGame();
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
  drawSkyOverlay();
}

function drawTile(tile, col, row) {
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;

  // --- Base: hierba en dos tonos tipo "damero" para que no se vea plana ---
  const isDark = (col + row) % 2 === 0;
  let color = isDark ? '#7cb342' : '#8bc34a';

  if (tile.type === TILE_TYPES.TILLED || tile.type === TILE_TYPES.PLANTED) {
    color = isDark ? '#6d4c41' : '#795548';
  }

  ctx.fillStyle = color;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  // Surcos en la tierra labrada, para que se note la textura
  if (tile.type === TILE_TYPES.TILLED || tile.type === TILE_TYPES.PLANTED) {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let i = 6; i < TILE_SIZE; i += 8) {
      ctx.beginPath();
      ctx.moveTo(x + 2, y + i);
      ctx.lineTo(x + TILE_SIZE - 2, y + i);
      ctx.stroke();
    }
  }

  // Rejilla sutil para distinguir casillas
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

  // Si está regada, un tinte azulado brillante encima
  if (tile.watered) {
    ctx.fillStyle = 'rgba(33, 150, 243, 0.3)';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  }

  // Dibujar la planta según su etapa de crecimiento
  if (tile.type === TILE_TYPES.PLANTED) {
    drawPlant(tile, x, y);
  }

  // Dibujar decoración (árbol o piedra) encima de la hierba
  if (tile.decoration === 'tree') {
    drawTree(x, y);
  } else if (tile.decoration === 'rock') {
    drawRock(x, y);
  }
}

// Árbol simple: tronco marrón + copa en dos círculos superpuestos
function drawTree(x, y) {
  const cx = x + TILE_SIZE / 2;

  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx, y + TILE_SIZE - 3, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tronco
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(cx - 3, y + TILE_SIZE - 14, 6, 12);

  // Copa (dos círculos para que no se vea tan perfecta/redonda)
  ctx.fillStyle = '#2e7d32';
  ctx.beginPath();
  ctx.arc(cx - 4, y + 10, 9, 0, Math.PI * 2);
  ctx.arc(cx + 4, y + 8, 9, 0, Math.PI * 2);
  ctx.arc(cx, y + 14, 10, 0, Math.PI * 2);
  ctx.fill();
}

// Piedra: un par de formas grises superpuestas para que no sea un círculo perfecto
function drawRock(x, y) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2 + 4;

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(cx, y + TILE_SIZE - 4, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#9e9e9e';
  ctx.beginPath();
  ctx.arc(cx - 3, cy, 6, 0, Math.PI * 2);
  ctx.arc(cx + 4, cy + 1, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#bdbdbd';
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

// Dibuja una plantita con tallo + hojas, y un efecto de "pulso" cuando ya
// está lista para cosechar (usa performance.now() para animar sin frameworks)
function drawPlant(tile, x, y) {
  const progress = tile.growthStage / DAYS_TO_GROW; // 0 a 1
  const cx = x + TILE_SIZE / 2;
  const baseY = y + TILE_SIZE - 6;
  const stemHeight = 4 + 14 * progress;
  const ready = tile.growthStage >= DAYS_TO_GROW;

  // Tallo
  ctx.strokeStyle = '#33691e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx, baseY - stemHeight);
  ctx.stroke();

  // Hojas (dos óvalos a los lados), solo si ya creció un poco
  if (progress > 0.25) {
    ctx.fillStyle = '#66bb6a';
    ctx.beginPath();
    ctx.ellipse(cx - 4, baseY - stemHeight * 0.6, 4, 2, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 4, baseY - stemHeight * 0.6, 4, 2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fruto en la punta: crece y, si está listo, "pulsa" suavemente
  let fruitRadius = 3 + 4 * progress;
  if (ready) {
    const pulse = Math.sin(performance.now() / 250) * 1.2;
    fruitRadius += pulse;
  }

  ctx.fillStyle = ready ? '#ff9800' : '#a5d6a7';
  ctx.beginPath();
  ctx.arc(cx, baseY - stemHeight, fruitRadius, 0, Math.PI * 2);
  ctx.fill();

  // Brillito extra cuando está lista, para que llame la atención
  if (ready) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(cx - fruitRadius / 3, baseY - stemHeight - fruitRadius / 3, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const x = player.x * TILE_SIZE;
  const y = player.y * TILE_SIZE;
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;

  // Sombra elíptica debajo, da sensación de profundidad
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, y + TILE_SIZE - 4, TILE_SIZE / 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cuerpo redondeado en vez de cuadrado
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.arc(cx, cy, TILE_SIZE / 2 - 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b71c1c';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Ojitos que miran hacia la dirección en la que te mueves
  ctx.fillStyle = '#fff';
  const eyeOffset = 5;
  let eye1 = { x: cx - eyeOffset, y: cy - 2 };
  let eye2 = { x: cx + eyeOffset, y: cy - 2 };

  if (player.facing === 'up') { eye1.y -= 3; eye2.y -= 3; }
  if (player.facing === 'down') { eye1.y += 3; eye2.y += 3; }
  if (player.facing === 'left') { eye1.x -= 3; eye2.x -= 3; }
  if (player.facing === 'right') { eye1.x += 3; eye2.x += 3; }

  [eye1, eye2].forEach((eye) => {
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#000';
  [eye1, eye2].forEach((eye) => {
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ==========================================================
// INICIO
// ==========================================================
loadGame(); // si había partida guardada, la restauramos
updateHUD();

document.getElementById('reset-btn').addEventListener('click', () => {
  const confirmReset = confirm('¿Seguro que quieres borrar tu partida y empezar de nuevo?');
  if (!confirmReset) return;

  localStorage.removeItem(SAVE_KEY);
  map = createMap();
  player.x = 5;
  player.y = 5;
  player.facing = 'down';
  day = 1;
  seedCount = 5;
  cropCount = 0;
  coins = 10;
  updateHUD();
});

buySeedBtn.addEventListener('click', () => {
  if (coins < SEED_PRICE) return; // por seguridad, aunque el botón ya se desactiva

  coins -= SEED_PRICE;
  seedCount++;
  updateHUD();
  saveGame();
});

// Loop de animación: redibuja continuamente para que el pulso del
// cultivo maduro se vea fluido, sin depender de que pulses una tecla
function animationLoop() {
  draw();
  requestAnimationFrame(animationLoop);
}
animationLoop();