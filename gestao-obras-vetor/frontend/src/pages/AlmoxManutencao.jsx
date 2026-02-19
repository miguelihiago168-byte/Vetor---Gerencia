import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AlmoxarifadoLayout from '../components/AlmoxarifadoLayout';
import { concluirManutencaoFerramenta, enviarFerramentaManutencao, getAlocacoesAbertas, registrarPerdaFerramenta, transferirFerramenta, getProjetos } from '../services/api';
import { useDialog } from '../context/DialogContext';

function AlmoxManutencao() {
  const { projetoId } = useParams();
  const { prompt } = useDialog();
  const [alocacoes, setAlocacoes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const carregar = async () => {
    try {
      const [aRes, pRes] = await Promise.all([getAlocacoesAbertas(projetoId), getProjetos()]);
      setAlocacoes(aRes.data || []);
      setProjetos((pRes.data || []).filter((p) => Number(p.id) !== Number(projetoId)));
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao carregar dados de manutenção.');
    }
  };

  useEffect(() => {
    carregar();
  }, [projetoId]);

  const enviarManutencao = async (alocacao) => {
    try {
      await enviarFerramentaManutencao({
        alocacao_id: alocacao.id,
        quantidade: Number(alocacao.quantidade) - Number(alocacao.quantidade_devolvida || 0),
        enviar_para_manutencao: true
      });
      setSucesso('Ativo enviado para manutenção.');
      carregar();
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao enviar para manutenção.');
    }
  };

  const baixaDefinitiva = async (alocacao) => {
    const justificativa = await prompt({
      title: 'Baixa definitiva',
      message: 'Justificativa obrigatória para baixa definitiva:',
      placeholder: 'Descreva a justificativa',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    });
    if (!justificativa) return;

    try {
      await enviarFerramentaManutencao({
        alocacao_id: alocacao.id,
        quantidade: Number(alocacao.quantidade) - Number(alocacao.quantidade_devolvida || 0),
        enviar_para_manutencao: false,
        justificativa
      });
      setSucesso('Baixa definitiva registrada com sucesso.');
      carregar();
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao dar baixa definitiva.');
    }
  };

  const registrarPerda = async (alocacao) => {
    const qtd = await prompt({
      title: 'Registrar perda',
      message: 'Quantidade perdida:',
      placeholder: 'Informe a quantidade',
      confirmText: 'Continuar',
      cancelText: 'Cancelar'
    });
    const justificativa = await prompt({
      title: 'Registrar perda',
      message: 'Justificativa da perda:',
      placeholder: 'Descreva a justificativa',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    });
    if (!qtd) return;

    try {
      await registrarPerdaFerramenta({
        alocacao_id: alocacao.id,
        quantidade: Number(qtd),
        justificativa: justificativa || null
      });
      setSucesso('Perda registrada com custo vinculado à obra.');
      carregar();
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao registrar perda.');
    }
  };

  const transferir = async (alocacao) => {
    const destino = await prompt({
      title: 'Transferência entre obras',
      message: 'Informe o ID da obra de destino:',
      placeholder: 'ID da obra',
      confirmText: 'Transferir',
      cancelText: 'Cancelar'
    });
    if (!destino) return;

    try {
      await transferirFerramenta({
        alocacao_id: alocacao.id,
        obra_destino_id: Number(destino)
      });
      setSucesso('Ativo transferido entre obras sem baixa.');
      carregar();
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao transferir ativo.');
    }
  };

  const retornarAoEstoque = async (alocacao) => {
    if (!alocacao?.manutencao_id) {
      setErro('Não foi possível localizar o registro de manutenção para esta alocação.');
      return;
    }

    try {
      await concluirManutencaoFerramenta(alocacao.manutencao_id, {
        retornar_estoque: true
      });
      setSucesso('Ativo retornado ao estoque com sucesso.');
      carregar();
    } catch (error) {
      setErro(error?.response?.data?.erro || 'Erro ao retornar ativo ao estoque.');
    }
  };

  return (
    <AlmoxarifadoLayout title="Manutenção">
        {erro && <div className="alert alert-error">{erro}</div>}
        {sucesso && <div className="alert alert-success">{sucesso}</div>}

        <div className="card">
          <h2 className="card-header">Ativos alocados nesta obra</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Colaborador</th>
                  <th>Status</th>
                  <th>Qtd pendente</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {alocacoes.map((a) => {
                  const pendente = Number(a.quantidade) - Number(a.quantidade_devolvida || 0);
                  return (
                    <tr key={a.id}>
                      <td>{a.ferramenta_nome}</td>
                      <td>{a.colaborador_usuario_nome || a.colaborador_nome || '-'}</td>
                      <td>{a.status}</td>
                      <td>{pendente}</td>
                      <td>
                        <div className="flex" style={{ gap: 8 }}>
                          {a.status === 'ALOCADA' && <button className="btn btn-warning" onClick={() => enviarManutencao(a)}>Enviar manutenção</button>}
                          {a.status === 'ALOCADA' && <button className="btn btn-danger" onClick={() => baixaDefinitiva(a)}>Baixa definitiva</button>}
                          {a.status === 'ALOCADA' && <button className="btn btn-secondary" onClick={() => registrarPerda(a)}>Registrar perda</button>}
                          {a.status === 'ALOCADA' && <button className="btn btn-primary" onClick={() => transferir(a)}>Transferir</button>}
                          {a.status === 'EM_MANUTENCAO' && <button className="btn btn-success" onClick={() => retornarAoEstoque(a)}>Retornar ao estoque</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {alocacoes.length === 0 && (
                  <tr><td colSpan={5}>Nenhuma alocação ativa.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="card-header">Obras disponíveis para transferência</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {projetos.map((p) => (
              <span key={p.id} className="badge badge-gray">#{p.id} {p.nome}</span>
            ))}
            {projetos.length === 0 && <span>Nenhuma outra obra disponível.</span>}
          </div>
        </div>
    </AlmoxarifadoLayout>
  );
}

export default AlmoxManutencao;
