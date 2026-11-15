import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ClipboardList, GitBranch, X } from 'lucide-react';
import { prepararPrioridades } from '../pages/analiseCronogramaUtils';
import './AnaliseCronograma.css';

const data = value => {
  if (!value) return 'não informada';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};
const numero = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const nome = a => [a.codigo_eap, a.nome].filter(Boolean).join(' · ');

function ListaDependencias({ titulo, itens }) {
  const [expandida, setExpandida] = useState(false);
  if (!itens.length) return null;
  const visiveis = expandida ? itens : itens.slice(0, 3);
  return <section className="analise-dependency-group">
    <h5>{titulo} <span>{itens.length}</span></h5>
    <ul className={`analise-dependency-list ${expandida ? 'is-expanded' : ''}`}>
      {visiveis.map(item => <li key={item.id}><span className="analise-dependency-code">{item.codigo_eap || '—'}</span><span>{item.nome || 'Atividade sem nome'}</span></li>)}
    </ul>
    {itens.length > 3 && <button type="button" className="analise-dependency-toggle" onClick={() => setExpandida(value => !value)}>{expandida ? 'Mostrar menos' : `Ver mais ${itens.length - 3}`}</button>}
  </section>;
}

export default function AnaliseCronograma({ analise, atividades, onClose }) {
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const fecharRef = useRef(null);
  const { prioridades, agrupadoras } = useMemo(() => prepararPrioridades(analise, atividades), [analise, atividades]);
  const criticas = prioridades.filter(a => a.no_caminho_critico).length;
  const bloqueadas = prioridades.filter(a => a.bloqueios.length).length;
  const visiveis = mostrarTodas ? prioridades : prioridades.slice(0, 3);

  useEffect(() => {
    const anterior = document.activeElement;
    fecharRef.current?.focus();
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); anterior?.focus(); };
  }, [onClose]);

  return <div className="analise-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="analise-dialog" role="dialog" aria-modal="true" aria-labelledby="analise-titulo">
      <header className="analise-header">
        <div><span className="analise-kicker"><ClipboardList size={15} /> Planejamento da obra</span><h2 id="analise-titulo">Análise do cronograma</h2><p>Prioridades e próximos passos para recuperar o prazo</p></div>
        <button ref={fecharRef} type="button" className="analise-close" aria-label="Fechar análise" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="analise-body">
        <div className="analise-overview">
          <div className="analise-overview-copy"><span>Diagnóstico · {data(analise.data_referencia)}</span><h3>{prioridades.length ? `${prioridades.length} ${prioridades.length === 1 ? 'atividade precisa' : 'atividades precisam'} de atenção` : 'Nenhuma atividade executável atrasada'}</h3><p>{prioridades.length ? 'Comece pelo caminho crítico e verifique os bloqueios antes de definir uma nova data.' : 'Acompanhe as datas e dependências para manter o planejamento atualizado.'}</p></div>
          <div className="analise-metrics"><div><strong>{prioridades.length}</strong><span>Atrasadas</span></div><div><strong>{criticas}</strong><span>No caminho crítico</span></div><div><strong>{bloqueadas}</strong><span>Com predecessoras pendentes</span></div></div>
        </div>
        {agrupadoras > 0 && <p className="analise-note">{agrupadoras} {agrupadoras === 1 ? 'atividade agrupadora foi omitida' : 'atividades agrupadoras foram omitidas'} para evitar repetir etapas e suas atividades. Os totais acima consideram apenas atividades executáveis.</p>}
        {!prioridades.length && agrupadoras > 0 && <p className="analise-note">Há atraso em etapas agrupadoras; confira as datas das atividades filhas na EAP.</p>}
        <section className="analise-prioridades">
          <div className="analise-section-title"><div><span>ONDE AGIR</span><h3>Plano de ação sugerido</h3><p>Ordenado por caminho crítico, quantidade de sucessoras abertas e dias de atraso.</p></div><span className="analise-count">{prioridades.length} {prioridades.length === 1 ? 'atividade' : 'atividades'}</span></div>
          {prioridades.length === 0 ? <div className="analise-empty"><CheckCircle2 size={25} /><strong>Sem ações de recuperação para listar</strong><span>Revise o planejamento sempre que houver mudanças na obra.</span></div> : <div className="analise-list">
            {visiveis.map((a, index) => <article className="analise-card" key={a.id}>
              <div className="analise-card-head"><span className="analise-rank">{String(index + 1).padStart(2, '0')}</span><div className="analise-card-name"><div className="analise-tags">{a.no_caminho_critico && <span className="analise-tag critical"><GitBranch size={13} /> Caminho crítico</span>}<span className="analise-tag late"><AlertTriangle size={13} /> {numero(a.dias_atraso)} dias de atraso</span></div><h4>{nome(a)}</h4></div></div>
              <div className="analise-card-facts"><div><span>Fim planejado</span><strong>{data(a.data_fim_planejada)}</strong></div><div><span>Executado</span><strong>{numero(a.percentual_executado)}%</strong></div><div><span>Restante estimado</span><strong>{a.quantidade_restante != null ? `${numero(a.quantidade_restante)} ${a.unidade_medida || ''}` : `${numero(a.percentual_restante)}%`}</strong></div><div><span>Sucessoras abertas</span><strong>{a.sucessorasAbertas.length}</strong></div></div>
              <div className="analise-action"><strong><ArrowRight size={16} /> Próximos passos</strong><ol>
                {a.bloqueios.length > 0 ? <li>Verifique a liberação de {a.bloqueios.length} {a.bloqueios.length === 1 ? 'predecessora pendente' : 'predecessoras pendentes'} antes de confirmar a execução.</li> : <li>Confirme com a equipe a causa do atraso, os recursos disponíveis e o saldo a executar.</li>}
                <li>Defina uma nova data de conclusão com o responsável e valide a capacidade de execução.</li>
                {a.sucessorasAbertas.length > 0 ? <li>Confira primeiro as próximas atividades vinculadas e avalie se a nova data afeta suas programações.</li> : <li>Atualize o avanço e acompanhe a nova data acordada.</li>}
              </ol></div>
              {(a.bloqueios.length > 0 || a.sucessorasAbertas.length > 0) && <details className="analise-details"><summary>Ver dependências <ChevronDown size={15} /></summary><div className="analise-dependencies"><ListaDependencias titulo="Predecessoras pendentes" itens={a.bloqueios} /><ListaDependencias titulo="Sucessoras abertas na cadeia" itens={a.sucessorasAbertas} /><small>Inclui vínculos indiretos; a relação não confirma impacto no prazo.</small></div></details>}
            </article>)}
          </div>}
          {prioridades.length > 3 && <button type="button" className="analise-more" onClick={() => setMostrarTodas(v => !v)}>{mostrarTodas ? 'Mostrar menos' : `Ver todas as ${prioridades.length} atividades`} <ChevronDown size={16} /></button>}
        </section>
        <details className="analise-suggestions"><summary><div><strong>Sugestões de dependências</strong><span>{numero(analise.resumo?.total_sugestoes_dependencias)} sugestões para revisão</span></div><ChevronDown size={18} /></summary><div className="analise-suggestions-body"><p>Sugestões precisam ser conferidas antes de confirmar vínculos na EAP.</p>{(analise.sugestoes_dependencias || []).length ? (analise.sugestoes_dependencias || []).map(s => <p key={`${s.id_origem}_${s.id_destino}`}><strong>{s.nome_origem}</strong> → <strong>{s.nome_destino}</strong> · {s.tipo_vinculo_recomendado}</p>) : <p>Nenhuma sugestão disponível.</p>}</div></details>
        <p className="analise-disclaimer">Orientações geradas a partir dos dados do cronograma. Valide prazos, equipe e recursos antes de tomar decisões.</p>
      </div>
    </div>
  </div>;
}
