// Configurações globais do app
// Configure "apiUrl" em app.json > extra com a URL pública do servidor.
// Exemplo: "https://sistema.suaempresa.com.br/api"
import Constants from 'expo-constants';

const PRODUCTION_API_URL = 'http://161.97.136.203/api';
const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

const cleanApiUrl = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.endsWith('/api')
    ? trimmed.replace(/\/+$/, '')
    : `${trimmed.replace(/\/+$/, '')}/api`;
};

const isLoopbackUrl = (value?: string) =>
  Boolean(
    value &&
      /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:|\/|$)/i.test(value),
  );

const envApiUrl = cleanApiUrl(process.env.EXPO_PUBLIC_API_URL as string | undefined);
const extraApiUrl = cleanApiUrl(extra?.apiUrl);

export const API_URL: string =
  (!isLoopbackUrl(envApiUrl) ? envApiUrl : undefined) ??
  (!isLoopbackUrl(extraApiUrl) ? extraApiUrl : undefined) ??
  PRODUCTION_API_URL;

export const normalizeApiUrl = cleanApiUrl;

export const CORES = {
  primaria: '#155EA8',
  primariaClara: '#1F7BD7',
  primariaEscura: '#0D3764',
  primariaMuitoClara: '#E7F1FC',
  secundaria: '#F28C28',
  secundariaClara: '#FFF2E3',
  sucesso: '#2F7D45',
  sucessoClaro: '#E9F7EE',
  alerta: '#D98216',
  alertaClaro: '#FFF4DF',
  aviso: '#F57F17',
  avisoClaro: '#FFFDE7',
  erro: '#C62828',
  erroClaro: '#FFEBEE',
  info: '#0277BD',
  infoClaro: '#E1F5FE',
  fundo: '#F3F6FA',
  superficie: '#FFFFFF',
  texto: '#172033',
  textoSecundario: '#637083',
  borda: '#DCE4EE',
  bordaForte: '#B8C6D8',
  desabilitado: '#AEB9C7',
  trilho: '#E8EDF4',
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
  'Aguardando análise': { label: 'Aguardando análise', cor: '#757575', corFundo: '#F5F5F5' },
  'Reprovado': { label: 'Reprovado', cor: '#C62828', corFundo: '#FFEBEE' },
  'Em cotação': { label: 'Em cotação', cor: '#F57F17', corFundo: '#FFFDE7' },
  'Cotação finalizada': { label: 'Cotação finalizada', cor: '#7B1FA2', corFundo: '#F3E5F5' },
  'Aprovado para compra': { label: 'Aprovado para compra', cor: '#0277BD', corFundo: '#E1F5FE' },
  'Comprado': { label: 'Comprado', cor: '#2E7D32', corFundo: '#E8F5E9' },
  'Cancelado': { label: 'Cancelado', cor: '#757575', corFundo: '#F5F5F5' },
};

export const PERFIS_GESTOR = [
  'Gestor Geral',
  'Gestor da Obra',
  'Gestor Local',
];

export const APP_VERSION = '2';
