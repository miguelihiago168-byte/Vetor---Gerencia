import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRDO, updateRDO, getAtividadesEAP, addRdoMaoObra, listRdoMaoObra, addRdoComentario, addRdoMaterial, addRdoOcorrencia, uploadRdoFoto, getAnexos, updateStatusRDO } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FileText, Download, ArrowLeft } from 'lucide-react';

function RDODetalhes() {
  const { projetoId, rdoId } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
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
        getAnexos(rdoId)
      ]);

      const [rdoRes, atividadesRes, maoObraRes, anexosRes] = results;

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
    } catch (error) {
      console.error('Erro ao carregar RDO:', error);
      const msg = error.response?.data?.erro || error.message || 'Erro ao carregar RDO';
      setErro(msg);
    } finally {
      setLoading(false);
    }
  };

  // Página de visualização: sem ações de edição/adicionar/upload

  const handleDownloadPDF = () => {
    window.open(`/api/rdos/${rdoId}/pdf`, '_blank');
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
      alert('Falha ao aprovar RDO: ' + (error.response?.data?.erro || error.message));
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rdos`)}>
              <ArrowLeft size={16} />
            </button>
            <h1>{`RDO - ${(rdo.numero_rdo || String(rdo.id)).toString().padStart(2,'0')}`}</h1>
            <span style={{
              padding: '6px 10px',
              background: (function(){
                // Aprovado -> verde; Em aprovação (Em análise) -> amarelo; Aguardando aprovação (Em preenchimento) -> azul; Reprovado -> vermelho
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={handleDownloadPDF}>
              <Download size={16} /> PDF
            </button>
            {isGestor && rdo.status === 'Em análise' && (
              <button className="btn btn-success" onClick={aprovarRDO}>
                Aprovar
              </button>
            )}
            {isGestor && rdo.status !== 'Em preenchimento' && (
              <button className="btn btn-warning" onClick={async () => {
                try {
                  await updateStatusRDO(rdoId, 'Em preenchimento');
                  setRdo(prev => ({ ...prev, status: 'Em preenchimento' }));
                } catch (error) {
                  alert('Falha ao permitir edição: ' + (error.response?.data?.erro || error.message));
                }
              }}>
                Permitir edição
              </button>
            )}
          </div>
        </div>

        {erro && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{erro}</div>}
        {sucesso && <div className="alert alert-success" style={{ marginBottom: '16px' }}>{sucesso}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
          {/* Conteúdo Principal */}
          <div>
            {/* Informações Gerais */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Informações Gerais</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>Data do Relatório</label>
                  <div>{formatLocalDate(rdo.data_relatorio)}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>Dia da Semana</label>
                  <div>{rdo.dia_semana || 'N/A'}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>Status</label>
                  <div>{statusLabel(rdo.status)}</div>
                </div>
              </div>
            </div>

            {/* Condições Climáticas */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Condições Climáticas</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3>Manhã</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>Clima</label>
                      <div>{rdo.clima_manha || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>Praticabilidade</label>
                      <div>{rdo.praticabilidade_manha || 'N/A'}</div>
                    </div>
                  </div>
                </div>
                <div>
                  <h3>Tarde</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>Clima</label>
                      <div>{rdo.clima_tarde || 'N/A'}</div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>Praticabilidade</label>
                      <div>{rdo.praticabilidade_tarde || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Atividades Executadas */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Atividades Executadas</h2>
              <div style={{ display: 'grid', gap: '12px' }}>
                {(rdo.atividades || []).map(atividade => (
                  <div key={atividade.id} style={{ padding: '12px', border: '1px solid #eee', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{atividade.codigo_eap}</strong> - {atividade.descricao}
                        {atividade.observacao && (
                          <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>Obs: {atividade.observacao}</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {atividade.quantidade_executada != null && (
                          <div>Qtd executada: {atividade.quantidade_executada}</div>
                        )}
                        {atividade.percentual_executado != null && (
                          <div>Percentual: {atividade.percentual_executado}%</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {(!rdo.atividades || rdo.atividades.length === 0) && (
                  <div style={{ color: '#666' }}>Nenhuma atividade registrada neste RDO.</div>
                )}
              </div>
            </div>

            {/* Mão de Obra */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Mão de Obra</h2>
              <div style={{ display: 'grid', gap: '8px' }}>
                {(Array.isArray(rdo.mao_obra_detalhada) && rdo.mao_obra_detalhada.length > 0 ? rdo.mao_obra_detalhada : maoObra).map((item, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: '8px', padding: '8px', border: '1px solid #eee', borderRadius: '4px' }}>
                    <div>{item.nome || item.nome_colaborador}</div>
                    <div>{item.funcao || item.funcao_colaborador}</div>
                    <div>{item.tipo ? String(item.tipo) : '-'}</div>
                    <div>{(item.horas || item.horas_trabalhadas || (function(){
                      // calcular horas quando vier detalhado
                      const toMin = (t) => { const m = String(t||'').match(/(\d{1,2}):(\d{2})/); return m ? (parseInt(m[1],10)*60+parseInt(m[2],10)) : null; };
                      const ini = toMin(item.entrada);
                      const fim = toMin(item.saida_final);
                      const i1 = toMin(item.saida_almoco);
                      const i2 = toMin(item.retorno_almoco);
                      if (ini==null || fim==null || fim<=ini) return 0;
                      let tot = Math.max(0, fim-ini);
                      if (i1!=null && i2!=null && i2>i1) tot = Math.max(0, tot-(i2-i1));
                      return Math.round((tot/60)*100)/100;
                    })())}h</div>
                  </div>
                ))}
                {(!Array.isArray(rdo.mao_obra_detalhada) || rdo.mao_obra_detalhada.length === 0) && maoObra.length === 0 && (
                  <div style={{ color: '#666' }}>Nenhum registro de mão de obra.</div>
                )}
              </div>
            </div>

            {/* Registros Fotográficos */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Registros Fotográficos</h2>
              <div style={{ display: 'grid', gap: '8px' }}>
                {(rdo.fotos || []).map((foto) => (
                  <div key={foto.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', padding: '8px', border: '1px solid #eee', borderRadius: '4px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{foto.descricao || 'Foto'}</div>
                      {foto.atividade_descricao && (
                        <div style={{ color: '#666', fontSize: '12px' }}>Atividade: {foto.atividade_descricao}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', color: '#666' }}>{new Date(foto.criado_em).toLocaleString('pt-BR')}</div>
                  </div>
                ))}
                {(!rdo.fotos || rdo.fotos.length === 0) && (
                  <div style={{ color: '#666' }}>Nenhum registro fotográfico.</div>
                )}
              </div>
            </div>

            {/* Materiais Utilizados */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Materiais Utilizados</h2>
              <div style={{ display: 'grid', gap: '8px' }}>
                {materiais.map((item, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', gap: '8px', padding: '8px', border: '1px solid #eee', borderRadius: '4px' }}>
                    <div>{item.nome_material || item.nome}</div>
                    <div>{item.quantidade}</div>
                    <div>{item.unidade}</div>
                  </div>
                ))}
                {materiais.length === 0 && (
                  <div style={{ color: '#666' }}>Nenhum material registrado.</div>
                )}
              </div>
            </div>

            {/* Ocorrências */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Ocorrências</h2>
              <div style={{ display: 'grid', gap: '12px' }}>
                {ocorrencias.map((item, index) => (
                  <div key={index} style={{ padding: '12px', border: '1px solid #eee', borderRadius: '4px' }}>
                    <div>
                      <strong>{item.titulo}</strong>
                      <div style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>{item.descricao}</div>
                      {item.gravidade && (
                        <div style={{ color: '#999', fontSize: '12px', marginTop: '4px' }}>Gravidade: {item.gravidade}</div>
                      )}
                    </div>
                  </div>
                ))}
                {ocorrencias.length === 0 && (
                  <div style={{ color: '#666' }}>Nenhuma ocorrência registrada.</div>
                )}
              </div>
            </div>

            {/* Comentários */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Comentários</h2>
              <div style={{ display: 'grid', gap: '12px' }}>
                {comentarios.map((item, index) => (
                  <div key={index} style={{ padding: '12px', border: '1px solid #eee', borderRadius: '4px' }}>
                    {item.comentario}
                  </div>
                ))}
                {comentarios.length === 0 && (
                  <div style={{ color: '#666' }}>Nenhum comentário.</div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            {/* Anexos */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>Anexos</h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                {anexos.map((anexo) => (
                  <div key={anexo.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', border: '1px solid #eee', borderRadius: '4px' }}>
                    <FileText size={16} />
                    <div style={{ flex: 1, fontSize: '14px' }}>{anexo.nome_original}</div>
                  </div>
                ))}
                {anexos.length === 0 && (
                  <div style={{ color: '#666' }}>Nenhum anexo.</div>
                )}
              </div>
            </div>

            {/* Informações do Projeto */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>Informações do Projeto</h3>
              <div style={{ fontSize: '14px', color: '#666' }}>
                <div><strong>Projeto:</strong> {rdo.projeto_nome}</div>
                <div><strong>Empresa Executante:</strong> {rdo.empresa_executante}</div>
                <div><strong>Cidade:</strong> {rdo.cidade}</div>
                <div><strong>Criado por:</strong> {rdo.criado_por_nome}</div>
                <div><strong>Data de Criação:</strong> {formatLocalDate(rdo.criado_em)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default RDODetalhes;