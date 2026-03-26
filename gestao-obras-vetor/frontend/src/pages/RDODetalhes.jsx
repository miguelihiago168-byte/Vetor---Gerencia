import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRDO, updateRDO, getAtividadesEAP, addRdoMaoObra, listRdoMaoObra, addRdoComentario, addRdoMaterial, addRdoOcorrencia, uploadRdoFoto, getAnexos, updateStatusRDO, getRdoFerramentasDisponiveis, getRdoFerramentas, addRdoFerramenta, getRdoPDF } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { FileText, Download, ArrowLeft, MapPin, Building2, User, Calendar } from 'lucide-react';
import { KPICards } from '../components/RDOTimeline';

function RDODetalhes() {
  const { projetoId, rdoId } = useParams();
  const navigate = useNavigate();
  const { isGestor, perfil } = useAuth();

  // Controle de permissões para ações nos RDOs
  const canAprovarRdo = perfil === 'Gestor Geral' || perfil === 'Gestor da Obra' || perfil === 'Gestor Local';
  const canReprovarRdo = canAprovarRdo || perfil === 'Fiscal';
  const { alert } = useDialog();
  const [rdo, setRdo] = useState(null);
  const [sucesso, setSucesso] = useState('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [atividades, setAtividades] = useState([]);
  const [maoObra, setMaoObra] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [ocorrencias, setOcorrencias] = useState([]);
  const [anexos, setAnexos] = useState([]);
  const [comentarios, setComentarios] = useState([]);
  const [ferramentasDisponiveis, setFerramentasDisponiveis] = useState([]);
  const [ferramentasRdo, setFerramentasRdo] = useState([]);
  const [novaFerramentaRdo, setNovaFerramentaRdo] = useState({ alocacao_id: '', quantidade: 1 });

  // Estados para novos itens
  const [novoComentario, setNovoComentario] = useState('');
  const [novoMaterial, setNovoMaterial] = useState({ nome: '', quantidade: '', unidade: '' });
  const [novaOcorrencia, setNovaOcorrencia] = useState({ titulo: '', descricao: '', tipo: '' });
  const [novaMaoObra, setNovaMaoObra] = useState({ nome: '', funcao: '', horas: '' });

  useEffect(() => {
    carregarDados();
  }, [rdoId]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        getRDO(rdoId),
        getAtividadesEAP(projetoId),
        listRdoMaoObra(rdoId),
        getAnexos(rdoId),
        getRdoFerramentasDisponiveis(rdoId),
        getRdoFerramentas(rdoId)
      ]);

      const [rdoRes, atividadesRes, maoObraRes, anexosRes, ferramentasDispRes, ferramentasRdoRes] = results;

      if (rdoRes.status === 'fulfilled') {
        setRdo(rdoRes.value.data);
      } else {
        const err = rdoRes.reason;
        const msg = err?.response?.data?.erro || err?.message || 'RDO não encontrado';
        setErro(msg);
        setRdo(null);
        return; // sem RDO, evita processar demais
      }

      setAtividades(atividadesRes.status === 'fulfilled' ? (atividadesRes.value.data || []) : []);
      setMaoObra(maoObraRes.status === 'fulfilled' ? (maoObraRes.value.data || []) : []);
      setAnexos(anexosRes.status === 'fulfilled' ? (anexosRes.value.data || []) : []);
      setFerramentasDisponiveis(ferramentasDispRes.status === 'fulfilled' ? (ferramentasDispRes.value.data || []) : []);
      setFerramentasRdo(ferramentasRdoRes.status === 'fulfilled' ? (ferramentasRdoRes.value.data || []) : []);
    } catch (error) {
      console.error('Erro ao carregar RDO:', error);
      const msg = error.response?.data?.erro || error.message || 'Erro ao carregar RDO';
      setErro(msg);
    } finally {
      setLoading(false);
    }
  };

  // Página de visualização: sem ações de edição/adicionar/upload

  const handleDownloadPDF = async () => {
    try {
      const resp = await getRdoPDF(rdoId);
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RDO-${String(rdoId).padStart(3, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      await alert({ title: 'Erro', message: 'Falha ao gerar PDF: ' + (error.response?.data?.erro || error.message) });
    }
  };

  const formatLocalDate = (dstr) => {
    if (!dstr) return 'N/A';
    const m = dstr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const dt = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
      return dt.toLocaleDateString('pt-BR');
    }
    const dt = new Date(dstr);
    return isNaN(dt.getTime()) ? dstr : dt.toLocaleDateString('pt-BR');
  };

  const statusLabel = (s) => {
    if (s === 'Em análise') return 'Em aprovação';
    if (s === 'Em preenchimento') return 'Aguardando aprovação';
    return s || 'N/A';
  };

  const aprovarRDO = async () => {
    try {
      await updateStatusRDO(rdoId, 'Aprovado');
      setRdo(prev => ({ ...prev, status: 'Aprovado' }));
      setSucesso('RDO aprovado com sucesso.');
    } catch (error) {
      await alert({ title: 'Erro', message: 'Falha ao aprovar RDO: ' + (error.response?.data?.erro || error.message) });
    }
  };

  const reprovarRDO = async () => {
    try {
      await updateStatusRDO(rdoId, 'Reprovado');
      setRdo(prev => ({ ...prev, status: 'Reprovado' }));
      setSucesso('RDO reprovado.');
    } catch (error) {
      await alert({ title: 'Erro', message: 'Falha ao reprovar RDO: ' + (error.response?.data?.erro || error.message) });
    }
  };

  const vincularFerramentaRdo = async () => {
    try {
      setErro('');
      if (!novaFerramentaRdo.alocacao_id) {
        setErro('Selecione um ativo retirado para a obra.');
        return;
      }
      await addRdoFerramenta(rdoId, {
        alocacao_id: Number(novaFerramentaRdo.alocacao_id),
        quantidade: Number(novaFerramentaRdo.quantidade || 1)
      });
      setNovaFerramentaRdo({ alocacao_id: '', quantidade: 1 });
      const [dispRes, itensRes] = await Promise.all([
        getRdoFerramentasDisponiveis(rdoId),
        getRdoFerramentas(rdoId)
      ]);
      setFerramentasDisponiveis(dispRes.data || []);
      setFerramentasRdo(itensRes.data || []);
      setSucesso('Ativo vinculado ao RDO com sucesso.');
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao vincular ativo ao RDO.');
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
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rdos`)}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <button className="btn btn-primary" onClick={carregarDados}>
              <Save size={16} /> Tentar recarregar
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        {/* Cabeçalho: título + ações */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rdos`)}>
              <ArrowLeft size={16} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ margin: 0 }}>{`RDO - ${(rdo.numero_rdo || String(rdo.id)).toString().padStart(2,'0')}`}</h1>
              <span style={{
                padding: '4px 10px',
                background: (function(){
                  if (rdo.status === 'Aprovado') return '#2E7D32';
                  if (rdo.status === 'Em análise') return '#F9A825';
                  if (rdo.status === 'Em preenchimento') return '#2962FF';
                  if (rdo.status === 'Reprovado') return '#C62828';
                  return '#888';
                })(),
                color: 'white',
                borderRadius: '16px',
                fontSize: '12px'
              }}>
                {statusLabel(rdo.status)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={handleDownloadPDF}>
              <Download size={16} /> PDF
            </button>
            {canAprovarRdo && rdo.status === 'Em análise' && (
              <button className="btn btn-success" onClick={aprovarRDO}>
                Aprovar
              </button>
            )}
            {canReprovarRdo && rdo.status === 'Em análise' && (
              <button className="btn btn-danger" onClick={reprovarRDO}>
                Reprovar
              </button>
            )}
            {isGestor && rdo.status !== 'Em preenchimento' && (
              <button className="btn btn-warning" onClick={async () => {
                try {
                  await updateStatusRDO(rdoId, 'Em preenchimento');
                  setRdo(prev => ({ ...prev, status: 'Em preenchimento' }));
                } catch (error) {
                  await alert({ title: 'Erro', message: 'Falha ao permitir edição: ' + (error.response?.data?.erro || error.message) });
                }
              }}>
                Permitir edição
              </button>
            )}
          </div>
        </div>

        {/* Row 1: 2 colunas — Informações Gerais | Informações do Projeto */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* Informações Gerais */}
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Informações Gerais</span>
            </div>
            {[
              { label: 'Data', value: formatLocalDate(rdo.data_relatorio) },
              { label: 'Dia da Semana', value: rdo.dia_semana || 'N/A' },
              { label: 'Status', value: statusLabel(rdo.status) },
              { label: 'Responsável', value: rdo.criado_por_nome || 'N/A' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9CA3AF', fontWeight: 600 }}>{row.label}</span>
                <span style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Informações do Projeto */}
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Informações do Projeto</span>
            </div>
            {[
              { label: 'Projeto', value: rdo.projeto_nome || 'N/A', icon: <Building2 size={11} /> },
              { label: 'Empresa Executante', value: rdo.empresa_executante || 'N/A', icon: <Building2 size={11} /> },
              { label: 'Cidade', value: rdo.cidade || 'N/A', icon: <MapPin size={11} /> },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9CA3AF', fontWeight: 600 }}>{row.icon}{row.label}</span>
                <span style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {erro && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{erro}</div>}
        {sucesso && <div className="alert alert-success" style={{ marginBottom: '16px' }}>{sucesso}</div>}

        {/* KPI Cards */}
        <KPICards
          rdo={rdo}
          maoObra={maoObra}
          atividadesExecutadas={rdo.atividades || []}
          ocorrencias={ocorrencias}
        />

        {/* Condições Climáticas — Manhã | Tarde lado a lado */}
        <div className="card" style={{ padding: '0', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Condições Climáticas</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ borderRight: '1px solid #F3F4F6' }}>
              <div style={{ padding: '6px 16px', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Manhã</span>
              </div>
              {[
                { label: 'Clima', value: rdo.clima_manha || 'N/A' },
                { label: 'Praticabilidade', value: rdo.praticabilidade_manha || 'N/A' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9CA3AF', fontWeight: 600 }}>{row.label}</span>
                  <span style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ padding: '6px 16px', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tarde</span>
              </div>
              {[
                { label: 'Clima', value: rdo.clima_tarde || 'N/A' },
                { label: 'Praticabilidade', value: rdo.praticabilidade_tarde || 'N/A' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9CA3AF', fontWeight: 600 }}>{row.label}</span>
                  <span style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mão de Obra */}
        <div className="card" style={{ padding: '0', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Mão de Obra</span>
          </div>
          {(Array.isArray(rdo.mao_obra_detalhada) && rdo.mao_obra_detalhada.length > 0 ? rdo.mao_obra_detalhada : maoObra).length > 0 ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', padding: '6px 16px', background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                {['Nome', 'Função', 'Tipo', 'Horas'].map(h => (
                  <span key={h} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>{h}</span>
                ))}
              </div>
              {(Array.isArray(rdo.mao_obra_detalhada) && rdo.mao_obra_detalhada.length > 0 ? rdo.mao_obra_detalhada : maoObra).map((item, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', padding: '8px 16px', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{item.nome || item.nome_colaborador || '-'}</span>
                  <span style={{ fontSize: '14px', color: '#374151' }}>{item.funcao || item.funcao_colaborador || '-'}</span>
                  <span style={{ fontSize: '14px', color: '#374151' }}>{item.tipo ? String(item.tipo) : '-'}</span>
                  <span style={{ fontSize: '14px', color: '#374151' }}>{(item.horas || item.horas_trabalhadas || (function(){
                    const toMin = (t) => { const m = String(t||'').match(/(\d{1,2}):(\d{2})/); return m ? (parseInt(m[1],10)*60+parseInt(m[2],10)) : null; };
                    const ini = toMin(item.entrada);
                    const fim = toMin(item.saida_final);
                    const i1 = toMin(item.saida_almoco);
                    const i2 = toMin(item.retorno_almoco);
                    if (ini==null || fim==null || fim<=ini) return 0;
                    let tot = Math.max(0, fim-ini);
                    if (i1!=null && i2!=null && i2>i1) tot = Math.max(0, tot-(i2-i1));
                    return Math.round((tot/60)*100)/100;
                  })())}h</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', color: '#9CA3AF', fontSize: '14px' }}>Nenhum registro de mão de obra.</div>
          )}
        </div>

        {/* Equipamentos */}
        {(rdo.equipamentos_lista || []).length > 0 && (
          <div className="card" style={{ padding: '0', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Equipamentos</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', padding: '6px 16px', background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
              {['Equipamento', 'Quantidade'].map(h => (
                <span key={h} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>{h}</span>
              ))}
            </div>
            {(rdo.equipamentos_lista || []).map((eq, idx) => (
              <div key={eq.id || idx} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', padding: '8px 16px', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{eq.nome}</span>
                <span style={{ fontSize: '14px', color: '#374151' }}>{eq.quantidade}</span>
              </div>
            ))}
          </div>
        )}

        {/* Atividades Executadas */}
        <div className="card" style={{ padding: '0', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Atividades Executadas</span>
          </div>
          {(rdo.atividades || []).length > 0 ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', padding: '6px 16px', background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                {['Atividade', 'Qtd', '%'].map(h => (
                  <span key={h} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>{h}</span>
                ))}
              </div>
              {(rdo.atividades || []).map(atividade => (
                <div key={atividade.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', padding: '8px 16px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{atividade.codigo_eap ? `${atividade.codigo_eap} — ` : ''}{atividade.descricao}</div>
                    {atividade.observacao && <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>{atividade.observacao}</div>}
                  </div>
                  <span style={{ fontSize: '14px', color: '#374151' }}>{atividade.quantidade_executada ?? '-'}</span>
                  <span style={{ fontSize: '14px', color: '#374151' }}>{atividade.percentual_executado != null ? `${atividade.percentual_executado}%` : '-'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', color: '#9CA3AF', fontSize: '14px' }}>Nenhuma atividade registrada neste RDO.</div>
          )}
        </div>

        {/* Registros Fotográficos */}
        {(rdo.fotos || []).length > 0 && (
          <div className="card" style={{ padding: '0', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Registros Fotográficos</span>
            </div>
            {(rdo.fotos || []).map((foto) => (
              <div key={foto.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #F3F4F6' }}>
                <div>
                  <div style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{foto.descricao || 'Foto'}</div>
                  {foto.atividade_descricao && <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Atividade: {foto.atividade_codigo ? `${foto.atividade_codigo} — ` : ''}{foto.atividade_descricao}</div>}
                </div>
                <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{new Date(foto.criado_em).toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        )}

        {/* Materiais Utilizados */}
        <div className="card" style={{ padding: '0', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Materiais Utilizados</span>
          </div>
          {materiais.length > 0 ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', padding: '6px 16px', background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                {['Material', 'Quantidade', 'Unidade'].map(h => (
                  <span key={h} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>{h}</span>
                ))}
              </div>
              {materiais.map((item, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', padding: '8px 16px', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{item.nome_material || item.nome}</span>
                  <span style={{ fontSize: '14px', color: '#374151' }}>{item.quantidade}</span>
                  <span style={{ fontSize: '14px', color: '#374151' }}>{item.unidade}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', color: '#9CA3AF', fontSize: '14px' }}>Nenhum material registrado.</div>
          )}
        </div>

        {/* Ocorrências */}
        <div className="card" style={{ padding: '0', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Ocorrências</span>
          </div>
          {ocorrencias.length > 0 ? (
            <div>
              {ocorrencias.map((item, index) => (
                <div key={index} style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', background: (item.gravidade || '').toLowerCase() === 'alta' ? '#FFFBEB' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', color: '#111827', fontWeight: 600 }}>{item.titulo}</span>
                    {item.gravidade && (
                      <span style={{
                        fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                        padding: '2px 8px', borderRadius: '4px',
                        background: (item.gravidade || '').toLowerCase() === 'alta' ? '#FEF3C7' : (item.gravidade || '').toLowerCase().startsWith('m') ? '#EDE9FE' : '#F3F4F6',
                        color: (item.gravidade || '').toLowerCase() === 'alta' ? '#92400E' : (item.gravidade || '').toLowerCase().startsWith('m') ? '#5B21B6' : '#6B7280',
                      }}>{item.gravidade}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6B7280' }}>{item.descricao}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', color: '#9CA3AF', fontSize: '14px' }}>Nenhuma ocorrência registrada.</div>
          )}
        </div>

        {/* Comentários */}
        {comentarios.length > 0 && (
          <div className="card" style={{ padding: '0', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Comentários</span>
            </div>
            {comentarios.map((item, index) => (
              <div key={index} style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', fontSize: '14px', color: '#374151' }}>
                {item.comentario}
              </div>
            ))}
          </div>
        )}

        {/* Anexos */}
        <div className="card" style={{ padding: '0', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Anexos</span>
          </div>
          {anexos.length > 0 ? (
            <div>
              {anexos.map((anexo) => (
                <div key={anexo.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderBottom: '1px solid #F3F4F6' }}>
                  <FileText size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ fontSize: '14px', color: '#111827' }}>{anexo.nome_original}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', color: '#9CA3AF', fontSize: '14px' }}>Nenhum anexo.</div>
          )}
        </div>
      </div>
    </>
  );
}

export default RDODetalhes;