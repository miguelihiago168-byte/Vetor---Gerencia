/**
 * Serviço de Cronograma e Gantt
 * Realiza cálculos de dependências, sugestões automáticas e análise de caminho crítico
 */

// Peso das heurísticas
const PESOS_HEURISTICAS = {
  temporal: 1,
  hierarquia: 1,
  palavrasChave: 2,
  durationSimilar: 0.5,
  ondasParalelas: -0.5,
  limiarRecomendacao: 3
};

// Mapa de palavras-chave e etapas
const MAPA_ETAPAS = {
  fundacao: 0,
  base: 0,
  escavacao: 0.5,
  pilar: 0.5,
  instalacao: 1,
  montagem: 1.2,
  comissionamento: 2,
  teste: 2.5,
  commissioning: 2,
  startup: 2.5,
  conclusao: 3,
  finalizacao: 3
};

/**
 * Calcula o score de dependência entre duas atividades
 * @param {Object} atividadeA - Atividade origem
 * @param {Object} atividadeB - Atividade destino
 * @param {boolean} modoParalelizacao - Se deve considerar paralelização
 * @returns {Object} { score, motivos, tipo_vinculo_recomendado }
 */
function calcularScoreDependencia(atividadeA, atividadeB, modoParalelizacao = true) {
  if (!atividadeA || !atividadeB) {
    return { score: 0, motivos: [], tipo_vinculo_recomendado: 'FS' };
  }

  let score = 0;
  const motivos = [];

  // 1. Validação básica: não permitir auto-dependência
  if (atividadeA.id === atividadeB.id) {
    return { score: -999, motivos: ['auto-dependencia'], tipo_vinculo_recomendado: null };
  }

  // 2. HEURÍSTICA TEMPORAL: Se A termina antes ou no mesmo dia que B começa
  if (atividadeA.data_fim_planejada && atividadeB.data_inicio_planejada) {
    const dataFimA = new Date(atividadeA.data_fim_planejada);
    const dataInicioB = new Date(atividadeB.data_inicio_planejada);

    if (dataFimA <= dataInicioB) {
      score += PESOS_HEURISTICAS.temporal;
      motivos.push('temporal');
    }

    // 4.1 DETECÇÃO DE ONDAS PARALELAS: se datas se sobrepõem, reduz score
    const dataInicioA = new Date(atividadeA.data_inicio_planejada);
    const dataFimB = new Date(atividadeB.data_fim_planejada);

    if (dataInicioA < dataFimB && dataInicioB < dataFimA) {
      // Atividades têm sobreposição temporal
      score += PESOS_HEURISTICAS.ondasParalelas;
      motivos.push('ondas_paralelas');
    }
  }

  // 3. HEURÍSTICA DE HIERARQUIA: Se estão no mesmo grupo da EAP
  if (atividadeA.pai_id && atividadeB.pai_id && atividadeA.pai_id === atividadeB.pai_id) {
    score += PESOS_HEURISTICAS.hierarquia;
    motivos.push('mesmo_grupo');
  }

  // 4. HEURÍSTICA DE PALAVRAS-CHAVE
  const etapaA = extrairEtapa(atividadeA.nome);
  const etapaB = extrairEtapa(atividadeB.nome);

  if (etapaA !== null && etapaB !== null) {
    if (etapaA < etapaB) {
      score += PESOS_HEURISTICAS.palavrasChave;
      motivos.push('palavras_chave');
    }
  }

  // 5. HEURÍSTICA DE DURAÇÃO SIMILAR (para detecção de paralelização)
  if (modoParalelizacao && atividadeA.duracao && atividadeB.duracao) {
    const duracaoA = parseInt(atividadeA.duracao) || 0;
    const duracaoB = parseInt(atividadeB.duracao) || 0;

    if (duracaoA > 0 && duracaoB > 0) {
      const percentSimilaridade = Math.abs(duracaoA - duracaoB) / Math.max(duracaoA, duracaoB);
      if (percentSimilaridade <= 0.3) {
        // Durações similares (±30%)
        score += PESOS_HEURISTICAS.durationSimilar;
        motivos.push('duracao_similar');
      }
    }
  }

  // Determinar tipo de vínculo recomendado
  let tipo_vinculo_recomendado = 'FS'; // Padrão: Fim-Início

  if (motivos.includes('ondas_paralelas') && motivos.length === 1) {
    tipo_vinculo_recomendado = 'SS'; // Se só tem ondas paralelas, pode ser Início-Início
  }

  return {
    score: parseFloat(score.toFixed(2)),
    motivos,
    tipo_vinculo_recomendado,
    recomendada: score >= PESOS_HEURISTICAS.limiarRecomendacao
  };
}

