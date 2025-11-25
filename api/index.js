// api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db');

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
    const [result] = await pool.query(
      'INSERT INTO telemetry (robotId, payload) VALUES (?, ?)',
      [robotId, JSON.stringify(payload)]
    );
    return res.json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'db error' });
  }
});

// control command (store and optionally notify)
app.post('/control', async (req, res) => {
  try {
    const { robotId, command } = req.body;
    const [result] = await pool.query(
      'INSERT INTO commands (robotId, command) VALUES (?, ?)',
      [robotId, JSON.stringify(command)]
    );
    return res.json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'db error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on ${port}`));
