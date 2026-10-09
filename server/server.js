const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" },
  maxHttpBufferSize: 50 * 1024 * 1024
});

const DB_FILE = path.join(__dirname, 'database.json');

// Helper functions to load & save persistent state
function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Database read error, starting fresh:", e);
  }
  return {
    users: [],
    messages: [],
    groups: ['General', 'Project-Team']
  };
}

let db = loadDatabase();

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error("Database save error:", e);
  }
}

const onlineMap = new Map(); // username.toLowerCase() -> socketId

// --- Auth Endpoints with Persistence ---
app.post('/api/register', (req, res) => {
  const { username, password, avatar } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const trimmed = username.trim();
  const existing = db.users.find(u => u.username.toLowerCase() === trimmed.toLowerCase());
  if (existing) return res.status(400).json({ error: 'Username already registered' });

  const newUser = { 
    username: trimmed, 
    password, 
    avatar: avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(trimmed) 
  };
  db.users.push(newUser);
  saveDatabase();
  res.json(newUser);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const trimmed = (username || '').trim().toLowerCase();
  const existing = db.users.find(u => u.username.toLowerCase() === trimmed);
  if (!existing || existing.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json(existing);
});

app.post('/api/update-avatar', (req, res) => {
  const { username, avatar } = req.body;
  const user = db.users.find(u => u.username.toLowerCase() === (username || '').toLowerCase());
  if (user) {
    user.avatar = avatar;
    saveDatabase();
    const userList = db.users.map(u => ({ username: u.username, avatar: u.avatar }));
    io.emit('sync_users', { users: userList, online: Array.from(onlineMap.keys()) });
  }
  res.json({ success: true });
});

app.get('/api/data', (req, res) => {
  const userList = db.users.map(u => ({ username: u.username, avatar: u.avatar }));
  res.json({ users: userList, groups: db.groups, messages: db.messages });
});

// --- WebSocket Realtime Handling ---
io.on('connection', (socket) => {
  socket.on('join', ({ username, avatar }) => {
    socket.username = username;
    const key = username.toLowerCase();
    onlineMap.set(key, socket.id);

    const user = db.users.find(u => u.username.toLowerCase() === key);
    if (user && avatar && user.avatar !== avatar) {
      user.avatar = avatar;
      saveDatabase();
    }

    const userList = db.users.map(u => ({ username: u.username, avatar: u.avatar }));
    io.emit('sync_users', { users: userList, online: Array.from(onlineMap.keys()) });
    io.emit('sync_groups', db.groups);
  });

  socket.on('create_group', (groupName) => {
    const clean = groupName.trim().replace(/\s+/g, '-');
    if (!db.groups.includes(clean)) {
      db.groups.push(clean);
      saveDatabase();
      io.emit('sync_groups', db.groups);
    }
  });

  socket.on('msg', (data) => {
    const sender = db.users.find(u => u.username.toLowerCase() === data.from.toLowerCase());
    const msgObj = {
      id: Date.now(),
      from: data.from,
      avatar: sender ? sender.avatar : data.avatar,
      to: data.to,
      text: data.text || '',
      isGroup: data.isGroup,
      hideFrom: data.hideFrom || '',
      mediaType: data.mediaType || null,
      mediaUrl: data.mediaUrl || null,
      fileName: data.fileName || null,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    db.messages.push(msgObj);
    saveDatabase();

    if (data.isGroup) {
      for (const [onlineUser, socketId] of onlineMap.entries()) {
        if (!data.hideFrom || onlineUser !== data.hideFrom.toLowerCase()) {
          io.to(socketId).emit('msg_broadcast', msgObj);
        }
      }
    } else {
      const targetSocket = onlineMap.get(data.to.toLowerCase());
      if (targetSocket) {
        io.to(targetSocket).emit('msg_broadcast', msgObj);
      }
      socket.emit('msg_broadcast', msgObj);
    }

    if (data.text && data.text.startsWith('@ai')) {
      setTimeout(() => {
        const aiMsg = {
          id: Date.now() + 1,
          from: 'CampusBot (AI)',
          avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=CampusBot',
          to: data.to,
          text: `🤖 AI Assistant: Acknowledged "${data.text.replace('@ai', '').trim()}". Saved in logs!`,
          isGroup: data.isGroup,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        db.messages.push(aiMsg);
        saveDatabase();

        if (data.isGroup) {
          io.emit('msg_broadcast', aiMsg);
        } else {
          const targetSocket = onlineMap.get(data.to.toLowerCase());
          if (targetSocket) io.to(targetSocket).emit('msg_broadcast', aiMsg);
          socket.emit('msg_broadcast', aiMsg);
        }
      }, 400);
    }
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      onlineMap.delete(socket.username.toLowerCase());
    }
    const userList = db.users.map(u => ({ username: u.username, avatar: u.avatar }));
    io.emit('sync_users', { users: userList, online: Array.from(onlineMap.keys()) });
  });
});

server.listen(5000, () => console.log('✓ Server running on http://localhost:5000 (Persistent storage enabled)'));
