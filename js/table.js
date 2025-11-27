// Подключаемся к боевому серверу с логикой
const socket = io('https://poker-server-f2et.onrender.com', {
  transports: ['websocket', 'polling'], // пусть будет гибко
});

// Лог для дебага
socket.on('connect', () => {
  console.log('[table.js] connected to engine:', socket.id);

  // Сразу "садимся" за стол, как демо
  const rnd = Math.floor(Math.random() * 1000);
  socket.emit('joinTable', {
    playerName: 'Browser ' + rnd,
  });
});

socket.on('connect_error', (err) => {
  console.error('[table.js] connect_error:', err);
});

socket.on('disconnect', (reason) => {
  console.warn('[table.js] disconnected:', reason);
});

// Сюда сервер шлёт всё состояние стола
socket.on('gameState', (state) => {
  console.log('[table.js] gameState:', state);

  // Пока просто отрисуем фишки и никнеймы по первым 6 игрокам
  const seatEls = document.querySelectorAll('.seat');
  if (!seatEls.length) {
    // если у красивого стола другая разметка — потом подгоним
    return;
  }

  seatEls.forEach((seatEl, index) => {
    const p = state.players[index];

    // Пример: внутри seat есть .seat-avatar, .seat-name, .seat-stack
    const nameEl  = seatEl.querySelector('.seat-name');
    const stackEl = seatEl.querySelector('.seat-stack');

    if (!p) {
      seatEl.classList.add('seat--empty');
      if (nameEl)  nameEl.textContent  = 'Пусто';
      if (stackEl) stackEl.textContent = '';
      return;
    }

    seatEl.classList.remove('seat--empty');
    if (nameEl)  nameEl.textContent  = p.name || ('Игрок ' + (index + 1));
    if (stackEl) stackEl.textContent = p.stack;
  });
});
