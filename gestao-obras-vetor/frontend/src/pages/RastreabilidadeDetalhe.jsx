import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, ClipboardCheck, FileImage, FileText, MapPin, PackageCheck, Paperclip, Pencil, XCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import Button from '../components/ui/Button';
import { addMaterialInspecao, enviarMaterialParaInspecao, getMaterialRecebimento, getUploadUrl, uploadEvidenciaMaterial } from '../services/api';
import './RastreabilidadeMateriais.css';

const statusTone = (status = '') => {
  if (status.includes('Aprovado')) return 'success';
  if (/Bloqueado|Reprovado/.test(status)) return 'danger';
  return '';
};

const parseStoredDate = (value) => {
  if (!value) return null;
  const text = String(value);
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
};

const displayDate = (value) => {
  const date = parseStoredDate(value);
  if (!date || Number.isNaN(date.getTime())) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
};

const isImage = (evidence) => /^image\//i.test(evidence.tipo_arquivo || '') || /\.(jpe?g|png|webp|gif)$/i.test(evidence.nome_arquivo || '');
const HISTORY_LABELS = {
  RECEBIMENTO_REGISTRADO: 'Recebimento registrado',
  RECEBIMENTO_ATUALIZADO: 'Recebimento atualizado',
  EVIDENCIA_ANEXADA: 'Evidência anexada',
  ENVIADO_PARA_INSPECAO: 'Enviado para inspeção',
  INSPECAO_REGISTRADA: 'Inspeção registrada',
  SAIDA_DE_MATERIAL_REGISTRADA: 'Saída de material registrada',
  APLICACAO_REGISTRADA: 'Aplicação registrada',
  REGISTRO_ENCERRADO: 'Recebimento encerrado'
};

