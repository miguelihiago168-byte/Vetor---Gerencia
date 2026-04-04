import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import {
  getEmailHistory
} from '../services/api';
import { Mail, Loader, Filter, Eye, XCircle, CheckCircle } from 'lucide-react';
import '../styles/EmailHistory.css';

function EmailHistory() {
  const { user } = useAuth();

  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    limit: 50,
    offset: 0
  });
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadEmailHistory();
  }, [filters.status]);

  const loadEmailHistory = async () => {
    try {
      setLoading(true);
      const response = await getEmailHistory({
        status: filters.status,
        limit: filters.limit,
        offset: filters.offset
      });

      if (response?.data) {
        setEmails(response.data);
        setTotal(response.total || 0);
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusFilter = (status) => {
    setFilters(prev => ({
      ...prev,
      status: prev.status === status ? '' : status,
      offset: 0
    }));
  };

  const handleViewDetails = (email) => {
    setSelectedEmail(email);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setTimeout(() => setSelectedEmail(null), 300);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ENVIADO':
        return 'badge-success';
      case 'ERRO':
        return 'badge-error';
      case 'PENDENTE':
        return 'badge-warning';
      default:
        return 'badge-default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ENVIADO':
        return <CheckCircle size={16} />;
      case 'ERRO':
        return <XCircle size={16} />;
      default:
        return <Mail size={16} />;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  };

  if (loading && emails.length === 0) {
    return (
      <div className="email-history-wrapper">
        <Navbar />
        <div className="email-history-container">
          <div className="loading-spinner">
            <Loader className="spinning" size={32} />
            <p>Carregando histórico...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="email-history-wrapper">
      <Navbar />
      <div className="email-history-container">
        <div className="history-header">
          <Mail size={32} />
          <h1>Histórico de Emails</h1>
          <p>Acompanhe todos os emails enviados pelo sistema</p>
        </div>

        {/* Filtros */}
        <div className="filters-section">
          <div className="filter-group">
            <Filter size={18} />
            <span>Filtrar por Status:</span>
            <button
              className={`filter-btn ${filters.status === '' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('')}
            >
              Todos
            </button>
            <button
              className={`filter-btn ${filters.status === 'ENVIADO' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('ENVIADO')}
            >
              Enviados
            </button>
            <button
              className={`filter-btn ${filters.status === 'ERRO' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('ERRO')}
            >
              Erros
            </button>
          </div>
        </div>

        {/* Tabela de Emails */}
        {emails.length > 0 ? (
          <div className="emails-table-wrapper">
            <table className="emails-table">
              <thead>
                <tr>
                  <th>De</th>
                  <th>Para</th>
                  <th>Assunto</th>
                  <th>Data/Hora</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {emails.map(email => (
                  <tr key={email.id}>
                    <td className="cell-from">{email.sender_user_id}</td>
                    <td className="cell-to">{email.recipient_email}</td>
                    <td className="cell-subject">
                      <span title={email.subject}>{email.subject}</span>
                    </td>
                    <td className="cell-date">{formatDate(email.created_at)}</td>
                    <td className="cell-status">
                      <span className={`badge ${getStatusColor(email.status)}`}>
                        {getStatusIcon(email.status)}
                        {email.status}
                      </span>
                    </td>
                    <td className="cell-actions">
                      <button
                        className="btn-view-details"
                        onClick={() => handleViewDetails(email)}
                        title="Ver detalhes"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Mail size={48} />
            <h3>Nenhum email encontrado</h3>
            <p>Comece enviando emails pelo sistema para vê-los aqui</p>
          </div>
        )}

        {/* Paginação */}
        {total > filters.limit && (
          <div className="pagination">
            <button
              disabled={filters.offset === 0}
              onClick={() => setFilters(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
            >
              Anterior
            </button>
            <span>
              Mostrando {filters.offset + 1} a {Math.min(filters.offset + filters.limit, total)} de {total}
            </span>
            <button
              disabled={filters.offset + filters.limit >= total}
              onClick={() => setFilters(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
            >
              Próximo
            </button>
          </div>
        )}
      </div>

      {/* Modal de Detalhes */}
      {showDetailModal && selectedEmail && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalhes do Email</h2>
              <button className="btn-close" onClick={handleCloseModal}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-group">
                <label>Status</label>
                <span className={`badge ${getStatusColor(selectedEmail.status)}`}>
                  {getStatusIcon(selectedEmail.status)}
                  {selectedEmail.status}
                </span>
              </div>

              <div className="detail-group">
                <label>Email Destinatário</label>
                <p>{selectedEmail.recipient_email}</p>
              </div>

              <div className="detail-group">
                <label>Assunto</label>
                <p>{selectedEmail.subject}</p>
              </div>

              <div className="detail-group">
                <label>Data de Envio</label>
                <p>{formatDate(selectedEmail.sent_at) || formatDate(selectedEmail.created_at)}</p>
              </div>

              {selectedEmail.template_used && (
                <div className="detail-group">
                  <label>Template Utilizada</label>
                  <p>{selectedEmail.template_used}</p>
                </div>
              )}

              {selectedEmail.error_message && (
                <div className="detail-group error">
                  <label>Mensagem de Erro</label>
                  <p className="error-text">{selectedEmail.error_message}</p>
                </div>
              )}

              {selectedEmail.body_html && (
                <div className="detail-group">
                  <label>Corpo do Email</label>
                  <div className="email-body-preview">
                    <div dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }} />
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={handleCloseModal}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailHistory;
