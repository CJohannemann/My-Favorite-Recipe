const crypto = require('node:crypto');

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

/**
 * Tiny in-memory fixed-window rate limiter, keyed by client IP.
 * Good enough for a single-instance personal app.
 */
function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();

  return {
    // Returns seconds to wait if over the limit, else 0.
    hit(key) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || entry.reset <= now) {
        entry = { count: 0, reset: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return entry.count > max ? Math.ceil((entry.reset - now) / 1000) : 0;
    },
    blocked(key) {
      const entry = hits.get(key);
      return entry && entry.reset > Date.now() && entry.count >= max
        ? Math.ceil((entry.reset - Date.now()) / 1000)
        : 0;
    },
  };
}

/**
 * HTTP Basic Auth for the whole app. The browser shows its own sign-in
 * prompt and remembers it. Only safe over HTTPS (the tunnel/proxy provides it).
 * Repeated wrong passwords from one IP are locked out for a while.
 */
function basicAuth({ user, password }) {
  const failures = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

  return (req, res, next) => {
    const wait = failures.blocked(req.ip);
    if (wait) {
      res.set('Retry-After', String(wait));
      return res.status(429).send('Too many failed sign-in attempts. Try again later.');
    }

    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      const u = decoded.slice(0, i);
      const p = decoded.slice(i + 1);
      // Evaluate both so timing doesn't reveal which one was wrong.
      const ok = safeEqual(u, user) & safeEqual(p, password);
      if (i !== -1 && ok) return next();
      failures.hit(req.ip);
    }

    res.set('WWW-Authenticate', 'Basic realm="My Favorite Recipes", charset="UTF-8"');
    res.status(401).send('Sign in required.');
  };
}

function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
  });
  next();
}

module.exports = { basicAuth, rateLimiter, securityHeaders };
