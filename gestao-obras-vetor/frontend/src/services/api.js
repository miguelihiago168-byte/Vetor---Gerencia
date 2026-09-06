import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

export const getStoredToken = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';

export const getUploadUrl = (storedPath) => {
  let cleanPath = String(storedPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  const uploadsIndex = cleanPath.toLowerCase().lastIndexOf('/uploads/');
  if (uploadsIndex >= 0) cleanPath = cleanPath.slice(uploadsIndex + '/uploads/'.length);

  cleanPath = cleanPath
    .replace(/^api\/uploads\//i, '')
    .replace(/^uploads\//i, '')
    .split('?')[0];

  if (!cleanPath) return '#';

  const encodedPath = cleanPath
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  const token = getStoredToken();
  return `/api/uploads/${encodedPath}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};

const shouldForceLogout = (error) => {
  if (error.response?.status !== 401) return false;

  const url = String(error.config?.url || '');
  // Rotas públicas de autenticação podem retornar 401 sem invalidar sessão já salva.
  if (
    url.includes('/auth/login')
    || url.includes('/auth/register')
    || url.includes('/auth/esqueci-senha')
    || url.includes('/auth/redefinir-senha')
    || url.includes('/auth/cancelar-conta')
  ) {
    return false;
  }

  const msg = String(error.response?.data?.erro || error.response?.data?.error || '').toLowerCase();
  const authErrors = [
    'token inválido',
    'token invalido',
    'token não fornecido',
    'token nao fornecido',
    'usuário inválido ou inativo',
    'usuario invalido ou inativo',
    'jwt expired',
    'jwt malformed',
    'invalid token',
    'invalid signature'
  ];

  return authErrors.some((item) => msg.includes(item));
};

// Interceptor para adicionar token
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    try {
      const storedUser = localStorage.getItem('usuario') || sessionStorage.getItem('usuario');
      const tenantId = storedUser ? Number(JSON.parse(storedUser)?.tenant_id) : null;
      if (tenantId) config.headers['x-tenant-id'] = String(tenantId);
    } catch (_) {
      // A malformed local cache is handled by AuthContext during bootstrap.
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar erros
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (shouldForceLogout(error)) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (credentials) => api.post('/auth/login', credentials);
export const registerTrialAccount = (data) => api.post('/auth/register', data);
export const validateInviteToken = (token) => api.get(`/auth/register/${token}`);
export const registerWithInviteToken = (token, data) => api.post(`/auth/register/${token}`, data);
export const esqueciSenha = (login) => api.post('/auth/esqueci-senha', { login });
export const redefinirSenha = (token, senha) => api.post('/auth/redefinir-senha', { token, senha });
export const cancelarConta = (data) => api.post('/auth/cancelar-conta', data);
export const renovarTrial = (data) => api.post('/auth/renovar-trial', data);

// Contato público
export const enviarContato = (data) => api.post('/contato', data);

// Usuários
export const getUsuarios = (params) => api.get('/usuarios', { params });
export const getUsuario = (id) => api.get(`/usuarios/${id}`);
export const getNovoLogin = () => api.get('/usuarios/novo-login');
export const getUsuariosDeletados = () => api.get('/usuarios/deletados/lista');
export const createUsuario = (data) => api.post('/usuarios', data);
export const updateUsuario = (id, data) => api.put(`/usuarios/${id}`, data);
export const concluirPrimeiroAcesso = (data) => api.patch('/usuarios/me/primeiro-acesso', data);
export const updateUsuarioGestor = (id, isGestor) => api.patch(`/usuarios/${id}/gestor`, { is_gestor: isGestor });
export const updateUsuarioAdm = (id, isAdm) => api.patch(`/usuarios/${id}/adm`, { is_adm: isAdm });
export const patchUsuarioInfo = (id, data) => api.patch(`/usuarios/${id}/info`, data);
export const patchUsuarioAvatar = (id, formData) => api.patch(`/usuarios/${id}/avatar`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const patchUsuarioAssinatura = (id, formData) => api.patch(`/usuarios/${id}/assinatura`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteUsuarioAssinatura = (id) => api.delete(`/usuarios/${id}/assinatura`);
export const patchUsuarioPresenca = (id, presenca_status) => api.patch(`/usuarios/${id}/presenca`, { presenca_status });
export const deleteUsuario = (id) => api.delete(`/usuarios/${id}`);
export const deleteUsuarioPermanente = (id) => api.delete(`/usuarios/${id}/permanente`);
export const bulkUpdateUsuarios = (ids, campo, valor, projeto_id) =>
  api.patch('/usuarios/bulk-update', { ids, campo, valor, projeto_id });
export const getMaoObraDireta = (params) => api.get('/usuarios/mao-obra-direta', { params });
export const createMaoObraDireta = (data) => api.post('/usuarios/mao-obra-direta', data);
export const updateMaoObraDireta = (id, data) => api.put(`/usuarios/mao-obra-direta/${id}`, data);
export const baixaMaoObraDireta = (id) => api.patch(`/usuarios/mao-obra-direta/${id}/baixa`);

// Projetos
export const getProjetos = () => api.get('/projetos');
export const getProjeto = (id) => api.get(`/projetos/${id}`);
export const createProjeto = (data) => api.post('/projetos', data);
export const updateProjeto = (id, data) => api.put(`/projetos/${id}`, data);
export const deleteProjeto = (id) => api.delete(`/projetos/${id}`);
export const uploadProjetoLogos = (id, formData) => api.post(`/projetos/${id}/logos`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const arquivarProjeto = (id) => api.patch(`/projetos/${id}/arquivar`);
export const desarquivarProjeto = (id) => api.patch(`/projetos/${id}/desarquivar`);
export const copiarEapProjeto = (destinoId, origemProjetoId) => api.post(`/projetos/${destinoId}/copiar-eap`, { origem_projeto_id: origemProjetoId });

// EAP
export const getAtividadesEAP = (projetoId) => api.get(`/eap/projeto/${projetoId}`);
export const createAtividade = (data) => api.post('/eap', data);
export const updateAtividade = (id, data) => api.put(`/eap/${id}`, data);
export const deleteAtividade = (id) => api.delete(`/eap/${id}`);
export const recalcularAvanco = (id) => api.post(`/eap/${id}/recalcular`);
export const getHistoricoAtividade = (id) => api.get(`/eap/${id}/historico`);
export const previewRecalculoEapProjeto = (projetoId) => api.get(`/eap/projeto/${projetoId}/recalcular-preview`);
export const recalcularEapProjeto = (projetoId) => api.post(`/eap/projeto/${projetoId}/recalcular-tudo`);
export const getUnidadesEAP = () => api.get('/eap/unidades');
export const baixarModeloEAP = () => api.get('/eap/modelo-excel', { responseType: 'blob' });
export const previewImportacaoEAP = (projetoId, formData) =>
  api.post(`/eap/projeto/${projetoId}/importar/preview`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const confirmarImportacaoEAP = (projetoId, linhas) =>
  api.post(`/eap/projeto/${projetoId}/importar/confirmar`, { linhas });

// RDOs
export const getRDOs = (projetoId) => api.get(`/rdos/projeto/${projetoId}`);
export const getRdoConfiguracao = (projetoId) => api.get(`/rdos/projeto/${projetoId}/configuracao`);
export const updateRdoConfiguracao = (projetoId, data) => api.put(`/rdos/projeto/${projetoId}/configuracao`, data);
export const getRDO = (id) => api.get(`/rdos/${id}`);
export const createRDO = (data) => api.post('/rdos', data);
export const updateRDO = (id, data) => api.put(`/rdos/${id}`, data);
export const executeRdoWorkflow = (id, acao, motivo) => api.patch(`/rdos/${id}/fluxo`, {
  acao,
  ...(motivo ? { motivo } : {})
});
export const deleteRDO = (id) => api.delete(`/rdos/${id}`);
export const deleteRDOsProjetoTodos = (projetoId) => api.delete(`/rdos/projeto/${projetoId}/todos`);
// PDF
export const getRdoPDF = (id) => api.get(`/rdos/${id}/pdf`, { responseType: 'blob' });

// Mão de obra (catálogo)
export const getMaoObra = () => api.get('/mao_obra');
export const createMaoObra = (data) => api.post('/mao_obra', data);

// RDO related actions (mao_obra vinculada, clima, comentarios, materiais, ocorrencias, assinaturas, fotos)
export const addRdoMaoObra = (rdoId, data) => api.post(`/rdo/${rdoId}/mao_obra`, data);
export const listRdoMaoObra = (rdoId) => api.get(`/rdo/${rdoId}/mao_obra`);
export const addRdoClima = (rdoId, data) => api.post(`/rdo/${rdoId}/clima`, data);
export const addRdoComentario = (rdoId, data) => api.post(`/rdo/${rdoId}/comentario`, data);
export const addRdoMaterial = (rdoId, data) => api.post(`/rdo/${rdoId}/material`, data);
export const addRdoOcorrencia = (rdoId, data) => api.post(`/rdo/${rdoId}/ocorrencia`, data);
export const getRdoOcorrenciasConfiguracao = () => api.get('/rdos/ocorrencias/configuracao');
export const getRdoOcorrencias = (rdoId) => api.get(`/rdos/${rdoId}/ocorrencias`);
export const syncRdoOcorrencias = (rdoId, data) => api.put(`/rdos/${rdoId}/ocorrencias`, data);
export const duplicarRdoOcorrencia = (rdoId, ocorrenciaId) => api.post(`/rdos/${rdoId}/ocorrencias/${ocorrenciaId}/duplicar`);
export const getRdoOcorrenciaHistorico = (rdoId, ocorrenciaId) => api.get(`/rdos/${rdoId}/ocorrencias/${ocorrenciaId}/historico`);
export const vincularEvidenciaOcorrencia = (rdoId, ocorrenciaId, data) => api.post(`/rdos/${rdoId}/ocorrencias/${ocorrenciaId}/evidencias`, data);
export const desvincularEvidenciaOcorrencia = (rdoId, ocorrenciaId, evidenciaId) => api.delete(`/rdos/${rdoId}/ocorrencias/${ocorrenciaId}/evidencias/${evidenciaId}`);
export const addRdoAssinatura = (rdoId, data) => api.post(`/rdo/${rdoId}/assinatura`, data);
// Backend espera o campo 'arquivo' no upload
export const uploadRdoFoto = (rdoId, formData, config = {}) => api.post(`/rdo/${rdoId}/foto`, formData, {
  ...config,
  headers: { 'Content-Type': 'multipart/form-data', ...(config.headers || {}) }
});
export const updateRdoFoto = (rdoId, fotoId, data) => api.patch(`/rdo/${rdoId}/foto/${fotoId}`, data);
export const deleteRdoFoto = (rdoId, fotoId) => api.delete(`/rdo/${rdoId}/foto/${fotoId}`);
export const reorderRdoFotos = (rdoId, fotoIds) => api.patch(`/rdo/${rdoId}/fotos/ordem`, { foto_ids: fotoIds });
// Equipamentos
export const getRdoEquipamentosCatalogo = (projetoId) => api.get(`/rdo/projeto/${projetoId}/equipamentos-catalogo`);
export const updateRdoEquipamentoCatalogo = (projetoId, nomeOriginal, nome) => api.patch(`/rdo/projeto/${projetoId}/equipamentos-catalogo`, { nome_original: nomeOriginal, nome });
export const deleteRdoEquipamentoCatalogo = (projetoId, nome) => api.delete(`/rdo/projeto/${projetoId}/equipamentos-catalogo`, { data: { nome } });
export const getRdoEquipamentos = (rdoId) => api.get(`/rdo/${rdoId}/equipamentos`);
export const addRdoEquipamento = (rdoId, data) => api.post(`/rdo/${rdoId}/equipamentos`, data);
export const deleteRdoEquipamento = (rdoId, equipId) => api.delete(`/rdo/${rdoId}/equipamentos/${equipId}`);
// Execução acumulada de atividades (somatório de quantidade_executada em RDOs aprovados)
export const getExecucaoAcumulada = (projetoId) => api.get(`/rdo/projeto/${projetoId}/execucao-atividades`);
// Colaboradores disponíveis para preenchimento de mão de obra (usuários + mão de obra direta)
export const getRdoColaboradores = (projetoId) => api.get(`/rdo/projeto/${projetoId}/colaboradores`);
export const createRdoColaborador = (projetoId, data) => api.post(`/rdo/projeto/${projetoId}/colaboradores`, data);

// Anexos
export const uploadAnexo = (rdoId, formData, config = {}) => api.post(`/anexos/upload/${rdoId}`, formData, {
  ...config,
  headers: { 'Content-Type': 'multipart/form-data', ...(config.headers || {}) }
});
export const getAnexos = (rdoId) => api.get(`/anexos/rdo/${rdoId}`);
export const deleteAnexo = (id) => api.delete(`/anexos/${id}`);
export const downloadAnexo = (id) => api.get(`/anexos/download/${id}`, { responseType: 'blob' });
// Anexos da RNC
export const uploadAnexoRNC = (rncId, formData) => api.post(`/anexos/upload-rnc/${rncId}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const getAnexosRNC = (rncId, categoria) => api.get(`/anexos/rnc/${rncId}`, { params: categoria ? { categoria } : undefined });

// Dashboard
export const getDashboardAvanco = (projetoId) => api.get(`/dashboard/projeto/${projetoId}/avanco`);
export const getProjectCockpit = (projetoId) => api.get(`/dashboard/projeto/${projetoId}/cockpit`);
export const getRDOStats = (projetoId) => api.get(`/dashboard/projeto/${projetoId}/rdos-stats`);
export const getDashboardGaleriaRdos = (projetoId) => api.get(`/dashboard/projeto/${projetoId}/galeria-rdos`);
export const getCurvaS = (projetoId) => api.get(`/dashboard/projeto/${projetoId}/curva-s`);

// RNC
export const getRNCs = (projetoId) => api.get(`/rnc/projeto/${projetoId}`);
export const createRNC = (data) => api.post('/rnc', data);
export const updateRNC = (id, data) => api.put(`/rnc/${id}`, data);
export const updateStatusRNC = (id, status) => api.patch(`/rnc/${id}/status`, { status });
// Submeter correção de RNC (responsável/criador)
export const submitCorrecaoRNC = (id, data) => api.post(`/rnc/${id}/corrigir`, data);
export const deleteRNC = (id) => api.delete(`/rnc/${id}`);
export const enviarRncParaAprovacao = (id) => api.post(`/rnc/${id}/enviar-aprovacao`);
export const getRNCPDF = (id) => api.get(`/rnc/${id}/pdf`, { responseType: 'blob' });

// Notificações
export const getNotificacoes = () => api.get('/notificacoes');
export const marcarNotificacaoLida = (id) => api.patch(`/notificacoes/${id}/read`);
export const marcarTodasNotificacoesLidas = () => api.patch('/notificacoes/marcar-todas-lidas');

// Mensageria
export const getMensagensNaoLidasCount = () => api.get('/mensagens/nao-lidas/count');
export const criarConversaDireta = (data) => api.post('/mensagens/conversas/direta', data);
export const listarConversas = (params) => api.get('/mensagens/conversas', { params });
export const listarMensagensConversa = (conversaId, params) =>
  api.get(`/mensagens/conversas/${conversaId}/mensagens`, { params });
export const enviarMensagemConversa = (conversaId, data) =>
  api.post(`/mensagens/conversas/${conversaId}/mensagens`, data);
export const marcarConversaComoLida = (conversaId) =>
  api.patch(`/mensagens/conversas/${conversaId}/marcar-lidas`);
export const editarMensagem = (mensagemId, data) =>
  api.patch(`/mensagens/mensagens/${mensagemId}`, data);
export const removerMensagem = (mensagemId) =>
  api.delete(`/mensagens/mensagens/${mensagemId}`);
export const limparMensagensApagadasConversa = (conversaId) =>
  api.delete(`/mensagens/conversas/${conversaId}/mensagens-apagadas`);
export const anexarArquivoMensagem = (mensagemId, formData) =>
  api.post(`/mensagens/mensagens/${mensagemId}/anexos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
export const listarReunioesMensagens = (params) => api.get('/mensagens/reunioes', { params });
export const listarReunioesHoje = (params) => api.get('/mensagens/reunioes/hoje', { params });
export const criarReuniaoMensagem = (data) => api.post('/mensagens/reunioes', data);
export const editarReuniaoMensagem = (id, data) => api.patch(`/mensagens/reunioes/${id}`, data);
export const cancelarReuniaoMensagem = (id) => api.patch(`/mensagens/reunioes/${id}/cancelar`);

// ─── Fornecedores ─────────────────────────────────────────────────────────
export const listarFornecedores = (params) => api.get('/fornecedores', { params });
export const detalharFornecedor = (id) => api.get(`/fornecedores/${id}`);
export const criarFornecedor = (data) => api.post('/fornecedores', data);
export const editarFornecedor = (id, data) => api.patch(`/fornecedores/${id}`, data);
export const toggleFornecedor = (id) => api.delete(`/fornecedores/${id}`);

// ─── Requisições (módulo compras multi-itens) ─────────────────────────────
export const listarRequisicoes = (params) => api.get('/requisicoes', { params });
export const criarRequisicao = (data) => api.post('/requisicoes', data);
export const listarRequisicoesProjeto = (projetoId, params) =>
  api.get(`/requisicoes/projeto/${projetoId}`, { params });
export const detalharRequisicao = (id) => api.get(`/requisicoes/${id}`);
export const analisarItemRequisicao = (reqId, itemId, data) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/analisar`, data);
export const solicitarCorrecaoItem = (reqId, itemId, data) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/solicitar-correcao`, data);
export const inserirCotacaoItem = (reqId, itemId, data) =>
  api.post(`/requisicoes/${reqId}/itens/${itemId}/cotacoes`, data);
export const selecionarCotacaoItem = (reqId, itemId, cotacaoId) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/cotacoes/${cotacaoId}/selecionar`);
export const marcarItemComprado = (reqId, itemId) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/comprado`);
export const concluirRequisicao = (reqId) =>
  api.patch(`/requisicoes/${reqId}/concluir`);
export const cancelarItemRequisicao = (reqId, itemId, data) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/cancelar`, data);
export const devolverCotacaoItem = (reqId, itemId, data) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/devolver-cotacao`, data);
export const finalizarCotacaoItem = (reqId, itemId) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/finalizar-cotacao`);
export const alterarQuantidadeItem = (reqId, itemId, quantidade) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/alterar-quantidade`, { quantidade });
export const editarRequisicaoHeader = (reqId, data) =>
  api.patch(`/requisicoes/${reqId}/editar`, data);
export const editarItemRequisicao = (reqId, itemId, data) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/editar`, data);
export const listarCotacoesFinalizadas = (params) => api.get('/requisicoes/finalizadas', { params });
export const listarCotacoesNegadas = (params) => api.get('/requisicoes/negadas', { params });
export const listarRequisicoesEncerradas = (params) => api.get('/requisicoes/encerradas', { params });
export const kanbanRequisicoes = (projetoId, params) =>
  api.get(`/requisicoes/kanban/projeto/${projetoId}`, { params });
