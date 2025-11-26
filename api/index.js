// api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { query } = require('./db');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// health
app.get('/', (req, res) => res.json({ ok: true }));

// POST telemetry
app.post('/telemetry', async (req, res) => {
  try {
    const { robotId, payload } = req.body;
    if (!robotId || !payload) return res.status(400).json({ error: 'robotId and payload required' });

    const result = await query(
      'INSERT INTO telemetry (robotId, payload) VALUES (?, ?)',
      [robotId, JSON.stringify(payload)]
    );

    // mysql2's execute returns rows; use last insert id from connection:
    const [{ insertId } = {}] = await query('SELECT LAST_INSERT_ID() AS insertId') || [{}];
    return res.json({ id: insertId || null });
  } catch (err) {
    console.error('telemetry error', err);
    return res.status(500).json({ error: 'db error' });
  }
});

// POST control
app.post('/control', async (req, res) => {
  try {
    const { robotId, command } = req.body;
    if (!robotId || !command) return res.status(400).json({ error: 'robotId and command required' });

    await query('INSERT INTO commands (robotId, command) VALUES (?, ?)', [robotId, JSON.stringify(command)]);
    const [{ insertId } = {}] = await query('SELECT LAST_INSERT_ID() AS insertId') || [{}];
    return res.json({ id: insertId || null });
  } catch (err) {
    console.error('control error', err);
    return res.status(500).json({ error: 'db error' });
  }
});

// GET unprocessed commands
app.get('/commands', async (req, res) => {
  try {
    const { robotId } = req.query;
    if (!robotId) return res.status(400).json({ error: 'robotId required' });

    const rows = await query(
      'SELECT id, robotId, command, processed, created_at FROM commands WHERE robotId = ? AND processed = 0 ORDER BY id ASC LIMIT 50',
      [robotId]
    );
    // parse JSON fields
    const parsed = rows.map(r => ({ ...r, command: r.command ? JSON.parse(r.command) : null }));
    res.json(parsed);
  } catch (err) {
    console.error('commands error', err);
    res.status(500).json({ error: 'db error' });
  }
});

// mark command processed
app.post('/commands/:id/processed', async (req, res) => {
  try {
    const id = req.params.id;
    await query('UPDATE commands SET processed = 1 WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('mark processed error', err);
    res.status(500).json({ error: 'db error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on ${port}`));
