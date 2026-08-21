import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import CockpitReturnButton from '../components/CockpitReturnButton';
import Button from '../components/ui/Button';
import {
  getRDO,
  listRdoMaoObra,
  getAnexos,
  executeRdoWorkflow,
  getUploadUrl
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CloudSun,
  ClipboardList,
  Download,
  CheckCircle2,
  XCircle,
  RotateCcw,
  File,
  FileImage,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Package,
  Paperclip,
  User,
  Users,
  Wrench
} from 'lucide-react';
import { KPICards } from '../components/RDOTimeline';
import './RDO.css';

const formatLocalDate = (dstr) => {
  if (!dstr) return 'N/A';
  const m = String(dstr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return dt.toLocaleDateString('pt-BR');
  }
  const dt = new Date(dstr);
  return isNaN(dt.getTime()) ? dstr : dt.toLocaleDateString('pt-BR');
};

const statusLabel = (s) => {
  if (s === 'Em aprovação do gestor') return 'Aguardando aprovação do gestor';
  if (s === 'Em aprovação do fiscal') return 'Aguardando aprovação do fiscal';
  if (s === 'Em preenchimento') return 'Em preenchimento';
  return s || 'N/A';
};

const statusClass = (s) => {
  const normalized = String(s || '').toLowerCase();
  if (normalized === 'aprovado') return 'is-approved';
  if (normalized.includes('aprovação') || normalized.includes('aprovacao') || normalized.includes('analise') || normalized.includes('análise')) return 'is-review';
  if (normalized.includes('preench')) return 'is-draft';
  if (normalized.includes('reprov')) return 'is-rejected';
  return 'is-neutral';
};

const arrayOf = (value) => (Array.isArray(value) ? value : []);

const valueOrDash = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return value;
};

