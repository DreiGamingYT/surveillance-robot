// api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { run, all } = require('./db');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// health
app.get('/', (req, res) => res.json({ ok: true }));

// insert telemetry
app.post('/telemetry', async (req, res) => {
  try {
    const { robotId, payload } = req.body;
    const info = run('INSERT INTO telemetry (robotId, payload) VALUES (?, ?)', [robotId, JSON.stringify(payload)]);
    return res.json({ id: info.lastInsertRowid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'db error' });
  }
});

// control command (store and optionally notify)
app.post('/control', async (req, res) => {
  try {
    const { robotId, command } = req.body;
    const info = run('INSERT INTO commands (robotId, command) VALUES (?, ?)', [robotId, JSON.stringify(command)]);
    return res.json({ id: info.lastInsertRowid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'db error' });
  }
});

app.get('/commands', (req, res) => {
  const { robotId } = req.query;
  const rows = all('SELECT id, robotId, command, processed, created_at FROM commands WHERE robotId = ? AND processed = 0 ORDER BY id ASC LIMIT 10', [robotId || '']);
  return res.json(rows);
});

// to mark processed endpoint:
app.post('/commands/:id/processed', (req, res) => {
  const id = req.params.id;
  run('UPDATE commands SET processed = 1 WHERE id = ?', [id]);
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on ${port}`));
