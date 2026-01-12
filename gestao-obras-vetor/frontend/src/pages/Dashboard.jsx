import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/projetos', { replace: true });
  }, [navigate]);

  return (
    <div className="loading">
      <div className="spinner"></div>
    </div>
  );
}

export default Dashboard;
