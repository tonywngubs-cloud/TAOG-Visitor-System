const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { rateLimit } = require('express-rate-limit');
const { sql, ensureSchema } = require('./database');
const PostgresSessionStore = require('./postgres-session-store');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? '' : crypto.randomBytes(32).toString('hex'));
const initialSetupToken = process.env.INITIAL_SETUP_TOKEN || '';

if (!sessionSecret) {
  throw new Error('SESSION_SECRET must be set when NODE_ENV=production.');
}

if (process.env.TRUST_PROXY === '1' || process.env.VERCEL) {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '32kb' }));
app.use(async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (error) {
    console.error('Unable to initialize the application database:', error);
    res.status(503).json({ error: 'The application database is temporarily unavailable.' });
  }
});
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(session({
  name: 'taog.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: new PostgresSessionStore(),
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
});

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (error, derivedKey) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(`${salt}:${derivedKey.toString('hex')}`);
  });
});

const verifyPassword = async (password, storedHash) => {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex || !/^[a-f0-9]{128}$/i.test(expectedHex)) {
    return false;
  }

  const actualHash = await hashPassword(password, salt);
  const actual = Buffer.from(actualHash.split(':')[1], 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const getStaffByEmail = async (email) => {
  const rows = await sql`
    SELECT id, email, password_hash, role
    FROM staff_users
    WHERE lower(email) = lower(${email})
  `;
  return rows[0] || null;
};

const getStaffById = async (id) => {
  const rows = await sql`SELECT id, email, role FROM staff_users WHERE id = ${id}`;
  return rows[0] || null;
};

const getStaffCount = async () => {
  const rows = await sql`SELECT COUNT(*)::int AS count FROM staff_users`;
  return rows[0].count;
};

const createStaffAccount = async (email, passwordHash, role) => {
  const rows = await sql`
    INSERT INTO staff_users (email, password_hash, role)
    VALUES (${email}, ${passwordHash}, ${role})
    RETURNING id, email, role
  `;
  return rows[0];
};

const createInitialAdmin = async (email, passwordHash) => {
  const rows = await sql`
    INSERT INTO staff_users (email, password_hash, role, is_initial_admin)
    SELECT ${email}, ${passwordHash}, 'admin', true
    WHERE NOT EXISTS (SELECT 1 FROM staff_users WHERE is_initial_admin = true)
    RETURNING id, email, role
  `;
  return rows[0] || null;
};

const startSession = (req, res, user, failureMessage) => {
  req.session.regenerate((error) => {
    if (error) {
      console.error('Unable to start a staff session:', error);
      res.status(500).json({ error: failureMessage });
      return;
    }

    req.session.staffId = user.id;
    req.session.save((saveError) => {
      if (saveError) {
        console.error('Unable to save a staff session:', saveError);
        res.status(500).json({ error: failureMessage });
        return;
      }
      res.json({ user: { id: user.id, email: user.email, role: user.role } });
    });
  });
};

app.get('/api/auth/setup-status', async (req, res) => {
  try {
    const accountCount = await getStaffCount();
    res.json({
      setupRequired: accountCount === 0,
      setupTokenRequired: isProduction,
      setupAvailable: !isProduction || Boolean(initialSetupToken),
    });
  } catch (error) {
    console.error('Unable to check initial account setup:', error);
    res.status(500).json({ error: 'Unable to check account setup.' });
  }
});

app.post('/api/auth/setup', loginLimiter, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const setupToken = typeof body.setupToken === 'string' ? body.setupToken : '';

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }
  if (password.length < 12 || password.length > 1024) {
    res.status(400).json({ error: 'Password must contain 12 to 1024 characters.' });
    return;
  }
  const submittedToken = Buffer.from(setupToken);
  const configuredToken = Buffer.from(initialSetupToken);
  if (isProduction && (!configuredToken.length || submittedToken.length !== configuredToken.length
    || !crypto.timingSafeEqual(submittedToken, configuredToken))) {
    res.status(403).json({ error: 'Initial setup is not authorized. Check the setup token with your system administrator.' });
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = await createInitialAdmin(email, passwordHash);
    if (!user) {
      res.status(409).json({ error: 'Initial setup is already complete. Sign in or ask an administrator to add your account.' });
      return;
    }
    startSession(req, res, user, 'Account created, but unable to sign in. Please sign in with your new account.');
  } catch (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'A staff account with that email already exists.' });
      return;
    }
    console.error('Unable to create the initial administrator account:', error);
    res.status(500).json({ error: 'Unable to create the initial administrator account.' });
  }
});

app.get('/api/auth/session', (req, res) => {
  if (!req.session.staffId) {
    res.json({ user: null });
    return;
  }

  getStaffById(req.session.staffId)
    .then((user) => {
      if (!user) {
        req.session.destroy(() => res.json({ user: null }));
        return;
      }
      res.json({ user });
    })
    .catch((error) => {
      console.error('Unable to load the current staff session:', error);
      res.status(500).json({ error: 'Unable to check sign-in status.' });
    });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password || email.length > 254 || password.length > 1024) {
    res.status(400).json({ error: 'Enter a valid email address and password.' });
    return;
  }

  try {
    const user = await getStaffByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      res.status(401).json({ error: 'The email address or password is incorrect.' });
      return;
    }

    startSession(req, res, user, 'Unable to sign in right now.');
  } catch (error) {
    console.error('Unable to authenticate staff:', error);
    res.status(500).json({ error: 'Unable to sign in right now.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('Unable to end the staff session:', error);
      res.status(500).json({ error: 'Unable to sign out right now.' });
      return;
    }
    res.clearCookie('taog.sid', { httpOnly: true, secure: isProduction, sameSite: 'lax' });
    res.status(204).end();
  });
});

