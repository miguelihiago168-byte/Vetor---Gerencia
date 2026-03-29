const { db } = require('../config/database');
db.run("UPDATE usuarios SET perfil='Gestor Geral' WHERE login='000001'", function(err) {
  if (err) { console.error('Erro:', err); }
  else { console.log('Perfil atualizado. Linhas afetadas:', this.changes); }
  db.close();
});
