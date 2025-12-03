// surveillance-robot/api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {
    exec
} = require('child_process');
const {
    pool
} = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'replace_with_secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const LIDAR_API_KEY = process.env.LIDAR_API_KEY || 'change_me';

const app = express();
app.use(helmet());
app.use(cors());

app.use(express.json());
const robotSockets = new Map();

const server = http.createServer(app);
const {
    Server
} = require('socket.io');

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['polling', 'websocket'],
});

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    const qRobotId = socket.handshake.query && socket.handshake.query.robotId;
    if (qRobotId) {
        robotSockets.set(qRobotId, socket.id);
        console.log(`Registered robot ${qRobotId} -> ${socket.id}`);
    }

    socket.on('register_robot', (data) => {
        try {
            const robotId = (data && data.robotId) ? data.robotId : null;
            if (robotId) {
                robotSockets.set(robotId, socket.id);
                console.log(`register_robot: ${robotId} -> ${socket.id}`);
                socket.emit('register_ack', {
                    ok: true,
                    robotId
                });
            } else {
                socket.emit('register_ack', {
                    ok: false,
                    error: 'robotId required'
                });
            }
        } catch (e) {
            console.error('register_robot error', e);
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

    socket.on('telemetry_from_pi', async (data) => {
        try {
            if (!data || typeof data !== 'object') {
                console.warn('telemetry_from_pi: invalid payload', data);
                socket.emit('telemetry_ack', {
                    ok: false,
                    error: 'invalid payload'
                });
                return;
            }

            const {
                robotId,
                payload
            } = data;
            if (!robotId || !payload) {
                console.warn('telemetry_from_pi missing robotId or payload', data);
                socket.emit('telemetry_ack', {
                    ok: false,
                    error: 'robotId and payload required'
                });
                return;
            }

            const [result] = await pool.execute(
                'INSERT INTO telemetry (robotId, payload) VALUES (?, ?)',
                [robotId, JSON.stringify(payload)]
            );
            const insertId = result.insertId;
            const event = {
                id: insertId,
                robotId,
                payload,
                created_at: new Date().toISOString()
            };
            io.emit('telemetry', event);
            socket.emit('telemetry_ack', {
                id: insertId,
                ok: true
            });
            console.log(`telemetry_from_pi persisted id=${insertId} robotId=${robotId}`);
        } catch (err) {
            console.error('socket telemetry error', err);
            socket.emit('telemetry_ack', {
                ok: false,
                error: (err && err.message) || 'unknown'
            });
        }
    });

    socket.on('detection', async (data) => {
  try {

    if (!data || !data.robotId || !data.payload) {
      console.warn('invalid detection received', data);
      return;
    }

    try {
      await pool.execute('INSERT INTO detections (robotId, payload) VALUES (?, ?)', [data.robotId, JSON.stringify(data.payload)]);
    } catch (e) {
      console.warn('failed to persist detection', e && e.message ? e.message : e);
    }

    io.emit('detection', {
      id: null,
      robotId: data.robotId,
      payload: data.payload,
      created_at: new Date().toISOString()
    });

    console.log('detection forwarded from', data.robotId);
  } catch (err) {
    console.error('detection handler error', err);
  }
});

function signToken(user) {
    return jwt.sign({
        userId: user.id,
        email: user.email
    }, JWT_SECRET, {
        expiresIn: '7d'
    });
}

app.get('/', (req, res) => res.json({
    ok: true
}));

app.post('/auth/register', async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body || {};
        if (!email || !password) return res.status(400).json({
            error: 'email & password required'
        });

        const [exists] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (exists && exists.length > 0) return res.status(400).json({
            error: 'user exists'
        });

        const hashed = await bcrypt.hash(password, 10);
        const [result] = await pool.execute('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashed]);
        const userId = result.insertId;
        const token = signToken({
            id: userId,
            email
        });
        return res.json({
            token,
            user: {
                id: userId,
                email
            }
        });
    } catch (err) {
        console.error('register error', err);
        return res.status(500).json({
            error: 'server error'
        });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body || {};
        if (!email || !password) return res.status(400).json({
            error: 'email & password required'
        });

        const [rows] = await pool.execute('SELECT id, email, password FROM users WHERE email = ?', [email]);
        if (!rows || rows.length === 0) return res.status(401).json({
            error: 'invalid credentials'
        });

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password || '');
        if (!match) return res.status(401).json({
            error: 'invalid credentials'
        });

        const token = signToken({
            id: user.id,
            email: user.email
        });
        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email
            }
        });
    } catch (err) {
        console.error('login error', err);
        return res.status(500).json({
            error: 'server error'
        });
    }
});

