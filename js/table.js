// /js/table.js

// 1. Коннект к серверу
const socket = io('/', {
  transports: ['websocket'],
});

let heroId = null;
let heroName = null;

// ====== УТИЛИТЫ ======

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = byId(id);
  if (el) el.textContent = text;
}

function suitIsRed(suit) {
  return suit === '♥' || suit === '♦' || suit === 'h' || suit === 'd';
}

function normalizeSuit(suit) {
  if (suit === 'h' || suit === '♥') return '♥';
  if (suit === 'd' || suit === '♦') return '♦';
  if (suit === 'c' || suit === '♣') return '♣';
  if (suit === 's' || suit === '♠') return '♠';
  return suit || '?';
}

// позиция относительно баттона (грубо, но норм)
function getPositionName(players, heroIndex, buttonIndex) {
  if (heroIndex == null || buttonIndex == null || players.length === 0) return '-';

  const active = players.filter(p => !p.isPaused && p.stack > 0);
  if (active.length < 2) return '-';

  const len = players.length;
  let order = [];
  for (let i = 0; i < len; i++) {
    const idx = (buttonIndex + i) % len;
    order.push(idx);
  }

  const onlyActive = order.filter(i => {
    const p = players[i];
    return p && !p.isPaused && p.stack > 0;
  });

  const posIdx = onlyActive.indexOf(heroIndex);
  if (posIdx < 0) return '-';

  // на 6 макс:
  const names6 = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
  return names6[posIdx] || 'MP';
}

// ====== ИНИЦИАЛИЗАЦИЯ ======

// имя игрока
(function initHeroName() {
  let stored = localStorage.getItem('mb_player_name') || '';
  if (!stored) {
    stored = 'Player ' + Math.floor(Math.random() * 900 + 100);
    localStorage.setItem('mb_player_name', stored);
  }
  heroName = stored;
  const heroNameEl = byId('heroName');
  if (heroNameEl) heroNameEl.textContent = heroName;
})();

// ====== СОЕДИНЕНИЕ СО СТОЛОМ ======

socket.on('connect', () => {
  heroId = socket.id;
  // присоединяемся к столу
  socket.emit('joinTable', {
    playerName: heroName,
  });

  // по желанию: можно авто сказать, что мы "играем"
  socket.emit('setPlaying', { playing: true });
});

// Основное состояние с сервера
socket.on('gameState', (state) => {
  renderGameState(state);
});

// ====== РЕНДЕР СОСТОЯНИЯ СТОЛА ======

function renderGameState(state) {
  if (!state) return;

  // --- Верх + общая инфа ---
  const totalPot = state.totalPot || 0;
  const stage = state.stage || 'waiting';

  // инфа о столе (можно оформить красивее)
  setText('tableInfo', `Live · Hold'em · Blinds ${state.smallBlind}/${state.bigBlind}`);

  // банк
  const potEl = byId('pot');
  if (potEl) {
    const span = potEl.querySelector('span');
    if (span) span.textContent = totalPot.toLocaleString('ru-RU');
    potEl.style.display = totalPot > 0 ? 'block' : 'none';
  }

  // борд
  renderBoard(state.communityCards || []);

  // игроки / стулья
  renderSeats(state);

  // герой (нижняя панель)
  renderHero(state);

  // позиция героя
  renderHeroPosition(state);

  // можно вывести последнюю фразу крупье (tableMessage)
  const heroLastActionEl = byId('heroLastAction');
  if (heroLastActionEl) {
    heroLastActionEl.textContent = state.tableMessage || 'Идёт раздача';
  }
}

function renderBoard(communityCards) {
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  boardEl.innerHTML = '';

  communityCards.forEach((card) => {
    const rank = card.rank;
    const suit = normalizeSuit(card.suit);
    const isRed = suitIsRed(suit);

    const cardDiv = document.createElement('div');
    cardDiv.className = 'card ' + (isRed ? 'red' : 'black');

    const rEl = document.createElement('div');
    rEl.className = 'card-rank';
    rEl.textContent = rank;

    const sEl = document.createElement('div');
    sEl.className = 'card-suit';
    sEl.textContent = suit;

    cardDiv.appendChild(rEl);
    cardDiv.appendChild(sEl);
    boardEl.appendChild(cardDiv);
  });
}

