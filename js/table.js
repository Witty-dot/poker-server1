// ================== КОННЕКТ К ДВИЖКУ ==================
const socket = io('https://poker-server-f2et.onrender.com', {
  transports: ['websocket', 'polling']
});

let myPlayerId = null;
let turnTimerInterval = null;
let lastSeenLogMessage = null;
let lastSeenDealerDetails = null;
let lastState = null; // последнее полученное состояние стола

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
const heroBestHandEl   = document.getElementById('heroBestHand');

const tableInfoEl  = document.getElementById('tableInfo');   // текст под зелёной точкой
const dealerShortEl = document.getElementById('dealerShort'); // короткий текст крупье над столом
const chatEl       = document.getElementById('chat');        // окно чата

// Кнопки действий
const foldButton      = document.getElementById('foldButton');
const checkCallButton = document.getElementById('checkCallButton');
const betRaiseButton  = document.getElementById('betRaiseButton');
const allInButton     = document.getElementById('allInButton');

const betRangeEl      = document.getElementById('betRange');
const betAmountEl     = document.getElementById('betAmount');
const betPercentLabel = document.getElementById('betPercentLabel');
const presetButtons   = Array.from(document.querySelectorAll('[data-bet-preset]'));

// ================== ВСПОМОГАТЕЛЬНЫЕ ==================

function suitToColor(suit) {
  if (suit === '♥' || suit === '♦') return 'red';
  return 'black';
}

function cardKey(card) {
  if (!card) return '';
  return String(card.rank) + String(card.suit);
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

// ====== ЧАТ (добавляем строки, не затираем) ======
function appendChatLine(type, text) {
  if (!chatEl || !text) return;
  const line = document.createElement('div');
  if (type === 'dealer') line.className = 'chat-line-dealer';
  if (type === 'system') line.className = 'chat-line-system';
  line.textContent = text;
  chatEl.appendChild(line);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ================== РЕНДЕР СТУЛЬЕВ ==================

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

// ================== РЕНДЕР БОРДА / БАНКА / КРУПЬЕ ==================

function renderBoardAndPot(state, comboKeys) {
  comboKeys = comboKeys || [];

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
      const el = createCardEl(card);
      if (comboKeys.includes(cardKey(card))) {
        el.classList.add('card--highlight');
      }
      boardEl.appendChild(el);
    });
  }

  // Детализация сайд-потов
  if (sidePotsEl) {
    const potDetails = state.potDetails || [];
    sidePotsEl.textContent = potDetails.length ? potDetails.join(' | ') : '';
  }

  // ВЕРХНЯЯ ИНФА ПОД ЗЕЛЁНОЙ ТОЧКОЙ
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

  // Краткое сообщение крупье над столом
  if (dealerShortEl) {
    let shortText = null;
    if (state.tableMessage) {
      shortText = state.tableMessage;
    } else if (state.dealerDetails) {
      shortText = String(state.dealerDetails).split('\n')[0] || null;
    }
    if (shortText && shortText.length > 110) {
      shortText = shortText.slice(0, 107) + '…';
    }
    dealerShortEl.textContent = shortText || '';
  }

  // КРУПЬЕ В ЧАТЕ:
  // 1) короткие сообщения (tableMessage)
  if (state.tableMessage && state.tableMessage !== lastSeenLogMessage) {
    appendChatLine('dealer', state.tableMessage);
    lastSeenLogMessage = state.tableMessage;
  }

  // 2) развёрнутая расшифровка (dealerDetails)
  if (state.dealerDetails && state.dealerDetails !== lastSeenDealerDetails) {
    const lines = String(state.dealerDetails).split('\n');
    lines.forEach(line => appendChatLine('system', line));
    lastSeenDealerDetails = state.dealerDetails;
  }
}

// ================== РЕНДЕР ХЕРО ==================

