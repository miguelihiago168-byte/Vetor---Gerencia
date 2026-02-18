import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProjetos, getRDOs, getRNCs, getAtividadesEAP } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ArrowRight, AlertCircle, Clock, LayoutDashboard, FolderOpen, FileText, Layers, AlertTriangle, Users } from 'lucide-react';

function Dashboard() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [projetos, setProjetos] = useState([]);
  const [rdos, setRdos] = useState([]);
  const [rncs, setRncs] = useState([]);
  const [atividadesEap, setAtividadesEap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [menuAtivo, setMenuAtivo] = useState('dashboard');

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { id: 'projetos', label: 'Projetos', path: '/projetos', icon: FolderOpen },
    { id: 'rdos', label: 'RDO', path: '/rdos', icon: FileText },
    { id: 'eap', label: 'EAP', path: '/eap', icon: Layers },
    { id: 'rnc', label: 'RNC', path: '/rnc', icon: AlertTriangle },
    { id: 'usuarios', label: 'Usuários', path: '/usuarios', icon: Users }
  ];

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      
      // Carregar projetos primeiro
      const projRes = await getProjetos();
      const projetosData = projRes.data || [];
      setProjetos(projetosData);

      // Carregar RDOs e RNCs de todos os projetos
      const rdoPromises = projetosData.map(proj => getRDOs(proj.id).catch(() => ({ data: [] })));
      const rncPromises = projetosData.map(proj => getRNCs(proj.id).catch(() => ({ data: [] })));

      const [rdoResults, rncResults] = await Promise.all([
        Promise.all(rdoPromises),
        Promise.all(rncPromises)
      ]);

      const allRdos = rdoResults.flatMap(result => result.data || []);
      const allRncs = rncResults.flatMap(result => result.data || []);

      setRdos(allRdos);
      setRncs(allRncs);

      // Carregar atividades da EAP de todos os projetos
      const eapPromises = projetosData.map(proj => getAtividadesEAP(proj.id).catch(() => ({ data: [] })));
      const eapResults = await Promise.all(eapPromises);
      const allAtividades = eapResults.flatMap(result => result.data || []);
      setAtividadesEap(allAtividades);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setErro('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
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

  const projetosAtivos = projetos.filter(p => !p.data_termino).length;
  const rdosAbertos = rdos.filter(r => r.status === 'Em preenchimento').length;
  const rncsAbertos = rncs.filter(r => r.status !== 'Encerrada').length;
  const rdosRecentes = rdos.slice(0, 5);
  const rncsRecentes = rncs.slice(0, 5);

  // Estatísticas das atividades da EAP
  const totalAtividades = atividadesEap.length;
  const atividadesEmProgresso = atividadesEap.filter(a => a.status === 'Em andamento').length;
  const atividadesConcluidas = atividadesEap.filter(a => a.status === 'Concluída').length;

  // Dados para o gráfico de RDOs por mês
  const rdosPorMes = {};
  rdos.forEach(rdo => {
    const mes = rdo.data_relatorio ? new Date(rdo.data_relatorio).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : 'N/A';
    rdosPorMes[mes] = (rdosPorMes[mes] || 0) + 1;
  });

  const dadosGrafico = Object.entries(rdosPorMes)
    .slice(-6)
    .map(([mes, total]) => ({ mes, 'RDOs': total }));

  // Dados para o gráfico de avanço dos projetos
  const dadosAvanco = projetos.slice(0, 10).map((projeto, index) => ({
    projeto: projeto.nome.length > 15 ? projeto.nome.substring(0, 15) + '...' : projeto.nome,
    avanco: projeto.percentual_progresso || 0
  }));

  return (
    <>
      <Navbar />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
        {/* Menu Lateral */}
        <div style={{
          width: '240px',
          background: 'white',
          borderRight: '1px solid var(--gray-100)',
          padding: '24px 0'
        }}>
          <div style={{ padding: '0 24px 24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: '600', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Navegação
            </h3>
            <nav>
              {menuItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setMenuAtivo(item.id);
                      navigate(item.path);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      width: '100%',
                      padding: '12px 24px',
                      border: 'none',
                      background: menuAtivo === item.id ? 'var(--primary-light)' : 'transparent',
                      color: menuAtivo === item.id ? 'var(--primary)' : 'var(--gray-700)',
                      borderRadius: '8px',
                      marginBottom: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: menuAtivo === item.id ? '600' : '500',
                      textAlign: 'left',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <IconComponent size={18} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="container" style={{ flex: 1, paddingTop: '24px', paddingBottom: '40px' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1>Dashboard de Acompanhamento</h1>
            <p style={{ color: 'var(--gray-600)', marginTop: '8px' }}>Bem-vindo, {usuario?.nome}! Acompanhe o progresso dos projetos e obras.</p>
          </div>

          {erro && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{erro}</div>}

        {/* Cards de Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <div className="card" style={{ padding: '20px', borderLeft: '4px solid #2196F3' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', textTransform: 'uppercase', marginBottom: '8px' }}>Projetos Ativos</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2196F3' }}>{projetosAtivos}</div>
            <small style={{ color: 'var(--gray-500)' }}>de {projetos.length} projetos</small>
          </div>

          <div className="card" style={{ padding: '20px', borderLeft: '4px solid #4CAF50' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', textTransform: 'uppercase', marginBottom: '8px' }}>RDOs Abertos</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4CAF50' }}>{rdosAbertos}</div>
            <small style={{ color: 'var(--gray-500)' }}>aguardando preenchimento</small>
          </div>

          <div className="card" style={{ padding: '20px', borderLeft: '4px solid #FF9800' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', textTransform: 'uppercase', marginBottom: '8px' }}>RNCs Abertas</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#FF9800' }}>{rncsAbertos}</div>
            <small style={{ color: 'var(--gray-500)' }}>não encerradas</small>
          </div>

          <div className="card" style={{ padding: '20px', borderLeft: '4px solid #9C27B0' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', textTransform: 'uppercase', marginBottom: '8px' }}>RDOs Totais</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#9C27B0' }}>{rdos.length}</div>
            <small style={{ color: 'var(--gray-500)' }}>registradas</small>
          </div>

          <div className="card" style={{ padding: '20px', borderLeft: '4px solid #FF9800' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', textTransform: 'uppercase', marginBottom: '8px' }}>Atividades EAP</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#FF9800' }}>{totalAtividades}</div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <small style={{ color: '#4CAF50' }}>✓ {atividadesConcluidas}</small>
              <small style={{ color: '#2196F3' }}>⟳ {atividadesEmProgresso}</small>
            </div>
          </div>
        </div>

        {/* Gráfico de RDOs */}
        {dadosGrafico.length > 0 && (
          <div className="card" style={{ padding: '20px', marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '16px' }}>RDOs Registradas (últimos 6 meses)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="RDOs" fill="#2196F3" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Gráfico de Avanço dos Projetos */}
        {dadosAvanco.length > 0 && (
          <div className="card" style={{ padding: '20px', marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '16px' }}>Curva de Avanço dos Projetos</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dadosAvanco}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="projeto" />
                <YAxis domain={[0, 100]} />
                <Tooltip formatter={(value) => [`${value}%`, 'Avanço']} />
                <Legend />
                <Line type="monotone" dataKey="avanco" stroke="#4CAF50" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Atividades Recentes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
          {/* RDOs Recentes */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3>RDOs Recentes</h3>
              <button
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => navigate('/projetos')}
              >
                Ver todas
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {rdosRecentes.length > 0 ? (
                rdosRecentes.map(rdo => (
                  <div
                    key={rdo.id}
                    style={{
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '6px',
                      borderLeft: `3px solid ${rdo.status === 'Em preenchimento' ? '#FF9800' : '#4CAF50'}`,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#efefef'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px' }}>
                          {rdo.numero_rdo || `RDO-${rdo.id}`}
                        </strong>
                        <small style={{ color: 'var(--gray-600)' }}>
                          {rdo.data_relatorio ? new Date(rdo.data_relatorio).toLocaleDateString('pt-BR') : 'Data não definida'}
                        </small>
                      </div>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          backgroundColor: rdo.status === 'Em preenchimento' ? '#FFF3E0' : '#E8F5E9',
                          color: rdo.status === 'Em preenchimento' ? '#E65100' : '#2E7D32'
                        }}
                      >
                        {rdo.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--gray-500)' }}>
                  Nenhuma RDO registrada
                </div>
              )}
            </div>
          </div>

          {/* RNCs Recentes */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3>RNCs Recentes</h3>
              <button
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => navigate('/projetos')}
              >
                Ver todas
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {rncsRecentes.length > 0 ? (
                rncsRecentes.map(rnc => (
                  <div
                    key={rnc.id}
                    style={{
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '6px',
                      borderLeft: `3px solid ${rnc.status === 'Encerrada' ? '#4CAF50' : '#FF5722'}`,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#efefef'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px' }}>
                          {rnc.titulo || `RNC #${rnc.id}`}
                        </strong>
                        <small style={{ color: 'var(--gray-600)' }}>
                          {rnc.data_criacao ? new Date(rnc.data_criacao).toLocaleDateString('pt-BR') : 'Data não definida'}
                        </small>
                      </div>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          backgroundColor: rnc.status === 'Encerrada' ? '#E8F5E9' : '#FFEBEE',
                          color: rnc.status === 'Encerrada' ? '#2E7D32' : '#C62828'
                        }}
                      >
                        {rnc.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--gray-500)' }}>
                  Nenhuma RNC registrada
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Menu de Ações Rápidas */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ marginBottom: '16px' }}>Ações Rápidas</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/projetos')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <ArrowRight size={16} />
              Ver Projetos
            </button>
            {usuario?.is_gestor === 1 && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigate('/usuarios')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <ArrowRight size={16} />
                  Gerenciar Usuários
                </button>
              </>
            )}
            <button
              className="btn btn-outline"
              onClick={carregarDados}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Clock size={16} />
              Atualizar Dados
            </button>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}

export default Dashboard;
