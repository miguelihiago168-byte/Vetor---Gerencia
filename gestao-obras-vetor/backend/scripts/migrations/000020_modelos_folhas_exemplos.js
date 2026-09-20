module.exports = {
  id: '000020_modelos_folhas_exemplos',
  description: 'Adiciona instrucoes e exemplos aos modelos padrao de montagem e torque',
  async up({ run }) {
    const montagem = {
      instrucoes: [
        'Identifique a obra, o lote, a atividade EAP e a area da inspecao.',
        'Registre a populacao e a amostra prevista antes de iniciar a verificacao.',
        'Para cada estrutura, marque Conforme, Nao conforme ou Nao aplicavel com justificativa.',
        'Anexe fotos, documentos e evidencias quando ajudarem a comprovar o resultado.',
        'Assine como executante e inspetor e envie a folha para aprovacao.'
      ],
      exemplo: 'Exemplo: String 01_02_03 | Inversor 01 | montagem conforme projeto, alinhamento e fixadores verificados.'
    };
    const torque = {
      instrucoes: [
        'Informe o requisito: fixador, torque nominal, tolerancia, documento e revisao.',
        'Selecione o torquimetro e confira a faixa de operacao e a validade da calibracao.',
        'Registre um ponto para cada local e informe o valor medido em N.m.',
        'O sistema compara cada medicao com os limites e sinaliza Conforme ou Nao conforme.',
        'Anexe o certificado de calibracao, fotos e evidencias antes de enviar para aprovacao.'
      ],
      exemplo: 'Exemplo: Parafuso M12 | nominal 75 N.m | limites 71,25 a 78,75 N.m | medicao 75 N.m = Conforme.'
    };

    await run(`
      UPDATE folhas_verificacao_modelos
      SET descricao = COALESCE(descricao, ?),
          configuracao = configuracao || ?::jsonb,
          atualizado_em = NOW()
      WHERE tipo_folha = 'MONTAGEM' AND codigo = 'FV-MON-PADRAO'
    `, ['Modelo padrão para inspeção da montagem de estruturas.', JSON.stringify(montagem)]);
    await run(`
      UPDATE folhas_verificacao_modelos
      SET descricao = COALESCE(descricao, ?),
          configuracao = configuracao || ?::jsonb,
          atualizado_em = NOW()
      WHERE tipo_folha = 'TORQUE' AND codigo = 'FV-TOR-PADRAO'
    `, ['Modelo padrão para controle de torque e rastreabilidade do instrumento.', JSON.stringify(torque)]);
  }
};