/**
 * Extrai a etapa (estágio) da atividade pelo nome/descrição
 * Retorna um número (0-3) indicando o estágio do projeto
 * @param {string} nome - Nome ou descrição da atividade
 * @returns {number|null} Número da etapa ou null se não encontrada
 */
function extrairEtapa(nome) {
  if (!nome) return null;

  const nomeLower = nome.toLowerCase();

  for (const palavra in MAPA_ETAPAS) {
    if (nomeLower.includes(palavra)) {
      return MAPA_ETAPAS[palavra];
    }
  }

  return null;
}

/**
 * Faz parse seguro de data (YYYY-MM-DD) sem deslocamento de timezone
 * @param {string|Date} valor
 * @returns {Date|null}
 */
function parseDataSemTimezone(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : new Date(valor.getTime());
  }

  if (typeof valor === 'string') {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const ano = Number(m[1]);
      const mes = Number(m[2]) - 1;
      const dia = Number(m[3]);
      const data = new Date(ano, mes, dia, 12, 0, 0, 0);
      return Number.isNaN(data.getTime()) ? null : data;
    }
  }

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Retorna true quando a data cai em dia útil (segunda a sexta)
 * @param {Date} data
 * @returns {boolean}
 */
function isDiaUtil(data) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return false;
  const dow = data.getDay();
  return dow >= 1 && dow <= 5;
}

/**
 * Soma/subtrai dias úteis (ignora sábado e domingo)
 * @param {Date|string} dataBase
 * @param {number} diasUteis
 * @returns {Date|null}
 */
function adicionarDiasUteis(dataBase, diasUteis) {
  const base = parseDataSemTimezone(dataBase);
  if (!base) return null;

  const resultado = new Date(base.getTime());
  const sentido = diasUteis >= 0 ? 1 : -1;
  let restante = Math.abs(diasUteis);

  while (restante > 0) {
    resultado.setDate(resultado.getDate() + sentido);
    if (isDiaUtil(resultado)) restante -= 1;
  }

  return resultado;
}

/**
 * Conta dias úteis no intervalo inclusivo [inicio, fim]
 * @param {Date|string} dataInicio
 * @param {Date|string} dataFim
 * @returns {number}
 */
