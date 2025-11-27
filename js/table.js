// ================== КОННЕКТ К ДВИЖКУ ==================
const socket = io('https://poker-server-f2et.onrender.com', {
  transports: ['websocket', 'polling']
});

let myPlayerId = null;
let turnTimerInterval = null;

// Кэш DOM-элементов
const seatEls      = Array.from(document.querySelectorAll('.seat'));          // seat-1..6
const dealerChipEl = document.getElementById('dealerChip');

const potEl       = document.getElementById('pot');
const potValueEl  = potEl ? potEl.querySelector('span') : null;
const boardEl     = document.getElementById('board');
const sidePotsEl  = document.getElementById('sidePots');

const heroNameEl       = document.getElementById('heroName');
const heroStackEl      = document.getElementById('heroStack');
const heroCardsSlots   = Array.from(document.querySelectorAll('.hero-card-slot'));
const heroLastActionEl = document.getElementById('heroLastAction');
const heroPositionEl   = document.getElementById('heroPosition');

const tableInfoEl = document.getElementById('tableInfo'); // верхняя строка под зелёной точкой
const chatEl      = document.getElementById('chat');      // скроллящийся чат (если есть)

// ============== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ РИСОВАНИЯ ==============

function suitToColor(suit) {
  // На сервере масть у тебя '♥','♦','♠','♣' (судя по разметке)
  if (suit === '♥' || suit === '♦') return 'red';
  return 'black';
}

function createCardEl(card) {
  const div = document.createElement('div');
  div.className = 'card ' + suitToColor(card.suit);

  const rankEl = document.createElement('div');
  rankEl.className = 'card-rank';
  rankEl.textContent = card.rank;

  const suitEl = document.createElement('div');
  suitEl.className = 'card-suit';
  suitEl.textContent = card.suit;

  div.appendChild(rankEl);
  div.appendChild(suitEl);
  return div;
}

function clearTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
}

// ============== РЕНДЕР ИГРОКОВ (стулья) ==============

function renderSeats(state) {
  const players = state.players || [];

  seatEls.forEach((seatEl, idx) => {
    const p = players[idx];
    const nameEl  = seatEl.querySelector('.seat-name');
    const stackEl = seatEl.querySelector('.seat-stack');

    if (!p) {
      seatEl.classList.add('seat--empty');
      if (nameEl)  nameEl.textContent  = 'Пусто';
      if (stackEl) stackEl.textContent = '';
      return;
    }

    seatEl.classList.remove('seat--empty');

    if (nameEl) {
      nameEl.textContent = p.name || ('Игрок ' + (idx + 1));
    }
    if (stackEl) {
      stackEl.textContent = p.stack;
    }

    // Подсветка активного игрока
    if (p.id === state.currentTurn) {
      seatEl.classList.add('seat--active');
    } else {
      seatEl.classList.remove('seat--active');
    }

    // Игрок на паузе — чуть приглушим (если есть такой класс)
    if (p.isPaused) {
      seatEl.classList.add('seat--paused');
    } else {
      seatEl.classList.remove('seat--paused');
    }
  });

  // Переставляем фишку дилера по buttonPlayerId
  if (dealerChipEl && state.buttonPlayerId) {
    // убираем старые классы dealer-1..dealer-6
    dealerChipEl.classList.remove(
      'dealer-1','dealer-2','dealer-3','dealer-4','dealer-5','dealer-6'
    );

    const btnIdx = players.findIndex(p => p.id === state.buttonPlayerId);
    if (btnIdx >= 0 && btnIdx < 6) {
      dealerChipEl.classList.add('dealer-' + (btnIdx + 1));
      dealerChipEl.style.display = 'block';
    } else {
      dealerChipEl.style.display = 'none';
    }
  }
}

// ============== РЕНДЕР БОРДА, БАНКА, СООБЩЕНИЙ ==============

