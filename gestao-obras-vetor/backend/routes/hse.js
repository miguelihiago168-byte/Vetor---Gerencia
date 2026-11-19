const express = require('express');
const { randomUUID } = require('crypto');
const { allQuery, getQuery, runQuery, withClient } = require('../config/database');
const { auth } = require('../middleware/auth');
const { PERMISSIONS, requirePermission, assertProjectAccess } = require('../middleware/rbac');
const { validDate } = require('../services/relatorioSemanalService');
const router = express.Router();

router.use(auth, requirePermission(PERMISSIONS.HSE_MANAGE));

async function projectAccess(req, res) {
  const id = Number(req.params.projetoId);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({erro:'Obra inválida.'}); return null; }
  if (!await assertProjectAccess(req,res,id)) return null;
  const project = await getQuery('SELECT id FROM projetos WHERE id=? AND tenant_id=?',[id,req.tenantId]);
  if (!project) { res.status(404).json({erro:'Obra não encontrada.'}); return null; }
  return id;
}

router.get('/projetos/:projetoId/planejamento', async (req,res) => {
  try {
    const project = await projectAccess(req,res); if (!project) return;
    const calendario = await getQuery('SELECT dias,excecoes FROM hse_calendarios WHERE tenant_id=? AND projeto_id=?',[req.tenantId,project]);
    const previsoes = await allQuery('SELECT * FROM hse_previsoes WHERE tenant_id=? AND projeto_id=? ORDER BY ativa DESC,inicio DESC,id DESC',[req.tenantId,project]);
    const obra = await getQuery('SELECT data_inicio,prazo_termino FROM projetos WHERE tenant_id=? AND id=?',[req.tenantId,project]);
    res.json({calendario,previsoes,obra});
  } catch (error) { console.error('[HSE] planejamento',error); res.status(500).json({erro:'Não foi possível carregar o planejamento.'}); }
});