function renderSeats(state) {
  const seats = document.querySelectorAll('.seat');
  const players = state.players || [];
  const currentTurnId = state.currentTurn;

  seats.forEach((seatEl, idx) => {
    const player = players[idx]; // 0 -> seat-1, 1 -> seat-2 и т.д.

    const nameEl = seatEl.querySelector('.seat-name');
    const stackEl = seatEl.querySelector('.seat-stack');
    const avatarEl = seatEl.querySelector('.seat-avatar');

    if (!player) {
      // пустое место
      seatEl.style.opacity = 0.25;
      if (nameEl) nameEl.textContent = 'Пусто';
      if (stackEl) stackEl.textContent = '—';
      if (avatarEl) avatarEl.textContent = '+';
      seatEl.classList.remove('seat--active', 'seat--turn');
      return;
    }

    seatEl.style.opacity = 1;
    const shortName = player.name || 'Игрок';
    if (nameEl) nameEl.textContent = shortName;
    if (stackEl) stackEl.textContent = (player.stack ?? 0).toLocaleString('ru-RU');
    if (avatarEl) avatarEl.textContent = (shortName[0] || 'P').toUpperCase();

    // подсветка играющего/ходящего
    if (player.inHand) {
      seatEl.classList.add('seat--active');
    } else {
      seatEl.classList.remove('seat--active');
    }

    if (player.id === currentTurnId) {
      seatEl.classList.add('seat--turn');
    } else {
      seatEl.classList.remove('seat--turn');
    }
  });

  // дилер-чип
  const dealerChip = document.getElementById('dealerChip');
  if (dealerChip) {
    const btnId = state.buttonPlayerId;
    const btnIndex = players.findIndex((p) => p.id === btnId);
    dealerChip.style.display = btnIndex === -1 ? 'none' : 'block';

    // грубая привязка к классам dealer-1 ... dealer-6
    dealerChip.className = 'dealer-chip';
    if (btnIndex >= 0 && btnIndex < 6) {
      dealerChip.classList.add(`dealer-${btnIndex + 1}`);
    }
  }

  // инфа в топбаре
  setText('tablePlayers', `${players.length} / 6 игроков`);
}

function renderHero(state) {
  const players = state.players || [];
  const heroIndex = players.findIndex((p) => p.id === heroId);
  const hero = heroIndex >= 0 ? players[heroIndex] : null;

  if (!hero) {
    setText('heroStack', '0');
    return;
  }

  // стек
  const stackEl = document.getElementById('heroStack');
  if (stackEl) {
    stackEl.textContent = hero.stack.toLocaleString('ru-RU');
  }

  // аватар
  const avatarEl = document.getElementById('heroAvatar');
  if (avatarEl) {
    const short = hero.name || 'Hero';
    avatarEl.textContent = (short[0] || 'H').toUpperCase();
  }

  // свои карты
  const handSlots = document.querySelectorAll('.hero-card-slot');
  const yourCards = state.yourCards || [];
  handSlots.forEach((slot, idx) => {
    slot.innerHTML = '';
    const card = yourCards[idx];
    if (!card) return;
    const rank = card.rank;
    const suit = normalizeSuit(card.suit);
    const isRed = suitIsRed(suit);

    const inner = document.createElement('div');
    inner.className = 'card ' + (isRed ? 'red' : 'black');
    inner.style.width = '100%';
    inner.style.height = '100%';

    const rEl = document.createElement('div');
    rEl.className = 'card-rank';
    rEl.textContent = rank;

    const sEl = document.createElement('div');
    sEl.className = 'card-suit';
    sEl.textContent = suit;

    inner.appendChild(rEl);
    inner.appendChild(sEl);
    slot.appendChild(inner);
  });
}

function renderHeroPosition(state) {
  const players = state.players || [];
  const btnId = state.buttonPlayerId;
  const heroIndex = players.findIndex((p) => p.id === heroId);
  const btnIndex = players.findIndex((p) => p.id === btnId);

  const posName = getPositionName(players, heroIndex, btnIndex);
  const el = byId('heroPosition');
  if (el) {
    el.textContent = `Позиция: ${posName}`;
  }
}

// ====== КНОПКИ ДЕЙСТВИЙ ======

function wireActions() {
  const foldBtn = byId('foldButton');
  const checkCallBtn = byId('checkCallButton');
  const betRaiseBtn = byId('betRaiseButton');
  const allInBtn = byId('allInButton');
  const betRange = byId('betRange');
  const betAmount = byId('betAmount');

  if (foldBtn) {
    foldBtn.addEventListener('click', () => {
      socket.emit('action', { type: 'fold' });
    });
  }

  if (checkCallBtn) {
    checkCallBtn.addEventListener('click', () => {
      socket.emit('action', { type: 'call' });
    });
  }

  if (allInBtn) {
    allInBtn.addEventListener('click', () => {
      socket.emit('action', { type: 'allin' });
    });
  }

  // связь слайдера и инпута
  if (betRange && betAmount) {
    betRange.addEventListener('input', () => {
      const val = parseInt(betRange.value || '0', 10);
      // пока без "от % пота", просто транслируем
      betAmount.value = val;
    });

    betAmount.addEventListener('input', () => {
      const v = parseInt(betAmount.value || '0', 10);
      if (!Number.isNaN(v)) {
        betRange.value = String(v);
      }
    });
  }

  if (betRaiseBtn) {
    betRaiseBtn.addEventListener('click', () => {
      let amount = 0;
      if (betAmount) {
        amount = parseInt(betAmount.value || '0', 10);
        if (Number.isNaN(amount) || amount < 0) amount = 0;
      }

      socket.emit('action', {
        type: 'bet',
        amount,
      });
    });
  }

  // Пресеты ставок (⅓, ½ банка и т.п.) — если есть
  document.querySelectorAll('[data-bet-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-bet-preset');
      // здесь можно взять из стейта totalPot и перевести в amount
      // но стейт нам приходит асинхронно, так что можно хранить lastState глобально.
      // Для первого круга оставим заглушкой — настроим позже.
    });
  });

  // Кнопка "Начать раздачу" (если есть на странице)
  const startBtn = byId('startHandButton') || byId('startHand');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      socket.emit('startHand');
    });
  }
}

document.addEventListener('DOMContentLoaded', wireActions);
