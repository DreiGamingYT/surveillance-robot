// api/db.js  (SQLite version using better-sqlite3)
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data.sqlite');

// ensure file exists
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '');
}

const db = new Database(dbPath);

// Simple helper to run a statement and return lastInsertRowid
function run(sql, params = []) {
  const stmt = db.prepare(sql);
  const info = stmt.run(...params);
  return info;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...params);
}

// Ensure tables exist (run once at startup)
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telemetry (
  id INT PRIMARY KEY AUTO_INCREMENT,
  robotId VARCHAR(100),
  payload JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commands (
  id INT PRIMARY KEY AUTO_INCREMENT,
  robotId VARCHAR(100),
  command JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = { db, run, all, get };
