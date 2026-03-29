import React from 'react';
import './RDOTimeline.css';

/* ──────────────────────────────────────────────────────────────
   KPI Cards — leitura rápida do dia
────────────────────────────────────────────────────────────── */
function KPICards({ rdo, maoObra, atividadesExecutadas, ocorrencias }) {
  const totalEquipe = (() => {
    const detalhada = Array.isArray(rdo?.mao_obra_detalhada) ? rdo.mao_obra_detalhada : [];
    if (detalhada.length > 0) return detalhada.length;
    if (maoObra && maoObra.length > 0) return maoObra.length;
    const d = Number(rdo?.mao_obra_direta || 0);
    const i = Number(rdo?.mao_obra_indireta || 0);
    const t = Number(rdo?.mao_obra_terceiros || 0);
    return d + i + t || null;
  })();

  const horas = rdo?.horas_trabalhadas != null
    ? String(rdo.horas_trabalhadas).replace('.', ',')
    : null;

  const atividadeCount = atividadesExecutadas?.length ?? (rdo?.atividades?.length ?? null);
  const ocorrenciaCount = ocorrencias?.length ?? null;

  const cards = [
    {
      label: 'Total Equipe',
      value: totalEquipe != null ? totalEquipe : '—',
      sub: totalEquipe != null ? 'colaborador' + (totalEquipe !== 1 ? 'es' : '') : 'sem registro',
    },
    {
      label: 'Horas Trabalhadas',
      value: horas != null ? horas : '—',
      sub: horas != null ? 'horas no dia' : 'sem registro',
    },
    {
      label: 'Atividades',
      value: atividadeCount != null ? atividadeCount : '—',
      sub: atividadeCount != null ? 'atividade' + (atividadeCount !== 1 ? 's' : '') + ' executada' + (atividadeCount !== 1 ? 's' : '') : 'sem registro',
    },
    {
      label: 'Ocorrências',
      value: ocorrenciaCount != null ? ocorrenciaCount : '—',
      sub: ocorrenciaCount != null
        ? (ocorrenciaCount === 0 ? 'nenhuma ocorrência' : ocorrenciaCount + ' registrada' + (ocorrenciaCount !== 1 ? 's' : ''))
        : 'sem registro',
      danger: ocorrenciaCount > 0,
    },
  ];

  return (
    <div className="rdo-kpi-grid">
      {cards.map((c) => (
        <div key={c.label} className="rdo-kpi-card">
          <span className="rdo-kpi-label">{c.label}</span>
          <span className={`rdo-kpi-value${c.danger ? ' danger' : ''}`}>{c.value}</span>
          <span className="rdo-kpi-sub">{c.sub}</span>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */
function formatTime(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function climaLabel(clima) {
  if (!clima) return null;
  const map = { Ensolarado: '☀️ Ensolarado', Nublado: '☁️ Nublado', Chuvoso: '🌧 Chuvoso', Ventoso: '💨 Ventoso' };
  return map[clima] || clima;
}

/* ──────────────────────────────────────────────────────────────
   Timeline
────────────────────────────────────────────────────────────── */
function RDOTimeline({ rdo, maoObra = [], atividadesExecutadas = [], ocorrencias = [], ferramentasRdo = [] }) {
  if (!rdo) return null;

  const events = [];

  /* 1 — Início da jornada */
  const horaInicio = formatTime(rdo.entrada_saida_inicio);
  events.push({
    key: 'inicio',
    dotClass: 'dot-start',
    time: horaInicio,
    heading: 'Início da Jornada',
    desc: horaInicio
      ? `Equipe iniciou atividades às ${horaInicio}h`
      : 'Equipe iniciou atividades no campo',
    tags: [],
  });

  /* 2 — Condições climáticas (apenas se houver dado) */
  const temClima = rdo.clima_manha || rdo.clima_tarde;
  if (temClima) {
    const parts = [];
    if (rdo.clima_manha) parts.push(`Manhã: ${climaLabel(rdo.clima_manha)}`);
    if (rdo.clima_tarde) parts.push(`Tarde: ${climaLabel(rdo.clima_tarde)}`);

    const praticabilidade = rdo.praticabilidade_manha || rdo.praticabilidade_tarde;
    const isPraticavel = praticabilidade === 'Praticável';
    const isImpraticavel = praticabilidade === 'Impraticável';

    events.push({
      key: 'clima',
      dotClass: isImpraticavel ? 'dot-warn' : 'dot-climate',
      time: null,
      heading: 'Condições Climáticas',
      desc: parts.join(' · '),
      tags: praticabilidade
        ? [{ label: praticabilidade, cls: isPraticavel ? 'tag-ok' : 'tag-warn' }]
        : [],
    });
  }

  /* 3 — Equipe presente (apenas se houver dados) */
  const equipeDetalhada = Array.isArray(rdo.mao_obra_detalhada) && rdo.mao_obra_detalhada.length > 0
    ? rdo.mao_obra_detalhada
    : maoObra;

  if (equipeDetalhada.length > 0) {
    const diretos = equipeDetalhada.filter(m => String(m.tipo || '').toLowerCase().includes('diret')).length;
    const indiretos = equipeDetalhada.filter(m => String(m.tipo || '').toLowerCase().includes('indiret')).length;
    const terceiros = equipeDetalhada.filter(m => String(m.tipo || '').toLowerCase().includes('tercei')).length;

    const subs = [];
    if (diretos > 0) subs.push({ label: `Diretos: ${diretos}`, cls: 'tag-info' });
    if (indiretos > 0) subs.push({ label: `Indiretos: ${indiretos}`, cls: '' });
    if (terceiros > 0) subs.push({ label: `Terceiros: ${terceiros}`, cls: '' });

    events.push({
      key: 'equipe',
      dotClass: 'dot-team',
      time: null,
      heading: 'Equipe Presente',
      desc: `${equipeDetalhada.length} colaborador${equipeDetalhada.length !== 1 ? 'es' : ''} no campo`,
      tags: subs,
    });
  } else {
    const totalRdo = Number(rdo.mao_obra_direta || 0) + Number(rdo.mao_obra_indireta || 0) + Number(rdo.mao_obra_terceiros || 0);
    if (totalRdo > 0) {
      events.push({
        key: 'equipe',
        dotClass: 'dot-team',
        time: null,
        heading: 'Equipe Presente',
        desc: `${totalRdo} colaborador${totalRdo !== 1 ? 'es' : ''} no campo`,
        tags: [],
      });
    }
  }

  /* 4 — Equipamentos (apenas se houver) */
  const equipamentos = (() => {
    if (ferramentasRdo.length > 0) return ferramentasRdo.map(f => f.ferramenta_nome || f.nome).filter(Boolean);
    if (Array.isArray(rdo.equipamentos) && rdo.equipamentos.length > 0)
      return rdo.equipamentos.map(e => e.nome || e.descricao || String(e)).filter(Boolean);
    if (typeof rdo.equipamentos === 'string' && rdo.equipamentos.trim())
      return [rdo.equipamentos];
    return [];
  })();

  if (equipamentos.length > 0) {
    events.push({
      key: 'equip',
      dotClass: 'dot-equip',
      time: null,
      heading: 'Equipamentos Utilizados',
      desc: `${equipamentos.length} equipamento${equipamentos.length !== 1 ? 's' : ''} ativo${equipamentos.length !== 1 ? 's' : ''} na obra`,
      tags: equipamentos.slice(0, 4).map(n => ({ label: n, cls: '' })),
    });
  }

  /* 5 — Atividades executadas (apenas se houver) */
  const atividades = atividadesExecutadas.length > 0
    ? atividadesExecutadas
    : (rdo.atividades || []);

  if (atividades.length > 0) {
    const concluidas = atividades.filter(a => Number(a.percentual_executado) >= 100).length;
    events.push({
      key: 'atividades',
      dotClass: 'dot-activity',
      time: null,
      heading: 'Atividades Executadas',
      desc: `${atividades.length} atividade${atividades.length !== 1 ? 's' : ''} trabalhada${atividades.length !== 1 ? 's' : ''}${concluidas > 0 ? `, ${concluidas} concluída${concluidas !== 1 ? 's' : ''}` : ''}`,
      tags: atividades.slice(0, 3).map(a => ({
        label: a.codigo_eap ? `${a.codigo_eap} ${a.descricao || ''}`.trim() : (a.descricao || 'Atividade'),
        cls: Number(a.percentual_executado) >= 100 ? 'tag-ok' : '',
      })),
    });
  }

  /* 6 — Ocorrências (apenas se houver) */
  if (ocorrencias.length > 0) {
    const alta = ocorrencias.filter(o => String(o.gravidade || '').toLowerCase() === 'alta').length;
    events.push({
      key: 'ocorrencias',
      dotClass: alta > 0 ? 'dot-danger' : 'dot-warn',
      time: null,
      heading: 'Ocorrências Registradas',
      desc: `${ocorrencias.length} ocorrência${ocorrencias.length !== 1 ? 's' : ''} no dia`,
      tags: ocorrencias.slice(0, 3).map(o => ({
        label: o.titulo || 'Ocorrência',
        cls: String(o.gravidade || '').toLowerCase() === 'alta' ? 'tag-danger'
          : String(o.gravidade || '').toLowerCase() === 'média' ? 'tag-warn'
          : 'tag-warn',
      })),
    });
  }

  /* 7 — Encerramento */
  const horaFim = formatTime(rdo.entrada_saida_fim);
  events.push({
    key: 'fim',
    dotClass: 'dot-end',
    time: horaFim,
    heading: 'Encerramento do Dia',
    desc: (() => {
      const parts = [];
      if (horaFim) parts.push(`Encerramiento às ${horaFim}h`);
      if (rdo.horas_trabalhadas) parts.push(`${rdo.horas_trabalhadas}h trabalhadas`);
      return parts.length > 0 ? parts.join(' · ') : 'Jornada encerrada';
    })(),
    tags: [],
  });

  return (
    <div className="rdo-timeline-wrapper">
      <p className="rdo-timeline-title">Cronologia do Dia</p>
      <ul className="rdo-timeline-list">
        {events.map((ev) => (
          <li key={ev.key} className="rdo-tl-item">
            <span className={`rdo-tl-dot ${ev.dotClass}`} />
            <div className="rdo-tl-content">
              {ev.time && <p className="rdo-tl-time">{ev.time}</p>}
              <p className="rdo-tl-heading">{ev.heading}</p>
              <p className="rdo-tl-desc">{ev.desc}</p>
              {ev.tags.length > 0 && (
                <div className="rdo-tl-tags">
                  {ev.tags.map((tag, i) => (
                    <span key={i} className={`rdo-tl-tag ${tag.cls || ''}`}>{tag.label}</span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { KPICards, RDOTimeline };
export default RDOTimeline;