function renderHero(state, comboKeys) {
  const players = state.players || [];
  const me = players.find(p => p.id === myPlayerId) || null;
  comboKeys = comboKeys || [];

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

  // Комбинация
  if (heroBestHandEl) {
    if (state.yourBestHandType) {
      heroBestHandEl.textContent = 'Комбинация: ' + state.yourBestHandType;
    } else {
      heroBestHandEl.textContent = 'Комбинация: —';
    }
  }

  // Карманные карты (мини-карты)
  const yourCards = state.yourCards || [];
  heroCardsSlots.forEach((slot, idx) => {
    slot.innerHTML = '';
    const card = yourCards[idx];
    if (!card) return;
    const cardEl = createCardEl(card);
    cardEl.style.width = '100%';
    cardEl.style.height = '100%';
    if (comboKeys.includes(cardKey(card))) {
      cardEl.classList.add('card--highlight');
    }
    slot.appendChild(cardEl);
  });

  // Статус "Ваш ход" + таймер
  clearTurnTimer();

  const isYourTurn = !!state.yourTurn;

  if (isYourTurn) {
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

  // Можно отключать кнопки, если не твой ход
  const disabled = !isYourTurn;
  [foldButton, checkCallButton, betRaiseButton, allInButton].forEach(btn => {
    if (!btn) return;
    btn.disabled = disabled;
    btn.classList.toggle('is-disabled', disabled);
  });
}

// ================== ГЛАВНЫЙ РЕНДЕР ==================

function renderState(state) {
  lastState = state;

  const comboKeys = (state.yourBestHandCards || []).map(cardKey);

  renderSeats(state);
  renderBoardAndPot(state, comboKeys);
  renderHero(state, comboKeys);
  updateBetControls(state);
}

// ================== УПРАВЛЕНИЕ СТАВКОЙ ==================

function updateBetControls(state) {
  if (!betRangeEl || !betAmountEl) return;
  const players = state.players || [];
  const me = players.find(p => p.id === myPlayerId) || null;
  if (!me) return;

  const stack = me.stack || 0;

  // ограничиваем максимально возможную ставку твоим стеком
  betAmountEl.max = stack;
  if (stack <= 0) {
    betRangeEl.value = 0;
    if (betPercentLabel) betPercentLabel.textContent = '0%';
    return;
  }

  // если сейчас в инпуте что-то странное — приводим в диапазон
  let current = parseInt(betAmountEl.value, 10);
  if (!Number.isFinite(current) || current < 0) current = 0;
  if (current > stack) current = stack;
  betAmountEl.value = current;

  // синхронизация процента с суммой
  const percent = stack > 0 ? Math.round((current / stack) * 100) : 0;
  betRangeEl.value = String(Math.min(100, Math.max(0, percent)));
  if (betPercentLabel) {
    betPercentLabel.textContent = betRangeEl.value + '%';
  }
}

// Минимальная сумма для Bet/ Raise, если поле пустое / 0
function getDefaultBetAmount() {
  if (!lastState) return 10;

  const s = lastState;
  const bigBlind = s.bigBlind || 10;
  const minRaise = s.minRaise || bigBlind;

  if (!s.currentBet || s.currentBet === 0) {
    // первый бет на улице: хотя бы размер BB
    return bigBlind;
  } else {
    // рейз до: currentBet + minRaise
    return s.currentBet + minRaise;
  }
}

// ================== SOCKET.IO СЛУШАТЕЛИ ==================

socket.on('connect', () => {
  console.log('[table.js] connected to engine:', socket.id);
  myPlayerId = socket.id;
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
  // console.log('[table.js] gameState:', state);
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
      let amount = 0;
      if (betAmountEl) {
        const raw = parseInt(betAmountEl.value, 10);
        if (Number.isFinite(raw) && raw > 0) {
          amount = raw;
        }
      }

      // Если сумма не задана или 0 — берём минимальный разумный бет/рейз
      if (amount <= 0) {
        amount = getDefaultBetAmount();
      }

      if (amount <= 0) return;

      socket.emit('action', { type: 'bet', amount });
    });
  }

  if (allInButton) {
    allInButton.addEventListener('click', () => {
      socket.emit('action', { type: 'allin' });
    });
  }

  // Ползунок
  if (betRangeEl && betAmountEl) {
    betRangeEl.addEventListener('input', () => {
      const percent = parseInt(betRangeEl.value, 10) || 0;
      if (betPercentLabel) {
        betPercentLabel.textContent = percent + '%';
      }

      const players = lastState && lastState.players ? lastState.players : [];
      const me = players.find(p => p.id === myPlayerId) || null;
      const stack = me ? me.stack || 0 : 0;

      const amount = Math.floor((stack * percent) / 100);
      betAmountEl.value = amount;
    });
  }

  // Ручной ввод суммы — обновляем процент
  if (betAmountEl && betRangeEl) {
    betAmountEl.addEventListener('input', () => {
      if (!lastState) return;
      const players = lastState.players || [];
      const me = players.find(p => p.id === myPlayerId) || null;
      const stack = me ? me.stack || 0 : 0;

      let val = parseInt(betAmountEl.value, 10);
      if (!Number.isFinite(val) || val < 0) val = 0;
      if (val > stack) val = stack;
      betAmountEl.value = val;

      const percent = stack > 0 ? Math.round((val / stack) * 100) : 0;
      betRangeEl.value = String(Math.min(100, Math.max(0, percent)));
      if (betPercentLabel) {
        betPercentLabel.textContent = betRangeEl.value + '%';
      }
    });
  }

  // пресеты (⅓ пота, ½, ¾, пот, макс)
  if (presetButtons.length && betAmountEl) {
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!lastState) return;
        const preset = btn.getAttribute('data-bet-preset');

        const players = lastState.players || [];
        const me = players.find(p => p.id === myPlayerId) || null;
        const stack = me ? me.stack || 0 : 0;
        const totalPot = lastState.totalPot || 0;

        let amount = 0;

        if (preset === 'max') {
          // сразу олл-ин
          socket.emit('action', { type: 'allin' });
          return;
        }

        if (preset === '33') {
          amount = Math.floor(totalPot * 0.33);
        } else if (preset === '50') {
          amount = Math.floor(totalPot * 0.5);
        } else if (preset === '75') {
          amount = Math.floor(totalPot * 0.75);
        } else if (preset === '100') {
          amount = totalPot;
        }

        if (amount <= 0) {
          // если банк мелкий / 0 — ориентируемся хотя бы на стек
          amount = Math.floor(stack * (parseInt(preset, 10) || 0) / 100);
        }

        if (amount > stack) amount = stack;
        if (amount < 0) amount = 0;

        betAmountEl.value = amount;

        // Обновим проценты и ползунок
        if (stack > 0 && betRangeEl) {
          const percent = Math.round((amount / stack) * 100);
          betRangeEl.value = String(Math.min(100, Math.max(0, percent)));
          if (betPercentLabel) {
            betPercentLabel.textContent = betRangeEl.value + '%';
          }
        }
      });
    });
  }

  // iOS-неон для .action-btn
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
