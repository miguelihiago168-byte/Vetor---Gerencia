const jwt = require('jsonwebtoken');
const { carregarPerfilUsuario } = require('./rbac');
const { PERFIS, inferirPerfil } = require('../constants/access');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuarioAtual = await carregarPerfilUsuario(decoded.id);
    if (!usuarioAtual) {
      return res.status(401).json({ erro: 'Usuário inválido ou inativo.' });
    }

    req.usuario = {
      ...decoded,
      ...usuarioAtual,
      perfil: inferirPerfil(usuarioAtual)
    };

    next();
  } catch (error) {
    res.status(401).json({ erro: 'Token inválido.' });
  }
};

const isGestor = (req, res, next) => {
  const perfil = inferirPerfil(req.usuario);
  if (![PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA].includes(perfil)) {
    return res.status(403).json({ erro: 'Acesso negado. Apenas gestores podem realizar esta ação.' });
  }
  next();
};

const isAdm = (req, res, next) => {
  const perfil = inferirPerfil(req.usuario);
  if (perfil !== PERFIS.ADM) {
    return res.status(403).json({ erro: 'Acesso negado. Apenas ADM podem realizar esta ação.' });
  }
  next();
};

module.exports = { auth, isGestor, isAdm };
