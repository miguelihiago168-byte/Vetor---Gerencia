import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { API_URL } from '../utils/constants';
import { storage } from '../utils/storage';
import { withCache } from '../utils/cache';

let logoutCallback: (() => void) | null = null;

export function setLogoutCallback(cb: () => void) {
  logoutCallback = cb;
}

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await storage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
export const login = (credentials: { login: string; senha: string }) =>
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
  withCache(`dash_avanco_${projetoId}`, () => api.get(`/dashboard/projeto/${projetoId}/avanco`));
export const getRDOStats = (projetoId: number) =>
  withCache(`dash_stats_${projetoId}`, () => api.get(`/dashboard/projeto/${projetoId}/rdos-stats`));
export const getCurvaS = (projetoId: number) =>
  withCache(`dash_curvas_${projetoId}`, () => api.get(`/dashboard/projeto/${projetoId}/curva-s`));

// ─── Requisições (Compras) ───────────────────────────────────────────────────
export const listarRequisicoesProjeto = (
  projetoId: number,
  params?: Record<string, unknown>,
) => withCache(`requisicoes_${projetoId}`, () => api.get(`/requisicoes/projeto/${projetoId}`, { params }));
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

// ─── Almoxarifado ────────────────────────────────────────────────────────────
export const getDashboardAlmoxarifado = (projetoId: number) =>
  withCache(`almox_dash_${projetoId}`, () => api.get(`/almoxarifado/dashboard/projeto/${projetoId}`));
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

// ─── Usuários ────────────────────────────────────────────────────────────────
export const getUsuarios = (params?: Record<string, unknown>) =>
  api.get('/usuarios', { params });

export default api;
