// Configurações globais do app
// Altere "apiUrl" em app.json > extra para o IP atual da máquina na rede local
// Exemplo: "http://192.168.1.100:3001/api"
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
export const API_URL: string = extra?.apiUrl ?? 'http://localhost:3001/api';

export const CORES = {
  primaria: '#1565C0',
  primariaClara: '#1976D2',
  primariaMuitoClara: '#E3F2FD',
  secundaria: '#FF6F00',
  sucesso: '#2E7D32',
  sucessoClaro: '#E8F5E9',
  alerta: '#F57F17',
  alertaClaro: '#FFFDE7',
  aviso: '#F57F17',
  avisoClaro: '#FFFDE7',
  erro: '#C62828',
  erroClaro: '#FFEBEE',
  info: '#0277BD',
  infoClaro: '#E1F5FE',
  fundo: '#F5F5F5',
  superficie: '#FFFFFF',
  texto: '#212121',
  textoSecundario: '#757575',
  borda: '#E0E0E0',
  desabilitado: '#BDBDBD',
};

export const STATUS_RDO = {
  em_preenchimento: {
    label: 'Em preenchimento',
    cor: '#F57F17',
    corFundo: '#FFFDE7',
  },
  em_analise: {
    label: 'Em análise',
    cor: '#0277BD',
    corFundo: '#E1F5FE',
  },
  aprovado: {
    label: 'Aprovado',
    cor: '#2E7D32',
    corFundo: '#E8F5E9',
  },
  reprovado: {
    label: 'Reprovado',
    cor: '#C62828',
    corFundo: '#FFEBEE',
  },
};

export const STATUS_RNC = {
  aberto: {
    label: 'Aberto',
    cor: '#C62828',
    corFundo: '#FFEBEE',
  },
  em_correcao: {
    label: 'Em correção',
    cor: '#F57F17',
    corFundo: '#FFFDE7',
  },
  em_aprovacao: {
    label: 'Em aprovação',
    cor: '#0277BD',
    corFundo: '#E1F5FE',
  },
  concluido: {
    label: 'Concluído',
    cor: '#2E7D32',
    corFundo: '#E8F5E9',
  },
  cancelado: {
    label: 'Cancelado',
    cor: '#757575',
    corFundo: '#F5F5F5',
  },
};

export const STATUS_ITEM_COMPRA = {
  pendente: { label: 'Pendente', cor: '#757575', corFundo: '#F5F5F5' },
  aprovado: { label: 'Aprovado', cor: '#0277BD', corFundo: '#E1F5FE' },
  em_cotacao: { label: 'Em cotação', cor: '#F57F17', corFundo: '#FFFDE7' },
  cotado: { label: 'Cotado', cor: '#7B1FA2', corFundo: '#F3E5F5' },
  comprado: { label: 'Comprado', cor: '#2E7D32', corFundo: '#E8F5E9' },
  cancelado: { label: 'Cancelado', cor: '#C62828', corFundo: '#FFEBEE' },
};

export const PERFIS_GESTOR = [
  'Gestor Geral',
  'Gestor da Obra',
  'Gestor Local',
];

export const APP_VERSION = '2';
