const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'your_secret_key';

// Accepts "Bearer <token>" or a raw token.
const verifyToken = (req, res, next) => {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    if (!token) return res.status(403).json({ message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, SECRET);
        req.userId = decoded.id;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Failed to authenticate token' });
    }
};

module.exports = { SECRET, verifyToken };
