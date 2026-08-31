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

// --- Tipos de cultivo disponibles ---
// Cada uno tiene su propio tiempo de crecimiento, precio de semilla,
// y cuánto paga al venderlo. Esto es lo que le da algo de estrategia
// al juego: la zanahoria es rápida y segura, la calabaza tarda más
// pero da más beneficio por unidad.
const CROP_TYPES = {
  carrot: {
    name: 'Zanahoria',
    emoji: '🥕',
    growDays: 3,
    seedPrice: 3,
    sellValue: 4,
    matureColor: '#ff9800',
    youngColor: '#a5d6a7',
  },
  pumpkin: {
    name: 'Calabaza',
    emoji: '🎃',
    growDays: 6,
    seedPrice: 6,
    sellValue: 12,
    matureColor: '#e65100',
    youngColor: '#aed581',
  },
};

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
        growthStage: 0, // 0 = recién plantado, hasta growDays del cultivo = listo
        cropType: null, // 'carrot' | 'pumpkin' | null (qué está plantado aquí)
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

// ==========================================================
// SONIDO (generado por código, sin archivos de audio externos)
// ==========================================================
// Usamos la Web Audio API para crear "pitidos" cortos. Es la forma
// más simple de tener sonido sin tener que buscar/alojar archivos .mp3.
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(frequency, duration = 0.1, type = 'sine') {
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = type; // 'sine' = tono suave, 'square' = más "retro"
  oscillator.frequency.value = frequency;

  // El volumen baja poco a poco (fade out) para que no suene un "clic" seco
  gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + duration);
}

// Sonidos concretos para cada acción del juego
const sounds = {
  till: () => playSound(200, 0.08, 'square'),
  plant: () => playSound(400, 0.1),
  water: () => playSound(600, 0.08),
  harvest: () => playSound(800, 0.15),
  buy: () => playSound(500, 0.1, 'square'),
  levelUp: () => {
    // Una pequeña melodía ascendente, más festiva
    [523, 659, 784, 1046].forEach((freq, i) => {
      setTimeout(() => playSound(freq, 0.15), i * 90);
    });
  },
  quest: () => {
    [660, 880].forEach((freq, i) => {
      setTimeout(() => playSound(freq, 0.12), i * 100);
    });
  },
};

// --- Estado del jugador ---
const player = {
  x: 5,          // posición LÓGICA en columnas (la casilla real donde estás)
  y: 5,          // posición LÓGICA en filas
  pixelX: 5 * TILE_SIZE, // posición VISUAL en píxeles (se desliza hacia x/y)
  pixelY: 5 * TILE_SIZE,
  facing: 'down', // hacia dónde mira: 'up' | 'down' | 'left' | 'right'
};

// --- Estado general del juego ---
let day = 1;
let seedCounts = { carrot: 5, pumpkin: 0 }; // cuántas semillas de cada tipo tenemos
let selectedSeed = 'carrot'; // qué semilla se planta al pulsar Espacio
let cropCount = 0;
let coins = 10;
let streak = 0; // racha de días JUGADOS SEGUIDOS (fechas reales, no días del juego)

// --- Nivel y experiencia ---
let level = 1;
let xp = 0;

// Cuánta XP hace falta para pasar del nivel actual al siguiente.
// Sube un poco cada nivel, así cuesta más subir cuanto más alto estás.
function xpNeededForLevel(lvl) {
  return lvl * 20;
}

// XP que da cada acción del juego
const XP_REWARDS = {
  till: 1,
  plant: 2,
  water: 1,
  harvest: 5,
};

