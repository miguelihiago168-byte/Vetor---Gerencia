import React, { useMemo, useState } from 'react';
import { Beaker, Truck } from 'lucide-react';
import Button from './ui/Button';
import { useAuth } from '../context/AuthContext';
import { addMaterialCaminhao } from '../services/api';

const nowInput = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const emptyTruck = () => ({ volume: '', romaneio: '', placa: '', motorista: '', lote: '', chegada_obra: nowInput(), inicio_concretagem: '', fim_concretagem: '', slump_obtido: '', temperatura: '', justificativa_divergencia: '' });
const parsePeriods = (value) => { try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch { return []; } };
const formatDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : 'Não informado';

export default function ConcreteTracePanel({ receipt, onUpdated, onError }) {
  const { usuario } = useAuth();
  const [truck, setTruck] = useState(emptyTruck);
  const [saving, setSaving] = useState(false);
  const canWrite = ['ADM', 'Gestor Geral', 'Gestor da Qualidade', 'Almoxarife'].includes(usuario?.perfil || '') || usuario?.is_gestor;
  const totalTruckVolume = useMemo(() => (receipt.caminhoes || []).reduce((sum, item) => sum + Number(item.volume || 0), 0), [receipt.caminhoes]);
  const totalSpecimens = useMemo(() => (receipt.corpos_prova || []).reduce((sum, item) => sum + Number(item.quantidade || 0), 0), [receipt.corpos_prova]);
  const plannedSpecimens = Number(receipt.dados_tecnicos?.quantidade_corpos_prova_prevista || 0);
  const setField = (field, value) => setTruck((current) => ({ ...current, [field]: value }));

  const submitTruck = async () => {
    if (!(Number(truck.volume) > 0)) return onError('Informe o volume do caminhão em m³.');
    try {
      setSaving(true); onError('');
      const response = await addMaterialCaminhao(receipt.id, { ...truck, volume: Number(truck.volume) });
      onUpdated(response.data); setTruck(emptyTruck());
    } catch (error) { onError(error.response?.data?.erro || error.message); }
    finally { setSaving(false); }
  };

  if (receipt.tipo_codigo !== 'CONCRETO') return null;
  return <>
    <section className="material-detail-card material-detail-card--wide">
      <div className="material-detail-card-title"><Truck size={19} /><div><h2>Caminhões / betoneiras</h2><p>Controle de volume, romaneio e condições de recebimento do concreto.</p></div></div>
      <div className="concrete-summary"><div><span>Volume declarado</span><strong>{receipt.quantidade_recebida} {receipt.unidade}</strong></div><div><span>Volume em caminhões</span><strong>{totalTruckVolume.toLocaleString('pt-BR')} m³</strong></div><div><span>Diferença</span><strong>{(Number(receipt.quantidade_recebida || 0) - totalTruckVolume).toLocaleString('pt-BR')} m³</strong></div></div>
      {canWrite && receipt.status === 'Rascunho' && <div className="concrete-form concrete-form--truck"><label className="form-group"><span className="form-label">Volume (m³) *</span><input className="form-input" type="number" min="0.001" step="0.001" value={truck.volume} onChange={(event) => setField('volume', event.target.value)} /></label><label className="form-group"><span className="form-label">Romaneio</span><input className="form-input" value={truck.romaneio} onChange={(event) => setField('romaneio', event.target.value)} /></label><label className="form-group"><span className="form-label">Placa</span><input className="form-input" value={truck.placa} onChange={(event) => setField('placa', event.target.value)} /></label><label className="form-group"><span className="form-label">Motorista</span><input className="form-input" value={truck.motorista} onChange={(event) => setField('motorista', event.target.value)} /></label><label className="form-group"><span className="form-label">Lote</span><input className="form-input" value={truck.lote} onChange={(event) => setField('lote', event.target.value)} /></label><label className="form-group"><span className="form-label">Chegada à obra</span><input className="form-input" type="datetime-local" value={truck.chegada_obra} onChange={(event) => setField('chegada_obra', event.target.value)} /></label><label className="form-group"><span className="form-label">Início da concretagem</span><input className="form-input" type="datetime-local" value={truck.inicio_concretagem} onChange={(event) => setField('inicio_concretagem', event.target.value)} /></label><label className="form-group"><span className="form-label">Fim da concretagem</span><input className="form-input" type="datetime-local" value={truck.fim_concretagem} onChange={(event) => setField('fim_concretagem', event.target.value)} /></label><label className="form-group"><span className="form-label">Slump obtido</span><input className="form-input" type="number" step="0.1" value={truck.slump_obtido} onChange={(event) => setField('slump_obtido', event.target.value)} /></label><label className="form-group"><span className="form-label">Temperatura</span><input className="form-input" type="number" step="0.1" value={truck.temperatura} onChange={(event) => setField('temperatura', event.target.value)} /></label><label className="form-group concrete-form__wide"><span className="form-label">Justificativa de divergência</span><input className="form-input" value={truck.justificativa_divergencia} onChange={(event) => setField('justificativa_divergencia', event.target.value)} placeholder="Obrigatória se o volume acumulado superar o declarado" /></label><Button loading={saving} onClick={submitTruck}>Registrar caminhão</Button></div>}
      {(receipt.caminhoes || []).length ? <div className="concrete-list">{receipt.caminhoes.map((item) => <div key={item.id}><strong>{item.volume} m³ {item.romaneio ? `· Romaneio ${item.romaneio}` : ''}</strong><span>{item.placa || 'Placa não informada'} · chegada {formatDate(item.chegada_obra)}{item.slump_obtido ? ` · slump ${item.slump_obtido}` : ''}</span></div>)}</div> : <p className="material-muted">Nenhum caminhão registrado.</p>}
    </section>
    <section className="material-detail-card material-detail-card--wide">
      <div className="material-detail-card-title"><Beaker size={19} /><div><h2>Corpos de prova</h2><p>Preenchidos no formulário antes do envio para inspeção; após aprovado, ficam disponíveis somente para consulta.</p></div></div>
      <div className="concrete-summary"><div><span>Quantidade prevista</span><strong>{plannedSpecimens || 'Não informada'}</strong></div><div><span>Quantidade registrada</span><strong>{totalSpecimens}</strong></div><div><span>Uso planejado</span><strong>{receipt.dados_tecnicos?.elemento_concretado}</strong></div></div>
      {(receipt.corpos_prova || []).length ? <div className="concrete-list">{receipt.corpos_prova.map((item) => <div key={item.id}><strong>{item.identificacao} · {item.quantidade} corpo(s)</strong><span>Período previsto: {parsePeriods(item.idades_previstas).map((period) => `${period} dias`).join(', ') || 'não informado'}</span></div>)}</div> : <p className="material-muted">Nenhum corpo de prova registrado no formulário.</p>}
    </section>
  </>;
}
