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
let lastPersonalMessage = null;
let hasJoinedTable = false; // один раз вызываем joinTable

// =====================================================
// ===============   DOM CACHE   ========================
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
const chatInputEl      = document.getElementById('chatInput');

const tableTitleEl     = document.getElementById('tableTitle');
const tablePlayersEl   = document.getElementById('tablePlayers');
const tableNameEl      = document.getElementById('tableName');

const seatButton       = document.getElementById('btnLeave'); // "Сесть за стол"/"Покинуть стол"

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

function highlightCardEl(el) {
  if (!el) return;
  el.classList.add('card--highlight');
  // чтобы подсветка работала даже без отдельного CSS
  el.style.boxShadow = '0 0 14px rgba(255,215,0,0.9), 0 0 4px rgba(0,0,0,0.8)';
  el.style.transform = 'translateY(-2px)';
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
// ===============   SEATS & DEALER CHIP   =============
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
      if (nameEl)  nameEl.textContent = 'Пусто';
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
 * Фишка дилера привязывается к фактической ширине/позиции стула:
 * ставим её между стулом и центром стола, чтобы не налезала на стул.
 */
function positionDealerChip(state) {
  if (!dealerChipEl || !tableEl) return;

  const players = state.players || [];
  const btnId   = state.buttonPlayerId;
  if (!btnId) {
    dealerChipEl.style.display = 'none';
    return;
  }

  const btnIdx = players.findIndex(p => p.id === btnId);
  if (btnIdx < 0 || btnIdx >= seatEls.length) {
    dealerChipEl.style.display = 'none';
    return;
  }

  const seatEl = seatEls[btnIdx];
  if (!seatEl) {
    dealerChipEl.style.display = 'none';
    return;
  }

  const tableRect = tableEl.getBoundingClientRect();
  const seatRect  = seatEl.getBoundingClientRect();

  const seatCx = seatRect.left + seatRect.width / 2;
  const seatCy = seatRect.top  + seatRect.height / 2;

  const tableCx = tableRect.left + tableRect.width / 2;
  const tableCy = tableRect.top  + tableRect.height / 2;

  let dx = tableCx - seatCx;
  let dy = tableCy - seatCy;
  const dist = Math.sqrt(dx*dx + dy*dy) || 1;
  dx /= dist;
  dy /= dist;

  const offset = seatRect.height * 0.9; // насколько отодвигаем фишку от стула внутрь стола

  const chipCx = seatCx + dx * offset;
  const chipCy = seatCy + dy * offset;

  const relX = ((chipCx - tableRect.left) / tableRect.width) * 100;
  const relY = ((chipCy - tableRect.top)  / tableRect.height) * 100;

  dealerChipEl.style.display = 'block';
  dealerChipEl.style.left = relX + '%';
  dealerChipEl.style.top  = relY + '%';
  dealerChipEl.style.transform = 'translate(-50%, -50%)';
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
      if (comboKeys.includes(cardKey(card))) {
        highlightCardEl(el);
      }
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
    const sb = state.smallBlind ?? 0;
    const bb = state.bigBlind   ?? 0;
    tableInfoEl.textContent =
      `Live · Hold'em · Блайнды ${sb}/${bb} · ${stageName}`;
  }

  // Заголовок в хедере: реальный лимит (NL sb/bb)
  if (tableTitleEl) {
    const sb = state.smallBlind ?? 0;
    const bb = state.bigBlind   ?? 0;
    tableTitleEl.textContent = `TABLE · NL ${sb}-${bb}`;
  }

  // Кол-во игроков в хедере (реально за столом)
  if (tablePlayersEl) {
    const players = state.players || [];
    const total   = players.length;
    const active  = players.filter(p => !p.isPaused && p.stack > 0).length;
    tablePlayersEl.textContent = `${active} / ${total} игроков`;
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

  // Персональное сообщение игроку (шоудаун, выигрыш и т.п.) → чат
  if (state.message && state.message !== lastPersonalMessage) {
    appendChatLine('system', state.message);
    lastPersonalMessage = state.message;
  }
}


// =====================================================
// ===============   HERO RENDER   ======================
// =====================================================

let lastHeroHint = '';

function buildHeroHint(state, me) {
  if (!me) return '';
  if (!state.yourTurn) return '';

  const toCall = (state.currentBet || 0) - (me.betThisStreet || 0);
  const stack  = me.stack || 0;

  if (toCall <= 0) {
    // никто не поставил
    if (stack > 0) {
      return 'Вы можете чекнуть или поставить.';
    }
    return 'Ход за вами.';
  }

  // есть ставка против вас
  if (toCall > 0 && toCall < stack) {
    return 'Вы можете уравнять ставку, сделать рейз или сбросить карты.';
  }

  if (toCall >= stack) {
    return 'У вас меньше фишек, вы можете уравнять олл-ин или сбросить карты.';
  }

  return '';
}

function renderHero(state, comboKeys) {
  const me = (state.players || []).find(p => p.id === myPlayerId);
  comboKeys = comboKeys || [];

  if (heroNameEl)  heroNameEl.textContent  = me ? me.name : 'Hero';
  if (heroStackEl) heroStackEl.textContent = me ? me.stack : 0;

  // Stage
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

  // Combination
  if (heroBestHandEl) {
    heroBestHandEl.textContent =
      state.yourBestHandType ? ('Комбинация: ' + state.yourBestHandType) : 'Комбинация: —';
  }

  // Pocket cards (только реальные; до раздачи слоты пустые — без белых заглушек)
  const yourCards = state.yourCards || [];
  heroCardsSlots.forEach((slot, idx) => {
    slot.innerHTML = '';
    const card = yourCards[idx];
    if (!card) return;
    const el = createCardEl(card);
    if (comboKeys.includes(cardKey(card))) {
      highlightCardEl(el);
    }
    el.style.width = '100%';
    el.style.height = '100%';
    slot.appendChild(el);
  });

  // Подсказка
  lastHeroHint = buildHeroHint(state, me);

  // Your turn / timer
  clearTurnTimer();
  if (state.yourTurn) {
    if (heroLastActionEl) {
      heroLastActionEl.textContent = lastHeroHint
        ? `Ваш ход · ${lastHeroHint}`
        : 'Ваш ход';
    }

    if (state.turnDeadline) {
      const deadline = state.turnDeadline;
      const upd = () => {
        const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (heroLastActionEl) {
          if (lastHeroHint) {
            heroLastActionEl.textContent = `Ваш ход · ${sec} с · ${lastHeroHint}`;
          } else {
            heroLastActionEl.textContent = `Ваш ход · ${sec} с`;
          }
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

  // Disable action buttons if not your turn
  const disable = !state.yourTurn || !isMeSeated(state);
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

function wireSeatButton() {
  if (!seatButton) return;

  seatButton.addEventListener('click', () => {
    if (!lastState) {
      // ещё не получили состояние от сервера — на всякий случай просто запросим join
      const rnd = Math.floor(Math.random() * 1000);
      socket.emit('joinTable', { playerName: 'Browser ' + rnd });
      hasJoinedTable = true;
      return;
    }

    const seated = isMeSeated(lastState);

    if (seated) {
      // "Покинуть стол" → ставим игрока на паузу, но не выкидываем с сервера
      socket.emit('setPlaying', { playing: false });
    } else {
      // "Сесть за стол"
      if (!hasJoinedTable) {
        const rnd = Math.floor(Math.random() * 1000);
        socket.emit('joinTable', { playerName: 'Browser ' + rnd });
        hasJoinedTable = true;
      }
      // на всякий случай снимаем с паузы
      socket.emit('setPlaying', { playing: true });
    }
  });
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

  let val = parseInt(betAmountEl.value, 10) || 0;
  if (val < 0) val = 0;
  if (val > stack) val = stack;
  betAmountEl.value = val;

  const percent = stack > 0 ? Math.round((val / stack) * 100) : 0;
  betRangeEl.value = String(percent);
  if (betPercentLabel) {
    betPercentLabel.textContent = percent + '%';
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
// ===============   SOCKET LISTENERS   =================
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
  renderState(state);
});


// =====================================================
// ===============   ACTION BUTTONS   ===================
// =====================================================

function wireActionButtons() {
  // Fold
  if (foldButton) {
    foldButton.addEventListener('click', () => {
      socket.emit('action', { type: 'fold' });
    });
  }

  // Check / Call
  if (checkCallButton) {
    checkCallButton.addEventListener('click', () => {
      socket.emit('action', { type: 'call' });
    });
  }

  // Bet / Raise
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

  // All-in
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

  // пресеты (⅓, ½, ¾, пот, макс)
  if (presetButtons.length && betAmountEl) {
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!lastState) return;
        const preset = btn.getAttribute('data-bet-preset');

        const players = lastState.players || [];
        const me = players.find(p => p.id === myPlayerId) || null;
        const stack = me ? me.stack || 0 : 0;
        const totalPot = lastState.totalPot || 0;

        if (preset === 'max') {
          socket.emit('action', { type: 'allin' });
          return;
        }

        let amount = 0;

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
          const perc = parseInt(preset, 10) || 0;
          amount = Math.floor(stack * perc / 100);
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

  // iOS-неон для .action-btn (дублирование с инлайновым скриптом не критично)
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


// =====================================================
// ===============   CHAT UX МЕЛОЧИ   ===================
// =====================================================

(function initChatUX() {
  if (chatInputEl) {
    // автофокус один раз (если будет бесить — скажешь, уберу)
    try {
      chatInputEl.focus();
    } catch (e) {
      // игнор
    }

    chatInputEl.addEventListener('focus', () => {
      if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
    });
  }
})();


// =====================================================
// ===============   INIT BINDINGS   ====================
// =====================================================

wireActionButtons();
wireSeatButton();
