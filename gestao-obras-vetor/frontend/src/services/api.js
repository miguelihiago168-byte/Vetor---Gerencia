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
export const getUsuarios = () => api.get('/usuarios');
export const getUsuario = (id) => api.get(`/usuarios/${id}`);
export const getNovoLogin = () => api.get('/usuarios/novo-login');
export const createUsuario = (data) => api.post('/usuarios', data);
export const updateUsuario = (id, data) => api.put(`/usuarios/${id}`, data);
export const updateUsuarioGestor = (id, isGestor) => api.patch(`/usuarios/${id}/gestor`, { is_gestor: isGestor });
export const deleteUsuario = (id) => api.delete(`/usuarios/${id}`);

// Projetos
export const getProjetos = () => api.get('/projetos');
export const getProjeto = (id) => api.get(`/projetos/${id}`);
export const createProjeto = (data) => api.post('/projetos', data);
export const updateProjeto = (id, data) => api.put(`/projetos/${id}`, data);
export const deleteProjeto = (id) => api.delete(`/projetos/${id}`);

// EAP
export const getAtividadesEAP = (projetoId) => api.get(`/eap/projeto/${projetoId}`);
export const createAtividade = (data) => api.post('/eap', data);
export const updateAtividade = (id, data) => api.put(`/eap/${id}`, data);
export const deleteAtividade = (id) => api.delete(`/eap/${id}`);
export const recalcularAvanco = (id) => api.post(`/eap/${id}/recalcular`);
export const getHistoricoAtividade = (id) => api.get(`/eap/${id}/historico`);

// RDOs
export const getRDOs = (projetoId) => api.get(`/rdos/projeto/${projetoId}`);
export const getRDO = (id) => api.get(`/rdos/${id}`);
export const createRDO = (data) => api.post('/rdos', data);
export const updateRDO = (id, data) => api.put(`/rdos/${id}`, data);
export const updateStatusRDO = (id, status) => api.patch(`/rdos/${id}/status`, { status });
export const deleteRDO = (id) => api.delete(`/rdos/${id}`);

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
export const uploadRdoFoto = (rdoId, formData) => api.post(`/rdo/${rdoId}/foto`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

// Anexos
export const uploadAnexo = (rdoId, formData) => api.post(`/anexos/upload/${rdoId}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const getAnexos = (rdoId) => api.get(`/anexos/rdo/${rdoId}`);
export const deleteAnexo = (id) => api.delete(`/anexos/${id}`);

// Dashboard
export const getDashboardAvanco = (projetoId) => api.get(`/dashboard/projeto/${projetoId}/avanco`);
export const getRDOStats = (projetoId) => api.get(`/dashboard/projeto/${projetoId}/rdos-stats`);

// RNC
export const getRNCs = (projetoId) => api.get(`/rnc/projeto/${projetoId}`);
export const createRNC = (data) => api.post('/rnc', data);
export const updateRNC = (id, data) => api.put(`/rnc/${id}`, data);
export const updateStatusRNC = (id, status) => api.patch(`/rnc/${id}/status`, { status });
// Submeter correção de RNC (responsável/criador)
export const submitCorrecaoRNC = (id, data) => api.post(`/rnc/${id}/corrigir`, data);
export const deleteRNC = (id) => api.delete(`/rnc/${id}`);
export const enviarRncParaAprovacao = (id) => api.post(`/rnc/${id}/enviar-aprovacao`);

export default api;