router.put('/projetos/:projetoId/grade-mensal', async (req,res) => {
  try {
    const project = await projectAccess(req,res); if (!project) return;
    const {alteracoes,versao} = req.body || {};
    if (!Array.isArray(alteracoes) || !alteracoes.length || alteracoes.length > 500 || !Array.isArray(versao))
      return res.status(400).json({erro:'Informe as alterações e a versão do planejamento.'});
    const seen = new Set();
    const normalize = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    for (const item of alteracoes) {
      if (!item || typeof item.funcao !== 'string' || !item.funcao.trim() || item.funcao.length>150 ||
          typeof item.empresa !== 'string' || item.empresa.length>150 || typeof item.fase !== 'string' || item.fase.length>150 ||
          !validDate(item.inicio) || !validDate(item.fim) || item.inicio>item.fim || item.inicio.slice(0,7)!==item.fim.slice(0,7) ||
          (item.quantidade !== null && (!Number.isSafeInteger(item.quantidade) || item.quantidade<0 || item.quantidade>1000000)))
        return res.status(400).json({erro:'Alteração mensal inválida.'});
      const key = [normalize(item.funcao),normalize(item.empresa),normalize(item.fase),item.inicio.slice(0,7)].join('\u0000');
      if (seen.has(key)) return res.status(400).json({erro:'Há alterações duplicadas para o mesmo mês e escopo.'});
      seen.add(key);
    }
    await withClient(async client => {
      await client.query('SELECT id FROM projetos WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[req.tenantId,project]);
      const result = await client.query('SELECT * FROM hse_previsoes WHERE tenant_id=$1 AND projeto_id=$2 AND ativa ORDER BY id FOR UPDATE',[req.tenantId,project]);
      let active = result.rows;
      const currentIds = active.map(row => String(row.id)).sort();
      const expectedIds = versao.map(String).sort();
      if (JSON.stringify(currentIds)!==JSON.stringify(expectedIds)) throw Object.assign(new Error('O planejamento foi alterado. Recarregue os dados antes de salvar.'),{status:409});
      const insert = async row => {
        const saved = await client.query(`INSERT INTO hse_previsoes (tenant_id,projeto_id,funcao,quantidade,inicio,fim,empresa,fase,referencia,observacoes,revisao,anterior_id,criado_por)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [req.tenantId,project,row.funcao,row.quantidade,row.inicio,row.fim,row.empresa,row.fase,row.referencia || '',row.observacoes || '',row.revisao || '',row.anterior_id || null,req.usuario.id]);
        active.push(saved.rows[0]);
      };
      const shift = (date,days) => { const d=new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
      for (const item of alteracoes) {
        const matches = active.filter(row => ['funcao','empresa','fase'].every(field => normalize(row[field])===normalize(item[field])) && row.inicio<=item.fim && row.fim>=item.inicio).sort((a,b)=>a.inicio.localeCompare(b.inicio));
        for (const row of matches) {
          await client.query('UPDATE hse_previsoes SET ativa=FALSE WHERE tenant_id=$1 AND id=$2',[req.tenantId,row.id]);
          active = active.filter(other => String(other.id)!==String(row.id));
          if (row.inicio < item.inicio) await insert({...row,fim:shift(item.inicio,-1),anterior_id:row.id});
          if (row.fim > item.fim) await insert({...row,inicio:shift(item.fim,1),anterior_id:row.id});
        }
        if (item.quantidade !== null) {
          let cursor = item.inicio;
          const newValues = {funcao:item.funcao.trim(),empresa:item.empresa.trim(),fase:item.fase.trim(),quantidade:item.quantidade};
          for (const row of matches) {
            const start = row.inicio < item.inicio ? item.inicio : row.inicio;
            const end = row.fim > item.fim ? item.fim : row.fim;
            if (cursor < start) await insert({...newValues,inicio:cursor,fim:shift(start,-1)});
            await insert({...row,...newValues,inicio:start,fim:end,anterior_id:row.id});
            cursor = shift(end,1);
          }
          if (cursor <= item.fim) await insert({...newValues,inicio:cursor,fim:item.fim});
        }
      }
    });
    res.json({ok:true});
  } catch (error) { if (error.status) return res.status(error.status).json({erro:error.message}); console.error('[HSE] grade mensal',error); res.status(500).json({erro:'Não foi possível salvar a grade mensal.'}); }
});

router.put('/projetos/:projetoId/calendario', async (req,res) => {
  try {
    const project = await projectAccess(req,res); if (!project) return;
    const { dias, excecoes } = req.body || {};
    if (!Array.isArray(dias) || new Set(dias).size !== dias.length || dias.some(d => !Number.isInteger(d) || d<0 || d>6) ||
      !excecoes || typeof excecoes !== 'object' || Array.isArray(excecoes) || Object.entries(excecoes).some(([date,value]) => !validDate(date) || typeof value !== 'boolean'))
      return res.status(400).json({erro:'Calendário inválido.'});
    await runQuery(`INSERT INTO hse_calendarios (tenant_id,projeto_id,dias,excecoes,atualizado_por) VALUES (?,?,?,?,?)
      ON CONFLICT (tenant_id,projeto_id) DO UPDATE SET dias=EXCLUDED.dias,excecoes=EXCLUDED.excecoes,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=NOW()`,
      [req.tenantId,project,JSON.stringify(dias),JSON.stringify(excecoes),req.usuario.id]);
    res.json({ok:true});
  } catch (error) { console.error('[HSE] calendário',error); res.status(500).json({erro:'Não foi possível salvar o calendário.'}); }
});

router.post('/projetos/:projetoId/previsoes', async (req,res) => {
  try {
    const project = await projectAccess(req,res); if (!project) return;
    const body = req.body || {};
    const fields = ['funcao','empresa','fase','referencia','observacoes','revisao'];
    const values = Object.fromEntries(fields.map(key => [key,String(body[key] || '').trim()]));
    const quantity = Number(body.quantidade);
    const previousId = body.anterior_id == null ? null : Number(body.anterior_id);
    if (!values.funcao || fields.some(key => values[key].length > (key === 'observacoes' ? 2000 : 150)) ||
        body.quantidade === '' || body.quantidade == null || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000 ||
        !validDate(body.inicio) || !validDate(body.fim) || body.fim < body.inicio ||
        (previousId !== null && (!Number.isSafeInteger(previousId) || previousId < 1)))
      return res.status(400).json({erro:'Preencha função, quantidade e vigência válidas.'});
    const id = await withClient(async client => {
      await client.query('SELECT id FROM projetos WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[req.tenantId,project]);
      let previousRow = null;
      if (previousId) {
        const previous = await client.query('SELECT * FROM hse_previsoes WHERE tenant_id=$1 AND projeto_id=$2 AND id=$3 AND ativa FOR UPDATE',[req.tenantId,project,previousId]);
        if (!previous.rowCount) throw Object.assign(new Error('A previsão já foi revisada ou não existe.'),{status:409});
        previousRow = previous.rows[0];
      }
      const overlap = await client.query(`SELECT id FROM hse_previsoes WHERE tenant_id=$1 AND projeto_id=$2 AND ativa
        AND lower(trim(funcao))=lower(trim($3)) AND lower(trim(empresa))=lower(trim($4)) AND lower(trim(fase))=lower(trim($5))
        AND inicio <= $7 AND fim >= $6 AND ($8::bigint IS NULL OR id<>$8) LIMIT 1`,
        [req.tenantId,project,values.funcao,values.empresa,values.fase,body.inicio,body.fim,previousId]);
      if (overlap.rowCount) throw Object.assign(new Error('Já existe previsão sobreposta para esta função, empresa e fase.'),{status:409});
      if (previousId) {
        await client.query('UPDATE hse_previsoes SET ativa=FALSE WHERE id=$1 AND tenant_id=$2',[previousId,req.tenantId]);
        const normalize = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
        const sameScope = ['funcao','empresa','fase'].every(field => normalize(previousRow[field]) === normalize(values[field]));
        if (sameScope && previousRow.inicio <= body.fim && previousRow.fim >= body.inicio) {
          const split = `INSERT INTO hse_previsoes (tenant_id,projeto_id,funcao,quantidade,inicio,fim,empresa,fase,referencia,observacoes,revisao,anterior_id,criado_por)
            SELECT tenant_id,projeto_id,funcao,quantidade,`;
          const rest = `,empresa,fase,referencia,observacoes,revisao,id,$4 FROM hse_previsoes WHERE tenant_id=$1 AND id=$2`;
          if (previousRow.inicio < body.inicio) await client.query(`${split} inicio,$3::date - 1${rest}`,[req.tenantId,previousId,body.inicio,req.usuario.id]);
          if (previousRow.fim > body.fim) await client.query(`${split} $3::date + 1,fim${rest}`,[req.tenantId,previousId,body.fim,req.usuario.id]);
        }
      }
      const result = await client.query(`INSERT INTO hse_previsoes (tenant_id,projeto_id,funcao,quantidade,inicio,fim,empresa,fase,referencia,observacoes,revisao,anterior_id,criado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [req.tenantId,project,values.funcao,quantity,body.inicio,body.fim,values.empresa,values.fase,values.referencia,values.observacoes,values.revisao,previousId,req.usuario.id]);
      return result.rows[0].id;
    });
    res.status(201).json({id});
  } catch (error) { if (error.status) return res.status(error.status).json({erro:error.message}); console.error('[HSE] previsão',error); res.status(500).json({erro:'Não foi possível salvar a previsão.'}); }
});

router.get('/mao-de-obra', async (req, res) => {
  try {
    const users = await allQuery(`SELECT u.id, u.nome, u.ativo, 'usuario' AS origem,
      COALESCE(c.funcao, u.funcao, '') AS funcao, c.tipo, u.login AS identificador
      FROM usuarios u JOIN usuario_tenants ut ON ut.usuario_id=u.id AND ut.tenant_id=? AND ut.ativo=1
      LEFT JOIN hse_classificacoes c ON c.tenant_id=ut.tenant_id AND c.origem='usuario' AND c.pessoa_id=u.id
      WHERE u.deletado_em IS NULL ORDER BY u.nome`, [req.tenantId]);
    const workers = await allQuery(`SELECT m.id, m.nome, m.ativo, 'mao_obra' AS origem,
      COALESCE(c.funcao, m.funcao, '') AS funcao, COALESCE(c.tipo, 'Direta') AS tipo, m.identificador
      FROM mao_obra_direta m LEFT JOIN hse_classificacoes c
      ON c.tenant_id=m.tenant_id AND c.origem='mao_obra' AND c.pessoa_id=m.id
      WHERE m.tenant_id=? ORDER BY m.nome`, [req.tenantId]);
    const functions = await allQuery('SELECT id,nome FROM hse_funcoes WHERE tenant_id=? ORDER BY nome', [req.tenantId]);
    res.json({ pessoas: [...users, ...workers], funcoes: functions });
  } catch (error) {
    console.error('[HSE] listagem', error);
    res.status(500).json({ erro: 'Não foi possível carregar a mão de obra.' });
  }
});

router.post('/funcoes', async (req, res) => {
  const name = String(req.body?.nome || '').trim();
  if (!name || name.length > 150) return res.status(400).json({ erro: 'Informe uma função válida.' });
  try {
    const result = await runQuery('INSERT INTO hse_funcoes (tenant_id,nome,criado_por) VALUES (?,?,?)', [req.tenantId, name, req.usuario.id]);
    res.status(201).json({ id: result.lastID, nome: name });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ erro: 'Esta função já está cadastrada.' });
    console.error('[HSE] função', error);
    res.status(500).json({ erro: 'Não foi possível cadastrar a função.' });
  }
});

router.post('/mao-de-obra', async (req, res) => {
  const name = String(req.body?.nome || '').trim();
  const role = String(req.body?.funcao || '').trim();
  const type = req.body?.tipo;
  if (!name || name.length > 200 || !role || role.length > 150 || !['Direta','Indireta','Terceiros'].includes(type))
    return res.status(400).json({ erro: 'Informe nome, função e classificação válidos.' });
  try {
    const id = await withClient(async client => {
      const result = await client.query(`INSERT INTO mao_obra_direta (tenant_id,identificador,nome,funcao,ativo,criado_por)
        VALUES ($1,$2,$3,$4,1,$5) RETURNING id`, [req.tenantId, `HSE-${randomUUID()}`, name, role, req.usuario.id]);
      const id = result.rows[0].id;
      await client.query(`INSERT INTO hse_classificacoes (tenant_id,origem,pessoa_id,funcao,tipo,atualizado_por)
        VALUES ($1,'mao_obra',$2,$3,$4,$5)`, [req.tenantId,id,role,type,req.usuario.id]);
      return id;
    });
    res.status(201).json({ id });
  } catch (error) {
    console.error('[HSE] cadastro', error);
    res.status(500).json({ erro: 'Não foi possível cadastrar a pessoa.' });
  }
});

router.put('/mao-de-obra/:origem/:id', async (req, res) => {
  const { origem } = req.params;
  const id = Number(req.params.id);
  const role = String(req.body?.funcao || '').trim();
  const type = req.body?.tipo;
  const name = String(req.body?.nome || '').trim();
  if (!['usuario','mao_obra'].includes(origem) || !Number.isSafeInteger(id) || id < 1 ||
      !role || role.length > 150 || !['Direta','Indireta','Terceiros'].includes(type) ||
      (origem === 'mao_obra' && (!name || name.length > 200)))
    return res.status(400).json({ erro: 'Dados de mão de obra inválidos.' });
  try {
    const target = origem === 'usuario'
      ? await getQuery('SELECT u.id FROM usuarios u JOIN usuario_tenants ut ON ut.usuario_id=u.id WHERE u.id=? AND ut.tenant_id=? AND ut.ativo=1 AND u.deletado_em IS NULL', [id,req.tenantId])
      : await getQuery('SELECT id FROM mao_obra_direta WHERE id=? AND tenant_id=?', [id,req.tenantId]);
    if (!target) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
    await withClient(async client => {
      if (origem === 'mao_obra') await client.query('UPDATE mao_obra_direta SET nome=$1,funcao=$2,atualizado_em=NOW() WHERE tenant_id=$3 AND id=$4', [name,role,req.tenantId,id]);
      await client.query(`INSERT INTO hse_classificacoes (tenant_id,origem,pessoa_id,funcao,tipo,atualizado_por)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (tenant_id,origem,pessoa_id) DO UPDATE
        SET funcao=EXCLUDED.funcao,tipo=EXCLUDED.tipo,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=NOW()`,
        [req.tenantId,origem,id,role,type,req.usuario.id]);
    });
    res.json({ ok:true });
  } catch (error) {
    console.error('[HSE] edição', error);
    res.status(500).json({ erro: 'Não foi possível atualizar a pessoa.' });
  }
});

router.patch('/mao-de-obra/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.ativo !== 'boolean')
    return res.status(400).json({ erro: 'Status inválido.' });
  try {
    const result = await runQuery(`UPDATE mao_obra_direta SET ativo=?, baixado_em=CASE WHEN ?=0 THEN NOW() ELSE NULL END,
      baixado_por=CASE WHEN ?=0 THEN CAST(? AS INTEGER) ELSE NULL END, atualizado_em=NOW() WHERE id=? AND tenant_id=?`,
      [req.body.ativo ? 1 : 0, req.body.ativo ? 1 : 0, req.body.ativo ? 1 : 0, req.usuario.id, id, req.tenantId]);
    if (!result.changes) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
    res.json({ ok:true });
  } catch (error) {
    console.error('[HSE] status', error);
    res.status(500).json({ erro: 'Não foi possível atualizar o status.' });
  }
});

module.exports = router;
