// surveillance-robot/api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { pool } = require('./db'); // must export pool in api/db.js

const JWT_SECRET = process.env.JWT_SECRET || 'replace_with_secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// create server + socket.io
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  transports: ['websocket']
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // receive telemetry emitted by Pi clients
  socket.on('telemetry_from_pi', async (data) => {
    try {
      const { robotId, payload } = data;
      if (!robotId || !payload) return;
      const [result] = await pool.execute('INSERT INTO telemetry (robotId, payload) VALUES (?, ?)', [robotId, JSON.stringify(payload)]);
      const insertId = result.insertId;
      const event = { id: insertId, robotId, payload, created_at: new Date().toISOString() };
      io.emit('telemetry', event);
    } catch (err) {
      console.error('socket telemetry error', err);
    }
  });

  socket.on('disconnect', () => console.log('socket disconnected', socket.id));
});

// Utility functions
function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

// Basic health
app.get('/', (req, res) => res.json({ ok: true }));

/**
 * AUTH: register / login / google
 */
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });

    const [exists] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (exists && exists.length > 0) return res.status(400).json({ error: 'user exists' });

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.execute('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashed]);
    const userId = result.insertId;
    const token = signToken({ id: userId, email });
    return res.json({ token, user: { id: userId, email } });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });

    const [rows] = await pool.execute('SELECT id, email, password FROM users WHERE email = ?', [email]);
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password || '');
    if (!match) return res.status(401).json({ error: 'invalid credentials' });

    const token = signToken({ id: user.id, email: user.email });
    return res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.post('/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken required' });

    const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
    const resp = await axios.get(tokenInfoUrl).catch(e => ({ status: e.response?.status || 500, data: e.response?.data }));
    if (!resp || resp.status !== 200) {
      console.error('google tokeninfo failed', resp?.status, resp?.data);
      return res.status(401).json({ error: 'invalid google token' });
    }

    const payload = resp.data;
    if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
      console.error('google aud mismatch', payload.aud);
      return res.status(401).json({ error: 'google token aud mismatch' });
    }

    const email = payload.email;
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    let userId;
    if (existing && existing.length > 0) {
      userId = existing[0].id;
    } else {
      const [ins] = await pool.execute('INSERT INTO users (email, password) VALUES (?, ?)', [email, null]);
      userId = ins.insertId;
    }

    const token = signToken({ id: userId, email });
    return res.json({ token, user: { id: userId, email } });
  } catch (err) {
    console.error('google auth error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * TELEMETRY & CONTROL
 */
app.post('/telemetry', async (req, res) => {
  try {
    const { robotId, payload } = req.body;
    if (!robotId || !payload) return res.status(400).json({ error: 'robotId and payload required' });

    const [result] = await pool.execute('INSERT INTO telemetry (robotId, payload) VALUES (?, ?)', [robotId, JSON.stringify(payload)]);
    const insertId = result.insertId;
    const event = { id: insertId, robotId, payload, created_at: new Date().toISOString() };
    io.emit('telemetry', event);
    return res.json({ id: insertId });
  } catch (err) {
    console.error('telemetry error', err);
    return res.status(500).json({ error: 'db error' });
  }
});

app.post('/control', async (req, res) => {
  try {
    const { robotId, command } = req.body;
    if (!robotId || !command) return res.status(400).json({ error: 'robotId and command required' });

    const [result] = await pool.execute('INSERT INTO commands (robotId, command) VALUES (?, ?)', [robotId, JSON.stringify(command)]);
    const insertId = result.insertId;
    io.emit('command', { id: insertId, robotId, command, created_at: new Date().toISOString() });
    return res.json({ id: insertId });
  } catch (err) {
    console.error('control error', err);
    return res.status(500).json({ error: 'db error' });
  }
});

app.get('/commands', async (req, res) => {
  try {
    const { robotId } = req.query;
    if (!robotId) return res.status(400).json({ error: 'robotId required' });
    const [rows] = await pool.execute('SELECT id, robotId, command, processed, created_at FROM commands WHERE robotId = ? AND processed = 0 ORDER BY id ASC LIMIT 50', [robotId]);
    const parsed = rows.map(r => ({ ...r, command: r.command ? JSON.parse(r.command) : null }));
    return res.json(parsed);
  } catch (err) {
    console.error('commands error', err);
    return res.status(500).json({ error: 'db error' });
  }
});

app.post('/commands/:id/processed', async (req, res) => {
  try {
    const id = req.params.id;
    await pool.execute('UPDATE commands SET processed = 1 WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('mark processed error', err);
    return res.status(500).json({ error: 'db error' });
  }
});

// start server
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`API + sockets listening on ${port}`));
