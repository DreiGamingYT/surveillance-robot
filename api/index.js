// surveillance-robot/api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const { pool } = require('./db'); 
const { spawn } = require('child_process');
const recordProcesses = new Map();

// recordings directory (declare once)
const REC_DIR = path.join(__dirname, 'static', 'recordings');
if (!fs.existsSync(REC_DIR)) fs.mkdirSync(REC_DIR, { recursive: true });

const JWT_SECRET = process.env.JWT_SECRET || 'replace_with_secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const LIDAR_API_KEY = process.env.LIDAR_API_KEY || '';

const app = express();
app.use('/record/file', express.static(REC_DIR));
app.use(helmet());
app.use(cors());
app.use(express.json()); // important: parse JSON bodies

// create server + socket.io
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['polling', 'websocket'],
});

// In-memory mapping: robotId -> socketId
// NOTE: ephemeral; will reset on server restart. For multi-instance use a shared store.
const robotSockets = new Map();

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // If robotId provided in handshake query, register it
  try {
    const q = socket.handshake && socket.handshake.query;
    const qRobotId = q && (q.robotId || q.robotid || q.robot);
    if (qRobotId) {
      robotSockets.set(qRobotId, socket.id);
      console.log(`Registered (handshake) robot ${qRobotId} -> ${socket.id}`);
    }
  } catch (e) {
    console.warn('error reading handshake query', e && e.message ? e.message : e);
  }

  // allow clients (Pi) to register after connecting
  socket.on('register_robot', (data) => {
    try {
      const robotId = data && (data.robotId || data.robotid || data.id);
      if (robotId) {
        robotSockets.set(robotId, socket.id);
        console.log(`register_robot: ${robotId} -> ${socket.id}`);
        socket.emit('register_ack', { ok: true, robotId });
      } else {
        socket.emit('register_ack', { ok: false, error: 'robotId required' });
      }
    } catch (e) {
      console.error('register_robot error', e);
    }
  });

  socket.on('telemetry_from_pi', async (data) => {
    try {
      if (!data || typeof data !== 'object') {
        console.warn('telemetry_from_pi invalid payload', data);
        socket.emit('telemetry_ack', { ok: false, error: 'invalid payload' });
        return;
      }
      const robotId = data.robotId || data.robotid || data.id;
      const payload = data.payload || data.data || null;
      if (!robotId || !payload) {
        console.warn('telemetry_from_pi missing robotId or payload', data);
        socket.emit('telemetry_ack', { ok: false, error: 'robotId and payload required' });
        return;
      }

      // persist to MySQL telemetry table if available
      try {
        const [result] = await pool.execute('INSERT INTO telemetry (robotId, payload) VALUES (?, ?)', [robotId, JSON.stringify(payload)]);
        const insertId = result.insertId;
        const event = { id: insertId, robotId, payload, created_at: new Date().toISOString() };
        // broadcast to UI clients
        io.emit('telemetry', event);
        socket.emit('telemetry_ack', { id: insertId, ok: true });
        console.log(`telemetry_from_pi persisted id=${insertId} robotId=${robotId}`);
      } catch (dbErr) {
        // if DB fails, still broadcast
        console.warn('telemetry_from_pi: db insert failed, broadcasting only', dbErr && dbErr.message ? dbErr.message : dbErr);
        const event = { id: null, robotId, payload, created_at: new Date().toISOString() };
        io.emit('telemetry', event);
        socket.emit('telemetry_ack', { ok: true, persisted: false });
      }
    } catch (err) {
      console.error('socket telemetry error', err && err.message ? err.message : err);
      socket.emit('telemetry_ack', { ok: false, error: (err && err.message) || 'unknown' });
    }
  });

app.post('/detections', async (req, res) => {
  try {
    const detection = req.body;
    if (!detection) return res.status(400).json({ error: 'no body' });
    // validation optional
    io.emit('detection', detection); // broadcast to UI clients
    // optionally persist: INSERT into detections table
    return res.json({ ok: true });
  } catch (e) {
    console.error('detections error', e);
    return res.status(500).json({ error: 'server error' });
  }
});

  socket.on('detection', async (data) => {
    try {
      if (!data || !data.robotId || !data.payload) {
        console.warn('invalid detection received', data);
        return;
      }

      // persist to MySQL detections table (optional)
      try {
        await pool.execute('INSERT INTO detections (robotId, payload) VALUES (?, ?)', [data.robotId, JSON.stringify(data.payload)]);
      } catch (e) {
        console.warn('failed to persist detection', e && e.message ? e.message : e);
      }

      // broadcast to UI clients
      io.emit('detection', {
        id: null,
        robotId: data.robotId,
        payload: data.payload,
        created_at: new Date().toISOString()
      });

      console.log('detection forwarded from', data.robotId);
    } catch (err) {
      console.error('detection handler error', err && err.message ? err.message : err);
    }
  });

  // generic command from UI to server (persist & broadcast)
  socket.on('command_from_ui', async (data) => {
    try {
      // data: { robotId, command }
      if (!data || !data.robotId || !data.command) {
        console.warn('invalid command_from_ui', data);
        return;
      }
      const [result] = await pool.execute('INSERT INTO commands (robotId, command) VALUES (?, ?)', [data.robotId, JSON.stringify(data.command)]);
      const insertId = result.insertId;
      io.emit('command', { id: insertId, robotId: data.robotId, command: data.command, created_at: new Date().toISOString() });
    } catch (err) {
      console.error('command_from_ui error', err && err.message ? err.message : err);
    }
  });

  socket.on('disconnect', () => {
    for (const [robotId, sid] of robotSockets.entries()) {
      if (sid === socket.id) {
        robotSockets.delete(robotId);
        console.log(`Unregistered robot ${robotId} (socket ${sid})`);
      }
    }
    console.log('socket disconnected', socket.id);
  });
});

