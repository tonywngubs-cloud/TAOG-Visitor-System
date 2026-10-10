const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'visitors.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database 1', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

db.serialize(() => {
  // 1. Visitors Table
  db.run(`CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initials TEXT,
    name TEXT,
    phone TEXT,
    email TEXT,
    type TEXT,
    visitReason TEXT,
    ministry TEXT,
    notes TEXT,
    date TEXT,
    status TEXT,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 2. Follow-ups Table
  db.run(`CREATE TABLE IF NOT EXISTS follow_ups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    person TEXT,
    owner TEXT,
    due TEXT,
    priority TEXT,
    status TEXT
  )`);

  // Seed initial data if tables are empty
  db.get("SELECT COUNT(*) as count FROM visitors", (err, row) => {
    if (row.count === 0) {
      const stmt = db.prepare(`INSERT INTO visitors (initials, name, phone, email, type, visitReason, ministry, notes, date, status, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      stmt.run('JM', 'James Molefe', '+27 71 456 2893', 'james@example.com', 'First-time visitor', 'Sunday service', 'Prayer ministry', 'First time visitor', 'Today, 09:42 AM', 'Follow-up needed', 'blue');
      stmt.run('TN', 'Thato Nkosi', '+27 82 315 4478', 'thato@example.com', 'Returning visitor', 'Sunday service', 'Youth ministry', 'Regular attendee', 'Today, 09:18 AM', 'Welcomed', 'gold');
      stmt.run('KM', 'Keitumetse Moyo', '+27 73 981 2056', 'keitumetse@example.com', 'First-time visitor', 'Prayer support', 'Prayer ministry', 'Needs prayer support', 'Today, 08:56 AM', 'Follow-up needed', 'green');
      stmt.finalize();
    }
  });

  db.get("SELECT COUNT(*) as count FROM follow_ups", (err, row) => {
    if (row.count === 0) {
      const stmt = db.prepare(`INSERT INTO follow_ups (title, person, owner, due, priority, status) VALUES (?, ?, ?, ?, ?, ?)`);
      stmt.run('Prayer requests', 'James Molefe', 'Pastor Ndlovu', 'Today', 'High', 'Pending');
      stmt.run('Welcome call', 'Keitumetse Moyo', 'Grace', 'Tomorrow', 'Medium', 'Pending');
      stmt.finalize();
    }
  });
});

module.exports = db;