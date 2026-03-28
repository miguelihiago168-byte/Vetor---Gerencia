/**
 * Recalcula percentual_executado de TODAS as atividades EAP
 * com base apenas em RDOs aprovados.
 * Roda uma vez para corrigir dados históricos.
 */
const sqlite3 = require('sqlite3');
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '../database/gestao_obras.db'));

const run  = (sql, p=[]) => new Promise((res, rej) => db.run(sql, p, function(e){ e ? rej(e) : res(this); }));
const get  = (sql, p=[]) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all  = (sql, p=[]) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));

async function main() {
  console.log('=== Recalculando avanço EAP (somente RDOs aprovados) ===\n');

  // Buscar todas as atividades folha (sem filhos) que têm entradas em rdo_atividades
  const atividades = await all(`
    SELECT DISTINCT ra.atividade_eap_id AS id
    FROM rdo_atividades ra
    JOIN rdos r ON ra.rdo_id = r.id
    WHERE r.status = 'Aprovado'
  `);

  console.log(`Atividades a recalcular: ${atividades.length}`);

  for (const { id: atividadeId } of atividades) {
    const info = await get('SELECT descricao, quantidade_total, percentual_executado FROM atividades_eap WHERE id = ?', [atividadeId]);
    if (!info) continue;

    const qtTotal = Number(info.quantidade_total || 0);
    const resQt = await get(`
      SELECT COALESCE(SUM(COALESCE(ra.quantidade_executada, 0)), 0) AS total
      FROM rdo_atividades ra
      JOIN rdos r ON ra.rdo_id = r.id
      WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
    `, [atividadeId]);

    let perc = 0;
    if (qtTotal > 0 && resQt?.total) {
      perc = Math.min(Math.round((resQt.total / qtTotal) * 10000) / 100, 100);
    } else {
      const resPerc = await get(`
        SELECT COALESCE(SUM(ra.percentual_executado), 0) AS total
        FROM rdo_atividades ra
        JOIN rdos r ON ra.rdo_id = r.id
        WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
      `, [atividadeId]);
      perc = Math.min(resPerc?.total || 0, 100);
    }

    let dataConclusao = null;
    if (perc >= 100) {
      const ultima = await get(`
        SELECT MAX(r.data_relatorio) AS d
        FROM rdo_atividades ra
        JOIN rdos r ON ra.rdo_id = r.id
        WHERE ra.atividade_eap_id = ? AND r.status = 'Aprovado'
      `, [atividadeId]);
      dataConclusao = ultima?.d || null;
    }

    const novoStatus = perc >= 100 ? 'Concluída' : (perc > 0 ? 'Em andamento' : 'Não iniciada');

    await run(
      'UPDATE atividades_eap SET percentual_executado = ?, status = ?, data_conclusao_real = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [perc, novoStatus, dataConclusao, atividadeId]
    );

    const anterior = info.percentual_executado;
    if (anterior !== perc) {
      console.log(`  [ID ${atividadeId}] ${info.descricao}: ${anterior}% → ${perc}% (${novoStatus})`);
    }
  }

  // Recalcular pais (de baixo para cima) — buscar todos os pais únicos
  const pais = await all(`
    SELECT DISTINCT pai_id AS id FROM atividades_eap 
    WHERE pai_id IS NOT NULL
    ORDER BY id
  `);

  // Ordenar do mais profundo para o mais alto (processar filhos antes dos pais)
  // Vamos usar múltiplas passagens para garantir propagação
  for (let pass = 0; pass < 5; pass++) {
    for (const { id: paiId } of pais) {
      const filhos = await all(`
        SELECT
          percentual_executado,
          COALESCE(peso_percentual_projeto, percentual_previsto, 0) AS peso_percentual
        FROM atividades_eap
        WHERE pai_id = ?
      `, [paiId]);
      if (!filhos.length) continue;

      let somaContribuicao = 0, somaPeso = 0, somaSimples = 0;
      for (const f of filhos) {
        const p = parseFloat(f.percentual_executado || 0);
        const w = parseFloat(f.peso_percentual || 0);
        somaSimples += p;
        if (w > 0) { somaContribuicao += (p * w) / 100; somaPeso += w; }
      }

      const novoPerc = somaPeso > 0
        ? Math.min(Math.round(somaContribuicao * 100) / 100, 100)
        : Math.min(Math.round((somaSimples / filhos.length) * 100) / 100, 100);

      const novoStatus = novoPerc >= 100 ? 'Concluída' : (novoPerc > 0 ? 'Em andamento' : 'Não iniciada');

      await run(
        'UPDATE atividades_eap SET percentual_executado = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
        [novoPerc, novoStatus, paiId]
      );
    }
  }

  // Mostrar estado final
  const resultado = await all('SELECT id, codigo_eap, descricao, percentual_executado, status FROM atividades_eap ORDER BY codigo_eap');
  console.log('\n=== Estado final da EAP ===');
  resultado.forEach(r => {
    console.log(`  [${r.codigo_eap || r.id}] ${r.descricao}: ${r.percentual_executado}% — ${r.status}`);
  });

  db.close();
  console.log('\nConcluído!');
}

main().catch(e => { console.error(e); db.close(); });
