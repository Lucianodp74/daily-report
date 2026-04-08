module.exports = {
  requireAuth: (req, res, next) => {
    next();
  },
  requireAdmin: (req, res, next) => {
    next();
  }
};
