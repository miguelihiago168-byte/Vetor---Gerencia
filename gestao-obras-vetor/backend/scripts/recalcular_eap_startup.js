/**
 * Recalcula percentual_executado de todas as atividades EAP ao iniciar o servidor.
 * Usa todos os RDOs que não estão Reprovados.
 */
const { getQuery, allQuery, runQuery } = require('../config/database');

async function recalcularTodasAtividades() {
  try {
    // Todas as atividades que aparecem em algum rdo_atividades
    const atividades = await allQuery(`
      SELECT DISTINCT ra.atividade_eap_id AS id
      FROM rdo_atividades ra
      JOIN rdos r ON ra.rdo_id = r.id
      WHERE r.status != 'Reprovado'
    `);

    for (const { id: atividadeId } of atividades) {
      const info = await getQuery('SELECT quantidade_total FROM atividades_eap WHERE id = ?', [atividadeId]);
      if (!info) continue;

      const qtTotal = Number(info.quantidade_total || 0);
      const resQt = await getQuery(`
        SELECT COALESCE(SUM(COALESCE(ra.quantidade_executada, 0)), 0) AS total
        FROM rdo_atividades ra
        JOIN rdos r ON ra.rdo_id = r.id
        WHERE ra.atividade_eap_id = ? AND r.status != 'Reprovado'
      `, [atividadeId]);

      let perc = 0;
      if (qtTotal > 0 && resQt?.total) {
        perc = Math.min(Math.round((resQt.total / qtTotal) * 10000) / 100, 100);
      } else {
        const resPerc = await getQuery(`
          SELECT COALESCE(SUM(ra.percentual_executado), 0) AS total
          FROM rdo_atividades ra
          JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ? AND r.status != 'Reprovado'
        `, [atividadeId]);
        perc = Math.min(resPerc?.total || 0, 100);
      }

      let dataConclusao = null;
      if (perc >= 100) {
        const ultima = await getQuery(`
          SELECT MAX(r.data_relatorio) AS d
          FROM rdo_atividades ra
          JOIN rdos r ON ra.rdo_id = r.id
          WHERE ra.atividade_eap_id = ? AND r.status != 'Reprovado'
        `, [atividadeId]);
        dataConclusao = ultima?.d || null;
      }

      const novoStatus = perc >= 100 ? 'Concluída' : (perc > 0 ? 'Em andamento' : 'Não iniciada');
      await runQuery(
        'UPDATE atividades_eap SET percentual_executado = ?, status = ?, data_conclusao_real = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
        [perc, novoStatus, dataConclusao, atividadeId]
      );
    }

    // Recalcular pais (múltiplos passes para propagação em árvore)
    const pais = await allQuery(`
      SELECT DISTINCT pai_id AS id FROM atividades_eap WHERE pai_id IS NOT NULL ORDER BY id
    `);

    for (let pass = 0; pass < 5; pass++) {
      for (const { id: paiId } of pais) {
        const filhos = await allQuery('SELECT percentual_executado, quantidade_total FROM atividades_eap WHERE pai_id = ?', [paiId]);
        if (!filhos.length) continue;

        let somaPesada = 0, somaPeso = 0, somaSimples = 0;
        for (const f of filhos) {
          const p = parseFloat(f.percentual_executado || 0);
          const w = parseFloat(f.quantidade_total || 0);
          somaSimples += p;
          if (w > 0) { somaPesada += p * w; somaPeso += w; }
        }

        const novoPerc = somaPeso > 0
          ? Math.min(Math.round((somaPesada / somaPeso) * 100) / 100, 100)
          : Math.min(Math.round((somaSimples / filhos.length) * 100) / 100, 100);

        const novoStatus = novoPerc >= 100 ? 'Concluída' : (novoPerc > 0 ? 'Em andamento' : 'Não iniciada');
        await runQuery(
          'UPDATE atividades_eap SET percentual_executado = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
          [novoPerc, novoStatus, paiId]
        );
      }
    }

    console.log('EAP recalculada com sucesso.');
  } catch (err) {
    console.warn('Falha ao recalcular EAP no startup:', err?.message || err);
  }
}

module.exports = { recalcularTodasAtividades };
