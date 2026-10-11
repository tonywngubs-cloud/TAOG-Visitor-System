const app = require('../server/server');

module.exports = (req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  const originalPath = requestUrl.searchParams.get('__vercel_path');

  if (!originalPath || (originalPath !== '/api' && !originalPath.startsWith('/api/'))) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  requestUrl.searchParams.delete('__vercel_path');
  req.url = `${originalPath}${requestUrl.search}`;
  app(req, res);
};
