const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room state
const room = {
  users: new Map(), // socketId → { username, color }
  messages: [],     // last 50 messages
};

const USER_COLORS = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff922b', '#cc5de8', '#20c997', '#f06595',
  '#74c0fc', '#a9e34b',
];

function getColor(index) {
  return USER_COLORS[index % USER_COLORS.length];
}

function broadcastUsers() {
  const list = Array.from(room.users.values());
  io.emit('users', { list });
}

io.on('connection', (socket) => {
  socket.on('join', ({ username }) => {
    const colorIndex = room.users.size;
    const user = { username, color: getColor(colorIndex) };
    room.users.set(socket.id, user);

    // Send current state to the joining user
    socket.emit('room-state', {
      users: Array.from(room.users.values()),
      messages: room.messages,
      you: { socketId: socket.id, ...user },
    });

    // Notify everyone else
    socket.broadcast.emit('user-joined', { username: user.username, color: user.color });

    broadcastUsers();
  });

  socket.on('message', ({ text }) => {
    const user = room.users.get(socket.id);
    if (!user || !text?.trim()) return;

    const msg = {
      id: Date.now() + Math.random(),
      username: user.username,
      color: user.color,
      text: text.trim(),
      timestamp: Date.now(),
    };

    room.messages.push(msg);
    if (room.messages.length > 50) room.messages.shift();

    io.emit('message', msg);
  });

  socket.on('reaction', ({ emoji }) => {
    const user = room.users.get(socket.id);
    if (!user) return;
    io.emit('reaction', { username: user.username, color: user.color, emoji });
  });

  socket.on('cursor-move', ({ x, y }) => {
    const user = room.users.get(socket.id);
    if (!user) return;
    socket.broadcast.emit('cursor-update', {
      socketId: socket.id,
      username: user.username,
      color: user.color,
      x,
      y,
    });
  });

  socket.on('disconnect', () => {
    const user = room.users.get(socket.id);
    if (!user) return;

    room.users.delete(socket.id);
    io.emit('user-left', { socketId: socket.id, username: user.username });
    broadcastUsers();
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
