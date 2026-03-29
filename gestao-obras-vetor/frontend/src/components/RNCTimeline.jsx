import React from 'react';
import './RNCTimeline.css';

const formatLocalDate = (dstr) => {
  if (!dstr) return null;
  const m = dstr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return dt.toLocaleDateString('pt-BR');
  }
  const dt = new Date(dstr);
  return isNaN(dt.getTime()) ? null : dt.toLocaleDateString('pt-BR');
};

const truncate = (text, max = 110) => {
  if (!text) return null;
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
};

function buildSteps(rnc) {
  const gravidade = rnc.gravidade ? `Gravidade: ${rnc.gravidade}` : null;
  const area = rnc.area_afetada ? `Área: ${rnc.area_afetada}` : null;
  const identificacaoResumo = [gravidade, area].filter(Boolean).join(' · ') || null;

  return [
    {
      label: 'Criação da RNC',
      date: formatLocalDate(rnc.criado_em),
      summary: truncate(rnc.descricao),
      completed: true,
    },
    {
      label: 'Identificação do Problema',
      date: formatLocalDate(rnc.criado_em),
      summary: identificacaoResumo,
      completed: true,
    },
    {
      label: 'Ação Corretiva Definida',
      date: null,
      summary: truncate(rnc.acao_corretiva),
      completed: Boolean(rnc.acao_corretiva),
    },
    {
      label: 'Correção Realizada',
      date: rnc.descricao_correcao ? formatLocalDate(rnc.descricao_correcao_em || rnc.atualizado_em) : null,
      summary: truncate(rnc.descricao_correcao),
      completed: Boolean(rnc.descricao_correcao),
    },
    {
      label: 'Encerramento',
      date: formatLocalDate(rnc.resolvido_em),
      summary: rnc.status === 'Encerrada' ? 'RNC encerrada com sucesso.' : null,
      completed: rnc.status === 'Encerrada',
    },
  ];
}

function RNCTimeline({ rnc }) {
  if (!rnc) return null;
  const steps = buildSteps(rnc);

  return (
    <div className="rnc-timeline" aria-label="Linha do tempo da RNC">
      {steps.map((step, index) => (
        <div
          key={index}
          className={`rnc-timeline__item ${step.completed ? 'rnc-timeline__item--done' : ''}`}
        >
          <div className="rnc-timeline__track">
            <div className="rnc-timeline__dot" />
            {index < steps.length - 1 && <div className="rnc-timeline__line" />}
          </div>
          <div className="rnc-timeline__content">
            <p className="rnc-timeline__label">{step.label}</p>
            {step.date && (
              <p className="rnc-timeline__date">{step.date}</p>
            )}
            {step.summary && (
              <p className="rnc-timeline__summary">{step.summary}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default RNCTimeline;