export const kanbanRequisicoesV2 = (projetoId, params) =>
  api.get(`/requisicoes/kanban/projeto/${projetoId}`, { params });
export const kanbanGlobal = (params) =>
  api.get('/requisicoes/kanban', { params });
export const aprovarTodosItens = (reqId) =>
  api.patch(`/requisicoes/${reqId}/aprovar-todos`);
export const analisarTodosItens = (reqId) =>
  api.patch(`/requisicoes/${reqId}/analisar-todos`);
export const comprarTodosItens = (reqId) =>
  api.patch(`/requisicoes/${reqId}/comprar-todos`);
export const getRequisicoesBadges = (projetoId) =>
  api.get('/requisicoes/badges', { params: projetoId ? { projeto_id: projetoId } : {} });
export const editarCotacaoItem = (reqId, itemId, cotacaoId, data) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/cotacoes/${cotacaoId}`, data);

// Compras (Pedidos e Cotações) — legado
export const criarPedidoCompra = (data) => api.post('/pedidos-compra', data);
export const aprovarInicialPedido = (id) => api.patch(`/pedidos-compra/${id}/aprovar-inicial`);
export const inserirCotacao = (id, dataOrForm) => {
  // aceita JSON ou FormData com 'pdf'
  const headers = (dataOrForm instanceof FormData) ? { 'Content-Type': 'multipart/form-data' } : undefined;
  return api.post(`/pedidos-compra/${id}/cotacoes`, dataOrForm, { headers });
};
export const selecionarCotacao = (id, cotacaoId) => api.patch(`/pedidos-compra/${id}/selecionar/${cotacaoId}`);
export const marcarComprado = (id) => api.patch(`/pedidos-compra/${id}/comprado`);
export const reprovarPedido = (id, motivo) => api.patch(`/pedidos-compra/${id}/reprovar`, { motivo });
export const listarPedidosPorProjeto = (projetoId) => api.get(`/pedidos-compra/projeto/${projetoId}`);
export const detalharPedido = (id) => api.get(`/pedidos-compra/${id}`);

// Estoque de insumos
export const getEstoqueSaldos = (params) => api.get('/estoque/saldos', { params });
export const getEstoqueLotes = (insumoId, params) => api.get(`/estoque/insumos/${insumoId}/lotes`, { params });
export const getEstoquePendencias = () => api.get('/estoque/pendencias');
export const receberEstoquePendencia = (id, data) => api.post(`/estoque/pendencias/${id}/receber`, data);
export const anexarDocumentoEstoque = (loteId, data) => api.post(`/estoque/lotes/${loteId}/anexos`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getEstoqueTransferencias = () => api.get('/estoque/transferencias');
export const criarEstoqueTransferencia = (data) => api.post('/estoque/transferencias', data);
export const aprovarEstoqueTransferencia = (id) => api.post(`/estoque/transferencias/${id}/aprovar`);
export const separarEstoqueTransferencia = (id) => api.post(`/estoque/transferencias/${id}/separar`);
export const despacharEstoqueTransferencia = (id) => api.post(`/estoque/transferencias/${id}/despachar`);
export const confirmarEstoqueTransferencia = (id) => api.post(`/estoque/transferencias/${id}/confirmar-recebimento`);
export const rejeitarEstoqueTransferencia = (id, justificativa) => api.post(`/estoque/transferencias/${id}/rejeitar`, { justificativa });
export const cancelarEstoqueTransferencia = (id, justificativa) => api.post(`/estoque/transferencias/${id}/cancelar`, { justificativa });
export const getEstoqueMovimentacoes = (params) => api.get('/estoque/movimentacoes', { params });
export const registrarSaidaEstoque = (data) => api.post('/estoque/saidas', data);
export const getEstoqueRastreabilidade = (params) => api.get('/estoque/rastreabilidade', { params });
export const getEstoqueRastreabilidadeDetalhe = (loteId) => api.get(`/estoque/rastreabilidade/${loteId}`);
export const inspecionarEntradaEstoque = (loteId, data) => api.post(`/estoque/rastreabilidade/${loteId}/inspecoes`, data);
export const gerarRncEntradaEstoque = (loteId, data) => api.post(`/estoque/rastreabilidade/${loteId}/rnc`, data);

// Financeiro (Fluxo de Caixa)
export const getFinanceiroDashboard = (projetoId, params) => api.get(`/financeiro/projeto/${projetoId}/dashboard`, { params });
export const updateFinanceiroSaldoInicial = (projetoId, saldoInicial) => api.patch(`/financeiro/projeto/${projetoId}/saldo-inicial`, { saldo_inicial: saldoInicial });
export const listarReceitasFinanceiro = (projetoId, params) => api.get(`/financeiro/projeto/${projetoId}/receitas`, { params });
export const criarReceitaFinanceiro = (projetoId, data) => api.post(`/financeiro/projeto/${projetoId}/receitas`, data);
export const receberReceitaFinanceiro = (id, data) => api.patch(`/financeiro/receitas/${id}/receber`, data);
export const estornarReceitaFinanceiro = (id, data) => api.post(`/financeiro/receitas/${id}/estornar`, data);
export const listarDespesasFinanceiro = (projetoId, params) => api.get(`/financeiro/projeto/${projetoId}/despesas`, { params });
export const criarDespesaFinanceiro = (projetoId, data) => api.post(`/financeiro/projeto/${projetoId}/despesas`, data);
export const pagarDespesaFinanceiro = (id, data) => api.patch(`/financeiro/despesas/${id}/pagar`, data);
export const estornarDespesaFinanceiro = (id, data) => api.post(`/financeiro/despesas/${id}/estornar`, data);
export const getFluxoCaixaFinanceiro = (projetoId, params) => api.get(`/financeiro/projeto/${projetoId}/fluxo`, { params });
export const getFinanceiroConsolidado = (params) => api.get('/financeiro/consolidado', { params });

// Almoxarifado
export const getPerfilAlmoxarifado = () => api.get('/almoxarifado/perfil');
export const getFerramentas = (params) => api.get('/almoxarifado/ferramentas', { params });
export const getColaboradoresRetirada = (projetoId) => api.get('/almoxarifado/colaboradores', { params: { projeto_id: projetoId } });
export const getProximoCodigoAtivo = (projetoId) => api.get('/almoxarifado/ferramentas/proximo-codigo', { params: { projeto_id: projetoId } });
export const createFerramenta = (data) => api.post('/almoxarifado/ferramentas', data);
export const transferirAtivoObra = (ferramentaId, data) => api.post(`/almoxarifado/ferramentas/${ferramentaId}/transferir`, data);
export const getAlocacoesAbertas = (projetoId) => api.get('/almoxarifado/alocacoes-abertas', { params: { projeto_id: projetoId } });
export const registrarRetiradaFerramenta = (data) => api.post('/almoxarifado/retiradas', data);
export const registrarDevolucaoFerramenta = (alocacaoId, data) => api.post(`/almoxarifado/devolucoes/${alocacaoId}`, data);
export const enviarFerramentaManutencao = (data) => api.post('/almoxarifado/manutencao/enviar', data);
export const concluirManutencaoFerramenta = (id, data) => api.post(`/almoxarifado/manutencao/${id}/concluir`, data);
export const registrarPerdaFerramenta = (data) => api.post('/almoxarifado/perdas', data);
export const transferirFerramenta = (data) => api.post('/almoxarifado/transferencias', data);
export const getDashboardAlmoxarifado = (projetoId) => api.get(`/almoxarifado/dashboard/projeto/${projetoId}`);
export const getRelatorioMovimentacoesAlmox = (projetoId) => api.get('/almoxarifado/relatorios/movimentacoes', { params: { projeto_id: projetoId } });
export const getRelatorioPerdasAlmox = (projetoId) => api.get('/almoxarifado/relatorios/perdas', { params: { projeto_id: projetoId } });
export const getRdoFerramentasDisponiveis = (rdoId) => api.get(`/almoxarifado/rdo/${rdoId}/ferramentas-disponiveis`);
export const getRdoFerramentas = (rdoId) => api.get(`/almoxarifado/rdo/${rdoId}/ferramentas`);
export const addRdoFerramenta = (rdoId, data) => api.post(`/almoxarifado/rdo/${rdoId}/ferramentas`, data);

export const getRdoLogs = (rdoId) => api.get(`/rdos/${rdoId}/logs`);
// Rastreabilidade de materiais
export const getMaterialTraceConfig = () => api.get('/rastreabilidade/configuracao');
export const getMaterialTraceIndicators = (projetoId) => api.get(`/rastreabilidade/indicadores/${projetoId}`);
export const getMaterialRecebimentos = (projetoId, params) => api.get(`/rastreabilidade/projeto/${projetoId}`, { params });
export const getMaterialRecebimento = (id) => api.get(`/rastreabilidade/${id}`);
export const createMaterialRecebimento = (data) => api.post('/rastreabilidade', data);
export const updateMaterialRecebimento = (id, data) => api.put(`/rastreabilidade/${id}`, data);
export const addMaterialInspecao = (id, data) => api.post(`/rastreabilidade/${id}/inspecoes`, data);
export const addMaterialAplicacao = (id, data) => api.post(`/rastreabilidade/${id}/aplicacoes`, data);
export const gerarRncMaterial = (id, data) => api.post(`/rastreabilidade/${id}/rnc`, data);
export const uploadEvidenciaMaterial = (id, data) => api.post(`/rastreabilidade/${id}/evidencias`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteEvidenciaMaterial = (id, evidenciaId) => api.delete(`/rastreabilidade/${id}/evidencias/${evidenciaId}`);
export const enviarMaterialParaInspecao = (id) => api.post(`/rastreabilidade/${id}/enviar-inspecao`);
export const addMaterialCaminhao = (id, data) => api.post(`/rastreabilidade/${id}/caminhoes`, data);
export const addMaterialCorpoProva = (id, data) => api.post(`/rastreabilidade/${id}/corpos-prova`, data);
export const updateMaterialCorpoProva = (id, corpoProvaId, data) => api.put(`/rastreabilidade/${id}/corpos-prova/${corpoProvaId}`, data);
export const encerrarMaterialRecebimento = (id, data) => api.post(`/rastreabilidade/${id}/encerrar`, data);

// Transferências entre CNPJs do mesmo grupo empresarial
export const listarTransferencias = () => api.get('/transferencias');
export const detalharTransferencia = (id) => api.get(`/transferencias/${id}`);
export const solicitarTransferencia = (data) => api.post('/transferencias', data);
export const aprovarTransferenciaOrigem = (id) => api.post(`/transferencias/${id}/aprovar-origem`);
export const aprovarTransferenciaDestino = (id) => api.post(`/transferencias/${id}/aprovar-destino`);
export const rejeitarTransferencia = (id, motivo) => api.post(`/transferencias/${id}/rejeitar`, { motivo });

// Email
export const getEmailConfig = () => api.get('/email/config');
export const saveEmailConfig = (data) => api.post('/email/config', data);
export const testEmailConfig = (data) => api.post('/email/config/test', data);
export const sendEmail = (data) => api.post('/email/send', data);
export const sendEmailFormData = (formData) => api.post('/email/send', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const uploadEmailInlineImage = (formData) => api.post('/email/upload-image', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const getEmailHistory = (params) => api.get('/email/history', { params });
export const getEmailHistoryDetail = (id) => api.get(`/email/history/${id}`);
export const toggleEmailFavorito = (id) => api.patch(`/email/history/${id}/favorito`);
export const deleteEmailHistory = (id) => api.delete(`/email/history/${id}`);
export const deleteReceivedEmail = (id) => api.delete(`/email/received/${id}`);
export const toggleReceivedEmailFavorito = (id) => api.patch(`/email/received/${id}/favorito`);
export const toggleReceivedEmailImportante = (id) => api.patch(`/email/received/${id}/importante`);
export const markReceivedEmailRead = (id, isRead = 1) =>
  api.patch(`/email/received/${id}/read`, { is_read: isRead ? 1 : 0 });
export const syncImapEmails = () => api.post('/email/imap/sync');
export const getReceivedEmails = () => api.get('/email/received');
export const getEmailTemplates = () => api.get('/email/templates');
export const getEmailTemplate = (id) => api.get(`/email/templates/${id}`);
export const saveEmailTemplate = (data) => api.post('/email/templates', data);
export const deleteEmailTemplate = (id) => api.delete(`/email/templates/${id}`);
export const getEmailSignature = () => api.get('/email/signature');
export const updateEmailSignature = (data) => api.put('/email/signature', data);

// ─── GANTT E DEPENDÊNCIAS (Novo Sistema) ─────────────────────────────────
export const sugerirDependenciasEAP = (projetoId, modoParalelizacao = true) =>
  api.post(`/eap/projeto/${projetoId}/sugerir-dependencias`, { modoParalelizacao });
export const confirmarDependencia = (dependenciaId, aceitar = true) =>
  api.post(`/eap/dependencia/${dependenciaId}/confirmar`, { aceitar });
export const listaDependenciasSugeridas = (projetoId) =>
  api.get(`/eap/projeto/${projetoId}/dependencias-sugeridas`);
export const aplicarCronogramaGantt = (projetoId) =>
  api.post('/eap/dependencias/aplicar-cronograma', { projetoId });
export const analisarCronograma = (projetoId) =>
  api.get(`/eap/projeto/${projetoId}/analise-cronograma`);
export const obterDadosGantt = (projetoId, params) =>
  api.get(`/eap/projeto/${projetoId}/gantt-data`, { params });

export default api;