const formatBytes = (value) => {
  const size = Number(value || 0);
  if (!size) return 'Tamanho não informado';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const toMinutes = (time) => {
  const match = String(time || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const calculateHours = (item) => {
  if (item.horas || item.horas_trabalhadas) return item.horas || item.horas_trabalhadas;
  const start = toMinutes(item.entrada);
  const end = toMinutes(item.saida_final);
  const breakStart = toMinutes(item.saida_almoco);
  const breakEnd = toMinutes(item.retorno_almoco);
  if (start === null || end === null || end <= start) return 0;
  let total = end - start;
  if (breakStart !== null && breakEnd !== null && breakEnd > breakStart) {
    total -= breakEnd - breakStart;
  }
  return Math.round((Math.max(0, total) / 60) * 100) / 100;
};

const getAttachmentKind = (anexo) => {
  const name = String(anexo.nome_arquivo || anexo.nome_original || anexo.nome || '').toLowerCase();
  const type = String(anexo.tipo || anexo.mime_type || '').toLowerCase();
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (type.includes('image') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) return 'image';
  return 'file';
};

const getAttachmentIcon = (kind) => {
  if (kind === 'pdf') return FileText;
  if (kind === 'image') return FileImage;
  return File;
};

const Section = ({ icon: Icon, title, count, children }) => (
  <section className="rdo-report-section">
    <div className="rdo-report-section-head">
      <div className="rdo-report-section-title">
        {Icon && (
          <span className="rdo-report-section-icon">
            <Icon size={17} />
          </span>
        )}
        <h2>{title}</h2>
      </div>
      {count !== undefined && <span className="rdo-report-count">{count}</span>}
    </div>
    <div className="rdo-report-section-body">{children}</div>
  </section>
);

const EmptyState = ({ children }) => (
  <div className="rdo-report-empty">{children}</div>
);

function RDODetalhes() {
  const { projetoId, rdoId } = useParams();
  const { perfil } = useAuth();
  const { alert } = useDialog();

  const canDecidirGestor = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade'].includes(perfil);
  const canDecidirFiscal = perfil === 'Fiscal';

  const [rdo, setRdo] = useState(null);
  const [sucesso, setSucesso] = useState('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [maoObra, setMaoObra] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [ocorrencias, setOcorrencias] = useState([]);
  const [anexos, setAnexos] = useState([]);
  const [comentarios, setComentarios] = useState([]);
  const [showSolicitarCorrecaoModal, setShowSolicitarCorrecaoModal] = useState(false);
  const [acaoDevolucao, setAcaoDevolucao] = useState('SOLICITAR_CORRECAO');
  const [textoCorrecao, setTextoCorrecao] = useState('');
  const [isEnviandoCorrecao, setIsEnviandoCorrecao] = useState(false);

  useEffect(() => {
    carregarDados();
  }, [rdoId]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      setErro('');

      const results = await Promise.allSettled([
        getRDO(rdoId),
        listRdoMaoObra(rdoId),
        getAnexos(rdoId)
      ]);

      const [rdoRes, maoObraRes, anexosRes] = results;

      if (rdoRes.status === 'fulfilled') {
        const rdoData = rdoRes.value.data;
        setRdo(rdoData);
        setComentarios(arrayOf(rdoData?.comentarios));
        setMateriais(arrayOf(rdoData?.materiais));
        setOcorrencias(arrayOf(rdoData?.ocorrencias));
      } else {
        const err = rdoRes.reason;
        const msg = err?.response?.data?.erro || err?.message || 'RDO não encontrado';
        setErro(msg);
        setRdo(null);
        return;
      }

      setMaoObra(maoObraRes.status === 'fulfilled' ? arrayOf(maoObraRes.value.data) : []);
      setAnexos(anexosRes.status === 'fulfilled' ? arrayOf(anexosRes.value.data) : []);
    } catch (error) {
      console.error('Erro ao carregar RDO:', error);
      const msg = error.response?.data?.erro || error.message || 'Erro ao carregar RDO';
      setErro(msg);
    } finally {
      setLoading(false);
    }
  };

  const numeroRdoRaw = String(rdo?.numero_rdo ?? rdo?.id ?? '').trim();
  const numeroRdoMatch = numeroRdoRaw.match(/(\d+)$/);
  const numeroRdoExibicao = String(Number(numeroRdoMatch?.[1] || numeroRdoRaw || rdo?.id || 0) || rdo?.id || '').padStart(3, '0');

  const handleDownloadPDF = async () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const url = token
      ? `/api/rdos/${rdoId}/pdf?token=${encodeURIComponent(token)}`
      : `/api/rdos/${rdoId}/pdf`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `RDO-${numeroRdoExibicao}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const aprovarRDO = async (acao) => {
    try {
      const resp = await executeRdoWorkflow(rdoId, acao);
      setRdo(prev => ({ ...prev, status: resp.data?.status, correcao_solicitada: 0 }));
      setSucesso(resp.data?.mensagem || 'RDO aprovado com sucesso.');
    } catch (error) {
      await alert({ title: 'Erro', message: 'Falha ao aprovar RDO: ' + (error.response?.data?.erro || error.message) });
    }
  };

  const voltarAprovadoParaCorrecao = async () => {
    try {
      const resp = await executeRdoWorkflow(rdoId, 'VOLTAR_APROVADO_PARA_CORRECAO');
      setRdo(prev => ({ ...prev, status: resp.data?.status, correcao_solicitada: 1, correcao_motivo: null }));
      setSucesso(resp.data?.mensagem || 'RDO aprovado devolvido para correção.');
      carregarDados();
    } catch (error) {
      await alert({ title: 'Erro', message: 'Falha ao voltar o RDO para correção: ' + (error.response?.data?.erro || error.message) });
    }
  };

  const solicitarCorrecaoRDO = async () => {
    try {
      if (!textoCorrecao.trim()) {
        await alert({ title: 'Aviso', message: 'Por favor, descreva a correção solicitada.' });
        return;
      }

      setIsEnviandoCorrecao(true);
      const resp = await executeRdoWorkflow(rdoId, acaoDevolucao, textoCorrecao.trim());
      setRdo(prev => ({ ...prev, status: resp.data?.status, correcao_solicitada: 1, correcao_motivo: textoCorrecao.trim() }));
      setTextoCorrecao('');
      setShowSolicitarCorrecaoModal(false);
      setSucesso(resp.data?.mensagem || 'RDO devolvido para correção.');
      carregarDados();
    } catch (error) {
      await alert({ title: 'Erro', message: 'Falha ao solicitar correção: ' + (error.response?.data?.erro || error.message) });
    } finally {
      setIsEnviandoCorrecao(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
        </div>
      </>
    );
  }

  if (!rdo) {
    return (
      <>
        <Navbar />
        <div className="container">
          <div className="alert alert-error">{erro || 'RDO não encontrado'}</div>
          <div className="rdo-report-inline-actions">
            <CockpitReturnButton fallbackTo={`/projeto/${projetoId}/rdos`} />
            <button className="btn btn-primary" onClick={carregarDados}>
              Recarregar
            </button>
          </div>
        </div>
      </>
    );
  }

  const fotos = arrayOf(rdo.fotos);
  const anexosLista = anexos.length > 0 ? anexos : arrayOf(rdo.anexos);
  const maoObraLista = arrayOf(rdo.mao_obra_detalhada).length > 0 ? arrayOf(rdo.mao_obra_detalhada) : maoObra;
  const equipamentosLista = arrayOf(rdo.equipamentos_lista);
  const atividadesEap = arrayOf(rdo.atividades).map(item => ({ ...item, tipo_relatorio: 'EAP' }));
  const atividadesAvulsas = arrayOf(rdo.atividades_avulsas).map(item => ({
    ...item,
    tipo_relatorio: 'Avulsa',
    descricao: item.descricao || item.atividade || item.nome
  }));
  const atividadesRelatorio = [...atividadesEap, ...atividadesAvulsas];
  const cidadeUf = [rdo.cidade, rdo.uf].filter(Boolean).join(' - ') || 'N/A';
  const horarioInicio = rdo.horario_inicio || rdo.entrada_saida_inicio || rdo.inicio_jornada;
  const horarioFim = rdo.horario_fim || rdo.entrada_saida_fim || rdo.fim_jornada;
  const intervaloInicio = rdo.intervalo_almoco_inicio;
  const intervaloFim = rdo.intervalo_almoco_fim;
  const intervalo = intervaloInicio && intervaloFim
    ? `${intervaloInicio} às ${intervaloFim}`
    : (rdo.intervalo || rdo.intervalo_almoco || rdo.horario_intervalo);

  return (
    <>
      <Navbar />
      <main className="container rdo-report-page">
        <div className="rdo-report-hero">
          <div className="rdo-report-hero-main">
            <CockpitReturnButton fallbackTo={`/projeto/${projetoId}/rdos`} className="btn rdo-report-back-btn" />
            <div className="rdo-report-title-block">
              {(rdo.logo_empresa_responsavel || rdo.logo_empresa_executante) && (
                <div className="rdo-company-brands rdo-report-company-brands">
                  {rdo.logo_empresa_responsavel && <div className="rdo-company-brand">
                    <img src={getUploadUrl(rdo.logo_empresa_responsavel)} alt={`Logo ${rdo.empresa_responsavel}`} />
                    <div><span>Contratante</span><strong>{rdo.empresa_responsavel}</strong></div>
                  </div>}
                  {rdo.logo_empresa_executante && <div className="rdo-company-brand">
                    <img src={getUploadUrl(rdo.logo_empresa_executante)} alt={`Logo ${rdo.empresa_executante}`} />
                    <div><span>Executante</span><strong>{rdo.empresa_executante}</strong></div>
                  </div>}
                </div>
              )}
              <div className="rdo-report-eyebrow">Relatório diário de obra</div>
              <div className="rdo-report-title-row">
                <h1>RDO {numeroRdoExibicao}</h1>
              </div>
              <div className="rdo-report-status-row">
                <span>Status</span>
                <strong className={`rdo-report-status ${statusClass(rdo.status)}`}>{statusLabel(rdo.status)}</strong>
              </div>
            </div>
          </div>

          <div className="rdo-report-actions">
            <Button tone="primary" variant="outline" startIcon={Download} className="rdo-view-action-btn" onClick={handleDownloadPDF}>PDF</Button>
            {canDecidirGestor && rdo.status === 'Em aprovação do gestor' && (
              <Button tone="success" variant="solid" startIcon={CheckCircle2} className="rdo-view-action-btn" onClick={() => aprovarRDO('APROVAR_GESTOR')}>Aprovar como gestor</Button>
            )}
            {canDecidirFiscal && rdo.status === 'Em aprovação do fiscal' && (
              <Button tone="success" variant="solid" startIcon={CheckCircle2} className="rdo-view-action-btn" onClick={() => aprovarRDO('APROVAR_FISCAL')}>Aprovar como fiscal</Button>
            )}
            {((canDecidirGestor && rdo.status === 'Em aprovação do gestor') || (canDecidirFiscal && rdo.status === 'Em aprovação do fiscal')) && (
              <>
                <Button tone="warning" variant="soft" startIcon={RotateCcw} className="rdo-view-action-btn" onClick={() => { setAcaoDevolucao('SOLICITAR_CORRECAO'); setShowSolicitarCorrecaoModal(true); }}>Solicitar correção</Button>
                <Button tone="danger" variant="solid" startIcon={XCircle} className="rdo-view-action-btn" onClick={() => { setAcaoDevolucao('REPROVAR'); setShowSolicitarCorrecaoModal(true); }}>Reprovar</Button>
              </>
            )}
            {rdo.status === 'Aprovado' && (canDecidirGestor || canDecidirFiscal) && (
              <Button tone="warning" variant="soft" startIcon={RotateCcw} className="rdo-view-action-btn" onClick={voltarAprovadoParaCorrecao}>Voltar para correção</Button>
            )}
          </div>

          <div className="rdo-report-meta-grid">
            <div className="rdo-report-meta-item">
              <Calendar size={16} />
              <span>Data</span>
              <strong>{formatLocalDate(rdo.data_relatorio)}</strong>
            </div>
            <div className="rdo-report-meta-item">
              <User size={16} />
              <span>Responsável</span>
              <strong>{rdo.criado_por_nome || 'N/A'}</strong>
            </div>
            <div className="rdo-report-meta-item">
              <MapPin size={16} />
              <span>Local</span>
              <strong>{cidadeUf}</strong>
            </div>
            <div className="rdo-report-meta-item">
              <Building2 size={16} />
              <span>Obra</span>
              <strong>{rdo.projeto_nome || 'N/A'}</strong>
            </div>
            {(rdo.gestor_aprovado_por_nome || rdo.fiscal_aprovado_por_nome) && (
              <div className="rdo-report-approval-summary">
                {rdo.gestor_aprovado_por_nome && <span><CheckCircle2 size={15} />Gestor: <strong>{rdo.gestor_aprovado_por_nome}</strong></span>}
                {rdo.fiscal_aprovado_por_nome && <span><CheckCircle2 size={15} />Fiscal: <strong>{rdo.fiscal_aprovado_por_nome}</strong></span>}
              </div>
            )}
          </div>
        </div>

        {erro && <div className="alert alert-error rdo-report-alert">{erro}</div>}
        {sucesso && <div className="alert alert-success rdo-report-alert">{sucesso}</div>}
        {Number(rdo.correcao_solicitada || 0) === 1 && (
          <div className="rdo-correction-alert">
            <div className="rdo-correction-alert-icon">
              <AlertTriangle size={18} />
            </div>
            <div>
              <strong>Este RDO possui uma devolução pendente.</strong>
              {rdo.correcao_motivo && <p>{rdo.correcao_motivo}</p>}
              <span>Revise as informações antes de reenviar para aprovação.</span>
            </div>
          </div>
        )}

        <KPICards
          rdo={rdo}
          maoObra={maoObraLista}
          atividadesExecutadas={atividadesRelatorio}
          ocorrencias={ocorrencias}
        />

        <Section icon={CloudSun} title="Clima e jornada">
          <div className="rdo-report-info-grid">
            <div className="rdo-report-daypart">
              <strong>Manha</strong>
              <div><span>Clima</span><b>{valueOrDash(rdo.clima_manha)}</b></div>
              <div><span>Praticabilidade</span><b>{valueOrDash(rdo.praticabilidade_manha)}</b></div>
            </div>
            <div className="rdo-report-daypart">
              <strong>Tarde</strong>
              <div><span>Clima</span><b>{valueOrDash(rdo.clima_tarde)}</b></div>
              <div><span>Praticabilidade</span><b>{valueOrDash(rdo.praticabilidade_tarde)}</b></div>
            </div>
            <div className="rdo-report-daypart">
              <strong>Jornada</strong>
              <div><span>Inicio</span><b>{valueOrDash(horarioInicio)}</b></div>
              <div><span>Fim</span><b>{valueOrDash(horarioFim)}</b></div>
              <div><span>Intervalo</span><b>{valueOrDash(intervalo)}</b></div>
              <div><span>Total</span><b>{rdo.horas_trabalhadas ? `${rdo.horas_trabalhadas}h` : '-'}</b></div>
            </div>
          </div>
        </Section>

        <Section icon={Users} title="Mão de obra" count={maoObraLista.length}>
          {maoObraLista.length > 0 ? (
            <div className="rdo-report-table-wrap">
              <table className="rdo-report-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Função</th>
                    <th>Tipo</th>
                    <th>Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {maoObraLista.map((item, index) => (
                    <tr key={item.id || index}>
                      <td>{item.nome || item.nome_colaborador || '-'}</td>
                      <td>{item.funcao || item.funcao_colaborador || '-'}</td>
                      <td>{valueOrDash(item.tipo)}</td>
                      <td>{calculateHours(item)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Nenhum registro de mão de obra.</EmptyState>
          )}
        </Section>

        <Section icon={Wrench} title="Equipamentos" count={equipamentosLista.length}>
          {equipamentosLista.length > 0 ? (
            <div className="rdo-report-table-wrap">
              <table className="rdo-report-table">
                <thead>
                  <tr>
                    <th>Equipamento</th>
                    <th>Quantidade</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {equipamentosLista.map((eq, index) => (
                    <tr key={eq.id || index}>
                      <td>{eq.nome || eq.equipamento || '-'}</td>
                      <td>{valueOrDash(eq.quantidade)}</td>
                      <td>{valueOrDash(eq.observacao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Nenhum equipamento registrado.</EmptyState>
          )}
        </Section>

        <Section icon={ClipboardList} title="Atividades executadas" count={atividadesRelatorio.length}>
          {atividadesRelatorio.length > 0 ? (
            <div className="rdo-report-activity-list">
              {atividadesRelatorio.map((atividade, index) => (
                <article key={`${atividade.tipo_relatorio}-${atividade.id || index}`} className="rdo-report-activity-item">
                  <div className="rdo-report-activity-main">
                    <span className={`rdo-report-tag ${atividade.tipo_relatorio === 'Avulsa' ? 'is-loose' : ''}`}>
                      {atividade.tipo_relatorio}
                    </span>
                    <h3>
                      {atividade.codigo_eap ? `${atividade.codigo_eap} - ` : ''}
                      {atividade.descricao || '-'}
                    </h3>
                    {atividade.observacao && <p>{atividade.observacao}</p>}
                  </div>
                  <div className="rdo-report-activity-numbers">
                    <div>
                      <span>Qtd</span>
                      <strong>{valueOrDash(atividade.quantidade_executada)}</strong>
                    </div>
                    <div>
                      <span>%</span>
                      <strong>{atividade.percentual_executado != null ? `${atividade.percentual_executado}%` : '-'}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhuma atividade registrada neste RDO.</EmptyState>
          )}
        </Section>

        <Section icon={ImageIcon} title="Registros fotográficos" count={fotos.length}>
          {fotos.length > 0 ? (
            <div className="rdo-report-photo-grid">
              {fotos.map((foto, index) => {
                const linkedActivity = foto.atividade_descricao
                  ? `${foto.atividade_codigo ? `${foto.atividade_codigo} - ` : ''}${foto.atividade_descricao}`
                  : foto.atividade_avulsa_descricao
                    ? `Avulsa - ${foto.atividade_avulsa_descricao}`
                    : '';
                return (
                  <a
                    key={foto.id || index}
                    className="rdo-report-photo-card"
                    href={getUploadUrl(foto.caminho_arquivo)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="rdo-report-photo-media">
                      <img src={getUploadUrl(foto.caminho_arquivo)} alt={foto.descricao || 'Foto do RDO'} />
                    </div>
                    <div className="rdo-report-photo-info">
                      <strong>{foto.descricao || 'Foto sem descrição'}</strong>
                      {linkedActivity && <span>{linkedActivity}</span>}
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <EmptyState>Nenhum registro fotográfico anexado.</EmptyState>
          )}
        </Section>

        <Section icon={Package} title="Materiais utilizados" count={materiais.length}>
          {materiais.length > 0 ? (
            <div className="rdo-report-table-wrap">
              <table className="rdo-report-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Quantidade</th>
                    <th>Unidade</th>
                    <th>NF</th>
                  </tr>
                </thead>
                <tbody>
                  {materiais.map((item, index) => (
                    <tr key={item.id || index}>
                      <td>{item.nome_material || item.nome || '-'}</td>
                      <td>{valueOrDash(item.quantidade)}</td>
                      <td>{valueOrDash(item.unidade)}</td>
                      <td>{valueOrDash(item.numero_nf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Nenhum material registrado.</EmptyState>
          )}
        </Section>

        <Section icon={AlertTriangle} title="Ocorrências" count={ocorrencias.length}>
          {ocorrencias.length > 0 ? (
            <div className="rdo-report-note-list">
              {ocorrencias.map((item, index) => (
                <article key={item.id || index} className="rdo-report-note-item">
                  <div>
                    <h3>#{item.numero || index + 1} · {item.titulo || item.categoria || item.tipo || 'Ocorrência'}</h3>
                    <p style={{ fontSize: '12px', color: '#64748b' }}>{item.categoria || 'Outra'} · {item.data_ocorrencia || rdo?.data_relatorio || '—'}{item.hora_inicio ? ` · ${item.hora_inicio}${item.hora_fim ? `–${item.hora_fim}` : item.em_andamento ? ' (em andamento)' : ''}` : ''}{item.local_frente ? ` · ${item.local_frente}` : ''}</p>
                    <p>{item.descricao_detalhada || item.descricao || '-'}</p>
                    {item.impactos?.length > 0 && <p style={{ fontSize: '12px' }}><strong>Impactos:</strong> {item.impactos.join(', ')}</p>}
                    {item.providencia_imediata && <p style={{ fontSize: '12px' }}><strong>Providência:</strong> {item.providencia_imediata}</p>}
                    {item.evidencias?.length > 0 && <p style={{ fontSize: '12px' }}><strong>Evidências:</strong> {item.evidencias.map((ev) => ev.anexo_nome || ev.foto_nome || 'Arquivo').join(', ')}</p>}
                  </div>
                  {item.gravidade && <span className="rdo-report-severity">{item.gravidade}</span>}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhuma ocorrência registrada.</EmptyState>
          )}
        </Section>

        <Section icon={MessageSquare} title="Comentários" count={comentarios.length}>
          {comentarios.length > 0 ? (
            <div className="rdo-report-note-list">
              {comentarios.map((item, index) => (
                <article key={item.id || index} className="rdo-report-note-item">
                  <div>
                    <h3>{item.usuario_nome || item.autor || 'Comentário'}</h3>
                    <p>{item.comentario}</p>
                  </div>
                  {item.created_at && <span>{formatLocalDate(item.created_at)}</span>}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhum comentário registrado.</EmptyState>
          )}
        </Section>

        <Section icon={Paperclip} title="Anexos" count={anexosLista.length}>
          {anexosLista.length > 0 ? (
            <div className="rdo-report-attachment-grid">
              {anexosLista.map((anexo, index) => {
                const kind = getAttachmentKind(anexo);
                const Icon = getAttachmentIcon(kind);
                const nome = anexo.nome_arquivo || anexo.nome_original || anexo.nome || 'Anexo';
                const caminho = anexo.caminho_arquivo || '';
                return (
                  <a
                    key={anexo.id || index}
                    className={`rdo-report-attachment-card is-${kind}`}
                    href={getUploadUrl(caminho)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="rdo-report-attachment-icon">
                      <Icon size={22} />
                    </span>
                    <span className="rdo-report-attachment-info">
                      <strong>{nome}</strong>
                      <small>{kind.toUpperCase()} - {formatBytes(anexo.tamanho)}</small>
                    </span>
                  </a>
                );
              })}
            </div>
          ) : (
            <EmptyState>Nenhum anexo enviado para este RDO.</EmptyState>
          )}
        </Section>
      </main>

      {showSolicitarCorrecaoModal && (
        <div className="rdo-report-modal-backdrop">
          <div className="rdo-report-modal">
            <h2>{acaoDevolucao === 'REPROVAR' ? 'Reprovar RDO' : 'Solicitar correção'}</h2>
            <p>{acaoDevolucao === 'REPROVAR' ? 'Informe o motivo da reprovação. O RDO retornará ao criador para correção.' : 'Descreva quais correções devem ser feitas neste RDO.'}</p>
            <textarea
              value={textoCorrecao}
              onChange={(e) => setTextoCorrecao(e.target.value)}
              placeholder="Ex: Revisar as quantidades de mão de obra registradas..."
            />
            <div className="rdo-report-modal-actions">
              <button
                onClick={() => {
                  setShowSolicitarCorrecaoModal(false);
                  setTextoCorrecao('');
                }}
                className="btn btn-secondary"
                disabled={isEnviandoCorrecao}
              >
                Cancelar
              </button>
              <button
                onClick={solicitarCorrecaoRDO}
                className="btn btn-warning"
                disabled={isEnviandoCorrecao || !textoCorrecao.trim()}
              >
                {isEnviandoCorrecao ? 'Enviando...' : acaoDevolucao === 'REPROVAR' ? 'Reprovar' : 'Solicitar correção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RDODetalhes;
