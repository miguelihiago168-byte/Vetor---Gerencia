module.exports = {
  id: '000009_estoque_entrada_por_obra',
  description: 'Direciona entradas de compras da obra para o estoque da propria obra',
  async up({ run }) {
    // Apenas lotes sem qualquer transferencia anterior sao realocados. Assim, a
    // migracao nao altera saldos que alguem ja tenha movimentado manualmente.
    await run(`
      INSERT INTO estoque_saldos
        (tenant_id,lote_id,local_chave,tipo_local,projeto_id,quantidade,quantidade_reservada)
      SELECT s.tenant_id, s.lote_id, 'OBRA:' || pe.projeto_solicitante_id,
        'OBRA', pe.projeto_solicitante_id, s.quantidade, s.quantidade_reservada
      FROM estoque_saldos s
      JOIN estoque_lotes l ON l.id=s.lote_id
      JOIN estoque_pendencias_recebimento pe ON pe.id=l.pendencia_recebimento_id
      WHERE s.local_chave='CENTRAL'
        AND pe.projeto_solicitante_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM estoque_movimentacoes m
          WHERE m.lote_id=l.id AND m.tipo IN ('RESERVA_TRANSFERENCIA','TRANSFERENCIA_SAIDA','TRANSFERENCIA_ENTRADA','CANCELAMENTO_TRANSFERENCIA')
        )
      ON CONFLICT (tenant_id,lote_id,local_chave) DO UPDATE
        SET quantidade=estoque_saldos.quantidade+EXCLUDED.quantidade,
            quantidade_reservada=estoque_saldos.quantidade_reservada+EXCLUDED.quantidade_reservada,
            atualizado_em=NOW()
    `);
    await run(`
      DELETE FROM estoque_saldos s
      USING estoque_lotes l, estoque_pendencias_recebimento pe
      WHERE s.lote_id=l.id
        AND l.pendencia_recebimento_id=pe.id
        AND s.local_chave='CENTRAL'
        AND pe.projeto_solicitante_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM estoque_movimentacoes m
          WHERE m.lote_id=l.id AND m.tipo IN ('RESERVA_TRANSFERENCIA','TRANSFERENCIA_SAIDA','TRANSFERENCIA_ENTRADA','CANCELAMENTO_TRANSFERENCIA')
        )
    `);
  }
};
