const key = (name) => String(name || '').trim().toLowerCase();
const fail = (status, message) => Object.assign(new Error(message), { status });

const buildCatalog = (rows, settings = {}) => {
  const catalog = new Map();
  const add = (row) => {
    const original = key(row.nome);
    if (!original) return;
    const override = Object.hasOwn(settings, original) ? settings[original] : null;
    if (override?.excluido) return;
    const nome = override?.nome || String(row.nome).trim();
    const id = key(nome);
    const current = catalog.get(id) || { nome, usos: 0, ultimo_uso: null };
    current.usos += Number(row.usos || 0);
    if (row.ultimo_uso && (!current.ultimo_uso || row.ultimo_uso > current.ultimo_uso)) {
      current.ultimo_uso = row.ultimo_uso;
    }
    catalog.set(id, current);
  };
  rows.forEach(add);
  Object.keys(settings).forEach(nome => add({ nome }));
  return [...catalog.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

const changeSettings = (settings, original, nome, excluido) => {
  const target = key(original);
  const patch = new Map();
  for (const [source, entry] of Object.entries(settings)) {
    if (!entry.excluido && key(entry.nome) === target) {
      patch.set(source, { nome, excluido });
    }
  }
  patch.set(target, { nome, excluido });
  // A reused name becomes a canonical suggestion even if it was renamed or hidden before.
  if (!excluido) patch.set(key(nome), { nome, excluido: false });
  return { ...settings, ...Object.fromEntries(patch) };
};

const createEquipmentCatalogService = ({ withClient, getWithClient, allWithClient, execWithClient }) => {
  const project = async (client, projetoId, tenantId, lock = false) => {
    const row = await getWithClient(client,
      `SELECT id, rdo_equipamentos_catalogo FROM projetos WHERE id = ? AND tenant_id = ?${lock ? ' FOR UPDATE' : ''}`,
      [projetoId, tenantId]);
    if (!row) throw fail(403, 'Projeto fora do tenant ativo.');
    return row;
  };
  return {
    list: (projetoId, tenantId) => withClient(async client => {
      const row = await project(client, projetoId, tenantId);
      const usages = await allWithClient(client, `
        SELECT MIN(TRIM(e.nome)) AS nome, COUNT(*) AS usos, MAX(r.data_relatorio) AS ultimo_uso
        FROM rdo_equipamentos e INNER JOIN rdos r ON r.id = e.rdo_id
        WHERE r.projeto_id = ? AND r.tenant_id = ? AND TRIM(COALESCE(e.nome, '')) <> ''
        GROUP BY LOWER(TRIM(e.nome))`, [projetoId, tenantId]);
      return buildCatalog(usages, row.rdo_equipamentos_catalogo);
    }),
    change: (projetoId, tenantId, original, newName, excluido = false) => withClient(async client => {
      const nomeOriginal = String(original || '').trim();
      const nome = String(excluido ? original || '' : newName || '').trim();
      if (!nomeOriginal || !nome || nome.length > 200 || nomeOriginal.length > 200) {
        throw fail(400, 'Informe um nome de equipamento com até 200 caracteres.');
      }
      const row = await project(client, projetoId, tenantId, true);
      const settings = changeSettings(row.rdo_equipamentos_catalogo || {}, nomeOriginal, nome, excluido);
      await execWithClient(client,
        'UPDATE projetos SET rdo_equipamentos_catalogo = ?::jsonb WHERE id = ? AND tenant_id = ?',
        [JSON.stringify(settings), projetoId, tenantId]);
      return { nome, excluido };
    })
  };
};

module.exports = { buildCatalog, changeSettings, createEquipmentCatalogService };
