const session = require('express-session');
const { sql } = require('./database');

class PostgresSessionStore extends session.Store {
  get(sid, callback) {
    sql`SELECT sess, expires FROM web_sessions WHERE sid = ${sid}`
      .then((rows) => {
        const row = rows[0];
        if (!row) {
          callback(null, null);
          return;
        }
        if (new Date(row.expires).getTime() <= Date.now()) {
          this.destroy(sid, (error) => callback(error, null));
          return;
        }
        callback(null, row.sess);
      })
      .catch(callback);
  }

  set(sid, sess, callback = () => {}) {
    const maxAge = sess.cookie && Number(sess.cookie.maxAge);
    const cookieExpiry = sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + (Number.isFinite(maxAge) ? maxAge : 8 * 60 * 60 * 1000);
    const expires = new Date(Number.isFinite(cookieExpiry)
      ? cookieExpiry
      : Date.now() + 8 * 60 * 60 * 1000).toISOString();
    let serialized;

    try {
      serialized = JSON.stringify(sess);
    } catch (error) {
      callback(error);
      return;
    }

    sql`INSERT INTO web_sessions (sid, sess, expires)
        VALUES (${sid}, ${serialized}::jsonb, ${expires})
        ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expires = EXCLUDED.expires`
      .then(() => sql`DELETE FROM web_sessions WHERE expires <= CURRENT_TIMESTAMP`)
      .then(() => callback())
      .catch(callback);
  }

  touch(sid, sess, callback = () => {}) {
    const maxAge = sess.cookie && Number(sess.cookie.maxAge);
    const cookieExpiry = sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + (Number.isFinite(maxAge) ? maxAge : 8 * 60 * 60 * 1000);
    const expires = new Date(Number.isFinite(cookieExpiry)
      ? cookieExpiry
      : Date.now() + 8 * 60 * 60 * 1000).toISOString();

    sql`UPDATE web_sessions SET expires = ${expires} WHERE sid = ${sid}`
      .then(() => callback())
      .catch(callback);
  }

  destroy(sid, callback = () => {}) {
    sql`DELETE FROM web_sessions WHERE sid = ${sid}`
      .then(() => callback())
      .catch(callback);
  }

  clear(callback = () => {}) {
    sql`DELETE FROM web_sessions`
      .then(() => callback())
      .catch(callback);
  }
}

module.exports = PostgresSessionStore;
