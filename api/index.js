// Vercel serverless entry point. vercel.json rewrites /api/* here and
// passes the original path in ?__p=… so the shared handler can route it.
const { handle } = require('../lib/app');

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('__p');
  return handle(req, res, original || url.pathname);
};
