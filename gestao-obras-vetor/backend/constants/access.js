const PERFIS = {
  ADM: 'ADM',
  GESTOR_GERAL: 'Gestor Geral',
  GESTOR_OBRA: 'Gestor da Obra',
  GESTOR_QUALIDADE: 'Gestor da Qualidade',
  ALMOXARIFE: 'Almoxarife',
  FISCAL: 'Fiscal'
};

const PERFIS_ALIAS = {
  'Gestor Local': PERFIS.GESTOR_OBRA,
  'Gestor de Qualidade': PERFIS.GESTOR_QUALIDADE
};

const SETORES = {
  ADMINISTRATIVO: 'Administrativo',
  ENGENHARIA: 'Engenharia',
  QUALIDADE: 'Qualidade',
  ALMOXARIFADO: 'Almoxarifado',
  FINANCEIRO: 'Financeiro',
  OUTRO: 'Outro'
};

const PERFIS_LISTA = Object.values(PERFIS);
const SETORES_LISTA = Object.values(SETORES);

const LEGACY_PERFIS_ALMOX = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  GESTOR_OBRA: 'GESTOR_OBRA',
  ALMOXARIFE: 'ALMOXARIFE',
  VISUALIZADOR: 'VISUALIZADOR'
};

const toIntFlag = (value) => Number(value) === 1 ? 1 : 0;

const normalizarPerfil = (perfil) => {
  if (!perfil) return null;
  if (PERFIS_LISTA.includes(perfil)) return perfil;
  return PERFIS_ALIAS[perfil] || null;
};

const inferirPerfil = (usuario = {}) => {
  const perfilNormalizado = normalizarPerfil(usuario.perfil);
  if (perfilNormalizado) return perfilNormalizado;

  if (String(usuario.perfil_almoxarifado || '').toUpperCase() === LEGACY_PERFIS_ALMOX.ALMOXARIFE) {
    return PERFIS.ALMOXARIFE;
  }

  if (toIntFlag(usuario.is_adm) === 1) return PERFIS.ADM;
  if (toIntFlag(usuario.is_gestor) === 1) return PERFIS.GESTOR_GERAL;

  return PERFIS.ADM;
};

const mapPerfilParaLegado = (perfil) => {
  const escolhido = normalizarPerfil(perfil) || PERFIS.ADM;

  const is_gestor = [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA].includes(escolhido) ? 1 : 0;
  const is_adm = escolhido === PERFIS.ADM ? 1 : 0;

  let perfil_almoxarifado = LEGACY_PERFIS_ALMOX.VISUALIZADOR;
  if (escolhido === PERFIS.GESTOR_GERAL) perfil_almoxarifado = LEGACY_PERFIS_ALMOX.ADMINISTRADOR;
  if (escolhido === PERFIS.GESTOR_OBRA) perfil_almoxarifado = LEGACY_PERFIS_ALMOX.GESTOR_OBRA;
  if (escolhido === PERFIS.ALMOXARIFE) perfil_almoxarifado = LEGACY_PERFIS_ALMOX.ALMOXARIFE;

  return { is_gestor, is_adm, perfil_almoxarifado };
};

module.exports = {
  PERFIS,
  SETORES,
  PERFIS_LISTA,
  SETORES_LISTA,
  normalizarPerfil,
  inferirPerfil,
  mapPerfilParaLegado
};
