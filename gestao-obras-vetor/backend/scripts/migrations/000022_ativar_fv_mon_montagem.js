module.exports = {
  id: '000022_ativar_fv_mon_montagem',
  description: 'Mantém o modelo FV-MON disponível para novas folhas de montagem',
  async up({ run }) {
    // A frente de Montagem permanece operacional. FV-TOR é apenas histórico;
    // não deve tornar o modelo FV-MON indisponível em tenants já existentes.
    await run(`UPDATE folhas_verificacao_modelos
      SET ativo=TRUE, atualizado_em=NOW()
      WHERE codigo='FV-MON-PADRAO' AND tipo_folha='MONTAGEM'`);
  }
};
