const assert = require('assert');
const { RDO_STATUS, RDO_ACTION, assertWorkflowAction } = require('../services/rdoWorkflowService');

const creator = { id: 10, perfil: 'Fiscal' };
const manager = { id: 20, perfil: 'Gestor da Obra' };
const fiscal = { id: 30, perfil: 'Fiscal' };
const rdo = (status) => ({ id: 1, criado_por: creator.id, status });

const expectsError = (fn, status) => {
  assert.throws(fn, (error) => error.status === status);
};

const main = () => {
  assert.strictEqual(
    assertWorkflowAction({ rdo: rdo(RDO_STATUS.DRAFT), usuario: creator, acao: RDO_ACTION.SEND_TO_MANAGER }).nextStatus,
    RDO_STATUS.MANAGER_REVIEW
  );
  assert.strictEqual(
    assertWorkflowAction({ rdo: rdo(RDO_STATUS.MANAGER_REVIEW), usuario: manager, acao: RDO_ACTION.APPROVE_MANAGER }).nextStatus,
    RDO_STATUS.FISCAL_REVIEW
  );
  assert.strictEqual(
    assertWorkflowAction({ rdo: rdo(RDO_STATUS.MANAGER_REVIEW), usuario: manager, acao: RDO_ACTION.APPROVE_MANAGER, exigeAprovacaoFiscal: false }).nextStatus,
    RDO_STATUS.APPROVED
  );
  assert.strictEqual(
    assertWorkflowAction({ rdo: rdo(RDO_STATUS.FISCAL_REVIEW), usuario: fiscal, acao: RDO_ACTION.APPROVE_FISCAL }).nextStatus,
    RDO_STATUS.APPROVED
  );
  assert.strictEqual(
    assertWorkflowAction({ rdo: rdo(RDO_STATUS.FISCAL_REVIEW), usuario: fiscal, acao: RDO_ACTION.REQUEST_CORRECTION, motivo: 'Corrigir quantidades' }).nextStatus,
    RDO_STATUS.DRAFT
  );
  assert.strictEqual(
    assertWorkflowAction({ rdo: rdo(RDO_STATUS.MANAGER_REVIEW), usuario: manager, acao: RDO_ACTION.REJECT, motivo: 'Dados inconsistentes' }).nextStatus,
    RDO_STATUS.REJECTED
  );

  expectsError(() => assertWorkflowAction({ rdo: rdo(RDO_STATUS.MANAGER_REVIEW), usuario: fiscal, acao: RDO_ACTION.APPROVE_FISCAL }), 409);
  expectsError(() => assertWorkflowAction({ rdo: rdo(RDO_STATUS.FISCAL_REVIEW), usuario: manager, acao: RDO_ACTION.APPROVE_MANAGER }), 409);
  expectsError(() => assertWorkflowAction({ rdo: rdo(RDO_STATUS.MANAGER_REVIEW), usuario: manager, acao: RDO_ACTION.REJECT }), 400);
  expectsError(() => assertWorkflowAction({ rdo: rdo(RDO_STATUS.DRAFT), usuario: manager, acao: RDO_ACTION.SEND_TO_MANAGER }), 403);
  expectsError(() => assertWorkflowAction({ rdo: { ...rdo(RDO_STATUS.REJECTED), correcao_solicitada: 1 }, usuario: creator, acao: RDO_ACTION.SEND_TO_MANAGER }), 409);

  console.log(JSON.stringify({ ok: true, scenarios: 11 }));
};

main();
