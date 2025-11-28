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
const pokerTableEl     = document.getElementById('table');

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

const seatButton       = document.getElementById('btnLeave');
const tableTitleEl     = document.getElementById('tableTitle');
const tablePlayersEl   = document.getElementById('tablePlayers');

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
      if (nameEl)  nameEl.textContent  = 'Пусто';
      if (stackEl) stackEl.textContent = '';
      return;
    }

    seatEl.classList.remove('seat--empty');
    if (nameEl)  nameEl.textContent  = slotPlayer.name || ('Игрок ' + (idx + 1));
    if (stackEl) stackEl.textContent = slotPlayer.stack;

    if (slotPlayer.id === state.currentTurn) {
      seatEl.classList.add('active');
    } else {
      seatEl.classList.remove('active');
    }
  });

  positionDealerChip(state);
}

/**
 * Дилерская фишка: всегда НА столе, рядом со стулом, не перекрывая его.
 * Считаем реальные координаты стула и ставим фишку ближе к центру стола.
 */
function positionDealerChip(state) {
  if (!dealerChipEl || !pokerTableEl) return;

  const players = state.players || [];
  const btnIdx = players.findIndex(p => p.id === state.buttonPlayerId);
  if (btnIdx < 0 || !seatEls[btnIdx]) {
    dealerChipEl.style.display = 'none';
    return;
  }

  const seatEl = seatEls[btnIdx];

  const tableRect = pokerTableEl.getBoundingClientRect();
  const seatRect  = seatEl.getBoundingClientRect();

  const seatCenterX  = seatRect.left + seatRect.width / 2;
  const seatCenterY  = seatRect.top  + seatRect.height / 2;
  const tableCenterX = tableRect.left + tableRect.width / 2;
  const tableCenterY = tableRect.top  + tableRect.height / 2;

  const dx = tableCenterX - seatCenterX;
  const dy = tableCenterY - seatCenterY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // Смещение от стула к центру стола
  const offset = 26; // px
  const chipX = seatCenterX + (dx / len) * offset;
  const chipY = seatCenterY + (dy / len) * offset;

  const left = chipX - tableRect.left;
  const top  = chipY - tableRect.top;

  dealerChipEl.style.left = left + 'px';
  dealerChipEl.style.top  = top + 'px';
  dealerChipEl.style.display = 'block';
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
    const sb = state.smallBlind || 0;
    const bb = state.bigBlind || 0;
    tableInfoEl.textContent =
      `Live · Hold'em · Блайнды ${sb}/${bb} · ${stageName}`;
  }

  // Short dealer text over table
  if (dealerShortEl) {
    let txt = state.tableMessage ||
              (state.dealerDetails ? String(state.dealerDetails).split('\n')[0] : '');
    if (txt && txt.length > 110) txt = txt.slice(0, 107) + '…';
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
  const players = state.players || [];
  const me = players.find(p => p.id === myPlayerId) || null;
  comboKeys = comboKeys || [];

  if (heroNameEl)  heroNameEl.textContent  = me ? me.name : 'Hero';
  if (heroStackEl) heroStackEl.textContent = me ? me.stack : 0;

  // Stage label
  if (heroPositionEl) {
    const stages = {
      waiting:  'Ожидание',
      preflop:  'Префлоп',
      flop:     'Флоп',
      turn:     'Тёрн',
      river:    'Ривер',
      showdown: 'Шоудаун'
    };
    heroPositionEl.textContent = 'Стадия: ' + (stages[state.stage] || '—');
  }

  // Combination name
  if (heroBestHandEl) {
    heroBestHandEl.textContent =
      state.yourBestHandType ? ('Комбинация: ' + state.yourBestHandType) : 'Комбинация: —';
  }

  // Pocket cards
  const yourCards = state.yourCards || [];
  heroCardsSlots.forEach((slot, idx) => {
    if (!slot) return;
    slot.innerHTML = '';
    const card = yourCards[idx];
    if (!card) return;
    const el = createCardEl(card);
    if (comboKeys.includes(cardKey(card))) el.classList.add('card--highlight');
    el.style.width = '100%';
    el.style.height = '100%';
    slot.appendChild(el);
  });

  // Your turn / timer + подсказка
  clearTurnTimer();

  const isYourTurn = !!state.yourTurn;
  const myBetThisStreet = me ? (me.betThisStreet || 0) : 0;
  const currentBet = state.currentBet || 0;
  const toCall = Math.max(0, currentBet - myBetThisStreet);

  let hintText = '';
  if (isYourTurn) {
    if (toCall <= 0) {
      hintText = 'Можно чекнуть или поставить.';
    } else {
      hintText = `Нужно уравнять ${toCall} или сделать рейз/пас.`;
    }
  }

  if (isYourTurn) {
    if (heroLastActionEl) {
      heroLastActionEl.textContent = 'Ваш ход';
    }
    if (state.turnDeadline) {
      const deadline = state.turnDeadline;
      const upd = () => {
        const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (heroLastActionEl) {
          heroLastActionEl.textContent =
            `Ваш ход · ${sec} с${hintText ? ' · ' + hintText : ''}`;
        }
        if (sec <= 0) clearTurnTimer();
      };
      upd();
      turnTimerInterval = setInterval(upd, 250);
    } else if (heroLastActionEl) {
      heroLastActionEl.textContent = `Ваш ход${hintText ? ' · ' + hintText : ''}`;
    }
  } else {
    if (heroLastActionEl) {
      heroLastActionEl.textContent = 'Ожидание других игроков';
    }
  }

  // Disable action buttons if not your turn
  const disable = !isYourTurn;
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
  // "за столом" — не на паузе и есть фишки
  return !me.isPaused && (me.stack || 0) > 0;
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
// ===============   HEADER INFO   ======================
// =====================================================

function updateHeaderInfo(state) {
  // NL SB–BB
  if (tableTitleEl) {
    const sb = state.smallBlind || 0;
    const bb = state.bigBlind || 0;
    tableTitleEl.textContent = `TABLE · NL ${sb}–${bb}`;
  }

  // X / 6 игроков — активные (не на паузе и с фишками)
  if (tablePlayersEl) {
    const players = state.players || [];
    const active = players.filter(p => !p.isPaused && (p.stack || 0) > 0).length;
    const maxSeats = seatEls.length || 6;
    tablePlayersEl.textContent = `${active} / ${maxSeats} игроков`;
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
  updateHeaderInfo(state);
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

  let val = parseInt(betAmountEl.value, 10);
  if (!Number.isFinite(val) || val < 0) val = 0;
  if (val > stack) val = stack;
  betAmountEl.value = val;

  const percent = stack > 0 ? Math.round((val / stack) * 100) : 0;
  betRangeEl.value = String(Math.min(100, Math.max(0, percent)));
  if (betPercentLabel) betPercentLabel.textContent = betRangeEl.value + '%';
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
  // ВАЖНО: не садимся автоматически, ждём клика "Сесть за стол"
});

socket.on('disconnect', () => {
  clearTurnTimer();
  console.warn('[table.js] Disconnected');
});

socket.on('gameState', (state) => {
  // console.log('[table.js] gameState:', state);
  renderState(state);
});


// =====================================================
// ===============   ACTION BUTTONS   ===================
// =====================================================

// Основные действия
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

  // Ползунок → сумма
  if (betRangeEl && betAmountEl) {
    betRangeEl.addEventListener('input', () => {
      const percent = parseInt(betRangeEl.value, 10) || 0;
      if (betPercentLabel) betPercentLabel.textContent = percent + '%';

      const players = (lastState && lastState.players) || [];
      const me = players.find(p => p.id === myPlayerId) || null;
      const stack = me ? (me.stack || 0) : 0;

      const amount = Math.floor((stack * percent) / 100);
      betAmountEl.value = amount;
    });
  }

  // Сумма → ползунок
  if (betAmountEl && betRangeEl) {
    betAmountEl.addEventListener('input', () => {
      if (!lastState) return;
      const players = lastState.players || [];
      const me = players.find(p => p.id === myPlayerId) || null;
      const stack = me ? (me.stack || 0) : 0;

      let val = parseInt(betAmountEl.value, 10);
      if (!Number.isFinite(val) || val < 0) val = 0;
      if (val > stack) val = stack;
      betAmountEl.value = val;

      const percent = stack > 0 ? Math.round((val / stack) * 100) : 0;
      betRangeEl.value = String(Math.min(100, Math.max(0, percent)));
      if (betPercentLabel) betPercentLabel.textContent = betRangeEl.value + '%';
    });
  }

  // Пресеты (⅓, ½, ¾, пот, макс)
  if (presetButtons.length && betAmountEl) {
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!lastState) return;
        const preset = btn.getAttribute('data-bet-preset');

        const players = lastState.players || [];
        const me = players.find(p => p.id === myPlayerId) || null;
        const stack = me ? (me.stack || 0) : 0;
        const totalPot = lastState.totalPot || 0;

        let amount = 0;

        if (preset === 'max') {
          socket.emit('action', { type: 'allin' });
          return;
        }

        if (preset === '33')      amount = Math.floor(totalPot * 0.33);
        else if (preset === '50') amount = Math.floor(totalPot * 0.5);
        else if (preset === '75') amount = Math.floor(totalPot * 0.75);
        else if (preset === '100') amount = totalPot;

        if (amount <= 0) {
          const p = parseInt(preset, 10) || 0;
          amount = Math.floor(stack * p / 100);
        }

        if (amount > stack) amount = stack;
        if (amount < 0) amount = 0;

        betAmountEl.value = amount;

        if (stack > 0 && betRangeEl) {
          const percent = Math.round((amount / stack) * 100);
          betRangeEl.value = String(Math.min(100, Math.max(0, percent)));
          if (betPercentLabel) betPercentLabel.textContent = betRangeEl.value + '%';
        }
      });
    });
  }

  // iOS-неон (дублирует inline-скрипт, но не ломает)
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


// =====================================================
// ===============   SEAT BUTTON CLICK   ================
// =====================================================

if (seatButton) {
  seatButton.addEventListener('click', () => {
    const state = lastState;
    const players = (state && state.players) || [];
    const me = players.find(p => p.id === myPlayerId) || null;

    if (!me) {
      // ещё не в списке игроков → первый вход за стол
      const rnd = Math.floor(Math.random() * 1000);
      socket.emit('joinTable', { playerName: 'Browser ' + rnd });
      return;
    }

    const seated = isMeSeated(state);
    if (seated) {
      // «Покинуть стол» → ставим на паузу
      socket.emit('setPlaying', { playing: false });
    } else {
      // «Сесть за стол» → снимаем с паузы
      socket.emit('setPlaying', { playing: true });
    }
  });
}
