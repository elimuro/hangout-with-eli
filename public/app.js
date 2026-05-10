const socket = io();

// State
let myUsername = '';
let myColor = '';
let mySocketId = '';
const remoteCursors = new Map(); // socketId → DOM element

// DOM refs
const entryScreen = document.getElementById('entry-screen');
const roomScreen = document.getElementById('room-screen');
const entryForm = document.getElementById('entry-form');
const usernameInput = document.getElementById('username-input');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesList = document.getElementById('messages-list');
const presenceList = document.getElementById('presence-list');
const cursorLayer = document.getElementById('cursor-layer');
const reactionStage = document.getElementById('reaction-stage');

// ── Entry ──────────────────────────────────────────────────────────────────

entryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) return;
  myUsername = username;
  socket.emit('join', { username });
});

// ── Room state on join ─────────────────────────────────────────────────────

socket.on('room-state', ({ users, messages, you }) => {
  mySocketId = you.socketId;
  myColor = you.color;

  entryScreen.classList.add('fade-out');
  setTimeout(() => {
    entryScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    roomScreen.classList.add('fade-in');
    messageInput.focus();
  }, 500);

  renderPresence(users);
  messages.forEach(renderMessage);
  scrollToBottom();
});

// ── Presence ───────────────────────────────────────────────────────────────

socket.on('users', ({ list }) => {
  renderPresence(list);
});

socket.on('user-joined', ({ username, color }) => {
  renderSystemMessage(`${username} arrived`);
});

socket.on('user-left', ({ socketId, username }) => {
  renderSystemMessage(`${username} drifted away`);
  removeCursor(socketId);
});

function renderPresence(users) {
  presenceList.innerHTML = '';
  users.forEach((user) => {
    const dot = document.createElement('span');
    dot.className = 'presence-dot';
    dot.style.setProperty('--user-color', user.color);
    dot.title = user.username;
    dot.textContent = user.username;
    presenceList.appendChild(dot);
  });
}

// ── Messages ───────────────────────────────────────────────────────────────

socket.on('message', (msg) => {
  renderMessage(msg);
  scrollToBottom();
});

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit('message', { text });
  messageInput.value = '';
});

function renderMessage({ username, color, text, timestamp }) {
  const el = document.createElement('div');
  el.className = 'message';
  el.classList.toggle('message--mine', username === myUsername);

  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  el.innerHTML = `
    <span class="msg-author" style="color: ${color}">${escapeHtml(username)}</span>
    <span class="msg-text">${escapeHtml(text)}</span>
    <span class="msg-time">${time}</span>
  `;

  messagesList.appendChild(el);
}

function renderSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'message message--system';
  el.textContent = text;
  messagesList.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  const area = document.getElementById('messages-area');
  area.scrollTop = area.scrollHeight;
}

// ── Reactions ──────────────────────────────────────────────────────────────

document.querySelectorAll('.reaction-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    socket.emit('reaction', { emoji });
  });
});

socket.on('reaction', ({ username, color, emoji }) => {
  spawnReaction(emoji, color, username);
});

function spawnReaction(emoji, color, username) {
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.textContent = emoji;
  el.style.left = 20 + Math.random() * 60 + '%';
  el.style.color = color;

  const label = document.createElement('span');
  label.className = 'floating-reaction-label';
  label.textContent = username;
  el.appendChild(label);

  reactionStage.appendChild(el);

  el.addEventListener('animationend', () => el.remove());
}

// ── Cursors ────────────────────────────────────────────────────────────────

let lastCursorEmit = 0;
document.addEventListener('mousemove', (e) => {
  const now = Date.now();
  if (now - lastCursorEmit < 40) return; // throttle to ~25fps
  lastCursorEmit = now;

  const x = e.clientX / window.innerWidth;
  const y = e.clientY / window.innerHeight;
  socket.emit('cursor-move', { x, y });
});

socket.on('cursor-update', ({ socketId, username, color, x, y }) => {
  let cursor = remoteCursors.get(socketId);

  if (!cursor) {
    cursor = document.createElement('div');
    cursor.className = 'remote-cursor';
    cursor.innerHTML = `
      <svg class="cursor-pointer" viewBox="0 0 12 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 0 L0 14 L3.5 10.5 L6 16 L8 15 L5.5 9.5 L10 9.5 Z" fill="currentColor"/>
      </svg>
      <span class="cursor-label">${escapeHtml(username)}</span>
    `;
    cursor.style.color = color;
    cursorLayer.appendChild(cursor);
    remoteCursors.set(socketId, cursor);
  }

  cursor.style.left = x * 100 + '%';
  cursor.style.top = y * 100 + '%';
});

function removeCursor(socketId) {
  const cursor = remoteCursors.get(socketId);
  if (cursor) {
    cursor.remove();
    remoteCursors.delete(socketId);
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
