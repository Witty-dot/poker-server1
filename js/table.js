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
// ===============   DOM CACHE   =======================
// =====================================================

const seatEls          = Array.from(document.querySelectorAll('.seat'));
const dealerChipEl     = document.getElementById('dealerChip');
const tableEl          = document.getElementById('table');

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

const tableNameEl      = document.getElementById('tableName');
const tablePlayersEl   = document.getElementById('tablePlayers');
const tableTitleEl     = document.getElementById('tableTitle');

const seatButton       = document.getElementById('btnLeave');

const foldButton       = document.getElementById('foldButton');
const checkCallButton  = document.getElementById('checkCallButton');
const betRaiseButton   = document.getElementById('betRaiseButton');
const allInButton      = document.getElementById('allInButton');

const betRangeEl       = document.getElementById('betRange');
const betAmountEl      = document.getElementById('betAmount');
const betPercentLabel  = document.getElementById('betPercentLabel');
const presetButtons    = Array.from(document.querySelectorAll('[data-bet-preset]'));

const chatInput        = document.getElementById('chatInput');
const chatSend         = document.getElementById('chatSend');

// =====================================================
// ===============   HELPERS   =========================
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
// ===============   SEATS RENDER   ====================
// =====================================================

function renderSeats(state) {
  const players = state.players || [];

  seatEls.forEach((seatEl, idx) => {
    const slotPlayer = players[idx];
    const nameEl  = seatEl.querySelector('.seat-name');
    const stackEl = seatEl.querySelector('.seat-stack');

    // Пустой стул: нет игрока, либо paused, либо без стека
    if (!slotPlayer || slotPlayer.isPaused || (slotPlayer.stack || 0) <= 0) {
      seatEl.classList.add('seat--empty');
      seatEl.classList.remove('active');
      if (nameEl)  nameEl.textContent  = 'Пусто';
      if (stackEl) stackEl.textContent = '';
      return;
    }

    seatEl.classList.remove('seat--empty');
    if (nameEl)  nameEl.textContent  = slotPlayer.name || ('Игрок ' + (idx + 1));
    if (stackEl) stackEl.textContent = slotPlayer.stack;

    if (slotPlayer.id === state.currentTurn) seatEl.classList.add('active');
    else seatEl.classList.remove('active');
  });

  // Фишка дилера: позиционируем относительно реальной ширины стула
  if (dealerChipEl && tableEl) {
    const btnIdx = (state.players || []).findIndex(p =>
      p.id === state.buttonPlayerId && !p.isPaused && (p.stack || 0) > 0
    );

    if (btnIdx >= 0 && seatEls[btnIdx]) {
      const seatEl = seatEls[btnIdx];

      const tableRect = tableEl.getBoundingClientRect();
      const seatRect  = seatEl.getBoundingClientRect();
      const chipW = dealerChipEl.offsetWidth || 18;
      const chipH = dealerChipEl.offsetHeight || 18;

      const seatCenterX = seatRect.left + seatRect.width / 2;
      const seatCenterY = seatRect.top  + seatRect.height / 2;
      const tableCenterX = tableRect.left + tableRect.width / 2;
      const tableCenterY = tableRect.top  + tableRect.height / 2;

      const dx = seatCenterX - tableCenterX;
      const dy = seatCenterY - tableCenterY;
      const offset = 8;

      let left, top;

      if (Math.abs(dx) >= Math.abs(dy)) {
        // левая / правая сторона
        if (dx > 0) {
          // справа от центра — фишка слева от стула (внутрь стола)
          left = seatRect.left - tableRect.left - chipW - offset;
        } else {
          // слева от центра — фишка справа от стула
          left = seatRect.right - tableRect.left + offset;
        }
        top = seatCenterY - tableRect.top - chipH / 2;
      } else {
        // верх / низ
        if (dy > 0) {
          // снизу — фишка над стулом
          top = seatRect.top - tableRect.top - chipH - offset;
        } else {
          // сверху — фишка под стулом
          top = seatRect.bottom - tableRect.top + offset;
        }
        left = seatCenterX - tableRect.left - chipW / 2;
      }

      dealerChipEl.style.left = `${left}px`;
      dealerChipEl.style.top  = `${top}px`;
      dealerChipEl.style.display = 'flex';
    } else {
      dealerChipEl.style.display = 'none';
    }
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

  // Инфа под зелёной точкой
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

  // Краткое сообщение крупье над столом
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
// ===============   HERO RENDER   =====================
// =====================================================

function renderHero(state, comboKeys) {
  const me = (state.players || []).find(p => p.id === myPlayerId);
  comboKeys = comboKeys || [];

  if (heroNameEl)  heroNameEl.textContent  = me ? me.name : 'Hero';
  if (heroStackEl) heroStackEl.textContent = me ? me.stack : 0;

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

  if (heroBestHandEl) {
    heroBestHandEl.textContent =
      state.yourBestHandType ? ('Комбинация: ' + state.yourBestHandType) : 'Комбинация: —';
  }

  // Карманные карты
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

  // Ваш ход / таймер + подсказка "чек / бет / колл"
  clearTurnTimer();

  const isYourTurn = !!state.yourTurn;
  const toCall = (me && state.currentBet)
    ? Math.max(0, (state.currentBet || 0) - (me.betThisStreet || 0))
    : 0;
  let actionHint = '';

  if (isYourTurn) {
    if (toCall <= 0) {
      actionHint = 'вы можете чекнуть или поставить';
    } else {
      actionHint = 'вы можете коллировать, рейзить или сбросить';
    }
  }

  if (isYourTurn) {
    if (heroLastActionEl) {
      heroLastActionEl.textContent = `Ваш ход · ${actionHint || ''}`.trim();
    }

    if (state.turnDeadline) {
      const deadline = state.turnDeadline;
      const upd = () => {
        const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (heroLastActionEl) {
          heroLastActionEl.textContent =
            `Ваш ход · ${actionHint || ''} · ${sec} с`.replace(' ·  ·', ' ·');
        }
        if (sec <= 0) clearTurnTimer();
      };
      upd();
      turnTimerInterval = setInterval(upd, 250);
    }
  } else {
    if (heroLastActionEl) {
      heroLastActionEl.textContent = 'Ожидание других игроков';
    }
  }

  // Блокируем кнопки, если не наш ход
  const disable = !isYourTurn;
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
  state = state || lastState;
  if (!myPlayerId || !state || !state.players) return false;
  const me = state.players.find(p => p.id === myPlayerId);
  if (!me) return false;
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
// ===============   HEADER INFO =======================
// =====================================================

function updateHeader(state) {
  if (tableTitleEl) {
    const sb = state.smallBlind || 0;
    const bb = state.bigBlind || 0;
    tableTitleEl.textContent = `TABLE · NL ${sb}–${bb}`;
  }

  if (tablePlayersEl) {
    const totalSeats = seatEls.length || 6;
    const activeCount = (state.players || []).filter(
      p => !p.isPaused && (p.stack || 0) > 0
    ).length;
    tablePlayersEl.textContent = `${Math.min(activeCount, totalSeats)} / ${totalSeats} игроков`;
  }
}

// =====================================================
// ===============   MAIN RENDER   =====================
// =====================================================

function renderState(state) {
  lastState = state;
  const comboKeys = (state.yourBestHandCards || []).map(cardKey);

  renderSeats(state);
  renderBoardAndPot(state, comboKeys);
  renderHero(state, comboKeys);
  updateBetControls(state);
  updateSeatButton(state);
  updateHeader(state);
}

// =====================================================
// ===============   BET CONTROLS   ====================
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
  if (betPercentLabel) {
    betPercentLabel.textContent = betRangeEl.value + '%';
  }
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
// ===============   SOCKET LISTENERS  =================
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
// ===============   UI WIRING   =======================
// =====================================================

function wireUi() {
  // JOIN / LEAVE
  if (seatButton) {
    seatButton.addEventListener('click', () => {
      const seated = isMeSeated();
      if (seated) {
        // "Покинуть стол" — ставим на паузу
        socket.emit('setPlaying', { playing: false });
      } else {
        // "Сесть за стол" — создаём игрока, включаем игру
        socket.emit('joinTable', {
          playerName: 'Browser ' + Math.floor(Math.random() * 1000)
        });
        socket.emit('setPlaying', { playing: true });
      }
    });
  }

  // ACTION BUTTONS
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

  // RANGE → AMOUNT
  if (betRangeEl && betAmountEl) {
    betRangeEl.addEventListener('input', () => {
      const percent = parseInt(betRangeEl.value, 10) || 0;
      if (betPercentLabel) {
        betPercentLabel.textContent = percent + '%';
      }

      const me = lastState && lastState.players
        ? lastState.players.find(p => p.id === myPlayerId)
        : null;
      const stack = me ? me.stack || 0 : 0;

      const amount = Math.floor((stack * percent) / 100);
      betAmountEl.value = amount;
    });
  }

  // AMOUNT → RANGE
  if (betAmountEl && betRangeEl) {
    betAmountEl.addEventListener('input', () => {
      if (!lastState) return;
      const me = (lastState.players || []).find(p => p.id === myPlayerId);
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

  // PRESET BUTTONS
  if (presetButtons.length && betAmountEl) {
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!lastState) return;
        const preset = btn.getAttribute('data-bet-preset');

        const me = (lastState.players || []).find(p => p.id === myPlayerId);
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
          amount = Math.floor(stack * (parseInt(preset, 10) || 0) / 100);
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

  // iOS-неон для .action-btn
  const actionBtns = document.querySelectorAll('.action-btn');
  actionBtns.forEach(btn => {
    const press = () => btn.classList.add('is-pressed');
    const release = () => btn.classList.remove('is-pressed');

    btn.addEventListener('touchstart', press, { passive: true });
    btn.addEventListener('mousedown', press);

    ['touchend','touchcancel','mouseup','mouseleave'].forEach(ev => {
      btn.addEventListener(ev, release);
    });
  });

  // Чат: авто-скролл и фокус
  if (chatInput) {
    chatInput.addEventListener('focus', () => {
      setTimeout(() => {
        chatEl && (chatEl.scrollTop = chatEl.scrollHeight);
      }, 50);
    });
  }
  if (chatSend && chatInput) {
    chatSend.addEventListener('click', () => {
      chatInput.value = '';
    });
  }
}

wireUi();
