/**
 * Used by Docker Compose healthcheck — must stay tiny (no extra deps).
 */
const port = process.env.PORT || 4000;
require('http')
  .get(`http://127.0.0.1:${port}/api/health`, (res) => {
    res.resume();
    res.on('end', () => process.exit(res.statusCode === 200 ? 0 : 1));
  })
  .on('error', () => process.exit(1));
