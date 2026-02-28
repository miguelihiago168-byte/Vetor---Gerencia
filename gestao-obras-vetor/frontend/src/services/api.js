import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para adicionar token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (credentials) => api.post('/auth/login', credentials);

// Usuários
export const getUsuarios = (params) => api.get('/usuarios', { params });
export const getUsuario = (id) => api.get(`/usuarios/${id}`);
export const getNovoLogin = () => api.get('/usuarios/novo-login');
export const getUsuariosDeletados = () => api.get('/usuarios/deletados/lista');
export const createUsuario = (data) => api.post('/usuarios', data);
export const updateUsuario = (id, data) => api.put(`/usuarios/${id}`, data);
export const updateUsuarioGestor = (id, isGestor) => api.patch(`/usuarios/${id}/gestor`, { is_gestor: isGestor });
export const updateUsuarioAdm = (id, isAdm) => api.patch(`/usuarios/${id}/adm`, { is_adm: isAdm });
export const deleteUsuario = (id) => api.delete(`/usuarios/${id}`);
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
export const arquivarProjeto = (id) => api.patch(`/projetos/${id}/arquivar`);
export const desarquivarProjeto = (id) => api.patch(`/projetos/${id}/desarquivar`);

// EAP
export const getAtividadesEAP = (projetoId) => api.get(`/eap/projeto/${projetoId}`);
export const createAtividade = (data) => api.post('/eap', data);
export const updateAtividade = (id, data) => api.put(`/eap/${id}`, data);
export const deleteAtividade = (id) => api.delete(`/eap/${id}`);
export const recalcularAvanco = (id) => api.post(`/eap/${id}/recalcular`);
export const getHistoricoAtividade = (id) => api.get(`/eap/${id}/historico`);
export const recalcularEapProjeto = (projetoId) => api.post(`/eap/projeto/${projetoId}/recalcular-tudo`);

// RDOs
export const getRDOs = (projetoId) => api.get(`/rdos/projeto/${projetoId}`);
export const getRDO = (id) => api.get(`/rdos/${id}`);
export const createRDO = (data) => api.post('/rdos', data);
export const updateRDO = (id, data) => api.put(`/rdos/${id}`, data);
export const updateStatusRDO = (id, status) => api.patch(`/rdos/${id}/status`, { status });
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
export const addRdoAssinatura = (rdoId, data) => api.post(`/rdo/${rdoId}/assinatura`, data);
// Backend espera o campo 'arquivo' no upload
export const uploadRdoFoto = (rdoId, formData) => api.post(`/rdo/${rdoId}/foto`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
// Execução acumulada de atividades (somatório de quantidade_executada em RDOs aprovados)
export const getExecucaoAcumulada = (projetoId) => api.get(`/rdo/projeto/${projetoId}/execucao-atividades`);
// Colaboradores disponíveis para preenchimento de mão de obra (usuários + mão de obra direta)
export const getRdoColaboradores = (projetoId) => api.get(`/rdo/projeto/${projetoId}/colaboradores`);
export const createRdoColaborador = (projetoId, data) => api.post(`/rdo/projeto/${projetoId}/colaboradores`, data);

// Anexos
export const uploadAnexo = (rdoId, formData) => api.post(`/anexos/upload/${rdoId}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const getAnexos = (rdoId) => api.get(`/anexos/rdo/${rdoId}`);
export const deleteAnexo = (id) => api.delete(`/anexos/${id}`);
// Anexos da RNC
export const uploadAnexoRNC = (rncId, formData) => api.post(`/anexos/upload-rnc/${rncId}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const getAnexosRNC = (rncId) => api.get(`/anexos/rnc/${rncId}`);

// Dashboard
export const getDashboardAvanco = (projetoId) => api.get(`/dashboard/projeto/${projetoId}/avanco`);
export const getRDOStats = (projetoId) => api.get(`/dashboard/projeto/${projetoId}/rdos-stats`);
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

// Notificações
export const getNotificacoes = () => api.get('/notificacoes');
export const marcarNotificacaoLida = (id) => api.patch(`/notificacoes/${id}/read`);

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
export const inserirCotacaoItem = (reqId, itemId, data) =>
  api.post(`/requisicoes/${reqId}/itens/${itemId}/cotacoes`, data);
export const selecionarCotacaoItem = (reqId, itemId, cotacaoId) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/cotacoes/${cotacaoId}/selecionar`);
export const marcarItemComprado = (reqId, itemId) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/comprado`);
export const cancelarItemRequisicao = (reqId, itemId, data) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/cancelar`, data);
export const listarCotacoesFinalizadas = (params) => api.get('/requisicoes/finalizadas', { params });
export const listarCotacoesNegadas = (params) => api.get('/requisicoes/negadas', { params });
export const kanbanRequisicoes = (projetoId, params) =>
  api.get(`/requisicoes/kanban/projeto/${projetoId}`, { params });
export const aprovarTodosItens = (reqId) =>
  api.patch(`/requisicoes/${reqId}/aprovar-todos`);
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

export default api;
