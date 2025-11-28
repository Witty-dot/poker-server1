// =====================================================
// ===============   CONNECT TO ENGINE   ===============
// =====================================================

const socket = io('https://poker-server-f2et.onrender.com', {
  transports: ['websocket', 'polling']
});

let myPlayerId = null;
let lastState = null;
let turnTimerInterval = null;
let lastSeenLogMessage = null;
let lastSeenDealerDetails = null;
let hasJoined = false;

// момент, когда можно открыть карманные карты (до этого показываем рубашку)
let heroRevealAt = 0;

// =====================================================
// ===============   DOM CACHE   =======================
// =====================================================

const seatEls          = Array.from(document.querySelectorAll('.seat'));
const dealerChipEl     = document.getElementById('dealerChip');

const potEl            = document.getElementById('pot');
const potValueEl       = potEl ? potEl.querySelector('span') : null;
const boardEl          = document.getElementById('board');
const sidePotsEl       = document.getElementById('sidePots');

const heroNameEl       = document.getElementById('heroName');
const heroStackEl      = document.getElementById('heroStack');
const heroCardsSlots   = Array.from(document.querySelectorAll('.hero-card-slot'));
const heroLastActionEl = document.getElementById('heroLastAction');
const heroPositionEl   = document.getElementById('heroPosition');
const heroBestHandEl   = document.getElementById('heroBestHand');

const tableInfoEl      = document.getElementById('tableInfo');
const dealerShortEl    = document.getElementById('dealerShort');
const chatEl           = document.getElementById('chat');

const tableTitleEl     = document.getElementById('tableTitle');
const tablePlayersEl   = document.getElementById('tablePlayers');
const minBuyinEl       = document.getElementById('minBuyin');
const maxBuyinEl       = document.getElementById('maxBuyin');

const seatButton       = document.getElementById('btnLeave');

// Actions
const foldButton       = document.getElementById('foldButton');
const checkCallButton  = document.getElementById('checkCallButton');
const betRaiseButton   = document.getElementById('betRaiseButton');
const allInButton      = document.getElementById('allInButton');

const betRangeEl       = document.getElementById('betRange');
const betAmountEl      = document.getElementById('betAmount');
const betPercentLabel  = document.getElementById('betPercentLabel');
const presetButtons    = Array.from(document.querySelectorAll('[data-bet-preset]'));

const chatInputEl      = document.getElementById('chatInput');
const chatSendEl       = document.getElementById('chatSend');

// =====================================================
// ===============   HELPERS   =========================
// =====================================================

function formatChips(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('ru-RU');
}

function suitToColor(suit) {
  return (suit === '♥' || suit === '♦') ? 'red' : 'black';
}

function cardKey(card) {
  if (!card) return '';
  return `${card.rank}${card.suit}`;
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
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerInterval = null;
}

