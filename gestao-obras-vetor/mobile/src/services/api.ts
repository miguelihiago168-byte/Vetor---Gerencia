import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { API_URL, normalizeApiUrl } from '../utils/constants';
import { storage } from '../utils/storage';
import { withCache } from '../utils/cache';

let logoutCallback: (() => void) | null = null;

const isLoopbackApiUrl = (value?: string | null) =>
  Boolean(
    value &&
      /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:|\/|$)/i.test(value),
  );

const getConfiguredApiUrl = async () => {
  const stored = await storage.getApiUrl();
  if (isLoopbackApiUrl(stored)) {
    await storage.removeApiUrl();
    return API_URL;
  }
  return stored || API_URL;
};

export function setLogoutCallback(cb: () => void) {
  logoutCallback = cb;
}

const api: AxiosInstance = axios.create({
  baseURL: API_URL || undefined,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const baseURL = await getConfiguredApiUrl();
    if (!baseURL) {
      throw new Error('Configure a URL pública do servidor antes de continuar.');
    }
    config.baseURL = baseURL;
    const token = await storage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const usuario = await storage.getUsuario();
    const tenantId = Number(usuario?.tenant_id || 0);
    if (tenantId) config.headers['x-tenant-id'] = String(tenantId);
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await storage.clearAll();
      if (logoutCallback) logoutCallback();
    }
    return Promise.reject(error);
  },
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const getActiveApiUrl = getConfiguredApiUrl;

export const setActiveApiUrl = async (apiUrl: string) => {
  const normalized = normalizeApiUrl(apiUrl);
  if (!normalized) throw new Error('Informe um endereço de API válido.');
  await storage.setApiUrl(normalized);
  api.defaults.baseURL = normalized;
  return normalized;
};

export const resetActiveApiUrl = async () => {
  await storage.removeApiUrl();
  api.defaults.baseURL = API_URL;
  return API_URL;
};

export const testarConexaoApi = async (apiUrl?: string) => {
  const baseURL = normalizeApiUrl(apiUrl) || (await getActiveApiUrl());
  if (!baseURL) throw new Error('Configure a URL pública do servidor.');
  const healthUrl = `${baseURL.replace(/\/api$/, '')}/api/health`;
  const resp = await axios.get(healthUrl, { timeout: 8000 });
  return { apiUrl: baseURL, data: resp.data };
};

export const login = (credentials: { usuario?: string; login?: string; senha: string }) =>
  api.post('/auth/login', credentials);

// ─── Projetos ────────────────────────────────────────────────────────────────
export const getProjetos = () => withCache('projetos', () => api.get('/projetos'));
export const getProjeto = (id: number) => withCache(`projeto_${id}`, () => api.get(`/projetos/${id}`));

// ─── EAP ─────────────────────────────────────────────────────────────────────
export const getAtividadesEAP = (projetoId: number) =>
  withCache(`eap_${projetoId}`, () => api.get(`/eap/projeto/${projetoId}`));

// ─── RDOs ────────────────────────────────────────────────────────────────────
export const getRDOs = (projetoId: number) =>
  withCache(`rdos_${projetoId}`, () => api.get(`/rdos/projeto/${projetoId}`));
export const getRDO = (id: number) => withCache(`rdo_${id}`, () => api.get(`/rdos/${id}`));
export const createRDO = (data: Record<string, unknown>) => api.post('/rdos', data);
export const updateRDO = (id: number, data: Record<string, unknown>) =>
  api.put(`/rdos/${id}`, data);
export const updateStatusRDO = (id: number, status: string) =>
  api.patch(`/rdos/${id}/status`, { status });
export const deleteRDO = (id: number) => api.delete(`/rdos/${id}`);

