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

// =====================================================
// ===============   DOM CACHE   ========================
// =====================================================

const seatEls          = Array.from(document.querySelectorAll('.seat'));
const dealerChipEl     = document.getElementById('dealerChip');

const potEl            = document.getElementById('pot');
const potValueEl       = potEl?.querySelector('span');
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


// =====================================================
// ===============   HELPERS   ==========================
// =====================================================

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
  if (type === 'dealer') line.className = 'chat-line-dealer';
  if (type === 'system') line.className = 'chat-line-system';
  line.textContent = text;
  chatEl.appendChild(line);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// =====================================================
// ===============   SEATS RENDER   =====================
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
      nameEl.textContent = 'Пусто';
      stackEl.textContent = '';
      return;
    }

    seatEl.classList.remove('seat--empty');
    nameEl.textContent  = slotPlayer.name || ('Игрок ' + (idx + 1));
    stackEl.textContent = slotPlayer.stack;

    if (slotPlayer.id === state.currentTurn) seatEl.classList.add('active');
    else seatEl.classList.remove('active');
  });

  // Dealer chip
  if (dealerChipEl) {
    dealerChipEl.classList.remove(
      'dealer-1','dealer-2','dealer-3','dealer-4','dealer-5','dealer-6'
    );

    const players = state.players || [];
    const btnIdx = players.findIndex(p => p.id === state.buttonPlayerId);

    if (btnIdx >= 0) {
      dealerChipEl.classList.add(`dealer-${btnIdx + 1}`);
      dealerChipEl.style.display = 'block';
    } else {
      dealerChipEl.style.display = 'none';
    }
  }
}


// =====================================================
// ===============   BOARD & POT RENDER   ===============
// =====================================================

function renderBoardAndPot(state, comboKeys) {
  comboKeys = comboKeys || [];

  // Pot
  if (potEl && potValueEl) {
    const totalPot = state.totalPot || 0;
    potValueEl.textContent = totalPot;
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
}


// =====================================================
// ===============   HERO RENDER   ======================
// =====================================================

function renderHero(state, comboKeys) {
  const me = (state.players || []).find(p => p.id === myPlayerId);
  comboKeys = comboKeys || [];

  heroNameEl.textContent  = me ? me.name : 'Hero';
  heroStackEl.textContent = me ? me.stack : 0;

  // Stage
  const stages = {
    waiting:  'Ожидание',
    preflop:  'Префлоп',
    flop:     'Флоп',
    turn:     'Тёрн',
    river:    'Ривер',
    showdown: 'Шоудаун'
  };
  heroPositionEl.textContent = 'Стадия: ' + (stages[state.stage] || '—');

  // Combination
  heroBestHandEl.textContent =
    state.yourBestHandType ? ('Комбинация: ' + state.yourBestHandType) : 'Комбинация: —';

  // Pocket cards
  heroCardsSlots.forEach((slot, idx) => {
    slot.innerHTML = '';
    const card = (state.yourCards || [])[idx];
    if (!card) return;
    const el = createCardEl(card);
    if (comboKeys.includes(cardKey(card))) el.classList.add('card--highlight');
    el.style.width = '100%';
    el.style.height = '100%';
    slot.appendChild(el);
  });

  // Your turn / timer
  clearTurnTimer();
  if (state.yourTurn) {
    heroLastActionEl.textContent = 'Ваш ход';
    if (state.turnDeadline) {
      const deadline = state.turnDeadline;
      const upd = () => {
        const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        heroLastActionEl.textContent = `Ваш ход · ${sec} с`;
        if (sec <= 0) clearTurnTimer();
      };
      upd();
      turnTimerInterval = setInterval(upd, 250);
    }
  } else {
    heroLastActionEl.textContent = 'Ожидание других игроков';
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
// ===============   JOIN / LEAVE LOGIC   ===============
// =====================================================

function isMeSeated(state) {
  if (!myPlayerId || !state || !state.players) return false;
  const me = state.players.find(p => p.id === myPlayerId);
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


// =====================================================
// ===============   MAIN RENDER   ======================
// =====================================================

function renderState(state) {
  lastState = state;
  const comboKeys = (state.yourBestHandCards || []).map(cardKey);

  renderSeats(state);
  renderBoardAndPot(state, comboKeys);
  renderHero(state, comboKeys);
  updateBetControls(state);
  updateSeatButton(state);
}


// =====================================================
// ===============   BET CONTROLS   =====================
// =====================================================

function updateBetControls(state) {
  if (!betRangeEl || !betAmountEl) return;
  const me = (state.players || []).find(p => p.id === myPlayerId);
  if (!me) return;

  const stack = me.stack || 0;
  betAmountEl.max = stack;

  let val = parseInt(betAmountEl.value) || 0;
  if (val < 0) val = 0;
  if (val > stack) val = stack;
  betAmountEl.value = val;

  const percent = stack > 0 ? Math.round((val / stack) * 100) : 0;
  betRangeEl.value = percent;
  betPercentLabel.textContent = percent + '%';
}

function getDefaultBetAmount() {
  if (!lastState) return 10;
  const s = lastState;
  const bb = s.bigBlind || 10;
  const minRaise = s.minRaise || bb;

  if (!s.currentBet || s.currentBet === 0) return bb;
  return s.currentBet + minRaise;
}


// =====================================================
// ===============   SOCKET LISTENERS   =================
// =====================================================

socket.on('connect', () => {
  myPlayerId = socket.id;
  console.log('[table.js] Connected →', myPlayerId);
});

socket.on('disconnect', () => {
  clearTurnTimer();
  console.warn('[table.js] Disconnected');
});

socket.on('gameState', (state) => {
  renderState(state);
});


// =====================================================
// ===============   ACTION BUTTONS   ===================
—END OF FILE—
