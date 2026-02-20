import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProjetos } from '../services/api';

export default function ProjetoSelector({ destino }) {
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const labels = {
    rdos: 'RDOs',
    rnc: 'RNC',
    eap: 'EAP',
    pedidos: 'Compras',
    financeiro: 'Financeiro',
    almoxarifado: 'Ativos',
    usuarios: 'Usuários',
    'curva-s': 'Curva S'
  };

  const destinoPath = (projetoId) => `/projeto/${projetoId}/${destino}`;

  useEffect(() => {
    getProjetos().then(res => {
      setProjetos(res.data || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading && projetos.length === 1) {
      navigate(destinoPath(projetos[0].id), { replace: true });
    }
  }, [loading, projetos, destino, navigate]);

  if (loading) return <div>Carregando projetos...</div>;
  if (projetos.length === 0) return <div>Nenhum projeto encontrado.</div>;
  if (projetos.length === 1) return null;

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h2>Escolha o projeto para acessar {labels[destino] || destino.toUpperCase()}</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {projetos.map(p => (
            <li key={p.id} style={{ margin: '16px 0' }}>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate(destinoPath(p.id))}>
                {p.nome} {p.cidade ? `- ${p.cidade}` : ''}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
