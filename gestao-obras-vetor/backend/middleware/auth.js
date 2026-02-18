const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    res.status(401).json({ erro: 'Token inválido.' });
  }
};

const isGestor = (req, res, next) => {
  if (!req.usuario.is_gestor) {
    return res.status(403).json({ erro: 'Acesso negado. Apenas gestores podem realizar esta ação.' });
  }
  next();
};

const isAdm = (req, res, next) => {
  if (!req.usuario.is_adm) {
    return res.status(403).json({ erro: 'Acesso negado. Apenas ADM podem realizar esta ação.' });
  }
  next();
};

module.exports = { auth, isGestor, isAdm };
