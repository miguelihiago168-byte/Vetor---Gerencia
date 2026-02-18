const { db, allQuery, getQuery } = require('../config/database');

// Recuperar usuários deletados (soft delete)
const recuperarUsuarioDeletado = async (usuarioId) => {
  try {
    const usuario = await getQuery(
      'SELECT * FROM usuarios WHERE id = ? AND deletado_em IS NOT NULL',
      [usuarioId]
    );
    return usuario;
  } catch (error) {
    console.error('Erro ao recuperar usuário deletado:', error);
    throw error;
  }
};

// Listar todos os usuários deletados
const listarUsuariosDeletados = async () => {
  try {
    const usuarios = await allQuery(
      'SELECT id, login, nome, email, is_gestor, deletado_em, deletado_por FROM usuarios WHERE deletado_em IS NOT NULL ORDER BY deletado_em DESC'
    );
    return usuarios;
  } catch (error) {
    console.error('Erro ao listar usuários deletados:', error);
    throw error;
  }
};

module.exports = { recuperarUsuarioDeletado, listarUsuariosDeletados };