// Suma XP y comprueba si con eso subes de nivel (puede subir varios
// niveles de golpe si ganaste mucha XP de una vez)
function addXP(amount) {
  xp += amount;

  while (xp >= xpNeededForLevel(level)) {
    xp -= xpNeededForLevel(level);
    level++;
    const bonus = level * 10;
    coins += bonus;
    sounds.levelUp();
    showToast(`⭐ ¡Nivel ${level}! +${bonus} monedas`, '#4527a0');
  }
}

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
    seedCounts,
    cropCount,
    coins,
    streak,
    lastPlayedDate,
    level,
    xp,
    completedQuests,
    pumpkinsHarvested,
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
    player.pixelX = state.player.x * TILE_SIZE;
    player.pixelY = state.player.y * TILE_SIZE;
    player.facing = state.player.facing;
    day = state.day;
    cropCount = state.cropCount;
    coins = state.coins ?? 10;
    streak = state.streak ?? 0;
    lastPlayedDate = state.lastPlayedDate ?? null;
    level = state.level ?? 1;
    xp = state.xp ?? 0;
    completedQuests = state.completedQuests ?? [];
    pumpkinsHarvested = state.pumpkinsHarvested ?? 0;

    // seedCounts es nuevo: si la partida guardada es de una versión
    // vieja (tenía "seedCount" a secas), lo convertimos al nuevo formato
    if (state.seedCounts) {
      seedCounts = state.seedCounts;
    } else if (typeof state.seedCount === 'number') {
      seedCounts = { carrot: state.seedCount, pumpkin: 0 };
    }

    // Asegurar que las casillas viejas (de antes de tener cropType)
    // tengan el campo, para que no quede undefined
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const tile = map[row][col];
        if (tile.type === TILE_TYPES.PLANTED && !tile.cropType) {
          tile.cropType = 'carrot';
        }
      }
    }

    return true;
  } catch (err) {
    console.error('No se pudo cargar la partida guardada:', err);
    return false;
  }
}

// ==========================================================
// RACHA DIARIA (streak) — el gancho de "vuelve mañana"
// ==========================================================
// Comparamos la fecha real de hoy con la última vez que jugaste.
// - Si es el mismo día: no pasa nada, ya contaste hoy.
// - Si es justo el día siguiente: la racha sube y te doy monedas de bonus.
// - Si dejaste pasar más de un día: la racha se rompe y vuelve a 1.
let lastPlayedDate = null;

function todayString() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function checkDailyStreak() {
  const today = todayString();

  if (lastPlayedDate === today) {
    return; // ya jugaste hoy, no hacemos nada más
  }

  if (lastPlayedDate === null) {
    // Primera vez que se juega nunca
    streak = 1;
  } else {
    const prev = new Date(lastPlayedDate);
    const curr = new Date(today);
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Volviste justo al día siguiente: ¡racha!
      streak++;
      const bonus = streak * 5;
      coins += bonus;
      showToast(`🔥 ¡Racha de ${streak} días! +${bonus} monedas`, '#ff6f00');
    } else {
      // Dejaste pasar más de un día: se rompe la racha
      streak = 1;
      showToast('Racha reiniciada. ¡Vuelve mañana para empezar otra!', '#455a64');
    }
  }

  lastPlayedDate = today;
  saveGame();
}

// Aviso emergente genérico (racha, nivel, misiones...). Se puede
// llamar varias veces seguidas: cada llamada apila un mensaje nuevo.
function showToast(message, color = '#ff6f00') {
  const toast = document.getElementById('streak-toast');
  toast.textContent = message;
  toast.style.background = color;
  toast.classList.add('visible');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 4000);
}

// ==========================================================
// MISIONES / LOGROS
// ==========================================================
// Cada misión tiene un id único, una descripción, una función
// "progress" que calcula cuánto llevas hecho, un "target" (meta),
// y una recompensa en monedas al completarla.
const QUESTS = [
  {
    id: 'first_harvest',
    description: 'Cosecha tu primer cultivo',
    target: 1,
    progress: () => cropCount,
    reward: 15,
  },
  {
    id: 'harvest_10',
    description: 'Cosecha 10 cultivos en total',
    target: 10,
    progress: () => cropCount,
    reward: 40,
  },
  {
    id: 'reach_level_3',
    description: 'Alcanza el nivel 3',
    target: 3,
    progress: () => level,
    reward: 30,
  },
  {
    id: 'grow_pumpkin',
    description: 'Cosecha tu primera calabaza',
    target: 1,
    progress: () => pumpkinsHarvested,
    reward: 25,
  },
  {
    id: 'streak_3',
    description: 'Consigue una racha de 3 días',
    target: 3,
    progress: () => streak,
    reward: 50,
  },
];

let completedQuests = []; // ids de misiones ya completadas
let pumpkinsHarvested = 0; // contador aparte, para la misión de calabaza