// RDO relacionados
export const getAnexos = (rdoId: number) => withCache(`anexos_rdo_${rdoId}`, () => api.get(`/anexos/rdo/${rdoId}`));
export const uploadAnexo = (rdoId: number, formData: FormData) =>
  api.post(`/anexos/upload/${rdoId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const deleteAnexo = (id: number) => api.delete(`/anexos/${id}`);

export const getRdoEquipamentos = (rdoId: number) =>
  api.get(`/rdo/${rdoId}/equipamentos`);
export const addRdoEquipamento = (rdoId: number, data: Record<string, unknown>) =>
  api.post(`/rdo/${rdoId}/equipamentos`, data);
export const deleteRdoEquipamento = (rdoId: number, equipId: number) =>
  api.delete(`/rdo/${rdoId}/equipamentos/${equipId}`);

export const getRdoColaboradores = (projetoId: number) =>
  withCache(`colab_rdo_${projetoId}`, () => api.get(`/rdo/projeto/${projetoId}/colaboradores`));
export const listRdoMaoObra = (rdoId: number) =>
  withCache(`mao_obra_rdo_${rdoId}`, () => api.get(`/rdo/${rdoId}/mao_obra`));
export const getExecucaoAcumulada = (projetoId: number) =>
  withCache(`execucao_${projetoId}`, () => api.get(`/rdo/projeto/${projetoId}/execucao-atividades`));
export const addRdoClima = (rdoId: number, data: Record<string, unknown>) =>
  api.post(`/rdo/${rdoId}/clima`, data);
export const addRdoMaterial = (rdoId: number, data: Record<string, unknown>) =>
  api.post(`/rdo/${rdoId}/material`, data);
export const addRdoOcorrencia = (rdoId: number, data: Record<string, unknown>) =>
  api.post(`/rdo/${rdoId}/ocorrencia`, data);
export const addRdoComentario = (rdoId: number, data: Record<string, unknown>) =>
  api.post(`/rdo/${rdoId}/comentario`, data);
export const addRdoAssinatura = (rdoId: number, data: Record<string, unknown>) =>
  api.post(`/rdo/${rdoId}/assinatura`, data);
export const updateRdoFoto = (
  rdoId: number,
  fotoId: number,
  data: Record<string, unknown>,
) => api.patch(`/rdo/${rdoId}/foto/${fotoId}`, data);
export const reorderRdoFotos = (rdoId: number, fotoIds: number[]) =>
  api.patch(`/rdo/${rdoId}/fotos/ordem`, { foto_ids: fotoIds });
export const getRdoLogs = (rdoId: number) => api.get(`/rdos/${rdoId}/logs`);

// ─── Anexos RDO (foto) ───────────────────────────────────────────────────────
export const uploadRdoFoto = (rdoId: number, formData: FormData) =>
  api.post(`/rdo/${rdoId}/foto`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// ─── RNC ─────────────────────────────────────────────────────────────────────
export const getRNCs = (projetoId: number) =>
  withCache(`rncs_${projetoId}`, () => api.get(`/rnc/projeto/${projetoId}`));
export const getRNC = (id: number) => withCache(`rnc_${id}`, () => api.get(`/rnc/${id}`));
export const createRNC = (data: Record<string, unknown>) => api.post('/rnc', data);
export const updateRNC = (id: number, data: Record<string, unknown>) =>
  api.put(`/rnc/${id}`, data);
export const updateStatusRNC = (id: number, status: string) =>
  api.patch(`/rnc/${id}/status`, { status });
export const submitCorrecaoRNC = (id: number, data: Record<string, unknown>) =>
  api.post(`/rnc/${id}/corrigir`, data);
export const enviarRncParaAprovacao = (id: number) =>
  api.post(`/rnc/${id}/enviar-aprovacao`);
export const deleteRNC = (id: number) => api.delete(`/rnc/${id}`);
export const getAnexosRNC = (rncId: number) => api.get(`/anexos/rnc/${rncId}`);
export const uploadAnexoRNC = (rncId: number, formData: FormData) =>
  api.post(`/anexos/upload-rnc/${rncId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const getDashboardAvanco = (projetoId: number) =>
  api.get(`/dashboard/projeto/${projetoId}/avanco`);
export const getRDOStats = (projetoId: number) =>
  api.get(`/dashboard/projeto/${projetoId}/rdos-stats`);
export const getCurvaS = (projetoId: number) =>
  api.get(`/dashboard/projeto/${projetoId}/curva-s`);
export const obterDadosGantt = (
  projetoId: number,
  params?: Record<string, unknown>,
) => api.get(`/eap/projeto/${projetoId}/gantt-data`, { params });

// ─── Requisições (Compras) ───────────────────────────────────────────────────
export const listarRequisicoesProjeto = (
  projetoId: number,
  params?: Record<string, unknown>,
) => withCache(`requisicoes_${projetoId}`, () => api.get(`/requisicoes/projeto/${projetoId}`, { params }));
export const listarRequisicoes = (params?: Record<string, unknown>) =>
  api.get('/requisicoes', { params });
export const detalharRequisicao = (id: number) => withCache(`requisicao_${id}`, () => api.get(`/requisicoes/${id}`));
export const criarRequisicao = (data: Record<string, unknown>) =>
  api.post('/requisicoes', data);
export const analisarItemRequisicao = (
  reqId: number,
  itemId: number,
  data: Record<string, unknown>,
) => api.patch(`/requisicoes/${reqId}/itens/${itemId}/analisar`, data);
export const inserirCotacaoItem = (
  reqId: number,
  itemId: number,
  data: Record<string, unknown>,
) => api.post(`/requisicoes/${reqId}/itens/${itemId}/cotacoes`, data);
export const selecionarCotacaoItem = (
  reqId: number,
  itemId: number,
  cotacaoId: number,
) =>
  api.patch(
    `/requisicoes/${reqId}/itens/${itemId}/cotacoes/${cotacaoId}/selecionar`,
  );
export const marcarItemComprado = (reqId: number, itemId: number) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/comprado`);
export const concluirRequisicao = (reqId: number) =>
  api.patch(`/requisicoes/${reqId}/concluir`);
export const cancelarItemRequisicao = (
  reqId: number,
  itemId: number,
  data: Record<string, unknown>,
) => api.patch(`/requisicoes/${reqId}/itens/${itemId}/cancelar`, data);
export const devolverCotacaoItem = (
  reqId: number,
  itemId: number,
  data: Record<string, unknown>,
) => api.patch(`/requisicoes/${reqId}/itens/${itemId}/devolver-cotacao`, data);
export const finalizarCotacaoItem = (reqId: number, itemId: number) =>
  api.patch(`/requisicoes/${reqId}/itens/${itemId}/finalizar-cotacao`);
export const alterarQuantidadeItem = (
  reqId: number,
  itemId: number,
  quantidade: number,
) => api.patch(`/requisicoes/${reqId}/itens/${itemId}/alterar-quantidade`, { quantidade });
export const editarRequisicaoHeader = (reqId: number, data: Record<string, unknown>) =>
  api.patch(`/requisicoes/${reqId}/editar`, data);
export const editarItemRequisicao = (
  reqId: number,
  itemId: number,
  data: Record<string, unknown>,
) => api.patch(`/requisicoes/${reqId}/itens/${itemId}/editar`, data);
export const listarCotacoesFinalizadas = (params?: Record<string, unknown>) =>
  api.get('/requisicoes/finalizadas', { params });
export const listarCotacoesNegadas = (params?: Record<string, unknown>) =>
  api.get('/requisicoes/negadas', { params });
export const listarRequisicoesEncerradas = (params?: Record<string, unknown>) =>
  api.get('/requisicoes/encerradas', { params });
export const kanbanRequisicoes = (projetoId: number, params?: Record<string, unknown>) =>
  api.get(`/requisicoes/kanban/projeto/${projetoId}`, { params });
export const kanbanGlobal = (params?: Record<string, unknown>) =>
  api.get('/requisicoes/kanban', { params });
export const aprovarTodosItens = (reqId: number) =>
  api.patch(`/requisicoes/${reqId}/aprovar-todos`);
export const analisarTodosItens = (reqId: number) =>
  api.patch(`/requisicoes/${reqId}/analisar-todos`);
export const comprarTodosItens = (reqId: number) =>
  api.patch(`/requisicoes/${reqId}/comprar-todos`);
export const getRequisicoesBadges = (projetoId?: number) =>
  api.get('/requisicoes/badges', {
    params: projetoId ? { projeto_id: projetoId } : {},
  });
export const editarCotacaoItem = (
  reqId: number,
  itemId: number,
  cotacaoId: number,
  data: Record<string, unknown>,
) => api.patch(`/requisicoes/${reqId}/itens/${itemId}/cotacoes/${cotacaoId}`, data);

// ─── Almoxarifado ────────────────────────────────────────────────────────────
export const getDashboardAlmoxarifado = (projetoId: number) =>
  withCache(`almox_dash_${projetoId}`, () => api.get(`/almoxarifado/dashboard/projeto/${projetoId}`));
export const getPerfilAlmoxarifado = () => api.get('/almoxarifado/perfil');
export const getFerramentas = (params?: Record<string, unknown>) =>
  withCache(`ferramentas_${JSON.stringify(params ?? {})}`, () => api.get('/almoxarifado/ferramentas', { params }));
export const getAlocacoesAbertas = (projetoId: number) =>
  withCache(`alocacoes_${projetoId}`, () => api.get('/almoxarifado/alocacoes-abertas', { params: { projeto_id: projetoId } }));
export const getColaboradoresRetirada = (projetoId: number) =>
  withCache(`colab_retirada_${projetoId}`, () => api.get('/almoxarifado/colaboradores', { params: { projeto_id: projetoId } }));
export const registrarRetiradaFerramenta = (data: Record<string, unknown>) =>
  api.post('/almoxarifado/retiradas', data);
export const registrarDevolucaoFerramenta = (
  alocacaoId: number,
  data: Record<string, unknown>,
) => api.post(`/almoxarifado/devolucoes/${alocacaoId}`, data);

// ─── Notificações ────────────────────────────────────────────────────────────
export const getNotificacoes = () => api.get('/notificacoes');
export const marcarNotificacaoLida = (id: number) =>
  api.patch(`/notificacoes/${id}/read`);
export const marcarTodasNotificacoesLidas = () =>
  api.patch('/notificacoes/marcar-todas-lidas');

// ─── Usuários ────────────────────────────────────────────────────────────────
export const getMensagensNaoLidasCount = () => api.get('/mensagens/nao-lidas/count');
export const criarConversaDireta = (data: Record<string, unknown>) =>
  api.post('/mensagens/conversas/direta', data);
export const listarConversas = (params?: Record<string, unknown>) =>
  api.get('/mensagens/conversas', { params });
export const listarMensagensConversa = (
  conversaId: number,
  params?: Record<string, unknown>,
) => api.get(`/mensagens/conversas/${conversaId}/mensagens`, { params });
export const enviarMensagemConversa = (conversaId: number, data: Record<string, unknown>) =>
  api.post(`/mensagens/conversas/${conversaId}/mensagens`, data);
export const marcarConversaComoLida = (conversaId: number) =>
  api.patch(`/mensagens/conversas/${conversaId}/marcar-lidas`);
export const listarReunioesMensagens = (params?: Record<string, unknown>) =>
  api.get('/mensagens/reunioes', { params });
export const listarReunioesHoje = (params?: Record<string, unknown>) =>
  api.get('/mensagens/reunioes/hoje', { params });
export const criarReuniaoMensagem = (data: Record<string, unknown>) =>
  api.post('/mensagens/reunioes', data);
export const editarReuniaoMensagem = (id: number, data: Record<string, unknown>) =>
  api.patch(`/mensagens/reunioes/${id}`, data);
export const cancelarReuniaoMensagem = (id: number) =>
  api.patch(`/mensagens/reunioes/${id}/cancelar`);

export const getUsuarios = (params?: Record<string, unknown>) =>
  api.get('/usuarios', { params });

export const listarTransferencias = () => api.get('/transferencias');
export const detalharTransferencia = (id: number) => api.get(`/transferencias/${id}`);
export const solicitarTransferencia = (data: Record<string, unknown>) => api.post('/transferencias', data);
export const aprovarTransferenciaOrigem = (id: number) => api.post(`/transferencias/${id}/aprovar-origem`);
export const aprovarTransferenciaDestino = (id: number) => api.post(`/transferencias/${id}/aprovar-destino`);
export const rejeitarTransferencia = (id: number, motivo?: string) => api.post(`/transferencias/${id}/rejeitar`, { motivo });

export default api;
