import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProjeto, getRDOStats, getRDOs, getAnexos, getDashboardAlmoxarifado } from '../services/api';
import { FileText, AlertTriangle, Image as ImageIcon, Activity } from 'lucide-react';
import { formatMoneyBR } from '../utils/currency';

const formatBRL = formatMoneyBR;

function ProjetoDetalhes() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [projeto, setProjeto] = useState(null);
  const [stats, setStats] = useState(null);
  const [almox, setAlmox] = useState(null);
  const [galeria, setGaleria] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [projetoId]);

  const carregarDados = async () => {
    try {
      const [projetoRes, statsRes] = await Promise.all([
        getProjeto(projetoId),
        getRDOStats(projetoId)
      ]);

      setProjeto(projetoRes.data);
      setStats(statsRes.data);

      try {
        const almoxRes = await getDashboardAlmoxarifado(projetoId);
        setAlmox(almoxRes.data);
      } catch {
        setAlmox(null);
      }

      // Carregar galeria geral de fotos do projeto (anexos dos RDOs)
      try {
        const rdosRes = await getRDOs(projetoId);
        const rdos = rdosRes.data || [];
        const anexosList = [];
        for (const rdo of rdos) {
          try {
            const ax = await getAnexos(rdo.id);
            const imgs = (ax.data || []).filter(a => String(a.tipo).startsWith('image/'));
            imgs.forEach(img => anexosList.push({
              id: img.id,
              nome: img.nome_arquivo,
              tipo: img.tipo,
              url: `/api/anexos/download/${img.id}`,
              rdo_id: rdo.id,
              criado_em: img.criado_em
            }));
          } catch {}
        }
        setGaleria(anexosList);
      } catch {}
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="loading"><div className="spinner"></div></div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container">
        {/* Cabeçalho do Projeto */}
        <div className="card mb-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <h1 style={{ marginBottom: '16px' }}>{projeto?.nome}</h1>
          <div className="grid grid-2" style={{ fontSize: '14px' }}>
            <div>
              <strong>Empresa Responsável:</strong> {projeto?.empresa_responsavel}
            </div>
            <div>
              <strong>Empresa Executante:</strong> {projeto?.empresa_executante}
            </div>
            <div>
              <strong>Cidade:</strong> {projeto?.cidade}
            </div>
            <div>
              <strong>Prazo:</strong> {new Date(projeto?.prazo_termino).toLocaleDateString('pt-BR')}
            </div>
          </div>
        </div>
        {/* A vencer (dias até prazo) */}
        {projeto && (
          <div className="grid grid-1 mb-4">
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '8px' }}>A vencer</div>
              {projeto.prazo_termino ? (
                (() => {
                  const prazo = new Date(projeto.prazo_termino);
                  const hoje = new Date();
                  const diff = Math.ceil((prazo - hoje) / (1000*60*60*24));
                  return (
                    <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{diff >= 0 ? `${diff} dias` : 'Vencido'}</div>
                  );
                })()
              ) : (
                <div style={{ fontSize: '18px', color: 'var(--gray-500)' }}>Prazo não informado</div>
              )}
            </div>
          </div>
        )}

        {/* Métricas de RDOs (preenchidos, iniciados, aprovados, em aprovação) */}
        {stats && (
          <div className="grid grid-4 mb-4">
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                Relatórios preenchidos (total)
              </div>
              <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'var(--primary)' }}>
                {stats.total_rdos || 0}
              </div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                🟡 Iniciados (em preenchimento)
              </div>
              <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'var(--warning)' }}>
                {stats.em_preenchimento || 0}
              </div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                🟢 Aprovados
              </div>
              <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'var(--success)' }}>
                {stats.aprovados || 0}
              </div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                🔵 Em aprovação (análise)
              </div>
              <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'var(--info)' }}>
                {stats.em_analise || 0}
              </div>
            </div>
          </div>
        )}

        {/* Estatísticas de RDOs */}
        {stats && (
          <div className="card mb-4">
            <h2 className="card-header">📊 Estatísticas de RDOs</h2>
            <div className="grid grid-4">
              <div>
                <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>Total de RDOs</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{stats.total_rdos || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>🟢 Aprovados</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--success)' }}>
                  {stats.aprovados || 0}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>🔵 Em Análise</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--info)' }}>
                  {stats.em_analise || 0}
                </div>
              </div>
                {/* Removido: Total Mão de Obra (não exibir por padrão) */}
            </div>
          </div>
        )}

        {/* Galeria de Fotos Geral (movida para cima, logo após métricas) */}
        <div className="card mt-2 mb-4">
          <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ImageIcon size={20} /> Galeria de Fotos do Projeto
          </h2>
          {galeria.length === 0 ? (
            <div className="card" style={{ padding: '16px', background: 'var(--gray-50)' }}>
              Nenhuma foto enviada nos RDOs deste projeto.
            </div>
          ) : (
            <div className="grid grid-4" style={{ gap: '12px' }}>
              {galeria.slice(0, 24).map(item => (
                <div key={item.id} className="card" style={{ padding: '8px' }}>
                  <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden', borderRadius: '6px', background: 'var(--gray-100)' }}>
                    <img src={item.url} alt={item.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '6px' }}>{item.nome}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ações Principais */}
        <div className="grid grid-2">
          <div 
            className="card" 
            onClick={() => navigate(`/projeto/${projetoId}/almoxarifado`)}
            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #36d1dc 0%, #5b86e5 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Activity size={32} color="white" />
              </div>
              <div>
                <h3>Ativos</h3>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '4px 0 0 0' }}>
                  Alocadas: {almox?.ferramentas_alocadas || 0} · Atraso: {almox?.ferramentas_atrasadas || 0} · Manutenção: {almox?.ferramentas_manutencao || 0}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--danger)', margin: '4px 0 0 0' }}>
                  Perdas: {almox?.total_perdas || 0} · Custo: R$ {formatBRL(almox?.custo_perdas)}
                </p>
              </div>
            </div>
          </div>

          <div 
            className="card" 
            onClick={() => navigate(`/projeto/${projetoId}/eap`)}
            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Activity size={32} color="white" />
              </div>
              <div>
                <h3>Gerenciar EAP</h3>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '4px 0 0 0' }}>
                  Estrutura Analítica do Projeto
                </p>
              </div>
            </div>
          </div>

          <div 
            className="card" 
            onClick={() => navigate(`/projeto/${projetoId}/rdos`)}
            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FileText size={32} color="white" />
              </div>
              <div>
                <h3>Lista de RDOs</h3>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '4px 0 0 0' }}>
                  Relatórios Diários de Obra
                </p>
              </div>
            </div>
          </div>

          <div 
            className="card" 
            onClick={() => navigate(`/projeto/${projetoId}/rnc`)}
            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={32} color="white" />
              </div>
              <div>
                <h3>RNC</h3>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '4px 0 0 0' }}>
                  Relatórios de Não Conformidade
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* (fim) Galeria de Fotos foi movida para cima */}
      </div>
    </>
  );
}

export default ProjetoDetalhes;