// Revisa todas las misiones activas y completa las que ya se cumplieron
function checkQuests() {
  QUESTS.forEach((quest) => {
    if (completedQuests.includes(quest.id)) return; // ya estaba completa

    if (quest.progress() >= quest.target) {
      completedQuests.push(quest.id);
      coins += quest.reward;
      sounds.quest();
      showToast(`✅ Misión cumplida: ${quest.description} (+${quest.reward} 🪙)`, '#2e7d32');
    }
  });

  renderQuestList();
}

// Dibuja la lista de misiones en el panel lateral del HUD
function renderQuestList() {
  const list = document.getElementById('quest-list');
  list.innerHTML = '';

  QUESTS.forEach((quest) => {
    const done = completedQuests.includes(quest.id);
    const current = Math.min(quest.progress(), quest.target);

    const item = document.createElement('li');
    item.className = done ? 'quest-done' : '';
    item.textContent = done
      ? `✅ ${quest.description}`
      : `⬜ ${quest.description} (${current}/${quest.target})`;
    list.appendChild(item);
  });
}
const dayCounterEl = document.getElementById('day-number');
const timeIconEl = document.getElementById('time-icon');
const carrotSeedCountEl = document.getElementById('carrot-seed-count');
const pumpkinSeedCountEl = document.getElementById('pumpkin-seed-count');
const cropCountEl = document.getElementById('crop-count');
const coinCountEl = document.getElementById('coin-count');
const streakCountEl = document.getElementById('streak-count');
const levelEl = document.getElementById('level-count');
const xpBarFillEl = document.getElementById('xp-bar-fill');
const xpLabelEl = document.getElementById('xp-label');
const buyCarrotBtn = document.getElementById('buy-carrot-btn');
const buyPumpkinBtn = document.getElementById('buy-pumpkin-btn');
const seedSelectorEls = document.querySelectorAll('.seed-option');

function updateHUD() {
  dayCounterEl.textContent = day;
  carrotSeedCountEl.textContent = seedCounts.carrot;
  pumpkinSeedCountEl.textContent = seedCounts.pumpkin;
  cropCountEl.textContent = cropCount;
  coinCountEl.textContent = coins;
  streakCountEl.textContent = streak;

  levelEl.textContent = level;
  const needed = xpNeededForLevel(level);
  xpBarFillEl.style.width = `${(xp / needed) * 100}%`;
  xpLabelEl.textContent = `${xp} / ${needed} XP`;

  buyCarrotBtn.disabled = coins < CROP_TYPES.carrot.seedPrice;
  buyPumpkinBtn.disabled = coins < CROP_TYPES.pumpkin.seedPrice;

  // Resaltar visualmente qué semilla está seleccionada para plantar
  seedSelectorEls.forEach((el) => {
    el.classList.toggle('selected', el.dataset.crop === selectedSeed);
  });
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
  // Los navegadores bloquean el audio hasta la primera interacción
  // del usuario; nos aseguramos de "despertarlo" aquí.
  if (audioCtx.state === 'suspended') audioCtx.resume();

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
    case '1':
      selectedSeed = 'carrot';
      updateHUD();
      break;
    case '2':
      selectedSeed = 'pumpkin';
      updateHUD();
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

  // Solo actualizamos la posición LÓGICA. La posición visual
  // (pixelX/pixelY) se desliza sola hacia esta cada frame,
  // ver updatePlayerVisualPosition() en el loop de animación.
  player.x = newX;
  player.y = newY;
}

