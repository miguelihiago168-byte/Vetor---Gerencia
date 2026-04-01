const run = async () => {
  const base = 'http://127.0.0.1:3001/api';
  const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
  const admin = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: '000001', senha: '123456' }) });
  const aj = await j(admin);
  if (!admin.ok) return console.log('admin login fail', admin.status, aj);
  const token = aj.token;
  const payload = { nome: 'Teste Login ' + Math.floor(Math.random() * 100000), senha: '123456', perfil: 'Fiscal', funcao: 'Fiscal', setor: 'Engenharia' };
  const created = await fetch(base + '/usuarios', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const cj = await j(created);
  console.log('create', created.status, cj?.usuario?.login, cj?.erro || 'ok');
  if (!created.ok) return;
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: cj.usuario.login, senha: '123456' }) });
  const lj = await j(login);
  console.log('new login', login.status, lj?.erro || lj?.usuario?.nome);
};
run().catch(e => { console.error(e); process.exit(1); });
