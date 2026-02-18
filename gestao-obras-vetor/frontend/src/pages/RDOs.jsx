import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRDOs, deleteRDO, deleteRDOsProjetoTodos, recalcularEapProjeto, getRdoPDF } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FileText, Download, Plus, Eye, Trash2 } from 'lucide-react';

function RDOs() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const [sucesso, setSucesso] = useState('');
    const formatLocalDate = (dstr) => {
      if (!dstr) return 'N/A';
      // Tratamento de string 'YYYY-MM-DD' sem fuso para evitar dia anterior
      const m = dstr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const dt = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
        return dt.toLocaleDateString('pt-BR');
      }
      const dt = new Date(dstr);
      return isNaN(dt.getTime()) ? dstr : dt.toLocaleDateString('pt-BR');
    };

    const statusLabel = (s) => {
      // Normaliza rótulos amigáveis
      if (s === 'Em análise') return 'Em aprovação';
      if (s === 'Em preenchimento') return 'Aguardando aprovação';
      return s || 'N/A';
    };

    const aprovarRDO = async (rdoId, e) => {
      if (e) e.stopPropagation();
      try {
        // Gestor aprova
        const { updateStatusRDO } = await import('../services/api');
        await updateStatusRDO(rdoId, 'Aprovado');
        setRdos(prev => prev.map(r => r.id === rdoId ? { ...r, status: 'Aprovado' } : r));
        setSucesso('RDO aprovado com sucesso.');
      } catch (error) {
        alert('Falha ao aprovar RDO: ' + (error.response?.data?.erro || error.message));
      }
    };
  const [rdos, setRdos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    carregarRDOs();
  }, [projetoId]);

  const carregarRDOs = async () => {
    try {
      setLoading(true);
      console.log('Carregando RDOs para projeto:', projetoId);
      const response = await getRDOs(projetoId);
      console.log('RDOs carregados:', response.data);
      const lista = response.data || [];
      // Agrupar por data de abertura (criado_em dia)
      setRdos(lista);
    } catch (error) {
      console.error('Erro ao carregar RDOs:', error);
      setErro('Erro ao carregar RDOs: ' + (error.response?.data?.erro || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (rdoId, e) => {
    if (e) e.stopPropagation();
    try {
      const resp = await getRdoPDF(rdoId);
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RDO-${String(rdoId).padStart(2,'0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Falha ao gerar PDF: ' + (error.response?.data?.erro || error.message));
    }
  };

  const handleDeleteRDO = async (rdoId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este RDO? Essa ação não pode ser desfeita.')) return;
    try {
      await deleteRDO(rdoId);
      setSucesso('RDO excluído com sucesso.');
      setRdos(prev => prev.filter(r => r.id !== rdoId));
    } catch (error) {
      alert('Erro ao excluir RDO: ' + (error.response?.data?.erro || error.message));
    }
  };

  const handleDeleteTodos = async () => {
    if (!isGestor) return;
    if (!window.confirm('Gestor: deseja realmente excluir TODOS os RDOs deste projeto e reverter o avanço? Esta ação não pode ser desfeita.')) return;
    try {
      const resp = await deleteRDOsProjetoTodos(projetoId);
      alert(resp.data?.mensagem || 'RDOs excluídos.');
      setRdos([]);
      try {
        const rec = await recalcularEapProjeto(projetoId);
        console.log(rec.data);
      } catch (err) {
        console.warn('Falha ao recalcular EAP após apagar todos os RDOs:', err);
      }
    } catch (error) {
      alert('Erro ao excluir todos os RDOs: ' + (error.response?.data?.erro || error.message));
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

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <h1>RDOs do Projeto</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => navigate(`/projeto/${projetoId}/rdos/novo`)}>
            <Plus size={16} />
            Novo RDO
          </button>
          {isGestor && (
            <button className="btn btn-danger" onClick={handleDeleteTodos} title="Excluir todos os RDOs do projeto">
              <Trash2 size={16} /> Apagar todos
            </button>
          )}
          </div>
        </div>

        {sucesso && <div className="alert alert-success" style={{ marginBottom: '16px' }}>{sucesso}</div>}
        {erro && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{erro}</div>}

        {rdos.length === 0 ? (
          <div className="card text-center" style={{ padding: '60px' }}>
            <FileText size={48} style={{ color: 'var(--gray-400)', marginBottom: '16px' }} />
            <h3 style={{ color: 'var(--gray-500)' }}>Nenhum RDO encontrado</h3>
            <p style={{ color: 'var(--gray-400)', marginTop: '8px' }}>
              Crie o primeiro RDO para este projeto.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '24px' }}>
            {Object.entries(rdos.reduce((acc, r) => {
              const dt = r.criado_em ? new Date(r.criado_em) : null;
              const key = dt && !isNaN(dt.getTime()) ? dt.toISOString().slice(0,10) : 'sem-data';
              if (!acc[key]) acc[key] = [];
              acc[key].push(r);
              return acc;
            }, {})).sort((a,b) => b[0].localeCompare(a[0])).map(([dia, lista]) => (
              <div key={dia}>
                <h3 style={{ marginBottom: '12px', color: 'var(--gray-700)' }}>
                  {dia === 'sem-data' ? 'Abertura: N/A' : `Abertos em ${new Date(dia).toLocaleDateString('pt-BR')}`}
                </h3>
                <div style={{ display: 'grid', gap: '16px' }}>
                  {lista.map(rdo => (
              <div
                key={rdo.id}
                className="card"
                style={{ padding: '20px', cursor: 'pointer' }}
                onClick={() => navigate(`/projeto/${projetoId}/rdos/${rdo.id}/editar`)}
                title="Editar RDO"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ marginBottom: '8px' }}>
                          {(() => {
                            const num = rdo.numero_rdo ? String(rdo.numero_rdo) : `RDO-${String(rdo.id).padStart(3,'0')}`;
                            return num;
                          })()}
                    </h3>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: 'var(--gray-600)' }}>
                      <span>Data: {formatLocalDate(rdo.data_relatorio)}</span>
                      <span>Status: {statusLabel(rdo.status)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{
                      padding: '6px 10px',
                      background: (function(){
                        // Cores solicitadas:
                        // Aprovado -> verde
                        // Em aprovação (Em análise) -> amarelo
                        // Aguardando aprovação (Em preenchimento) -> azul
                        // Reprovado -> vermelho
                        if (rdo.status === 'Aprovado') return '#2E7D32';
                        if (rdo.status === 'Em análise') return '#F9A825';
                        if (rdo.status === 'Em preenchimento') return '#2962FF';
                        if (rdo.status === 'Reprovado') return '#C62828';
                        return '#888';
                      })(),
                      color: 'white',
                      borderRadius: '16px',
                      fontSize: '12px',
                      alignSelf: 'center'
                    }}>
                      {statusLabel(rdo.status)}
                    </span>
                    {/* Botão de visualizar removido: clique no card abre o formulário de edição */}
                    {isGestor && rdo.status === 'Em análise' && (
                      <button
                        className="btn btn-success"
                        onClick={(e) => aprovarRDO(rdo.id, e)}
                        title="Aprovar RDO"
                      >
                        Aprovar
                      </button>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={(e) => handleDownloadPDF(rdo.id, e)}
                      title="Download PDF"
                    >
                      <Download size={16} />
                      PDF
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={(e) => handleDeleteRDO(rdo.id, e)}
                      title="Excluir RDO"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default RDOs;
