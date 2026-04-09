/**
 * Wraps async route handlers so rejected promises reach Express error middleware.
 * Without this, a thrown error from await (e.g. Redis/DB) can leave the client
 * with no response — nginx then returns 502 Bad Gateway.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