function contarDiasUteisInclusivo(dataInicio, dataFim) {
  const inicio = parseDataSemTimezone(dataInicio);
  const fim = parseDataSemTimezone(dataFim);
  if (!inicio || !fim) return 0;
  if (fim < inicio) return 0;

  const cursor = new Date(inicio.getTime());
  let dias = 0;
  while (cursor <= fim) {
    if (isDiaUtil(cursor)) dias += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  // Evita duração 0 para atividades totalmente no fim de semana.
  return Math.max(1, dias);
}

/**
 * Calcula duração em dias entre duas datas
 * @param {string} dataInicio - Data no formato YYYY-MM-DD
 * @param {string} dataFim - Data no formato YYYY-MM-DD
 * @returns {number} Duração em dias
 */
function calcularDuracao(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return 0;

  return contarDiasUteisInclusivo(dataInicio, dataFim);
}

/**
 * Detecta ciclos em um grafo de dependências (DFS)
 * @param {number} novoOrigemId - ID da atividade origem da nova aresta
 * @param {number} novoDestinoId - ID da atividade destino da nova aresta
 * @param {Array} dependenciasExistentes - Lista de dependências já confirmadas
 * @returns {Object} { temCiclo, caminhoCiclo }
 */
function detectarCiclos(novoOrigemId, novoDestinoId, dependenciasExistentes = []) {
  // Construir adjacência com a nova aresta
  const grafo = {};

  dependenciasExistentes.forEach(dep => {
    if (!grafo[dep.atividade_origem_id]) {
      grafo[dep.atividade_origem_id] = [];
    }
    grafo[dep.atividade_origem_id].push(dep.atividade_destino_id);
  });

  // Adicionar nova aresta
  if (!grafo[novoOrigemId]) {
    grafo[novoOrigemId] = [];
  }
  grafo[novoOrigemId].push(novoDestinoId);

  // DFS para detectar ciclo
  const visited = new Set();
  const recursionStack = new Set();
  const caminhos = [];

  function dfs(node, caminho = []) {
    visited.add(node);
    recursionStack.add(node);
    caminho.push(node);

    if (grafo[node]) {
      for (const vizinho of grafo[node]) {
        if (vizinho === novoDestinoId && recursionStack.has(novoOrigemId)) {
          // Ciclo encontrado
          const indiceCiclo = caminho.indexOf(novoOrigemId);
          if (indiceCiclo !== -1) {
            caminhos.push(caminho.slice(indiceCiclo));
          }
        }

        if (!visited.has(vizinho)) {
          dfs(vizinho, [...caminho]);
        } else if (recursionStack.has(vizinho)) {
          // Ciclo encontrado
          const indiceCiclo = caminho.indexOf(vizinho);
          if (indiceCiclo !== -1) {
            caminhos.push(caminho.slice(indiceCiclo).concat(vizinho));
          }
        }
      }
    }

    recursionStack.delete(node);
    caminho.pop();
  }

  dfs(novoOrigemId);

  const temCiclo = caminhos.length > 0;

  return {
    temCiclo,
    caminhoCiclo: caminhos.length > 0 ? caminhos[0] : []
  };
}

/**
 * Calcula o caminho crítico usando o algoritmo CPM (Critical Path Method)
 * @param {Array} atividades - Lista de todas as atividades
 * @param {Array} dependenciasConfirmadas - Apenas dependências confirmadas
 * @returns {Object} { caminhoCritico, dataConclusao, folgas, criticalSlackPath }
 */
function calcularCaminoCritico(atividades, dependenciasConfirmadas = []) {
  if (!atividades || atividades.length === 0) {
    return {
      caminhoCritico: [],
      dataConclusao: null,
      folgas: {},
      criticalSlackPath: 0
    };
  }

  // Criar mapa de atividades por ID
  const atividadesMap = {};
  atividades.forEach(at => {
    atividadesMap[at.id] = at;
  });

  // Inicializar early start e early finish
  const earliestStart = {};
  const earliestFinish = {};
  const latestStart = {};
  const latestFinish = {};

  // Calcular Early Start/Early Finish (forward pass)
  for (const at of atividades) {
    earliestStart[at.id] = 0;
    earliestFinish[at.id] = 0;
  }

  // Encontrar atividades iniciais (sem predecessoras)
  const atividadesIniciais = atividades.filter(at => {
    const temPredecessora = dependenciasConfirmadas.some(dep =>
      dep.atividade_destino_id === at.id && dep.confirmada_usuario === 1
    );
    return !temPredecessora;
  });

  // Forward pass: calcular ES e EF
  function calcularES_EF(atividadeId, visitados = new Set()) {
    if (visitados.has(atividadeId)) return;
    visitados.add(atividadeId);

    const atividade = atividadesMap[atividadeId];
    if (!atividade) return;

    // Encontrar todas as predecessoras
    const predecessoras = dependenciasConfirmadas.filter(dep =>
      dep.atividade_destino_id === atividadeId && dep.confirmada_usuario === 1
    );

    if (predecessoras.length === 0) {
      // Atividade inicial
      earliestStart[atividadeId] = 0;
    } else {
      // ES = max(EF de predecessoras)
      let maxEF = 0;
      for (const pred of predecessoras) {
        calcularES_EF(pred.atividade_origem_id, visitados);
        maxEF = Math.max(maxEF, earliestFinish[pred.atividade_origem_id] || 0);
      }
      earliestStart[atividadeId] = maxEF;
    }

    // EF = ES + duração
    const duracao = calcularDuracao(atividade.data_inicio_planejada, atividade.data_fim_planejada);
    earliestFinish[atividadeId] = earliestStart[atividadeId] + duracao;
  }

  // Calcular para todas as atividades
  for (const at of atividades) {
    calcularES_EF(at.id);
  }

  // Encontrar data de conclusão (máximo EF)
  const dataConclusao = Math.max(...Object.values(earliestFinish));

  // Backward pass: calcular LS e LF
  for (const at of atividades) {
    latestFinish[at.id] = dataConclusao;
    latestStart[at.id] = dataConclusao;
  }

  function calcularLS_LF(atividadeId, visitados = new Set()) {
    if (visitados.has(atividadeId)) return;
    visitados.add(atividadeId);

    const atividade = atividadesMap[atividadeId];
    if (!atividade) return;

    // Encontrar todas as sucessoras
    const sucessoras = dependenciasConfirmadas.filter(dep =>
      dep.atividade_origem_id === atividadeId && dep.confirmada_usuario === 1
    );

    if (sucessoras.length === 0) {
      // Atividade final: LF = conclusão do projeto (não EF da própria atividade)
      latestFinish[atividadeId] = dataConclusao;
    } else {
      // LF = min(LS de sucessoras)
      let minLS = Infinity;
      for (const suc of sucessoras) {
        calcularLS_LF(suc.atividade_destino_id, visitados);
        minLS = Math.min(minLS, latestStart[suc.atividade_destino_id] || Infinity);
      }
      latestFinish[atividadeId] = minLS;
    }

    // LS = LF - duração
    const duracao = calcularDuracao(atividade.data_inicio_planejada, atividade.data_fim_planejada);
    latestStart[atividadeId] = latestFinish[atividadeId] - duracao;
  }

  for (const at of atividades) {
    calcularLS_LF(at.id);
  }

  // Calcular folgas (Slack)
  const folgas = {};
  const caminhoCritico = [];

  for (const at of atividades) {
    const slack = Math.max(0, (latestStart[at.id] || 0) - (earliestStart[at.id] || 0));
    folgas[at.id] = slack;

    if (slack === 0) {
      caminhoCritico.push(at.id);
    }
  }

  return {
    caminhoCritico,
    dataConclusao: dataConclusao > 0 ? dataConclusao : 0,
    folgas,
    earliestStart,
    earliestFinish,
    latestStart,
    latestFinish
  };
}

/**
 * Sugere dependências em lote para um projeto inteiro
 * @param {Array} atividades - Lista de todas as atividades
 * @param {Array} dependenciasExistentes - Dependências já salvass no BD
 * @param {boolean} modoParalelizacao - Se deve considerar paralelização
 * @returns {Object} { sugestoes: [...], totalSugestoes, caminoCritico }
 */
function sugerirDependenciasLote(atividades, dependenciasExistentes = [], modoParalelizacao = true) {
  if (!atividades || atividades.length < 2) {
    return {
      sugestoes: [],
      totalSugestoes: 0,
      caminoCritico: {}
    };
  }

  const sugestoes = [];
  const paresAnalisados = new Set();

  // Gerar todas as combinações possíveis (A → B)
  for (let i = 0; i < atividades.length; i++) {
    for (let j = 0; j < atividades.length; j++) {
      if (i === j) continue;

      const idPar = `${atividades[i].id}_${atividades[j].id}`;
      if (paresAnalisados.has(idPar)) continue;
      paresAnalisados.add(idPar);

      const atividadeA = atividades[i];
      const atividadeB = atividades[j];

      // Verificar se já existe dependência (confirmada ou sugerida)
      const jaExiste = dependenciasExistentes.some(dep =>
        dep.atividade_origem_id === atividadeA.id && dep.atividade_destino_id === atividadeB.id
      );

      if (jaExiste) continue;

      // Calcular score
      const { score, motivos, tipo_vinculo_recomendado, recomendada } = 
        calcularScoreDependencia(atividadeA, atividadeB, modoParalelizacao);

      // Só incluir se score >= limiar
      if (recomendada && score >= PESOS_HEURISTICAS.limiarRecomendacao) {
        // Validar se não criaria ciclo
        const { temCiclo } = detectarCiclos(atividadeA.id, atividadeB.id, dependenciasExistentes);

        if (!temCiclo) {
          sugestoes.push({
            id_origem: atividadeA.id,
            nome_origem: atividadeA.nome || atividadeA.codigo_eap,
            id_destino: atividadeB.id,
            nome_destino: atividadeB.nome || atividadeB.codigo_eap,
            score,
            motivos: motivos.join(', '),
            tipo_vinculo_recomendado,
            temCiclo: false,
            duracao_origem: calcularDuracao(atividadeA.data_inicio_planejada, atividadeA.data_fim_planejada),
            duracao_destino: calcularDuracao(atividadeB.data_inicio_planejada, atividadeB.data_fim_planejada)
          });
        }
      }
    }
  }

  // Ordenar por score decrescente
  sugestoes.sort((a, b) => b.score - a.score);

  // Calcular caminho crítico
  const caminoCritico = calcularCaminoCritico(atividades, dependenciasExistentes);

  return {
    sugestoes,
    totalSugestoes: sugestoes.length,
    caminoCritico
  };
}

/**
 * Recalcula o cronograma baseado em dependências confirmadas
 * Não salva no banco, apenas calcula novas datas e retorna para preview
 * @param {Array} atividades - Lista de atividades com datas originais
 * @param {Array} dependenciasConfirmadas - Dependências confirmadas a aplicar
 * @returns {Object} { novasAtividades, alteracoes }
 */
function recalcularCronograma(atividades, dependenciasConfirmadas = []) {
  if (!atividades || atividades.length === 0) {
    return {
      novasAtividades: [],
      alteracoes: []
    };
  }

  // Copiar atividades para não modificar as originais
  const novasAtividades = JSON.parse(JSON.stringify(atividades));
  const atividadesMap = {};

  novasAtividades.forEach(at => {
    atividadesMap[at.id] = at;
  });

  const alteracoes = [];
  const isDataValida = (valor) => {
    return !!parseDataSemTimezone(valor);
  };

  const adicionarDias = (data, dias) => {
    return adicionarDiasUteis(data, dias);
  };

  const duracaoPorAtividade = new Map();
  for (const at of novasAtividades) {
    if (!isDataValida(at.data_inicio_planejada) || !isDataValida(at.data_fim_planejada)) continue;
    const duracao = calcularDuracao(at.data_inicio_planejada, at.data_fim_planejada);
    if (duracao > 0) duracaoPorAtividade.set(at.id, duracao);
  }

  const dependenciasPorDestino = new Map();
  for (const dep of dependenciasConfirmadas) {
    if (dep.confirmada_usuario !== 1) continue;
    if (!dependenciasPorDestino.has(dep.atividade_destino_id)) {
      dependenciasPorDestino.set(dep.atividade_destino_id, []);
    }
    dependenciasPorDestino.get(dep.atividade_destino_id).push(dep);
  }

  const cacheDatas = new Map();
  const emResolucao = new Set();

  const obterDatasOriginais = (atividade) => {
    if (!atividade) return null;
    if (!isDataValida(atividade.data_inicio_planejada) || !isDataValida(atividade.data_fim_planejada)) return null;
    const duracao = duracaoPorAtividade.get(atividade.id);
    if (!duracao || duracao < 1) return null;
    const inicio = parseDataSemTimezone(atividade.data_inicio_planejada);
    if (!inicio) return null;
    const fim = parseDataSemTimezone(atividade.data_fim_planejada);
    if (!fim) return null;
    return { inicio, fim, duracao };
  };

  function resolverDatasAtividade(atividadeId) {
    if (cacheDatas.has(atividadeId)) {
      return cacheDatas.get(atividadeId);
    }

    const atividade = atividadesMap[atividadeId];
    const datasOriginais = obterDatasOriginais(atividade);
    if (!atividade || !datasOriginais) {
      cacheDatas.set(atividadeId, null);
      return null;
    }

    if (emResolucao.has(atividadeId)) {
      // Evita loop infinito em caso de ciclo: mantém datas originais.
      return datasOriginais;
    }

    emResolucao.add(atividadeId);

    const predecessoras = dependenciasPorDestino.get(atividadeId) || [];
    let inicioCalculado = new Date(datasOriginais.inicio.getTime());

    if (predecessoras.length > 0) {
      let maiorInicioRestricao = null;

      for (const pred of predecessoras) {
        const datasPred = resolverDatasAtividade(pred.atividade_origem_id);
        if (!datasPred) continue;

        const tipo = String(pred.tipo_vinculo || 'FS').toUpperCase();
        let inicioMinimo;

        if (tipo === 'SS') {
          // Start-to-Start: sucessora pode iniciar quando predecessora inicia.
          inicioMinimo = new Date(datasPred.inicio.getTime());
        } else if (tipo === 'FF') {
          // Finish-to-Finish: fim da sucessora >= fim da predecessora.
          inicioMinimo = adicionarDias(datasPred.fim, -(datasOriginais.duracao - 1));
        } else {
          // FS (padrão): sucessora inicia no dia seguinte ao fim da predecessora.
          inicioMinimo = adicionarDias(datasPred.fim, 1);
        }

        if (!inicioMinimo) continue;

        if (!maiorInicioRestricao || inicioMinimo > maiorInicioRestricao) {
          maiorInicioRestricao = inicioMinimo;
        }
      }

      // Respeita data manual original: só empurra para frente se houver restrição maior.
      if (maiorInicioRestricao && maiorInicioRestricao > inicioCalculado) {
        inicioCalculado = maiorInicioRestricao;
      }
    }

    const inicioAlterado = inicioCalculado.getTime() !== datasOriginais.inicio.getTime();
    const fimCalculado = inicioAlterado
      ? adicionarDias(inicioCalculado, datasOriginais.duracao - 1)
      : new Date(datasOriginais.fim.getTime());
    if (!fimCalculado) {
      emResolucao.delete(atividadeId);
      cacheDatas.set(atividadeId, datasOriginais);
      return datasOriginais;
    }
    const resolvido = { inicio: inicioCalculado, fim: fimCalculado, duracao: datasOriginais.duracao };

    cacheDatas.set(atividadeId, resolvido);
    emResolucao.delete(atividadeId);
    return resolvido;
  }

  // Aplicar recalcular para cada atividade
  for (const at of novasAtividades) {
    const dataInicioOriginal = at.data_inicio_planejada;
    const dataFimOriginal = at.data_fim_planejada;

    if (!isDataValida(dataInicioOriginal) || !isDataValida(dataFimOriginal)) {
      continue;
    }

    const datasResolvidas = resolverDatasAtividade(at.id);
    if (!datasResolvidas || !datasResolvidas.inicio || !datasResolvidas.fim) {
      continue;
    }

    // Atualizar datas
    at.data_inicio_planejada = formatarData(datasResolvidas.inicio);
    at.data_fim_planejada = formatarData(datasResolvidas.fim);

    // Registrar alteração se houve mudança
    if (dataInicioOriginal !== at.data_inicio_planejada || dataFimOriginal !== at.data_fim_planejada) {
      alteracoes.push({
        atividade_id: at.id,
        nome: at.nome,
        data_inicio_original: dataInicioOriginal,
        data_inicio_nova: at.data_inicio_planejada,
        data_fim_original: dataFimOriginal,
        data_fim_nova: at.data_fim_planejada,
        dias_deslocamento: calcularDuracao(dataInicioOriginal, at.data_inicio_planejada)
      });
    }
  }

  return {
    novasAtividades,
    alteracoes
  };
}

/**
 * Formata uma data para YYYY-MM-DD
 * @param {Date|string} data - Data em objeto Date ou string
 * @returns {string} Data no formato YYYY-MM-DD
 */
function formatarData(data) {
  if (typeof data === 'string') {
    return data;
  }

  const d = new Date(data);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();

  return `${year}-${month}-${day}`;
}

/**
 * Detecta atividades atrasadas com base na data de hoje e status
 * @param {Array} atividades - Lista de atividades
 * @returns {Array} IDs das atividades atrasadas
 */
function detectarAtividadesAtrasadas(atividades, opcoes = {}) {
  const {
    folgas = {},
    caminhoCritico = [],
    dependencias = [],
    exigirImpactoNoPrazo = false,
    apenasCaminhoCritico = false
  } = opcoes;

  const caminhoCriticoSet = new Set(caminhoCritico || []);
  const atividadesPorId = new Map((atividades || []).map((at) => [at.id, at]));
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const atrasadas = [];

  atividades.forEach(at => {
    if (at.data_fim_planejada && at.percentual_executado < 100) {
      const dataFim = parseDataSemTimezone(at.data_fim_planejada);
      if (!dataFim) return;

      if (dataFim < hoje) {
        if (apenasCaminhoCritico && !caminhoCriticoSet.has(at.id)) {
          return;
        }

        if (exigirImpactoNoPrazo) {
          const folga = Number(folgas[at.id] || 0);
          if (folga > 0) {
            return;
          }

          // Sem pressão de sucessoras no curto prazo, não marcar como atraso crítico.
          const sucessoras = (dependencias || []).filter((dep) => {
            return dep.confirmada_usuario === 1 && dep.atividade_origem_id === at.id;
          });

          if (sucessoras.length > 0) {
            let existePressaoAgora = false;

            for (const dep of sucessoras) {
              const sucessora = atividadesPorId.get(dep.atividade_destino_id);
              if (!sucessora) continue;

              const tipo = String(dep.tipo_vinculo || 'FS').toUpperCase();
              const inicioSucessora = parseDataSemTimezone(sucessora.data_inicio_planejada);
              const fimSucessora = parseDataSemTimezone(sucessora.data_fim_planejada);

              if ((tipo === 'FS' || tipo === 'SS') && inicioSucessora && inicioSucessora <= hoje) {
                existePressaoAgora = true;
                break;
              }

              if (tipo === 'FF' && fimSucessora && fimSucessora <= hoje) {
                existePressaoAgora = true;
                break;
              }
            }

            if (!existePressaoAgora) {
              return;
            }
          }
        }

        atrasadas.push(at.id);
      }
    }
  });

  return atrasadas;
}

module.exports = {
  calcularScoreDependencia,
  detectarCiclos,
  calcularCaminoCritico,
  sugerirDependenciasLote,
  recalcularCronograma,
  calcularDuracao,
  formatarData,
  detectarAtividadesAtrasadas,
  extrairEtapa,
  PESOS_HEURISTICAS,
  MAPA_ETAPAS
};