app.use('/api', (req, res, next) => {
  const publicAuthRoutes = new Set([
    'GET /auth/session',
    'GET /auth/setup-status',
    'POST /auth/login',
    'POST /auth/logout',
    'POST /auth/setup',
  ]);
  if (publicAuthRoutes.has(`${req.method} ${req.path}`)) {
    next();
    return;
  }
  const protectedRoute = req.path === '/visitors'
    || req.path === '/followups'
    || req.path.startsWith('/followups/')
    || (req.method === 'POST' && req.path === '/auth/staff');
  if (!protectedRoute) {
    next();
    return;
  }
  if (!req.session.staffId) {
    res.status(401).json({ error: 'Sign in is required.' });
    return;
  }
  next();
});

app.post('/api/auth/staff', async (req, res) => {
  try {
    const currentUser = await getStaffById(req.session.staffId);
    if (!currentUser || currentUser.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access is required to add staff.' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (password.length < 12 || password.length > 1024) {
      res.status(400).json({ error: 'Password must contain 12 to 1024 characters.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const staff = await createStaffAccount(email, passwordHash, 'staff');
    res.status(201).json({ staff });
  } catch (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'A staff account with that email already exists.' });
      return;
    }
    console.error('Unable to create staff account:', error);
    res.status(500).json({ error: 'Unable to create staff account.' });
  }
});

app.get('/api/visitors', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM visitors ORDER BY id DESC`;
    res.json({
      visitors: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        visitReason: row.visit_reason,
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Unable to load visitors:', error);
    res.status(500).json({ error: 'Unable to load visitors.' });
  }
});

app.post('/api/visitors', async (req, res) => {
  const {
    name, phone, email, visitType, visitReason, ministry, notes, followUp,
  } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' || !phone.trim()) {
    res.status(400).json({ error: 'Name and phone number are required.' });
    return;
  }

  const visitorName = name.trim();
  const initials = visitorName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
  const colors = ['blue', 'gold', 'green', 'rose', 'purple'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const dateStr = 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const status = 'Follow-up needed';
  try {
    const visitorRows = await sql`
      INSERT INTO visitors
        (initials, name, phone, email, type, visit_reason, ministry, notes, date, status, color)
      VALUES (
        ${initials}, ${visitorName}, ${phone.trim()}, ${typeof email === 'string' ? email.trim() : ''},
        ${visitType || 'First-time visitor'}, ${visitReason || ''}, ${ministry || ''}, ${notes || ''},
        ${dateStr}, ${status}, ${randomColor}
      )
      RETURNING id
    `;
    const newId = Number(visitorRows[0].id);

    if (followUp) {
      await sql`
        INSERT INTO follow_ups (title, person, owner, due, priority, status)
        VALUES (${visitReason || 'General follow-up'}, ${visitorName}, 'Pastor Ndlovu', 'Tomorrow', 'Medium', 'Pending')
      `;
    }

    res.status(201).json({
      message: 'Success',
      id: newId,
      visitor: {
        id: newId, initials, name: visitorName, phone: phone.trim(),
        email: typeof email === 'string' ? email.trim() : '',
        type: visitType || 'First-time visitor', date: dateStr, status, color: randomColor,
      },
    });
  } catch (error) {
    console.error('Unable to register visitor:', error);
    res.status(500).json({ error: 'Unable to register visitor.' });
  }
});

app.get('/api/followups', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM follow_ups ORDER BY id DESC`;
    res.json({ followUps: rows.map((row) => ({ ...row, id: Number(row.id) })) });
  } catch (error) {
    console.error('Unable to load follow-ups:', error);
    res.status(500).json({ error: 'Unable to load follow-ups.' });
  }
});

app.patch('/api/followups/:id', async (req, res) => {
  try {
    const rows = await sql`SELECT status FROM follow_ups WHERE id = ${req.params.id}`;
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    const newStatus = row.status === 'Completed' ? 'Pending' : 'Completed';
    await sql`UPDATE follow_ups SET status = ${newStatus} WHERE id = ${req.params.id}`;
    res.json({ message: 'Success', status: newStatus });
  } catch (error) {
    console.error('Unable to update follow-up:', error);
    res.status(500).json({ error: 'Unable to update follow-up.' });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) {
    next();
    return;
  }
  res.sendFile(path.join(distPath, 'index.html'), (error) => {
    if (error) next(error);
  });
});

if (require.main === module) {
  app.listen(PORT, isProduction ? '0.0.0.0' : '127.0.0.1', () => {
    console.log(`TAOG Visitor System listening on port ${PORT}.`);
  });
}

module.exports = app;