function checkApiKey(req) {
  const headersKey = req.headers['x-api-key'] || req.headers['X-API-KEY'];
  return (LIDAR_API_KEY && headersKey === LIDAR_API_KEY);
}

function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

// health
app.get('/', (req, res) => res.json({ ok: true }));

app.post('/auth/register', async (req, res) => {
  try {
    const body = req.body || {};
    const email = body.email;
    const password = body.password;
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });

    const [exists] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (exists && exists.length > 0) return res.status(400).json({ error: 'user exists' });

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.execute('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashed]);
    const userId = result.insertId;
    const token = signToken({ id: userId, email });
    return res.json({ token, user: { id: userId, email } });
  } catch (err) {
    console.error('register error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const body = req.body || {};
    const email = body.email;
    const password = body.password;
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });

    const [rows] = await pool.execute('SELECT id, email, password FROM users WHERE email = ?', [email]);
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password || '');
    if (!match) return res.status(401).json({ error: 'invalid credentials' });

    const token = signToken({ id: user.id, email: user.email });
    return res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('login error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.post('/auth/google', async (req, res) => {
  try {
    const body = req.body || {};
    const idToken = body.idToken;
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
    console.error('google auth error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server error' });
  }
});

// REPLACE your existing /telemetry handler with this:
app.post('/telemetry', async (req, res) => {
  try {
    // log incoming for debugging (remove or lower later)
    console.log('POST /telemetry headers=', JSON.stringify(req.headers));
    console.log('POST /telemetry raw body=', JSON.stringify(req.body));

    const body = req.body || {};
    // Accept both top-level payload or { payload: {...} } shapes
    const robotId = body.robotId || body.robotid || body.id || (body.payload && body.payload.robotId) || null;
    const payload = body.payload || body.data || (body.robotId ? (Object.assign({}, body)) : null);

    if (!robotId || !payload) {
      console.warn('POST /telemetry - missing robotId or payload', { robotId, hasPayload: !!payload });
      return res.status(400).json({ error: 'robotId and payload required' });
    }

    // Build event to emit to UI clients
    const event = { id: null, robotId: robotId, payload: payload, created_at: new Date().toISOString() };

    // Broadcast immediately
    io.emit('telemetry', event);

    // Attempt to persist to DB if pool exists
    if (typeof pool !== 'undefined' && pool) {
      try {
        const [result] = await pool.execute('INSERT INTO telemetry (robotId, payload) VALUES (?, ?)', [robotId, JSON.stringify(payload)]);
        const insertId = result.insertId || null;
        // re-emit with id if persisted
        const persistedEvent = { ...event, id: insertId };
        io.emit('telemetry', persistedEvent);
        // respond success (persisted)
        return res.status(201).json({ ok: true, persisted: true, id: insertId });
      } catch (dbErr) {
        console.warn('POST /telemetry - db insert failed, emitting only', dbErr && dbErr.message ? dbErr.message : dbErr);
        // still return success but indicate not persisted
        return res.status(202).json({ ok: true, persisted: false, note: 'emitted' });
      }
    } else {
      // no DB configured — just emit
      return res.status(200).json({ ok: true, emitted: true });
    }
  } catch (err) {
    // log full stack so you can inspect Render / server logs
    console.error('POST /telemetry unhandled error:', err && err.stack ? err.stack : err);
    // return minimal info to caller
    return res.status(500).json({ error: 'server error' });
  }
});

