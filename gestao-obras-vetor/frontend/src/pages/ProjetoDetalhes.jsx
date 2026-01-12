import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProjeto, getDashboardAvanco, getRDOStats } from '../services/api';
import { BarChart, Activity, FileText, AlertTriangle, Users as UsersIcon } from 'lucide-react';

function ProjetoDetalhes() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [projeto, setProjeto] = useState(null);
  const [avanco, setAvanco] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [projetoId]);

  const carregarDados = async () => {
    try {
      const [projetoRes, avancoRes, statsRes] = await Promise.all([
        getProjeto(projetoId),
        getDashboardAvanco(projetoId),
        getRDOStats(projetoId)
      ]);
      
      setProjeto(projetoRes.data);
      setAvanco(avancoRes.data);
      setStats(statsRes.data);
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

        {/* Métricas Principais */}
        {avanco && (
          <div className="grid grid-4 mb-4">
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                Avanço Físico Geral
              </div>
              <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'var(--primary)' }}>
                {avanco.avanco_geral.avanco_medio?.toFixed(1) || 0}%
              </div>
            </div>
            
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                ✅ Concluídas
              </div>
              <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'var(--success)' }}>
                {avanco.avanco_geral.concluidas || 0}
              </div>
            </div>
            
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                🔄 Em Andamento
              </div>
              <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'var(--warning)' }}>
                {avanco.avanco_geral.em_andamento || 0}
              </div>
            </div>
            
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                ⏸️ Não Iniciadas
              </div>
              <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'var(--secondary)' }}>
                {avanco.avanco_geral.nao_iniciadas || 0}
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

        {/* Ações Principais */}
        <div className="grid grid-2">
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

          <div 
            className="card" 
            onClick={() => navigate(`/projeto/${projetoId}/usuarios`)}
            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <UsersIcon size={32} color="white" />
              </div>
              <div>
                <h3>Equipe do Projeto</h3>
                <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '4px 0 0 0' }}>
                  {projeto?.usuarios?.length || 0} usuários vinculados
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Atividades Principais */}
        {avanco && avanco.atividades_principais && avanco.atividades_principais.length > 0 && (
          <div className="card mt-4">
            <h2 className="card-header">📋 Atividades Principais</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Previsto</th>
                    <th>Executado</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {avanco.atividades_principais.map((atividade, idx) => (
                    <tr key={idx}>
                      <td><strong>{atividade.codigo_eap}</strong></td>
                      <td>{atividade.descricao}</td>
                      <td>{atividade.percentual_previsto}%</td>
                      <td><strong>{atividade.percentual_executado?.toFixed(1)}%</strong></td>
                      <td>
                        <span className={
                          atividade.status === 'Concluída' ? 'badge badge-green' :
                          atividade.status === 'Em andamento' ? 'badge badge-yellow' :
                          'badge badge-gray'
                        }>
                          {atividade.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ProjetoDetalhes;