function renderBoardAndPot(state) {
  // Банк
  if (potEl && potValueEl) {
    const totalPot = state.totalPot || 0;
    potValueEl.textContent = totalPot;
    potEl.style.display = totalPot > 0 ? 'block' : 'none';
  }

  // Общие карты
  if (boardEl) {
    boardEl.innerHTML = '';
    const cards = state.communityCards || [];
    cards.forEach(card => {
      boardEl.appendChild(createCardEl(card));
    });
  }

  // Детализация сайд-потов (по желанию)
  if (sidePotsEl) {
    const potDetails = state.potDetails || [];
    if (potDetails.length) {
      sidePotsEl.textContent = potDetails.join(' | ');
    } else {
      sidePotsEl.textContent = '';
    }
  }

  // Общая инфа по столу / сообщения крупье
  if (tableInfoEl) {
    // Можно комбинировать stage + tableMessage
    let text = '';
    if (state.tableMessage) text += state.tableMessage;
    if (!text) {
      // запасной вариант: просто стадия
      text = 'Стадия: ' + (state.stage || '—');
    }
    tableInfoEl.textContent = text;
  }

  // Крупье в чат (минимальная версия)
  if (chatEl && state.dealerDetails) {
    // не спамим бесконечно — для простоты просто перезаписываем
    chatEl.textContent = state.dealerDetails;
  }
}

// ============== РЕНДЕР ХЕРО (карты, стек, статус, таймер) ==============

function renderHero(state) {
  const players = state.players || [];
  const me = players.find(p => p.id === myPlayerId) || null;

  if (heroNameEl) {
    heroNameEl.textContent = me ? (me.name || 'Hero') : 'Hero';
  }
  if (heroStackEl) {
    heroStackEl.textContent = me ? (me.stack || 0) : 0;
  }

  // Позиция (BTN / SB / BB — сервер такого не шлёт, можно позже добавить,
  // сейчас просто покажем стадию и "Ваш ход" / "Ожидание")
  if (heroPositionEl) {
    heroPositionEl.textContent = 'Стадия: ' + (state.stage || '—');
  }

  // Карманные карты
  const yourCards = state.yourCards || [];
  heroCardsSlots.forEach((slot, idx) => {
    const card = yourCards[idx];
    if (!card) {
      slot.textContent = ''; // можно тут фон-задник сделать через CSS
      slot.classList.remove('card-red', 'card-black');
      return;
    }
    const label = String(card.rank) + String(card.suit);
    slot.textContent = label;
    slot.classList.remove('card-red', 'card-black');
    slot.classList.add(suitToColor(card.suit) === 'red' ? 'card-red' : 'card-black');
  });

  // Статус "Ваш ход" + таймер
  clearTurnTimer();

  if (state.yourTurn) {
    if (heroLastActionEl) {
      heroLastActionEl.textContent = 'Ваш ход';
    }

    if (state.turnDeadline) {
      const deadline = state.turnDeadline;
      const updateTimer = () => {
        const now = Date.now();
        let sec = Math.max(0, Math.ceil((deadline - now) / 1000));
        if (heroLastActionEl) {
          heroLastActionEl.textContent = `Ваш ход · ${sec} с`;
        }
        if (sec <= 0) {
          clearTurnTimer();
        }
      };
      updateTimer();
      turnTimerInterval = setInterval(updateTimer, 250);
    }
  } else {
    if (heroLastActionEl) {
      heroLastActionEl.textContent = 'Ожидание других игроков';
    }
  }
}

// ============== ГЛАВНЫЙ РЕНДЕР СОСТОЯНИЯ ==============

function renderState(state) {
  renderSeats(state);
  renderBoardAndPot(state);
  renderHero(state);
}

// ================== SOCKET.IO СЛУШАТЕЛИ ==================

socket.on('connect', () => {
  console.log('[table.js] connected to engine:', socket.id);
  myPlayerId = socket.id;

  // сразу садимся за стол как отдельный игрок
  const rnd = Math.floor(Math.random() * 1000);
  socket.emit('joinTable', {
    playerName: 'Browser ' + rnd
  });
});

socket.on('connect_error', (err) => {
  console.error('[table.js] connect_error:', err);
});

socket.on('disconnect', (reason) => {
  console.warn('[table.js] disconnected:', reason);
  clearTurnTimer();
});

// основное состояние от сервера
socket.on('gameState', (state) => {
  console.log('[table.js] gameState:', state);
  if (!myPlayerId) {
    // на всякий случай обновим, если пришло раньше connect
    myPlayerId = socket.id;
  }
  renderState(state);
});

// ================== (ПОТОМ) КНОПКИ ДЕЙСТВИЙ ==================
// Здесь позже можно навесить:
// - foldButton -> socket.emit('action', { type: 'fold' })
// - check/call  -> socket.emit('action', { type: 'call' })
// - bet/raise   -> socket.emit('action', { type: 'bet', amount: ... })
// - all-in      -> socket.emit('action', { type: 'allin' })
//
// Пока не трогаем, сначала добиваем корректный рендер.