// Hace que la posición visual del jugador (en píxeles) se acerque
// suavemente a su posición lógica (en casillas) cada frame. Esto es
// lo que da la sensación de "deslizarse" en vez de saltar de golpe.
function updatePlayerVisualPosition() {
  const targetX = player.x * TILE_SIZE;
  const targetY = player.y * TILE_SIZE;

  // 0.25 = qué tan rápido "alcanza" el destino (más alto = más rápido)
  const smoothing = 0.25;
  player.pixelX += (targetX - player.pixelX) * smoothing;
  player.pixelY += (targetY - player.pixelY) * smoothing;

  // Si ya está muy cerca, lo dejamos exacto (evita que quede
  // temblando por decimales infinitesimales para siempre)
  if (Math.abs(targetX - player.pixelX) < 0.5) player.pixelX = targetX;
  if (Math.abs(targetY - player.pixelY) < 0.5) player.pixelY = targetY;
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
    sounds.till();
    addXP(XP_REWARDS.till);
    saveGame();
    return;
  }

  if (tile.type === TILE_TYPES.TILLED) {
    // Plantar la semilla actualmente seleccionada (si tenemos alguna)
    if (seedCounts[selectedSeed] > 0) {
      tile.type = TILE_TYPES.PLANTED;
      tile.cropType = selectedSeed;
      tile.growthStage = 0;
      tile.watered = false;
      seedCounts[selectedSeed]--;
      sounds.plant();
      addXP(XP_REWARDS.plant);
      updateHUD();
      saveGame();
    }
    return;
  }

  if (tile.type === TILE_TYPES.PLANTED) {
    const crop = CROP_TYPES[tile.cropType];

    if (tile.growthStage >= crop.growDays) {
      // Cosechar: cada cultivo paga distinto según su sellValue
      cropCount++;
      coins += crop.sellValue;
      if (tile.cropType === 'pumpkin') pumpkinsHarvested++;

      tile.type = TILE_TYPES.GRASS;
      tile.cropType = null;
      tile.growthStage = 0;
      tile.watered = false;

      sounds.harvest();
      addXP(XP_REWARDS.harvest);
      updateHUD();
      checkQuests();
      saveGame();
    } else {
      // Regar (solo afecta si aún no está lista)
      tile.watered = true;
      sounds.water();
      addXP(XP_REWARDS.water);
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
        const maxGrowth = CROP_TYPES[tile.cropType].growDays;
        tile.growthStage = Math.min(tile.growthStage + 1, maxGrowth);
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
  const crop = CROP_TYPES[tile.cropType];
  const progress = tile.growthStage / crop.growDays; // 0 a 1
  const cx = x + TILE_SIZE / 2;
  const baseY = y + TILE_SIZE - 6;
  const stemHeight = 4 + 14 * progress;
  const ready = tile.growthStage >= crop.growDays;

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

  // Fruto en la punta: crece y, si está listo, "pulsa" suavemente.
  // La calabaza se dibuja un poco más grande que la zanahoria para
  // que se note la diferencia entre cultivos de un vistazo.
  const sizeBonus = tile.cropType === 'pumpkin' ? 1.4 : 1;
  let fruitRadius = (3 + 4 * progress) * sizeBonus;
  if (ready) {
    const pulse = Math.sin(performance.now() / 250) * 1.2;
    fruitRadius += pulse;
  }

  ctx.fillStyle = ready ? crop.matureColor : crop.youngColor;
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
  const x = player.pixelX;
  const y = player.pixelY;
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
checkDailyStreak(); // revisamos si hoy suma o rompe la racha
updateHUD();
checkQuests(); // pinta el panel de misiones con el progreso actual

document.getElementById('reset-btn').addEventListener('click', () => {
  const confirmReset = confirm('¿Seguro que quieres borrar tu partida y empezar de nuevo?');
  if (!confirmReset) return;

  localStorage.removeItem(SAVE_KEY);
  map = createMap();
  player.x = 5;
  player.y = 5;
  player.pixelX = 5 * TILE_SIZE;
  player.pixelY = 5 * TILE_SIZE;
  player.facing = 'down';
  day = 1;
  seedCounts = { carrot: 5, pumpkin: 0 };
  selectedSeed = 'carrot';
  cropCount = 0;
  coins = 10;
  streak = 0;
  lastPlayedDate = null;
  level = 1;
  xp = 0;
  completedQuests = [];
  pumpkinsHarvested = 0;
  updateHUD();
  checkQuests();
});

buyCarrotBtn.addEventListener('click', () => buySeed('carrot'));
buyPumpkinBtn.addEventListener('click', () => buySeed('pumpkin'));

function buySeed(type) {
  const price = CROP_TYPES[type].seedPrice;
  if (coins < price) return; // por seguridad, aunque el botón ya se desactiva

  coins -= price;
  seedCounts[type]++;
  sounds.buy();
  updateHUD();
  saveGame();
}

// Click en las etiquetas de semilla (1/2 en el HUD) también selecciona
seedSelectorEls.forEach((el) => {
  el.addEventListener('click', () => {
    selectedSeed = el.dataset.crop;
    updateHUD();
  });
});

// Loop de animación: redibuja continuamente para que el pulso del
// cultivo maduro se vea fluido, sin depender de que pulses una tecla
function animationLoop() {
  updatePlayerVisualPosition();
  draw();
  requestAnimationFrame(animationLoop);
}
animationLoop();