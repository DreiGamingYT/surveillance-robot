// api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { pool } = require('./db'); // assumes api/db.js exists and exports pool

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// create HTTP server & attach socket.io
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
  cors: {
    origin: '*', // tighten this in production to only your domains
    methods: ['GET', 'POST']
  },
  transports: ['websocket'],
});

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('socket disconnected:', socket.id);
  });
});

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  socket.on('telemetry_from_pi', async (data) => {
    try {
      const { robotId, payload } = data;
      const [result] = await pool.execute('INSERT INTO telemetry (robotId, payload) VALUES (?, ?)', [
        robotId,
        JSON.stringify(payload),
      ]);
      const insertId = result.insertId;
      const event = { id: insertId, robotId, payload, created_at: new Date().toISOString() };
      io.emit('telemetry', event);
    } catch (err) {
      console.error('socket telemetry error', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected:', socket.id);
  });
});

// Helper - use pool.execute for inserts and get insertId
async function insertTelemetry(robotId, payload) {
  const [result] = await pool.execute('INSERT INTO telemetry (robotId, payload) VALUES (?, ?)', [
    robotId,
    JSON.stringify(payload),
  ]);
  return result.insertId;
}

async function insertCommand(robotId, command) {
  const [result] = await pool.execute('INSERT INTO commands (robotId, command) VALUES (?, ?)', [
    robotId,
    JSON.stringify(command),
  ]);
  return result.insertId;
}

async function getUnprocessedCommands(robotId) {
  const [rows] = await pool.execute(
    'SELECT id, robotId, command, processed, created_at FROM commands WHERE robotId = ? AND processed = 0 ORDER BY id ASC LIMIT 50',
    [robotId]
  );
  return rows;
}

app.get('/', (req, res) => res.json({ ok: true }));

// POST telemetry (REST)
app.post('/telemetry', async (req, res) => {
  try {
    const { robotId, payload } = req.body;
    if (!robotId || !payload) return res.status(400).json({ error: 'robotId and payload required' });

    const insertId = await insertTelemetry(robotId, payload);

    // Emit realtime event to connected clients
    const event = { id: insertId, robotId, payload, created_at: new Date().toISOString() };
    io.emit('telemetry', event);

    return res.json({ id: insertId });
  } catch (err) {
    console.error('telemetry error', err);
    return res.status(500).json({ error: 'db error' });
  }
});

// POST control (save command, emit event optionally)
app.post('/control', async (req, res) => {
  try {
    const { robotId, command } = req.body;
    if (!robotId || !command) return res.status(400).json({ error: 'robotId and command required' });

    const insertId = await insertCommand(robotId, command);

    // Optionally emit command event to robot clients (if they are connected via socket)
    io.emit('command', { id: insertId, robotId, command, created_at: new Date().toISOString() });

    return res.json({ id: insertId });
  } catch (err) {
    console.error('control error', err);
    return res.status(500).json({ error: 'db error' });
  }
});

// GET commands (polling fallback)
app.get('/commands', async (req, res) => {
  try {
    const { robotId } = req.query;
    if (!robotId) return res.status(400).json({ error: 'robotId required' });

    const rows = await getUnprocessedCommands(robotId);
    // parse JSON command field
    const parsed = rows.map((r) => ({ ...r, command: r.command ? JSON.parse(r.command) : null }));
    return res.json(parsed);
  } catch (err) {
    console.error('commands error', err);
    return res.status(500).json({ error: 'db error' });
  }
});

// mark processed
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

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`API + sockets listening on ${port}`));