app.post('/control', async (req, res) => {
  try {
    const body = req.body || {};
    const robotId = body.robotId || body.robotid || null;
    const command = body.command || body.cmd || null;
    if (!robotId || !command) return res.status(400).json({ error: 'robotId and command required' });

    const [result] = await pool.execute('INSERT INTO commands (robotId, command) VALUES (?, ?)', [robotId, JSON.stringify(command)]);
    const insertId = result.insertId;
    io.emit('command', { id: insertId, robotId, command, created_at: new Date().toISOString() });
    return res.json({ id: insertId });
  } catch (err) {
    console.error('control error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'db error' });
  }
});

app.get('/commands', async (req, res) => {
  try {
    const robotId = req.query.robotId || req.query.robotid || null;
    if (!robotId) return res.status(400).json({ error: 'robotId required' });
    const [rows] = await pool.execute('SELECT id, robotId, command, processed, created_at FROM commands WHERE robotId = ? AND processed = 0 ORDER BY id ASC LIMIT 50', [robotId]);
    const parsed = rows.map(r => ({ ...r, command: r.command ? JSON.parse(r.command) : null }));
    return res.json(parsed);
  } catch (err) {
    console.error('commands error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'db error' });
  }
});

app.post('/commands/:id/processed', async (req, res) => {
  try {
    const id = req.params.id;
    await pool.execute('UPDATE commands SET processed = 1 WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('mark processed error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'db error' });
  }
});

app.post('/lidar/control', (req, res) => {
  try {
    const headersKey = req.headers['x-api-key'] || req.headers['X-API-KEY'] || req.headers['x-api-key'.toLowerCase()];
    if (!LIDAR_API_KEY || headersKey !== LIDAR_API_KEY) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const body = req.body || {};
    const robotId = body.robotId || body.robotid || null;
    const action = body.action || null;
    if (!robotId || !action) return res.status(400).json({ error: 'robotId and action required' });
    if (!['start', 'stop'].includes(action)) return res.status(400).json({ error: 'action must be start or stop' });

    const socketId = robotSockets.get(robotId);
    if (!socketId) {
      console.warn('lidar control: no socket for robotId', robotId);
      return res.status(404).json({ error: 'robot not connected' });
    }

    io.to(socketId).emit('lidar_control', { action });
    console.log(`Emitted lidar_control ${action} -> ${robotId} (socket ${socketId})`);
    return res.json({ ok: true, sentTo: robotId });
  } catch (err) {
    console.error('lidar control error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/record/list', (req, res) => {
  try {
    const robotId = req.query.robotId || '';
    const dir = path.join(__dirname, 'static', 'recordings');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'))
      .map(f => {
        const st = fs.statSync(path.join(dir, f));
        return { id: f, filename: f, created_at: st.mtime.toISOString(), size: st.size };
      })
      .sort((a,b) => b.created_at.localeCompare(a.created_at));
    res.json(files);
  } catch (e) {
    console.error('record list error', e);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /record/file/:filename  (serve file)
app.get('/record/file/:filename', (req, res) => {
  const f = req.params.filename;
  const p = path.join(__dirname, 'static', 'recordings', f);
  if (!fs.existsSync(p)) return res.status(404).send('not found');
  res.sendFile(p);
});

// DELETE /record/:id
app.delete('/record/:id', (req, res) => {
  try {
    const id = req.params.id;
    const p = path.join(__dirname, 'static', 'recordings', id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
    fs.unlinkSync(p);
    return res.json({ ok: true });
  } catch (e) {
    console.error('delete record error', e);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/telemetry/recent', async (req, res) => {
  try {
    const robotId = req.query.robotId;
    const limit = parseInt(req.query.limit || '100', 10);
    if (!robotId) return res.status(400).json({ error: 'robotId required' });
    const [rows] = await pool.execute('SELECT id, robotId, payload, created_at FROM telemetry WHERE robotId = ? ORDER BY id DESC LIMIT ?', [robotId, limit]);
    const parsed = rows.map(r => ({ id: r.id, robotId: r.robotId, payload: JSON.parse(r.payload), created_at: r.created_at }));
    return res.json(parsed);
  } catch (err) {
    console.error('telemetry.recent error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.post('/record/start', async (req, res) => {
  if (!checkApiKey(req)) return res.status(403).json({ error: 'forbidden' });
  const { robotId, source } = req.body || {};
  if (!robotId || !source) return res.status(400).json({ error: 'robotId and source required' });
  // generate id + filename
  const id = `rec_${Date.now()}`;
  const filename = `${id}.mp4`;
  const outPath = path.join(REC_DIR, filename);

  const args = ['-y', '-i', source, '-c', 'copy', outPath];
  const ff = spawn('ffmpeg', args);

  ff.stderr.on('data', d => console.log('ffmpeg:', d.toString()));
  ff.on('exit', (code, sig) => console.log('ffmpeg exit', code, sig));

  recordProcesses.set(id, { proc: ff, filename });

  return res.json({ ok: true, id, filename });
});

// In /record/stop handler:
app.post('/record/stop', async (req, res) => {
  if (!checkApiKey(req)) return res.status(403).json({ error: 'forbidden' });
  const { robotId, id } = req.body || {};
  if (!robotId || !id) return res.status(400).json({ error: 'robotId and id required' });
  const rec = recordProcesses.get(id);
  if (!rec) {
    // If process not found, but file exists, still return filename
    const fallbackFile = `${id}.mp4`;
    const p = path.join(REC_DIR, fallbackFile);
    const exists = fs.existsSync(p);
    return res.json({ ok: true, id, filename: exists ? fallbackFile : null });
  }
  // gracefully stop ffmpeg
  try {
    rec.proc.kill('SIGINT'); // allow ffmpeg to finalize file
  } catch (e) {}
  recordProcesses.delete(id);

  return res.json({ ok: true, id, filename: rec.filename });
});

// start server
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`API + sockets listening on ${port}`));