function appendChatLine(type, text) {
  if (!chatEl || !text) return;
  const line = document.createElement('div');

  if (type === 'dealer')      line.className = 'chat-line-dealer';
  else if (type === 'system') line.className = 'chat-line-system';
  else if (type === 'you')    line.className = 'chat-line-you';
  else if (type === 'player') line.className = 'chat-line-player';

  line.textContent = text;
  chatEl.appendChild(line);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function findMe(state) {
  if (!state || !state.players) return null;
  return state.players.find(p => p.id === myPlayerId) || null;
}

// =====================================================
// ===============   SEATS RENDER   ====================
// =====================================================

function renderSeats(state) {
  const players = state.players || [];

  seatEls.forEach((seatEl, idx) => {
    const slotPlayer = players[idx];
    const nameEl  = seatEl.querySelector('.seat-name');
    const stackEl = seatEl.querySelector('.seat-stack');

    if (!slotPlayer) {
      seatEl.classList.add('seat--empty');
      seatEl.classList.remove('active');
      if (nameEl)  nameEl.textContent  = 'Пусто';
      if (stackEl) stackEl.textContent = '';
      return;
    }

    seatEl.classList.remove('seat--empty');

    if (nameEl) {
      nameEl.textContent  = slotPlayer.name || ('Игрок ' + (idx + 1));
    }
    if (stackEl) {
      stackEl.textContent = formatChips(slotPlayer.stack);
    }

    if (slotPlayer.id === state.currentTurn) seatEl.classList.add('active');
    else seatEl.classList.remove('active');
  });

  // Dealer chip
  if (dealerChipEl) {
    dealerChipEl.classList.remove(
      'dealer-1','dealer-2','dealer-3','dealer-4','dealer-5','dealer-6'
    );

    const btnIdx = (state.players || []).findIndex(p => p.id === state.buttonPlayerId);

    if (btnIdx >= 0) {
      dealerChipEl.classList.add(`dealer-${btnIdx + 1}`);
      dealerChipEl.style.display = 'block';
    } else {
      dealerChipEl.style.display = 'none';
    }
  }
}

// =====================================================
// ===============   HEADER INFO   =====================
// =====================================================

function updateHeader(state) {
  const sb = state.smallBlind || 0;
  const bb = state.bigBlind || 0;

  if (tableTitleEl) {
    tableTitleEl.textContent = `TABLE · NL ${sb}-${bb}`;
  }

  if (tablePlayersEl) {
    const players = state.players || [];
    const activeCount = players.filter(p => !p.isPaused && p.stack > 0).length;
    const maxSeats = 6;
    tablePlayersEl.textContent = `${activeCount} / ${maxSeats} игроков`;
  }

  if (minBuyinEl && maxBuyinEl) {
    // Примерно как в первом скрине: 50 и 500 BB
    const minBuy = bb * 50;
    const maxBuy = bb * 500;
    minBuyinEl.textContent = `Мин. бай-ин: ${minBuy ? formatChips(minBuy) : '—'}`;
    maxBuyinEl.textContent = `Макс. бай-ин: ${maxBuy ? formatChips(maxBuy) : '—'}`;
  }
}

// =====================================================
// ===============   BOARD & POT RENDER   ==============
// =====================================================

function renderBoardAndPot(state, comboKeys) {
  comboKeys = comboKeys || [];

  // Pot
  if (potEl && potValueEl) {
    const totalPot = state.totalPot || 0;
    potValueEl.textContent = formatChips(totalPot);
    potEl.style.display = totalPot > 0 ? 'block' : 'none';
  }

  // Board
  if (boardEl) {
    boardEl.innerHTML = '';
    (state.communityCards || []).forEach(card => {
      const el = createCardEl(card);
      if (comboKeys.includes(cardKey(card))) el.classList.add('card--highlight');
      boardEl.appendChild(el);
    });
  }

  // Side pots
  if (sidePotsEl) {
    const pots = state.potDetails || [];
    sidePotsEl.textContent = pots.length ? pots.join(' | ') : '';
  }

  // Info under green dot
  if (tableInfoEl) {
    const stages = {
      waiting:  'Ожидание раздачи',
      preflop:  'Префлоп',
      flop:     'Флоп',
      turn:     'Тёрн',
      river:    'Ривер',
      showdown: 'Шоудаун'
    };
    const stageName = stages[state.stage] || '—';
    tableInfoEl.textContent =
      `Live · Hold'em · Блайнды ${state.smallBlind}/${state.bigBlind} · ${stageName}`;
  }

  // Short dealer text over table
  if (dealerShortEl) {
    let txt = state.tableMessage ||
              (state.dealerDetails ? String(state.dealerDetails).split('\n')[0] : '');
    if (txt.length > 110) txt = txt.slice(0, 107) + '…';
    dealerShortEl.textContent = txt || '';
  }

  // Dealer → чат
  if (state.tableMessage && state.tableMessage !== lastSeenLogMessage) {
    appendChatLine('dealer', state.tableMessage);
    lastSeenLogMessage = state.tableMessage;
  }

  if (state.dealerDetails && state.dealerDetails !== lastSeenDealerDetails) {
    String(state.dealerDetails).split('\n').forEach(l => appendChatLine('system', l));
    lastSeenDealerDetails = state.dealerDetails;
  }

  updateHeader(state);
}

// =====================================================
// ===============   HERO RENDER   =====================
// =====================================================

function renderHero(state, comboKeys) {
  const me = findMe(state);
  comboKeys = comboKeys || [];

  if (heroNameEl)  heroNameEl.textContent  = me ? me.name : 'Hero';
  if (heroStackEl) heroStackEl.textContent = me ? formatChips(me.stack) : '0';

  // Stage
  const stages = {
    waiting:  'Ожидание',
    preflop:  'Префлоп',
    flop:     'Флоп',
    turn:     'Тёрн',
    river:    'Ривер',
    showdown: 'Шоудаун'
  };
  if (heroPositionEl) {
    heroPositionEl.textContent = 'Стадия: ' + (stages[state.stage] || '—');
  }

  // Combination
  if (heroBestHandEl) {
    heroBestHandEl.textContent =
      state.yourBestHandType ? ('Комбинация: ' + state.yourBestHandType) : 'Комбинация: —';
  }

  // Карманные карты
  const yourCards = state.yourCards || [];
  const now = Date.now();
  const showBack =
    heroRevealAt &&
    state.stage === 'preflop' &&
    yourCards.length >= 2 &&
    now < heroRevealAt;

  heroCardsSlots.forEach((slot, idx) => {
    slot.innerHTML = '';

    if (!yourCards[idx]) return;

    if (showBack) {
      const b = document.createElement('div');
      b.className = 'card card-back';
      slot.appendChild(b);
      return;
    }

    const card = yourCards[idx];
    const el = createCardEl(card);
    if (comboKeys.includes(cardKey(card))) el.classList.add('card--highlight');
    el.style.width = '100%';
    el.style.height = '100%';
    slot.appendChild(el);
  });

  // Your turn / timer
  clearTurnTimer();
  if (state.yourTurn) {
    if (heroLastActionEl) heroLastActionEl.textContent = 'Ваш ход';
    if (state.turnDeadline) {
      const deadline = state.turnDeadline;
      const upd = () => {
        const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (heroLastActionEl) {
          heroLastActionEl.textContent = `Ваш ход · ${sec} с`;
        }
        if (sec <= 0) clearTurnTimer();
      };
      upd();
      turnTimerInterval = setInterval(upd, 250);
    }
  } else {
    if (heroLastActionEl) heroLastActionEl.textContent = 'Ожидание других игроков';
  }

  // Disable action buttons if not your turn
  const disable = !state.yourTurn;
  [foldButton, checkCallButton, betRaiseButton, allInButton].forEach(btn => {
    if (!btn) return;
    btn.disabled = disable;
    btn.classList.toggle('is-disabled', disable);
  });
}

// =====================================================
// ===============   JOIN / LEAVE LOGIC   ==============
// =====================================================

function isMeSeated(state) {
  const me = findMe(state);
  if (!me) return false;
  return !me.isPaused && me.stack > 0;
}

function updateSeatButton(state) {
  if (!seatButton) return;
  const seated = isMeSeated(state);
  if (seated) {
    seatButton.textContent = 'Покинуть стол';
    seatButton.classList.remove('btn-join');
    seatButton.classList.add('btn-leave');
  } else {
    seatButton.textContent = 'Сесть за стол';
    seatButton.classList.remove('btn-leave');
    seatButton.classList.add('btn-join');
  }
}

function generatePlayerName() {
  const num = Math.floor(100 + Math.random() * 900);
  return `Browser ${num}`;
}

function handleSeatButtonClick() {
  if (!lastState) {
    // ещё нет состояния — просто пытаемся присесть
    socket.emit('joinTable', { playerName: generatePlayerName() });
    hasJoined = true;
    return;
  }

  const me = findMe(lastState);
  if (!me) {
    // не в списке игроков — джойнимся
    socket.emit('joinTable', { playerName: generatePlayerName() });
    hasJoined = true;
    return;
  }

  const seated = !me.isPaused && me.stack > 0;
  if (seated) {
    socket.emit('setPlaying', { playing: false });
  } else {
    socket.emit('setPlaying', { playing: true });
  }
}

// =====================================================
// ===============   MAIN RENDER   =====================
// =====================================================

function renderState(state) {
  // определить момент "раздачи" карманных карт
  const prevStage = lastState ? lastState.stage : null;
  const prevCardsKey = lastState
    ? (lastState.yourCards || []).map(cardKey).join('|')
    : '';
  const newCardsKey = (state.yourCards || []).map(cardKey).join('|');

  if (
    state.stage === 'preflop' &&
    newCardsKey &&
    (state.stage !== prevStage || newCardsKey !== prevCardsKey)
  ) {
    // на префлопе, только что раздали новые карты → сперва рубашка
    heroRevealAt = Date.now() + 600; // 0.6 сек
  } else if (state.stage !== 'preflop') {
    heroRevealAt = 0;
  }

  lastState = state;

  const comboKeys = (state.yourBestHandCards || []).map(cardKey);

  renderSeats(state);
  renderBoardAndPot(state, comboKeys);
  renderHero(state, comboKeys);
  updateBetControls(state);
  updateSeatButton(state);
}

// =====================================================
// ===============   BET CONTROLS   ====================
// =====================================================

function updateBetControls(state) {
  if (!betRangeEl || !betAmountEl) return;
  const me = findMe(state);
  if (!me) return;

  const stack = me.stack || 0;
  betAmountEl.max = stack;

  let val = parseInt(betAmountEl.value, 10);
  if (!Number.isFinite(val)) val = 0;
  if (val < 0) val = 0;
  if (val > stack) val = stack;
  betAmountEl.value = val;

  const percent = stack > 0 ? Math.round((val / stack) * 100) : 0;
  betRangeEl.value = String(percent);
  if (betPercentLabel) betPercentLabel.textContent = percent + '%';
}

// Минимальная сумма для Bet / Raise, если поле пустое / 0
function getDefaultBetAmount() {
  if (!lastState) return 10;

  const s = lastState;
  const bigBlind = s.bigBlind || 10;
  const minRaise = s.minRaise || bigBlind;

  if (!s.currentBet || s.currentBet === 0) {
    // первый бет на улице: хотя бы размер BB
    return bigBlind;
  } else {
    // рейз до: currentBet + minRaise (минимальный рейз)
    return s.currentBet + minRaise;
  }
}

// =====================================================
// ===============   SOCKET LISTENERS   ================
// =====================================================

socket.on('connect', () => {
  myPlayerId = socket.id;
  console.log('[table.js] Connected →', myPlayerId);
});

socket.on('connect_error', (err) => {
  console.error('[table.js] connect_error:', err);
});

socket.on('disconnect', () => {
  clearTurnTimer();
  console.warn('[table.js] Disconnected');
});

socket.on('gameState', (state) => {
  // узнаём, что мы уже в списке игроков
  if (!hasJoined && state.players && state.players.find(p => p.id === myPlayerId)) {
    hasJoined = true;
  }
  renderState(state);
});

// (будущий) серверный чат — на будущее, сейчас сервер этого события не шлёт
socket.on('chatMessage', (msg) => {
  if (!msg || !msg.text) return;
  const fromId   = msg.playerId;
  const fromName = msg.playerName || 'Игрок';
  const text     = msg.text;

  if (fromId === myPlayerId) {
    appendChatLine('you', text);
  } else {
    appendChatLine('player', `${fromName}: ${text}`);
  }
});

// =====================================================
// ===============   ACTION BUTTONS   ==================
// =====================================================

function wireUi() {
  // join / leave
  if (seatButton) {
    seatButton.addEventListener('click', handleSeatButtonClick);
  }

  // ACTIONS
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

  // SLIDER
  if (betRangeEl && betAmountEl) {
    betRangeEl.addEventListener('input', () => {
      const percent = parseInt(betRangeEl.value, 10) || 0;
      if (betPercentLabel) {
        betPercentLabel.textContent = percent + '%';
      }

      const me = lastState ? findMe(lastState) : null;
      const stack = me ? me.stack || 0 : 0;

      const amount = Math.floor((stack * percent) / 100);
      betAmountEl.value = amount;
    });
  }

  // ручной ввод суммы
  if (betAmountEl && betRangeEl) {
    betAmountEl.addEventListener('input', () => {
      if (!lastState) return;
      const me = findMe(lastState);
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

        const me = findMe(lastState);
        const stack = me ? me.stack || 0 : 0;
        const totalPot = lastState.totalPot || 0;

        let amount = 0;

        if (preset === 'max') {
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
          const pct = parseInt(preset, 10) || 0;
          amount = Math.floor(stack * pct / 100);
        }

        if (amount > stack) amount = stack;
        if (amount < 0) amount = 0;

        betAmountEl.value = amount;

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

  // CHAT
  function sendChatFromInput() {
    if (!chatInputEl) return;
    const text = chatInputEl.value.trim();
    if (!text) return;

    // пока: локальный вывод + отправка на сервер (когда добавишь обработчик)
    appendChatLine('you', text);
    socket.emit('chatMessage', { text });

    chatInputEl.value = '';
  }

  if (chatSendEl) {
    chatSendEl.addEventListener('click', sendChatFromInput);
  }

  if (chatInputEl) {
    chatInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChatFromInput();
      }
    });
  }
}

wireUi();