export default function RastreabilidadeDetalhe() {
  const { projetoId, recebimentoId } = useParams();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [inspection, setInspection] = useState({ resultado: 'Aprovado', motivo: '' });

  const load = async () => {
    try { setReceipt((await getMaterialRecebimento(recebimentoId)).data); }
    catch (requestError) { setError(requestError.response?.data?.erro || requestError.message); }
  };
  useEffect(() => { load(); }, [recebimentoId]);

  const inspectionRequiresReason = ['Aprovado com ressalva', 'Bloqueado', 'Reprovado'].includes(inspection.resultado);
  const canInspect = receipt?.status !== 'Rascunho' && (receipt?.status_inspecao === 'Aguardando inspeção' || receipt?.status_inspecao === 'Em inspeção');
  const canEditReceipt = receipt && receipt.status !== 'Encerrado' && !['Aprovado', 'Aprovado com ressalva', 'Bloqueado', 'Reprovado'].includes(receipt.status_inspecao);
  const technicalData = useMemo(() => Object.entries(receipt?.dados_tecnicos || {}).filter(([, value]) => value !== '' && value != null), [receipt]);
  const historyItems = useMemo(() => {
    const source = receipt?.historico || [];
    const evidence = source.filter((item) => item.acao === 'EVIDENCIA_ANEXADA');
    const remaining = source.filter((item) => item.acao !== 'EVIDENCIA_ANEXADA');
    const grouped = evidence.length ? [{ id: 'evidencias-agrupadas', acao: 'EVIDENCIAS_AGRUPADAS', criado_em: evidence[0].criado_em, usuario_nome: evidence[0].usuario_nome, quantidade: evidence.length }, ...remaining] : remaining;
    return grouped.slice(0, 6);
  }, [receipt]);

  const finishInspection = async () => {
    if (inspectionRequiresReason && !inspection.motivo.trim()) {
      setError('Inclua uma justificativa para este resultado de inspeção.');
      return;
    }
    try {
      setSaving(true); setError('');
      const total = Number(receipt.quantidade_recebida);
      const result = await addMaterialInspecao(receipt.id, {
        resultado: inspection.resultado,
        inspecionado_em: new Date().toISOString(),
        quantidade_aprovada: inspection.resultado.startsWith('Aprovado') ? total : 0,
        quantidade_bloqueada: inspection.resultado === 'Bloqueado' ? total : 0,
        quantidade_reprovada: inspection.resultado === 'Reprovado' ? total : 0,
        motivo: inspection.motivo
      });
      setReceipt(result.data);
    } catch (requestError) { setError(requestError.response?.data?.erro || requestError.message); }
    finally { setSaving(false); }
  };

  const uploadFiles = async (event, categoria) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      setSaving(true); setError('');
      await Promise.all(files.map(async (file) => {
        const body = new FormData();
        body.append('arquivo', file);
        body.append('categoria', categoria);
        await uploadEvidenciaMaterial(receipt.id, body);
      }));
      await load();
    } catch (requestError) { setError(requestError.response?.data?.erro || requestError.message); }
    finally { event.target.value = ''; setSaving(false); }
  };

  const sendToInspection = async () => {
    try {
      setSaving(true); setError('');
      setReceipt((await enviarMaterialParaInspecao(receipt.id)).data);
    } catch (requestError) { setError(requestError.response?.data?.erro || requestError.message); }
    finally { setSaving(false); }
  };

  if (!receipt) return <><Navbar /><main className="container quality-page"><div className="quality-empty"><PackageCheck size={36} /><h3>Carregando recebimento…</h3></div>{error && <div className="alert alert-error">{error}</div>}</main></>;

  return <>
    <Navbar />
    <main className="container quality-page material-detail-page">
      <div className="material-detail-topbar">
        <Button className="quality-back-button" variant="outline" startIcon={ArrowLeft} onClick={() => navigate(`/projeto/${projetoId}/rastreabilidade-materiais`)}>Voltar para recebimentos</Button>
        <div className="material-detail-header-actions">{canEditReceipt && <Button variant="outline" startIcon={Pencil} onClick={() => navigate(`/projeto/${projetoId}/rastreabilidade-materiais/${receipt.id}/editar`)}>Editar recebimento</Button>}<span className={`material-chip ${statusTone(receipt.status_inspecao)}`}>{receipt.status_inspecao}</span></div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <section className="material-detail-hero">
        <div><p className="eyebrow">RECEBIMENTO {receipt.codigo}</p><h1>{receipt.nome_material}</h1><p>{receipt.quantidade_recebida} {receipt.unidade} · Recebido em {displayDate(receipt.recebido_em)}</p></div>
        <div className="material-status-summary"><PackageCheck size={25} /><div><strong>{receipt.saldo_disponivel} {receipt.unidade}</strong><span>saldo liberado para aplicação</span></div></div>
      </section>

      <div className="material-detail-grid">
        <section className="material-detail-card material-detail-card--wide">
          <div className="material-detail-card-title"><ClipboardCheck size={19} /><div><h2>Inspeção e liberação</h2><p>Registro da avaliação de qualidade do material.</p></div></div>
          {receipt.status === 'Rascunho' ? <div className="material-inspection-result"><ClipboardCheck size={22} /><div><strong>Rascunho em preenchimento</strong><span>Confira os dados e os anexos antes de enviar este recebimento para inspeção.</span></div><Button loading={saving} onClick={sendToInspection}>Enviar para inspeção</Button></div> : canInspect ? <div className="material-inspection-form">
            <div className="material-form-grid material-form-grid--three">
              <label className="form-group"><span className="form-label">Resultado</span><select className="form-select" value={inspection.resultado} onChange={(event) => setInspection((current) => ({ ...current, resultado: event.target.value }))}><option>Aprovado</option><option>Aprovado com ressalva</option><option>Bloqueado</option><option>Reprovado</option></select></label>
              <div className="material-real-time"><CalendarClock size={18} /><div><strong>Data e hora da inspeção</strong><span>{displayDate(new Date().toISOString())}</span></div></div>
            </div>
            {inspectionRequiresReason && <label className="form-group material-form-inline-field"><span className="form-label">Justificativa *</span><textarea className="form-textarea" rows="3" value={inspection.motivo} onChange={(event) => setInspection((current) => ({ ...current, motivo: event.target.value }))} placeholder="Descreva a ressalva, bloqueio ou reprovação" /></label>}
            <div className="material-detail-actions"><Button tone={inspection.resultado === 'Aprovado' ? 'neutral' : inspection.resultado === 'Bloqueado' || inspection.resultado === 'Reprovado' ? 'danger' : 'neutral'} startIcon={inspection.resultado.startsWith('Aprovado') ? CheckCircle2 : XCircle} loading={saving} onClick={finishInspection}>Concluir inspeção</Button></div>
          </div> : <div className={`material-inspection-result ${statusTone(receipt.status_inspecao)}`}><CheckCircle2 size={22} /><div><strong>{receipt.status_inspecao}</strong><span>{receipt.inspecoes?.[0] ? `Inspecionado em ${displayDate(receipt.inspecoes[0].inspecionado_em)}${receipt.inspecoes[0].inspetor_nome ? ` por ${receipt.inspecoes[0].inspetor_nome}` : ''}.` : 'Aguardando dados da inspeção.'}</span></div>{receipt.status_inspecao.includes('Aprovado') && <Button variant="outline" onClick={() => document.getElementById('material-evidences')?.scrollIntoView({ behavior: 'smooth' })}>Ver documentos</Button>}</div>}
        </section>

        <section className="material-detail-card material-detail-card--wide">
          <div className="material-detail-card-title"><MapPin size={19} /><div><h2>Identificação</h2><p>Dados do lote e armazenamento.</p></div></div>
          <dl className="material-data-list"><div><dt>Fornecedor</dt><dd>{receipt.fornecedor_nome || 'Não informado'}</dd></div><div><dt>Lote</dt><dd>{receipt.lote || 'Não informado'}</dd></div><div><dt>Nota fiscal</dt><dd>{receipt.nota_fiscal || 'Não informada'}</dd></div><div><dt>Fabricante</dt><dd>{receipt.fabricante || 'Não informado'}</dd></div><div><dt>Local inicial</dt><dd>{receipt.local_armazenamento || 'Não informado'}</dd></div></dl>
        </section>

        <section id="material-evidences" className="material-detail-card material-detail-card--wide">
          <div className="material-detail-card-title"><Paperclip size={19} /><div><h2>Fotos, NF e documentos</h2><p>Anexos vinculados a este recebimento, disponíveis para auditoria.</p></div></div>
          {receipt.status === 'Rascunho' ? <div className="material-evidence-upload"><label className="material-upload-button">Adicionar fotos e documentos<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx" onChange={(event) => uploadFiles(event, 'Documento')} /></label></div> : <div className="material-locked-notice"><CheckCircle2 size={17} />Anexos encerrados: fotos, NF e documentos foram definidos no preenchimento inicial antes do envio para inspeção.</div>}
          {receipt.evidencias?.length ? <div className="material-evidence-grid">{receipt.evidencias.map((evidence) => <a className={`material-evidence ${isImage(evidence) ? 'is-image' : ''}`} key={evidence.id} href={getUploadUrl(evidence.caminho_arquivo)} target="_blank" rel="noreferrer">{isImage(evidence) ? <img src={getUploadUrl(evidence.caminho_arquivo)} alt={evidence.descricao || evidence.nome_arquivo} /> : <FileText size={26} />}<div><strong>{evidence.nome_arquivo}</strong><span>{evidence.categoria || 'Documento'} · {displayDate(evidence.criado_em)}</span></div></a>)}</div> : <div className="material-form-hint"><FileImage size={18} />Nenhum anexo foi incluído no preenchimento inicial.</div>}
        </section>

        <section className="material-detail-card material-detail-card--wide">
          <div className="material-detail-card-title"><FileText size={19} /><div><h2>Dados técnicos e observações</h2><p>Informações registradas no recebimento.</p></div></div>
          {technicalData.length ? <dl className="material-tech-grid">{technicalData.map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value)}</dd></div>)}</dl> : <p className="material-muted">Nenhum dado técnico complementar informado.</p>}
          {receipt.descricao && <p className="material-notes"><strong>Descrição:</strong> {receipt.descricao}</p>}{receipt.observacoes && <p className="material-notes"><strong>Observações:</strong> {receipt.observacoes}</p>}
        </section>

        <section className="material-detail-card material-detail-card--wide">
          <div className="material-detail-card-title"><CalendarClock size={19} /><div><h2>Histórico</h2><p>Eventos deste recebimento em ordem cronológica.</p></div></div>
          <div className="material-history">{historyItems.map((item) => <div key={item.id}><span></span><div><strong>{item.acao === 'EVIDENCIAS_AGRUPADAS' ? `${item.quantidade} evidência${item.quantidade > 1 ? 's' : ''} anexada${item.quantidade > 1 ? 's' : ''}` : HISTORY_LABELS[item.acao] || item.acao.replaceAll('_', ' ')}</strong><p>{displayDate(item.criado_em)}{item.usuario_nome ? ` · ${item.usuario_nome}` : ''}</p></div></div>)}</div>
        </section>
      </div>
    </main>
  </>;
}
