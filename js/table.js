// ================== КОННЕКТ К ДВИЖКУ ==================
const socket = io('https://poker-server-f2et.onrender.com', {
  transports: ['websocket', 'polling']
});

let myPlayerId = null;
let turnTimerInterval = null;
let lastSeenLogMessage = null;
let lastSeenDealerDetails = null;

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

const tableInfoEl = document.getElementById('tableInfo'); // текст под зелёной точкой
const chatEl      = document.getElementById('chat');      // окно чата

// Кнопки действий (если есть на странице)
const foldButton      = document.getElementById('foldButton');
const checkCallButton = document.getElementById('checkCallButton');
const betRaiseButton  = document.getElementById('betRaiseButton');
const allInButton     = document.getElementById('allInButton');
const betRangeEl      = document.getElementById('betRange');
const betAmountEl     = document.getElementById('betAmount');
const betPercentLabel = document.getElementById('betPercentLabel');
const presetButtons   = Array.from(document.querySelectorAll('[data-bet-preset]'));

// ============== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ РИСОВАНИЯ ==============

function suitToColor(suit) {
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

// ====== ЧАТ (добавляем строки, а не затираем полностью) ======
function appendChatLine(type, text) {
  if (!chatEl || !text) return;
  const line = document.createElement('div');
  // простое различие по типам
  if (type === 'dealer') line.className = 'chat-line-dealer';
  if (type === 'system') line.className = 'chat-line-system';
  line.textContent = text;
  chatEl.appendChild(line);
  chatEl.scrollTop = chatEl.scrollHeight;
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
      seatEl.classList.remove('active');
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

    // Подсветка активного игрока (совместимо с .seat.active)
    if (p.id === state.currentTurn) {
      seatEl.classList.add('active');
    } else {
      seatEl.classList.remove('active');
    }
  });

  // Переставляем фишку дилера по buttonPlayerId
  if (dealerChipEl && state.buttonPlayerId) {
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

// ============== РЕНДЕР БОРДА, БАНКА, СТАТУСА ==============

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
    sidePotsEl.textContent = potDetails.length ? potDetails.join(' | ') : '';
  }

  // ВЕРХНЯЯ ИНФА ПОД ЗЕЛЁНОЙ ТОЧКОЙ — БЕЗ "ТЕКСТА КРУПЬЕ"
  if (tableInfoEl) {
    const stageMap = {
      waiting:  'Ожидание раздачи',
      preflop:  'Префлоп',
      flop:     'Флоп',
      turn:     'Тёрн',
      river:    'Ривер',
      showdown: 'Шоудаун'
    };
    const stageName = stageMap[state.stage] || '—';
    const sb = state.smallBlind || 0;
    const bb = state.bigBlind || 0;
    tableInfoEl.textContent = `Live · Hold'em · Блайнды ${sb}/${bb} · ${stageName}`;
  }

  // КРУПЬЕ В ЧАТЕ:
  // 1) короткие сообщения (lastLogMessage -> tableMessage)
  if (state.tableMessage && state.tableMessage !== lastSeenLogMessage) {
    appendChatLine('dealer', state.tableMessage);
    lastSeenLogMessage = state.tableMessage;
  }

  // 2) развёрнутая расшифровка (dealerDetails) — многострочный текст
  if (state.dealerDetails && state.dealerDetails !== lastSeenDealerDetails) {
    const lines = String(state.dealerDetails).split('\n');
    lines.forEach(line => appendChatLine('system', line));
    lastSeenDealerDetails = state.dealerDetails;
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

  if (heroPositionEl) {
    const stageMap = {
      waiting:  'Ожидание',
      preflop:  'Префлоп',
      flop:     'Флоп',
      turn:     'Тёрн',
      river:    'Ривер',
      showdown: 'Шоудаун'
    };
    heroPositionEl.textContent = 'Стадия: ' + (stageMap[state.stage] || '—');
  }

  // КАРМАННЫЕ КАРТЫ — рисуем мини-карты внутри hero-card-slot
  const yourCards = state.yourCards || [];
  heroCardsSlots.forEach((slot, idx) => {
    slot.innerHTML = '';
    const card = yourCards[idx];
    if (!card) return;
    const cardEl = createCardEl(card);
    // немного уменьшим, чтобы влезло
    cardEl.style.width = '100%';
    cardEl.style.height = '100%';
    slot.appendChild(cardEl);
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
  updateBetControls(state);
}

// ================== УПРАВЛЕНИЕ СТАВКОЙ (ползунок / пресеты) ==================

function updateBetControls(state) {
  if (!betRangeEl || !betAmountEl) return;
  const players = state.players || [];
  const me = players.find(p => p.id === myPlayerId) || null;
  if (!me) return;

  const stack = me.stack || 0;

  // если сейчас не наш ход — можно заблокировать управление, если захочешь
  // пока просто оставляем

  // синхронность ползунка и поля ставки
  betRangeEl.addEventListener('input', () => {
    const percent = parseInt(betRangeEl.value, 10) || 0;
    if (betPercentLabel) {
      betPercentLabel.textContent = percent + '%';
    }
    const amount = Math.floor((stack * percent) / 100);
    betAmountEl.value = amount;
  }, { once: true });
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
    myPlayerId = socket.id;
  }
  renderState(state);
});

// ================== КНОПКИ ДЕЙСТВИЙ ==================

function wireActionButtons() {
  if (foldButton) {
    foldButton.addEventListener('click', () => {
      socket.emit('action', { type: 'fold' });
    });
  }

  if (checkCallButton) {
    checkCallButton.addEventListener('click', () => {
      socket.emit('action', { type: 'call' });
    });
  }

  if (betRaiseButton) {
    betRaiseButton.addEventListener('click', () => {
      if (!betAmountEl) return;
      const raw = parseInt(betAmountEl.value, 10);
      const amount = Number.isFinite(raw) && raw > 0 ? raw : 0;
      if (amount <= 0) return;
      socket.emit('action', { type: 'bet', amount });
    });
  }

  if (allInButton) {
    allInButton.addEventListener('click', () => {
      socket.emit('action', { type: 'allin' });
    });
  }

  // пресеты (⅓ пота, ½, макс и т.п.)
  if (presetButtons.length && betAmountEl) {
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-bet-preset');
        // пока очень грубо: "max" -> пустим all-in, остальное не трогаем
        if (preset === 'max') {
          socket.emit('action', { type: 'allin' });
          return;
        }
        // остальное можно потом нормально привязать к pot/stack
      });
    });
  }

  // iOS-неон для .action-btn (как в демо)
  const actionBtns = document.querySelectorAll('.action-btn');
  actionBtns.forEach(btn => {
    const press = () => btn.classList.add('is-pressed');
    const release = () => btn.classList.remove('is-pressed');

    btn.addEventListener('touchstart', press, { passive: true });
    btn.addEventListener('mousedown', press);

    ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(ev => {
      btn.addEventListener(ev, release);
    });
  });
}

wireActionButtons();
