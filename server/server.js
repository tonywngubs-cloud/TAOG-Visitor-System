const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- VISITORS API ---

// Get all visitors / directory entries
app.get('/api/visitors', (req, res) => {
  db.all("SELECT * FROM visitors ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({ visitors: rows });
  });
});

// Register a new visitor
app.post('/api/visitors', (req, res) => {
  const { name, phone, email, visitType, visitReason, ministry, notes, followUp } = req.body;
  
  // Generate initials
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  const colors = ['blue', 'gold', 'green', 'rose', 'purple'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const dateStr = 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const status = 'Follow-up needed';

  const sql = `INSERT INTO visitors (initials, name, phone, email, type, visitReason, ministry, notes, date, status, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [initials, name, phone, email || '', visitType, visitReason, ministry, notes, dateStr, status, randomColor];

  db.run(sql, params, function(err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    const newId = this.lastID;

    // If follow-up checkbox is checked, create a follow-up task automatically
    if (followUp) {
      db.run(`INSERT INTO follow_ups (title, person, owner, due, priority, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [visitReason || 'General follow-up', name, 'Pastor Ndlovu', 'Tomorrow', 'Medium', 'Pending']
      );
    }

    res.json({
      message: 'Success',
      id: newId,
      visitor: { id: newId, initials, name, phone, email, type: visitType, date: dateStr, status, color: randomColor }
    });
  });
});

// --- FOLLOW-UPS API ---

// Get all follow-up tasks
app.get('/api/followups', (req, res) => {
  db.all("SELECT * FROM follow_ups ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({ followUps: rows });
  });
});

// Toggle follow-up status
app.patch('/api/followups/:id', (req, res) => {
  const { id } = req.params;
  db.get("SELECT status FROM follow_ups WHERE id = ?", [id], (err, row) => {
    if (err || !row) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const newStatus = row.status === 'Completed' ? 'Pending' : 'Completed';
    db.run("UPDATE follow_ups SET status = ? WHERE id = ?", [newStatus, id], function(err) {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.json({ message: 'Success', status: newStatus });
    });
  });
});

app.listen(PORT, () => {
  console.log(`TAOG Backend Server running on port ${PORT}`);
});