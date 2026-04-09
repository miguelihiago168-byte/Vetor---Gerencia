import React, { useEffect, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import './GanttSidebar.css';

/**
 * Componente GanttSidebar
 * Exibe um gráfico de Gantt em uma sidebar deslizável
 * Mostra atividades, dependências, caminho crítico e folgas
 */
const GanttSidebar = ({ isOpen, onClose, dadosGantt, caminhoCritico, folgas, embedded = false }) => {
  const [dados, setDados] = useState([]);
  const [escalaMin, setEscalaMin] = useState(0);
  const [escalaMax, setEscalaMax] = useState(100);
  const [tooltip, setTooltip] = useState(null);

  const isValidDate = (value) => {
    if (!value) return false;
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
  };

  const parseDateOnly = (value) => {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const isBusinessDay = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    const dayOfWeek = date.getDay();
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  };

  const countBusinessDaysInclusive = (startValue, endValue) => {
    const start = parseDateOnly(startValue);
    const end = parseDateOnly(endValue);
    if (!start || !end || end < start) return 0;

    const cursor = new Date(start.getTime());
    let total = 0;

    while (cursor <= end) {
      if (isBusinessDay(cursor)) total += 1;
      cursor.setDate(cursor.getDate() + 1);
    }

    return Math.max(1, total);
  };

  const countBusinessDaysOffset = (baseValue, targetValue) => {
    const base = parseDateOnly(baseValue);
    const target = parseDateOnly(targetValue);
    if (!base || !target || target <= base) return 0;

    const cursor = new Date(base.getTime());
    let total = 0;

    while (cursor < target) {
      cursor.setDate(cursor.getDate() + 1);
      if (isBusinessDay(cursor)) total += 1;
    }

    return total;
  };

  const formatDateBR = (value) => {
    if (!value) return '-';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    if (!isValidDate(value)) return '-';
    return new Date(value).toLocaleDateString('pt-BR');
  };

  useEffect(() => {
    if (dadosGantt && dadosGantt.atividades) {
      const atividadesValidas = dadosGantt.atividades
      .filter((at) => isValidDate(at.data_inicio) && isValidDate(at.data_fim));

      if (atividadesValidas.length === 0) {
        setDados([]);
        setEscalaMin(0);
        setEscalaMax(30);
        return;
      }

      const idsParaNome = new Map(
        dadosGantt.atividades.map((atividade) => [
          atividade.id,
          atividade.codigo_eap ? `${atividade.codigo_eap} - ${atividade.nome}` : atividade.nome
        ])
      );

      const dataBase = atividadesValidas.reduce((menor, atividade) => {
        const dataAtual = parseDateOnly(atividade.data_inicio);
        return dataAtual < menor ? dataAtual : menor;
      }, parseDateOnly(atividadesValidas[0].data_inicio));

      const atividadesProcesadas = atividadesValidas.map(at => {
        const diasDoInicio = countBusinessDaysOffset(dataBase, at.data_inicio);
        const diasDuracao = countBusinessDaysInclusive(at.data_inicio, at.data_fim);

        return {
          id: at.id,
          nome: at.nome,
          nomeExibicao: at.codigo_eap ? `${at.codigo_eap} ${at.nome}` : at.nome,
          dataInicio: at.data_inicio,
          dataFim: at.data_fim,
          diasDoInicio,
          deslocamento: diasDoInicio,
          diasDuracao,
          percentual: at.percentual_executado || 0,
          status: at.status,
          noCaminhoCritico: at.no_caminho_critico,
          atrasado: at.atrasado,
          folga: folgas ? folgas[at.id] || 0 : 0,
          predecessoras: (at.dependencias || []).map((dependencia) => idsParaNome.get(dependencia.origem_id) || `#${dependencia.origem_id}`),
          predecessorasIds: (at.dependencias || []).map((dependencia) => dependencia.origem_id)
        };
      });

      setDados(atividadesProcesadas);

      // Calcular escala (dias do primeiro ao último)
      const diasDoInicio = Math.min(...atividadesProcesadas.map(a => a.deslocamento));
      const diasDoFim = Math.max(...atividadesProcesadas.map(a => a.deslocamento + a.diasDuracao));

      setEscalaMin(diasDoInicio);
      setEscalaMax(diasDoFim + 1);
    }
  }, [dadosGantt, folgas]);

  const getCor = (atividade) => {
    if (atividade.percentual >= 100) return '#4caf50';  // Verde — Concluída
    if (atividade.atrasado) return '#dc2626';           // Vermelho — Atrasada
    if (atividade.noCaminhoCritico) return '#ff9800';   // Laranja — Crítica
    return '#2196f3';                                   // Azul — Normal
  };

  const calcularPosicaoTooltip = (rect, container) => {
    const tooltipWidth = 300;
    const tooltipHeight = 98;
    const margem = 10;

    if (!container) {
      return { x: margem, y: margem };
    }

    const containerRect = container.getBoundingClientRect();
    const maxX = Math.max(margem, container.clientWidth - tooltipWidth - margem);
    const maxY = Math.max(margem, container.clientHeight - tooltipHeight - margem);

    let x = (rect.left - containerRect.left) + (rect.width / 2) - (tooltipWidth / 2);
    x = Math.max(margem, Math.min(x, maxX));

    let y = (rect.top - containerRect.top) - tooltipHeight - 10;
    if (y < margem) {
      y = (rect.bottom - containerRect.top) + 10;
    }
    y = Math.max(margem, Math.min(y, maxY));

    return { x, y };
  };

  return (
    <div className={`gantt-sidebar ${embedded ? 'gantt-embedded' : (isOpen ? 'aberto' : 'fechado')}`}>
      {/* Header da Sidebar */}
      <div className="gantt-header">
        <div className="gantt-titulo">
          <h3>Cronograma (Gantt)</h3>
          <p>Visualização de dependências e caminho crítico</p>
        </div>
        {!embedded && (
          <button className="gantt-close" onClick={onClose}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Conteúdo do Gantt */}
      <div className="gantt-content">
        {!dados || dados.length === 0 ? (
          <div className="gantt-vazio">
            <AlertCircle size={32} />
            <p>Nenhuma atividade com cronograma disponível</p>
          </div>
        ) : (
          <>
            {/* Legenda */}
            <div className="gantt-legenda">
              <div className="legenda-item">
                <div className="legenda-cor" style={{ backgroundColor: '#4caf50' }}></div>
                <span>Concluída</span>
              </div>
              <div className="legenda-item">
                <div className="legenda-cor" style={{ backgroundColor: '#2196f3' }}></div>
                <span>Normal</span>
              </div>
              <div className="legenda-item">
                <div className="legenda-cor" style={{ backgroundColor: '#ff9800' }}></div>
                <span>Crítico</span>
              </div>
              <div className="legenda-item">
                <div className="legenda-cor" style={{ backgroundColor: '#dc2626' }}></div>
                <span>Atrasado</span>
              </div>
            </div>

            {/* Gráfico Gantt SVG */}
            <div className="gantt-grafico" style={{ position: 'relative' }}>
              <GanttChartSVG
                dados={dados}
                escalaMin={escalaMin}
                escalaMax={escalaMax}
                getCor={getCor}
                formatDateBR={formatDateBR}
                calcularPosicaoTooltip={calcularPosicaoTooltip}
                setTooltip={setTooltip}
              />
              {tooltip && (
                <div className="gantt-tooltip" style={{ top: tooltip.y, left: tooltip.x }}>
                  <strong>{tooltip.atividade.nomeExibicao}</strong>
                  <div>{formatDateBR(tooltip.atividade.dataInicio)} até {formatDateBR(tooltip.atividade.dataFim)}</div>
                  <div>{tooltip.atividade.diasDuracao} dias · {tooltip.atividade.percentual.toFixed(0)}% concluído</div>
                  {tooltip.atividade.predecessoras.length > 0 && (
                    <div>Predecessora: {tooltip.atividade.predecessoras.join(', ')}</div>
                  )}
                </div>
              )}
            </div>

            {/* Informações adicionais */}
            <div className="gantt-info">
              {caminhoCritico && caminhoCritico.caminhoCritico && (
                <div className="info-item">
                  <h4>Caminho Crítico</h4>
                  <p>
                    {Array.isArray(caminhoCritico.caminhoCritico) && caminhoCritico.caminhoCritico.length > 0
                      ? `${caminhoCritico.caminhoCritico.length} atividades`
                      : 'Sem dependências confirmadas'}
                  </p>
                  <p className="data-conclusao">
                    Duração estimada: {Number(caminhoCritico.dataConclusao || 0)} dias
                  </p>
                </div>
              )}

              <div className="info-item">
                <h4>Resumo</h4>
                <ul>
                  <li>Total de atividades: {dados.length}</li>
                  <li>
                    Atividades críticas:{' '}
                    {dados.filter(a => a.noCaminhoCritico).length}
                  </li>
                  <li>
                    Atividades atrasadas:{' '}
                    {dados.filter(a => a.atrasado).length}
                  </li>
                </ul>
              </div>
            </div>

            {/* Detalhes das Atividades */}
            <div className="gantt-detalhes">
              <h4>Detalhes das Atividades</h4>
              <div className="detalhes-lista">
                {dados.map(at => (
                  <div key={at.id} className="detalhe-item" style={{ borderLeftColor: getCor(at) }}>
                    <div className="detalhe-col-nome">
                      <div className="detalhe-cor" style={{ backgroundColor: getCor(at) }}></div>
                      <span className="detalhe-nome">{at.nome}</span>
                      {at.percentual >= 100 && <span className="badge-concluida">Concluída</span>}
                      {at.noCaminhoCritico && at.percentual < 100 && <span className="badge-critico">Crítico</span>}
                      {at.atrasado && at.percentual < 100 && <span className="badge-atrasado">Atrasado</span>}
                    </div>
                    <div className="detalhe-col-datas">
                      <small>{formatDateBR(at.dataInicio)} até {formatDateBR(at.dataFim)}</small>
                    </div>
                    <div className="detalhe-col-pred">
                      {at.predecessoras.length > 0 && (
                        <small>Predecessora: {at.predecessoras.join(', ')}</small>
                      )}
                    </div>
                    <div className="detalhe-col-pct">
                      <small>{at.percentual.toFixed(1)}%</small>
                    </div>
                    <div className="detalhe-col-folga">
                      {at.folga > 0 && <small>Folga: {at.folga} dias</small>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer da Sidebar */}
      <div className="gantt-footer">
        <small>
          Última atualização: {new Date().toLocaleTimeString('pt-BR')}
        </small>
      </div>
    </div>
  );
};

/* ─── SVG Gantt Chart com setas de dependência ─── */

const MARGIN_LEFT = 200;
const ROW_HEIGHT = 38;
const HEADER_HEIGHT = 28;
const MIN_PIXELS_PER_DAY = 8;

const GanttChartSVG = ({ dados, escalaMin, escalaMax, getCor, formatDateBR, calcularPosicaoTooltip, setTooltip }) => {
  const totalDays = Math.max(escalaMax - escalaMin, 1);
  const pixelsPerDay = Math.max(Math.floor(800 / totalDays), MIN_PIXELS_PER_DAY);
  const plotWidth = totalDays * pixelsPerDay;
  const svgWidth = MARGIN_LEFT + plotWidth + 20;
  const svgHeight = HEADER_HEIGHT + dados.length * ROW_HEIGHT + 2;

  // Mapa de índice de linha por id (para calcular posição das setas)
  const rowIndexById = {};
  dados.forEach((d, i) => { rowIndexById[d.id] = i; });

  // Ticks do eixo X (máx 15 ticks)
  const tickStep = Math.max(1, Math.ceil(totalDays / 15));
  const ticks = [];
  for (let t = 0; t <= totalDays; t += tickStep) ticks.push(escalaMin + t);

  const getBarX = (d) => MARGIN_LEFT + (d.deslocamento - escalaMin) * pixelsPerDay;
  const getBarW = (d) => Math.max(d.diasDuracao * pixelsPerDay, 4);
  const getBarY = (i) => HEADER_HEIGHT + i * ROW_HEIGHT + 6;
  const barH = ROW_HEIGHT - 12;
  const getRowCenterY = (i) => HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2;

  // Gerar paths das setas de dependência (saem do fim da predecessora ao início da sucessora)
  const arrows = [];
  dados.forEach((d, destIdx) => {
    (d.predecessorasIds || []).forEach((predId) => {
      const srcIdx = rowIndexById[predId];
      if (srcIdx === undefined) return;
      const pred = dados[srcIdx];
      const sx = getBarX(pred) + getBarW(pred);
      const sy = getRowCenterY(srcIdx);
      const dx = getBarX(d);
      const dy = getRowCenterY(destIdx);
      let path;
      if (sx + 4 <= dx) {
        // Caminho direto com cotovelo
        const elbowX = sx + Math.max(6, (dx - sx) * 0.5);
        path = `M${sx},${sy} L${elbowX},${sy} L${elbowX},${dy} L${dx},${dy}`;
      } else {
        // Predecessora está à direita ou muito próxima — contorna pela esquerda
        const farX = Math.max(sx, dx) + 16;
        path = `M${sx},${sy} L${farX},${sy} L${farX},${dy} L${dx},${dy}`;
      }
      arrows.push({ path, key: `${predId}-${d.id}` });
    });
  });

  return (
    <div className="gantt-svg-container">
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ fontFamily: 'sans-serif', display: 'block', minWidth: svgWidth }}
      >
        <defs>
          <marker id="gantt-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill="#888" />
          </marker>
        </defs>

        {/* Grade vertical e labels do eixo X */}
        {ticks.map((t) => {
          const x = MARGIN_LEFT + (t - escalaMin) * pixelsPerDay;
          return (
            <g key={t}>
              <line x1={x} y1={HEADER_HEIGHT} x2={x} y2={svgHeight} stroke="#e8e8e8" />
              <text x={x} y={HEADER_HEIGHT - 6} textAnchor="middle" fontSize={10} fill="#999">
                {`D${t}`}
              </text>
            </g>
          );
        })}

        {/* Linha separadora vertical entre labels e barras */}
        <line x1={MARGIN_LEFT} y1={0} x2={MARGIN_LEFT} y2={svgHeight} stroke="#d0d0d0" strokeWidth={1} />

        {/* Linha separadora do header */}
        <line x1={0} y1={HEADER_HEIGHT} x2={svgWidth} y2={HEADER_HEIGHT} stroke="#ddd" />

        {/* Linhas de atividades */}
        {dados.map((d, i) => {
          const y = HEADER_HEIGHT + i * ROW_HEIGHT;
          const bx = getBarX(d);
          const bw = getBarW(d);
          const by = getBarY(i);
          const cor = getCor(d);
          const progW = Math.min(Math.max((d.percentual / 100) * bw, 0), bw);
          const label = d.nomeExibicao.length > 26 ? d.nomeExibicao.slice(0, 24) + '…' : d.nomeExibicao;
          return (
            <g key={d.id}>
              {/* Fundo alternado */}
              <rect x={0} y={y} width={svgWidth} height={ROW_HEIGHT} fill={i % 2 === 0 ? '#fafafa' : '#f2f2f2'} />
              {/* Indicador de cor na margem esquerda */}
              <rect x={0} y={y + 6} width={3} height={ROW_HEIGHT - 12} rx={1} fill={cor} opacity={0.7} />
              {/* Label da atividade — alinhado à esquerda */}
              <text x={8} y={y + ROW_HEIGHT / 2 + 4} textAnchor="start" fontSize={11} fill="#333">
                {label}
              </text>
              {/* Fundo translúcido (duração planejada) */}
              <rect x={bx} y={by} width={bw} height={barH} rx={3} fill={cor} opacity={0.18} />
              {/* Progresso preenchido */}
              {progW > 0 && <rect x={bx} y={by} width={progW} height={barH} rx={3} fill={cor} opacity={0.85} />}
              {/* Borda da barra */}
              <rect x={bx} y={by} width={bw} height={barH} rx={3} fill="none" stroke={cor} strokeWidth={1.5} />
              {/* Área de hover transparente */}
              <rect
                x={bx} y={by} width={bw} height={barH}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const container = e.currentTarget.closest('.gantt-grafico');
                  const posicao = calcularPosicaoTooltip(rect, container);
                  setTooltip({
                    x: posicao.x,
                    y: posicao.y,
                    atividade: d
                  });
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const container = e.currentTarget.closest('.gantt-grafico');
                  const posicao = calcularPosicaoTooltip(rect, container);
                  setTooltip({
                    x: posicao.x,
                    y: posicao.y,
                    atividade: d
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            </g>
          );
        })}

        {/* Setas de dependência (renderizadas por cima das barras) */}
        {arrows.map(({ path, key }) => (
          <path
            key={key}
            d={path}
            fill="none"
            stroke="#888"
            strokeWidth={1.5}
            markerEnd="url(#gantt-arrow)"
          />
        ))}
      </svg>
    </div>
  );
};

export default GanttSidebar;
