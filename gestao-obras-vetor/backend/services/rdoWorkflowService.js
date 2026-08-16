const { PERFIS, inferirPerfil } = require('../constants/access');

const RDO_STATUS = Object.freeze({
  DRAFT: 'Em preenchimento',
  MANAGER_REVIEW: 'Em aprovação do gestor',
  FISCAL_REVIEW: 'Em aprovação do fiscal',
  APPROVED: 'Aprovado',
  REJECTED: 'Reprovado'
});

const RDO_ACTION = Object.freeze({
  SEND_TO_MANAGER: 'ENVIAR_PARA_APROVACAO_GESTOR',
  APPROVE_MANAGER: 'APROVAR_GESTOR',
  APPROVE_FISCAL: 'APROVAR_FISCAL',
  REQUEST_CORRECTION: 'SOLICITAR_CORRECAO',
  REJECT: 'REPROVAR'
});

const MANAGER_PROFILES = new Set([
  PERFIS.GESTOR_GERAL,
  PERFIS.GESTOR_OBRA,
  PERFIS.GESTOR_QUALIDADE
]);

const editableStatus = (status) => [RDO_STATUS.DRAFT, RDO_STATUS.REJECTED].includes(status);

const workflowError = (message, status = 409) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const assertWorkflowAction = ({ rdo, usuario, acao, motivo, exigeAprovacaoFiscal = true }) => {
  const perfil = inferirPerfil(usuario);
  const isManager = MANAGER_PROFILES.has(perfil);
  const isFiscal = perfil === PERFIS.FISCAL;
  const needsReason = [RDO_ACTION.REQUEST_CORRECTION, RDO_ACTION.REJECT].includes(acao);

  if (!Object.values(RDO_ACTION).includes(acao)) {
    throw workflowError('Ação de fluxo de RDO inválida.', 400);
  }
  if (needsReason && !String(motivo || '').trim()) {
    throw workflowError('Informe o motivo da devolução do RDO.', 400);
  }

  if (acao === RDO_ACTION.SEND_TO_MANAGER) {
    if (Number(rdo.criado_por) !== Number(usuario.id)) {
      throw workflowError('Apenas o criador pode enviar o RDO para aprovação.', 403);
    }
    if (!editableStatus(rdo.status)) {
      throw workflowError('Apenas RDOs em preenchimento ou reprovados podem ser enviados para aprovação.');
    }
    if (Number(rdo.correcao_solicitada || 0) === 1) {
      throw workflowError('Salve as correções solicitadas antes de reenviar o RDO para aprovação.');
    }
    return { perfil, stage: 'gestor', nextStatus: RDO_STATUS.MANAGER_REVIEW };
  }

  if (acao === RDO_ACTION.APPROVE_MANAGER) {
    if (!isManager) throw workflowError('Apenas gestores podem aprovar a etapa de gestão.', 403);
    if (rdo.status !== RDO_STATUS.MANAGER_REVIEW) throw workflowError('O RDO não aguarda aprovação do gestor.');
    return {
      perfil,
      stage: 'gestor',
      nextStatus: exigeAprovacaoFiscal ? RDO_STATUS.FISCAL_REVIEW : RDO_STATUS.APPROVED
    };
  }

  if (acao === RDO_ACTION.APPROVE_FISCAL) {
    if (!isFiscal) throw workflowError('Apenas fiscais podem aprovar a etapa de fiscalização.', 403);
    if (rdo.status !== RDO_STATUS.FISCAL_REVIEW) throw workflowError('O RDO não aguarda aprovação do fiscal.');
    return { perfil, stage: 'fiscal', nextStatus: RDO_STATUS.APPROVED };
  }

  const stage = rdo.status === RDO_STATUS.MANAGER_REVIEW
    ? 'gestor'
    : rdo.status === RDO_STATUS.FISCAL_REVIEW
      ? 'fiscal'
      : null;
  if (!stage) throw workflowError('O RDO não está em uma etapa de aprovação.');
  if (stage === 'gestor' && !isManager) throw workflowError('Apenas gestores podem devolver um RDO nesta etapa.', 403);
  if (stage === 'fiscal' && !isFiscal) throw workflowError('Apenas fiscais podem devolver um RDO nesta etapa.', 403);

  return {
    perfil,
    stage,
    nextStatus: acao === RDO_ACTION.REJECT ? RDO_STATUS.REJECTED : RDO_STATUS.DRAFT
  };
};

module.exports = {
  RDO_STATUS,
  RDO_ACTION,
  MANAGER_PROFILES,
  editableStatus,
  assertWorkflowAction
};
