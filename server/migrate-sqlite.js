const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { sql, ensureSchema } = require('./database');

const sqlitePath = path.resolve(process.argv[2] || path.join(__dirname, 'visitors.db'));

function openSqlite(filePath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (error) => {
      if (error) reject(error);
      else resolve(db);
    });
  });
}

function querySqlite(db, query) {
  return new Promise((resolve, reject) => {
    db.all(query, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function hasTable(db, table) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
      [table],
      (error, row) => (error ? reject(error) : resolve(Boolean(row))),
    );
  });
}

async function importBatch(records, makeQuery) {
  for (let index = 0; index < records.length; index += 50) {
    const queries = records.slice(index, index + 50).map(makeQuery);
    if (queries.length) await sql.transaction(queries);
  }
}

async function main() {
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite file not found: ${sqlitePath}`);
  }

  await ensureSchema();
  const legacy = await openSqlite(sqlitePath);
  try {
    const visitors = (await hasTable(legacy, 'visitors'))
      ? await querySqlite(legacy, 'SELECT * FROM visitors ORDER BY id')
      : [];
    const followUps = (await hasTable(legacy, 'follow_ups'))
      ? await querySqlite(legacy, 'SELECT * FROM follow_ups ORDER BY id')
      : [];
    const staff = (await hasTable(legacy, 'staff_users'))
      ? await querySqlite(legacy, 'SELECT * FROM staff_users ORDER BY id')
      : [];
    const hasInitialAdmin = staff.some((user) => user.is_initial_admin === 1);
    let initialAdminAssigned = hasInitialAdmin;

    await importBatch(visitors, (row) => sql`
      INSERT INTO visitors
        (id, initials, name, phone, email, type, visit_reason, ministry, notes, date, status, color, created_at)
      VALUES (
        ${row.id}, ${row.initials}, ${row.name}, ${row.phone}, ${row.email},
        ${row.type}, ${row.visitReason ?? row.visit_reason ?? ''}, ${row.ministry}, ${row.notes},
        ${row.date}, ${row.status}, ${row.color}, ${row.created_at || new Date().toISOString()}
      )
      ON CONFLICT DO NOTHING
    `);

    await importBatch(followUps, (row) => sql`
      INSERT INTO follow_ups (id, title, person, owner, due, priority, status)
      VALUES (${row.id}, ${row.title}, ${row.person}, ${row.owner}, ${row.due}, ${row.priority}, ${row.status})
      ON CONFLICT DO NOTHING
    `);

    await importBatch(staff, (row) => {
      const isInitialAdmin = !initialAdminAssigned && (row.role || 'admin') === 'admin';
      if (isInitialAdmin) initialAdminAssigned = true;
      return sql`
        INSERT INTO staff_users (id, email, password_hash, role, is_initial_admin)
        VALUES (${row.id}, ${row.email}, ${row.password_hash}, ${row.role || 'admin'}, ${isInitialAdmin})
        ON CONFLICT DO NOTHING
      `;
    });

    await sql`
      SELECT setval(
        pg_get_serial_sequence('visitors', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM visitors), 1), 1),
        EXISTS (SELECT 1 FROM visitors)
      )
    `;
    await sql`
      SELECT setval(
        pg_get_serial_sequence('follow_ups', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM follow_ups), 1), 1),
        EXISTS (SELECT 1 FROM follow_ups)
      )
    `;
    await sql`
      SELECT setval(
        pg_get_serial_sequence('staff_users', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM staff_users), 1), 1),
        EXISTS (SELECT 1 FROM staff_users)
      )
    `;

    console.log(`Imported ${visitors.length} visitors, ${followUps.length} follow-ups, and ${staff.length} staff accounts.`);
  } finally {
    await new Promise((resolve, reject) => legacy.close((error) => (error ? reject(error) : resolve())));
  }
}

main().catch((error) => {
  console.error(`SQLite migration failed: ${error.message}`);
  process.exitCode = 1;
});
