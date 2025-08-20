// middleware/authenticate.js
const jwt = require('jsonwebtoken');

module.exports = function authenticate(requiredRole = null) {
  return (req, res, next) => {
    try {
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload; // { id, role, name? }

      if (requiredRole && req.user.role !== requiredRole) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      next();
    } catch (err) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
  };
};
