import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProjetos } from '../services/api';

export default function ProjetoSelector({ destino }) {
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    getProjetos().then(res => {
      setProjetos(res.data || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Carregando projetos...</div>;
  if (projetos.length === 0) return <div>Nenhum projeto encontrado.</div>;
  if (projetos.length === 1) {
    // Redireciona automaticamente
    navigate(`/projeto/${projetos[0].id}/${destino}`);
    return null;
  }

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h2>Escolha o projeto para acessar {destino.toUpperCase()}</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {projetos.map(p => (
            <li key={p.id} style={{ margin: '16px 0' }}>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate(`/projeto/${p.id}/${destino}`)}>
                {p.nome} {p.cidade ? `- ${p.cidade}` : ''}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