app.post('/auth/google', async (req, res) => {
    try {
        const {
            idToken
        } = req.body || {};
        if (!idToken) return res.status(400).json({
            error: 'idToken required'
        });

        const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
        const resp = await axios.get(tokenInfoUrl).catch(e => ({
            status: e.response?.status || 500,
            data: e.response?.data
        }));
        if (!resp || resp.status !== 200) {
            console.error('google tokeninfo failed', resp?.status, resp?.data);
            return res.status(401).json({
                error: 'invalid google token'
            });
        }

        const payload = resp.data;
        if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
            console.error('google aud mismatch', payload.aud);
            return res.status(401).json({
                error: 'google token aud mismatch'
            });
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

        const token = signToken({
            id: userId,
            email
        });
        return res.json({
            token,
            user: {
                id: userId,
                email
            }
        });
    } catch (err) {
        console.error('google auth error', err);
        return res.status(500).json({
            error: 'server error'
        });
    }
});

app.post('/telemetry', async (req, res) => {
    try {
        const body = req.body || {};
        if (!Object.keys(body).length) {
            console.warn('POST /telemetry - empty body or body not parsed. headers=', req.headers);
            return res.status(400).json({
                error: 'empty or invalid JSON body'
            });
        }

        const {
            robotId,
            payload
        } = body;
        if (!robotId || !payload) {
            console.warn('POST /telemetry - missing fields', {
                robotId,
                payload
            });
            return res.status(400).json({
                error: 'robotId and payload required'
            });
        }

        const event = {
            id: null,
            robotId,
            payload,
            created_at: new Date().toISOString()
        };
        io.emit('telemetry', event);

        return res.json({
            ok: true,
            emitted: true
        });
    } catch (err) {
        console.error('telemetry error', err);
        return res.status(500).json({
            error: 'server error'
        });
    }
});

app.post('/control', async (req, res) => {
    try {
        const {
            robotId,
            command
        } = req.body || {};
        if (!robotId || !command) return res.status(400).json({
            error: 'robotId and command required'
        });

        const [result] = await pool.execute('INSERT INTO commands (robotId, command) VALUES (?, ?)', [robotId, JSON.stringify(command)]);
        const insertId = result.insertId;
        io.emit('command', {
            id: insertId,
            robotId,
            command,
            created_at: new Date().toISOString()
        });
        return res.json({
            id: insertId
        });
    } catch (err) {
        console.error('control error', err);
        return res.status(500).json({
            error: 'db error'
        });
    }
});

app.get('/commands', async (req, res) => {
    try {
        const {
            robotId
        } = req.query || {};
        if (!robotId) return res.status(400).json({
            error: 'robotId required'
        });
        const [rows] = await pool.execute('SELECT id, robotId, command, processed, created_at FROM commands WHERE robotId = ? AND processed = 0 ORDER BY id ASC LIMIT 50', [robotId]);
        const parsed = rows.map(r => ({
            ...r,
            command: r.command ? JSON.parse(r.command) : null
        }));
        return res.json(parsed);
    } catch (err) {
        console.error('commands error', err);
        return res.status(500).json({
            error: 'db error'
        });
    }
});

app.post('/commands/:id/processed', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.execute('UPDATE commands SET processed = 1 WHERE id = ?', [id]);
        return res.json({
            ok: true
        });
    } catch (err) {
        console.error('mark processed error', err);
        return res.status(500).json({
            error: 'db error'
        });
    }
});

app.post('/lidar/start', async (req, res) => {
    const key = req.headers['x-api-key'];
    if (key !== LIDAR_API_KEY) return res.status(403).json({
        error: 'forbidden'
    });

    const cmd = `ssh -i /path/to/server_private_key -o StrictHostKeyChecking=no robotctl@192.168.1.50'/home/robotctl/lidar/start_lidar.sh'`;
    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            console.error('lidar start failed', err, stderr);
            return res.status(500).json({
                error: 'start failed',
                stderr
            });
        }
        return res.json({
            ok: true,
            out: stdout
        });
    });
});

app.post('/lidar/control', (req, res) => {
    try {
        const key = req.headers['x-api-key'] || '';
        if (!process.env.LIDAR_API_KEY || key !== process.env.LIDAR_API_KEY) {
            return res.status(403).json({
                error: 'forbidden'
            });
        }

        const {
            robotId,
            action
        } = req.body || {};
        if (!robotId || !action) return res.status(400).json({
            error: 'robotId and action required'
        });
        if (!['start', 'stop'].includes(action)) return res.status(400).json({
            error: 'action must be start or stop'
        });

        const socketId = robotSockets.get(robotId);
        if (!socketId) {
            console.warn('lidar control: no socket for robotId', robotId);
            return res.status(404).json({
                error: 'robot not connected'
            });
        }

        io.to(socketId).emit('lidar_control', {
            action
        });
        console.log(`Emitted lidar_control ${action} -> ${robotId} (socket ${socketId})`);
        return res.json({
            ok: true,
            sentTo: robotId
        });
    } catch (err) {
        console.error('lidar control error', err);
        return res.status(500).json({
            error: 'server error'
        });
    }
});

// start server
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`API + sockets listening on ${port}`));