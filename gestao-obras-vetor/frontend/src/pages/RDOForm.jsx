import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getAtividadesEAP, getProjeto, getRDO, createRDO, updateRDO, getMaoObra, createMaoObra, addRdoMaoObra, listRdoMaoObra, addRdoClima, addRdoComentario, uploadRdoFoto, addRdoMaterial, addRdoOcorrencia } from '../services/api';
import { addRdoAssinatura } from '../services/api';
import { Plus, Trash2, UploadCloud } from 'lucide-react';
import Modal from '../components/Modal';
import Lightbox from '../components/Lightbox';
import { useAuth } from '../context/AuthContext';

const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function RDOForm(){
  const { projetoId, rdoId } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();

  const [atividadesEap, setAtividadesEap] = useState([]);
  const [expandidos, setExpandidos] = useState({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [formData, setFormData] = useState({
    data_relatorio: '',
    dia_semana: '',
    entrada_saida_inicio: '07:00',
    entrada_saida_fim: '17:00',
    intervalo_almoco_inicio: '12:00',
    intervalo_almoco_fim: '13:00',
    horas_trabalhadas: 0,
    clima_manha: 'Claro',
    clima_tarde: 'Claro',
    tempo_manha: '★',
    tempo_tarde: '★',
    praticabilidade_manha: 'Praticável',
    praticabilidade_tarde: 'Praticável',
    clima_noite: 'Claro',
    tempo_noite: '★',
    praticabilidade_noite: 'Praticável',
    pluviometria_total: 0,
    mao_obra_direta: 0,
    mao_obra_indireta: 0,
    mao_obra_terceiros: 0,
    mao_obra_detalhada: [],
    equipamentos: '',
    ocorrencias: '',
    comentarios: '',
    status: 'Em preenchimento',
    atividades: []
  });

  const [projectInfo, setProjectInfo] = useState(null);
  const [maoObraCatalog, setMaoObraCatalog] = useState([]);
  const [rdoFull, setRdoFull] = useState(null);
  const [comentarioTexto, setComentarioTexto] = useState('');
  const [materialForm, setMaterialForm] = useState({ nome_material: '', quantidade: '', unidade: '' });
  const [ocorrenciaForm, setOcorrenciaForm] = useState({ titulo: '', descricao: '', gravidade: '' });

  const [draftAtividade, setDraftAtividade] = useState({ atividade_eap_id: '', percentual_executado: '', quantidade_executada: '', observacao: '' });
  const [showCreateMaoModal, setShowCreateMaoModal] = useState(false);
  const [newMaoNome, setNewMaoNome] = useState('');
  const [newMaoFuncao, setNewMaoFuncao] = useState('');

  const [showAddCatalogModal, setShowAddCatalogModal] = useState(false);
  const [catalogMaoId, setCatalogMaoId] = useState(null);
  const [catalogEntrada, setCatalogEntrada] = useState('07:00');
  const [catalogSaidaAlm, setCatalogSaidaAlm] = useState('12:00');
  const [catalogRetornoAlm, setCatalogRetornoAlm] = useState('13:00');
  const [catalogSaida, setCatalogSaida] = useState('17:00');

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [lightboxAlt, setLightboxAlt] = useState(null);
  const signatureFileRef = useRef();
  const [selectedSignatureFile, setSelectedSignatureFile] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState(null);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoActivityId, setPhotoActivityId] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      try {
        const eapRes = await getAtividadesEAP(projetoId);
        setAtividadesEap(eapRes.data || []);

        // carregar info do projeto (cabecalho)
        try {
          const projR = await getProjeto(projetoId);
          setProjectInfo(projR.data || null);
        } catch (e) {
          // ignore
        }

        // carregar catalogo de mao de obra
        try {
          const mo = await getMaoObra();
          setMaoObraCatalog(mo.data || []);
        } catch (e) {}

        if (rdoId) {
          const res = await getRDO(rdoId);
          const rdo = res.data;
          setRdoFull(rdo);
          setFormData({
            data_relatorio: rdo.data_relatorio,
            dia_semana: rdo.dia_semana,
            entrada_saida_inicio: rdo.entrada_saida_inicio || '07:00',
            entrada_saida_fim: rdo.entrada_saida_fim || '17:00',
            intervalo_almoco_inicio: rdo.intervalo_almoco_inicio || '12:00',
            intervalo_almoco_fim: rdo.intervalo_almoco_fim || '13:00',
            horas_trabalhadas: rdo.horas_trabalhadas || 0,
            clima_manha: rdo.clima_manha || 'Claro',
            clima_tarde: rdo.clima_tarde || 'Claro',
            tempo_manha: rdo.tempo_manha || '★',
            tempo_tarde: rdo.tempo_tarde || '★',
            praticabilidade_manha: rdo.praticabilidade_manha || 'Praticável',
            praticabilidade_tarde: rdo.praticabilidade_tarde || 'Praticável',
            mao_obra_direta: rdo.mao_obra_direta || 0,
            mao_obra_indireta: rdo.mao_obra_indireta || 0,
            mao_obra_terceiros: rdo.mao_obra_terceiros || 0,
            mao_obra_detalhada: rdo.mao_obra_detalhada || [],
            equipamentos: rdo.equipamentos || '',
            ocorrencias: rdo.ocorrencias || '',
            comentarios: rdo.comentarios || '',
            atividades: (rdo.atividades || []).map(a => ({
              atividade_eap_id: a.atividade_eap_id,
              percentual_executado: a.percentual_executado,
              quantidade_executada: a.quantidade_executada || '',
              observacao: a.observacao || ''
            }))
          });
        } else {
          // preencher colaboradores a partir do projeto
          try {
            const projetoRes = await getProjeto(projetoId);
            const projeto = projetoRes.data;
            const colaboradores = (projeto.usuarios || []).map(u => ({
              usuario_id: u.id,
              nome: u.nome,
              funcao: '',
              classificacao: '',
              entrada: '',
              saida: '',
              intervalo_inicio: '',
              intervalo_fim: '',
              horas: 0
            }));
            setFormData(prev => ({ ...prev, mao_obra_detalhada: colaboradores }));
          } catch (err) {
            // ignore
          }
        }
      } catch (error) {
        setErro('Erro ao carregar dados do formulário.');
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, [projetoId, rdoId]);

  const atividadeGroups = useMemo(() => {
    const parents = atividadesEap.filter(a => !a.pai_id);
    const groups = parents.map(p => ({ parent: p, children: atividadesEap.filter(c => c.pai_id === p.id) }));
    // children without parent
    const orphanChildren = atividadesEap.filter(a => a.pai_id && !parents.some(p => p.id === a.pai_id));
    if (orphanChildren.length) groups.push({ parent: { id: 'outros', codigo_eap: 'Outros', descricao: '' }, children: orphanChildren });
    return groups;
  }, [atividadesEap]);

  const weekdayFromDate = (value) => (value ? dias[new Date(value).getDay()] : '');
            const openRelatorio = () => {
              const data = formData || {};
              const mao = (data.mao_obra_detalhada || []).map(m => `
                <tr>
                  <td style="padding:6px; border:1px solid #000">${m.nome || ''}</td>
                  <td style="padding:6px; border:1px solid #000">${m.funcao || ''}</td>
                  <td style="padding:6px; border:1px solid #000">${m.entrada || ''} - ${m.saida || ''}</td>
                  <td style="padding:6px; border:1px solid #000; text-align:right">${(m.horas || 0).toFixed(2)}</td>
                </tr>
              `).join('');

              const atividades = (data.atividades || []).map(a => `
                <tr>
                  <td style="padding:6px; border:1px solid #000">${a.titulo || a.descricao || ''}</td>
                  <td style="padding:6px; border:1px solid #000; text-align:center">${a.quantidade || ''}</td>
                  <td style="padding:6px; border:1px solid #000; text-align:center">${a.percentual || ''}</td>
                  <td style="padding:6px; border:1px solid #000">${a.status || ''}</td>
                </tr>
              `).join('');

              const climaManha = (data.clima && data.clima.manha) ? data.clima.manha : '';
              const climaTarde = (data.clima && data.clima.tarde) ? data.clima.tarde : '';

              const html = `
                <html>
                <head>
                  <meta charset="utf-8" />
                  <title>Relatório Diário de Obra - RDO</title>
                  <style>
                    @page { size: A4; margin: 18mm }
                    body { font-family: Arial, Helvetica, sans-serif; font-size:12px; color:#000 }
                    .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px }
                    .brand { display:flex; align-items:center }
                    .brand img { height:40px; margin-right:12px }
                    .title { font-weight:700; font-size:14px }
                    table { border-collapse: collapse; width:100%; margin-top:8px }
                    th, td { border:1px solid #000; padding:6px }
                    .small { font-size:11px }
                    .section-title { background:#eee; font-weight:700; padding:6px; border:1px solid #000 }
                  </style>
                </head>
                <body>
                  <div class="header">
                    <div class="brand">
                      <div style="width:66px;height:40px;background:#ddd;display:inline-block;margin-right:8px"></div>
                      <div>
                        <div class="title">Relatório Diário de Obra (RDO)</div>
                        <div class="small">Relatório gerado: ${new Date().toLocaleString()}</div>
                      </div>
                    </div>
                    <div style="text-align:right">
                      <div><strong>Relatório nº</strong> ${data.numero || ''}</div>
                      <div><strong>Data</strong> ${data.data || ''}</div>
                    </div>
                  </div>

                  <table>
                    <tr>
                      <td style="width:50%"><strong>Obra</strong><br/>${data.obra || data.projeto || ''}</td>
                      <td style="width:25%"><strong>Local</strong><br/>${data.local || ''}</td>
                      <td style="width:25%"><strong>Responsável</strong><br/>${data.responsavel || ''}</td>
                    </tr>
                  </table>

                  <table>
                    <tr>
                      <td style="width:40%"><strong>Horário de trabalho</strong><br/>Entrada/Saída: ${data.entrada_saida || ''}</td>
                      <td style="width:30%"><strong>Horas trabalhadas</strong><br/>${data.horas_trabalhadas || ''}</td>
                      <td style="width:30%"><strong>Condição climática</strong><br/>Manhã: ${climaManha} <br/>Tarde: ${climaTarde}</td>
                    </tr>
                  </table>

                  <div style="margin-top:10px">
                    <div class="section-title">Mão de obra (${(data.mao_obra_detalhada||[]).length})</div>
                    <table>
                      <thead>
                        <tr>
                          <th>Nome</th>
                          <th>Função</th>
                          <th>Entrada / Saída</th>
                          <th>Horas</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${mao || '<tr><td colspan="4" style="padding:6px;border:1px solid #000">Nenhum registro</td></tr>'}
                      </tbody>
                    </table>
                  </div>

                  <div style="margin-top:10px">
                    <div class="section-title">Atividades</div>
                    <table>
                      <thead>
                        <tr>
                          <th>Descrição</th>
                          <th style="width:90px">Qtd</th>
                          <th style="width:90px">% Exec.</th>
                          <th style="width:160px">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${atividades || '<tr><td colspan="4" style="padding:6px;border:1px solid #000">Nenhuma atividade</td></tr>'}
                      </tbody>
                    </table>
                  </div>

                  <div style="margin-top:12px">
                    <div class="section-title">Fotos</div>
                    <div style="padding:8px; border:1px solid #000; min-height:60px">${(data.fotos || []).map(f => `<div style="display:inline-block;margin:4px;border:1px solid #999;padding:2px"><img src="${f.url || f}" style="height:80px"/></div>`).join('') || 'Sem fotos'}</div>
                  </div>

                  <div style="margin-top:12px">
                    <div class="section-title">Observações</div>
                    <div style="padding:8px;border:1px solid #000; min-height:50px">${(data.observacoes || data.comentarios || '')}</div>
                  </div>

                </body>
                </html>
              `;

              const w = window.open('', '_blank');
              if (!w) { alert('Não foi possível abrir a janela de relatório. Verifique o bloqueador de pop-ups.'); return; }
              w.document.open();
              w.document.write(html);
              w.document.close();
            };

  const toMinutes = (t) => {
    if (!t) return null;
    const m = t.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1],10) * 60 + parseInt(m[2],10);
  };

  const calcHorasInterval = (inicio, fim, intInicio, intFim) => {
    const inicioM = toMinutes(inicio || '07:00');
    const fimM = toMinutes(fim || '17:00');
    const intI = toMinutes(intInicio || null);
    const intF = toMinutes(intFim || null);
    if (inicioM == null || fimM == null) return 0;
    let total = Math.max(0, fimM - inicioM);
    if (intI != null && intF != null && intF > intI) {
      total = Math.max(0, total - (intF - intI));
    }
    return Math.round((total / 60) * 100) / 100;
  };

  const handleAddAtividade = () => {
    if (!draftAtividade.atividade_eap_id) return;
    const infoAtvCheck = atividadesEap.find(a => a.id === Number(draftAtividade.atividade_eap_id));
    if (infoAtvCheck && (infoAtvCheck.pai_id === null || infoAtvCheck.pai_id === undefined)) {
      setErro('Atividades mãe não podem ser selecionadas. Escolha uma sub-atividade.');
      return;
    }
    // bloquear atividades já 100%
    if (infoAtvCheck && (infoAtvCheck.percentual_executado || 0) >= 100) {
      setErro('Esta atividade já está 100% concluída e não pode receber avanço.');
      return;
    }

    const qt = draftAtividade.quantidade_executada;
    let perc = draftAtividade.percentual_executado;
    if ((qt !== undefined && qt !== null && qt !== '') && (!perc || perc === '')) {
      const info = atividadesEap.find(a => a.id === Number(draftAtividade.atividade_eap_id));
      const quantidadeTotal = info ? (info.quantidade_total || 0) : 0;
      const parsedQ = parseFloat(qt);
      if (quantidadeTotal && !isNaN(parsedQ)) {
        perc = Math.min(Math.round((parsedQ / quantidadeTotal) * 10000) / 100, 100);
      } else {
        perc = 0;
      }
    }

    if ((qt === '' || qt === undefined) && (perc === '' || perc === undefined)) return;

    const item = {
      atividade_eap_id: draftAtividade.atividade_eap_id,
      quantidade_executada: qt,
      percentual_executado: perc || 0,
      observacao: draftAtividade.observacao || ''
    };

    const jaExiste = formData.atividades.some((a) => a.atividade_eap_id === item.atividade_eap_id);
    const novaLista = jaExiste
      ? formData.atividades.map((a) => a.atividade_eap_id === item.atividade_eap_id ? item : a)
      : [...formData.atividades, item];
    setFormData({ ...formData, atividades: novaLista });
    setDraftAtividade({ atividade_eap_id: '', percentual_executado: '', quantidade_executada: '', observacao: '' });
  };

  const removerAtividade = (id) => {
    setFormData({ ...formData, atividades: formData.atividades.filter((a) => a.atividade_eap_id !== id) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (!formData.data_relatorio) {
      setErro('Data do relatório é obrigatória.');
      return;
    }

    const payload = {
      ...formData,
      status: formData.status,
      projeto_id: parseInt(projetoId, 10),
      dia_semana: weekdayFromDate(formData.data_relatorio),
      mao_obra_detalhada: formData.mao_obra_detalhada || [],
      atividades: formData.atividades.map((a) => ({
        ...a,
        atividade_eap_id: parseInt(a.atividade_eap_id, 10),
        percentual_executado: parseFloat(a.percentual_executado)
      }))
    };

    try {
      setIsSaving(true);
      // validações: atividades percentuais
      for (const a of formData.atividades || []) {
        const p = parseFloat(a.percentual_executado || 0);
        if (isNaN(p) || p < 0 || p > 100) { setErro('Porcentagem de execução deve estar entre 0 e 100.'); return; }
      }
      if (rdoId) {
        await updateRDO(rdoId, payload);
        setSucesso('RDO atualizado.');
        // enviar clima por periodos
        try {
          await addRdoClima(rdoId, { periodo: 'manha', condicao_tempo: payload.clima_manha, condicao_trabalho: payload.praticabilidade_manha, pluviometria_mm: 0 });
          await addRdoClima(rdoId, { periodo: 'tarde', condicao_tempo: payload.clima_tarde, condicao_trabalho: payload.praticabilidade_tarde, pluviometria_mm: 0 });
          await addRdoClima(rdoId, { periodo: 'noite', condicao_tempo: payload.clima_noite, condicao_trabalho: payload.praticabilidade_noite, pluviometria_mm: payload.pluviometria_total || 0 });
        } catch (e) {}
      } else {
        const createResp = await createRDO(payload);
        setSucesso('RDO criado com sucesso.');
        // se criou, obter id e enviar clima e vinculos de mao de obra salvos localmente
        const newId = createResp.data.rdo.id || createResp.data.id;
        try {
          await addRdoClima(newId, { periodo: 'manha', condicao_tempo: payload.clima_manha, condicao_trabalho: payload.praticabilidade_manha, pluviometria_mm: 0 });
          await addRdoClima(newId, { periodo: 'tarde', condicao_tempo: payload.clima_tarde, condicao_trabalho: payload.praticabilidade_tarde, pluviometria_mm: 0 });
          await addRdoClima(newId, { periodo: 'noite', condicao_tempo: payload.clima_noite, condicao_trabalho: payload.praticabilidade_noite, pluviometria_mm: payload.pluviometria_total || 0 });
        } catch (e) {}
      }
      setTimeout(() => navigate(`/projeto/${projetoId}/rdos`), 800);
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao salvar RDO.');
    }
    finally { setIsSaving(false); }
  };

  const handleCreateMaoObra = async (nome, funcao) => {
    try {
      const res = await createMaoObra({ nome, funcao });
      const mo = await getMaoObra();
      setMaoObraCatalog(mo.data || []);
      return res.data.id;
    } catch (err) {
      setErro('Erro ao criar colaborador.');
    }
  };

  const openAddCatalogModal = (maoId) => {
    setCatalogMaoId(maoId);
    setCatalogEntrada('07:00');
    setCatalogSaidaAlm('12:00');
    setCatalogRetornoAlm('13:00');
    setCatalogSaida('17:00');
    setShowAddCatalogModal(true);
  };

  const handleConfirmAddCatalog = async () => {
    try {
      if (!rdoId) { setErro('Salve o RDO antes de vincular colaboradores.'); return; }
      await addRdoMaoObra(rdoId, { mao_obra_id: catalogMaoId, horario_entrada: catalogEntrada, horario_saida_almoco: catalogSaidaAlm, horario_retorno_almoco: catalogRetornoAlm, horario_saida_final: catalogSaida });
      const lista = await listRdoMaoObra(rdoId);
      setFormData(prev => ({ ...prev, mao_obra_detalhada: lista.data || prev.mao_obra_detalhada }));
      try { const refreshed = await getRDO(rdoId); setRdoFull(refreshed.data); } catch (e) {}
      setSucesso('Colaborador vinculado ao RDO.');
      setShowAddCatalogModal(false);
    } catch (err) { setErro('Erro ao vincular colaborador.'); }
  };

  const onSignatureFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    if (signaturePreview) {
      try { URL.revokeObjectURL(signaturePreview); } catch (e) {}
    }
    if (f) {
      setSelectedSignatureFile(f);
      setSignaturePreview(URL.createObjectURL(f));
    } else {
      setSelectedSignatureFile(null);
      setSignaturePreview(null);
    }
  };

  const handleAddComentario = async () => {
    try {
      if (!rdoId) { setErro('Salve o RDO antes de comentar.'); return; }
      await addRdoComentario(rdoId, { comentario: comentarioTexto });
      setComentarioTexto('');
      // refresh rdo
      try { const refreshed = await getRDO(rdoId); setRdoFull(refreshed.data); } catch (e) {}
      setSucesso('Comentário registrado.');
    } catch (err) { setErro('Erro ao registrar comentário.'); }
  };

  const handleUploadFoto = async (fileInput, atividadeId) => {
    try {
      if (!rdoId) { setErro('Salve o RDO antes de enviar fotos.'); return; }
      // backward compatible: accept DOM file input or File object
      const fd = new FormData();
      if (fileInput && fileInput.files) fd.append('arquivo', fileInput.files[0]);
      else if (fileInput instanceof File) fd.append('arquivo', fileInput);
      else { setErro('Arquivo inválido.'); return; }
      if (atividadeId) fd.append('rdo_atividade_id', atividadeId);
      const res = await uploadRdoFoto(rdoId, fd);
      setSucesso('Foto enviada.');
      // refresh rdo
      try { const refreshed = await getRDO(rdoId); setRdoFull(refreshed.data); } catch (e) {}
    } catch (err) { setErro('Erro ao enviar foto.'); }
  };

  const openPhotoModal = (atividadeId = null) => {
    setPhotoActivityId(atividadeId);
    setPhotoFile(null);
    if (photoPreview) { try { URL.revokeObjectURL(photoPreview); } catch (e) {} }
    setPhotoPreview(null);
    setShowPhotoModal(true);
  };

  const onPhotoFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    if (photoPreview) { try { URL.revokeObjectURL(photoPreview); } catch (e) {} }
    if (f) {
      setPhotoFile(f);
      setPhotoPreview(URL.createObjectURL(f));
    } else {
      setPhotoFile(null);
      setPhotoPreview(null);
    }
  };

  const confirmPhotoUpload = async () => {
    try {
      if (!photoFile) { setErro('Escolha um arquivo primeiro.'); return; }
      if (!rdoId) { setErro('Salve o RDO antes de enviar fotos.'); return; }
      setIsUploadingPhoto(true);
      await handleUploadFoto(photoFile, photoActivityId);
      setShowPhotoModal(false);
      if (photoPreview) { try { URL.revokeObjectURL(photoPreview); } catch (e) {} }
      setPhotoFile(null); setPhotoPreview(null);
    } catch (e) {
      setErro('Erro ao enviar foto.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleAddMaterial = async () => {
    try {
      if (!rdoId) { setErro('Salve o RDO antes de registrar materiais.'); return; }
      // validação cliente
      if (!materialForm.nome_material || materialForm.nome_material.trim() === '') { setErro('Nome do material é obrigatório.'); return; }
      const quantidadeNum = parseFloat(materialForm.quantidade || 0) || 0;
      const payload = { nome_material: materialForm.nome_material.trim(), quantidade: quantidadeNum, unidade: materialForm.unidade || null };
      const resp = await addRdoMaterial(rdoId, payload);
      setMaterialForm({ nome_material: '', quantidade: '', unidade: '' });
      try { const refreshed = await getRDO(rdoId); setRdoFull(refreshed.data); } catch (e) {}
      setSucesso('Material registrado.');
    } catch (err) { setErro('Erro ao registrar material.'); }
  };

  const handleAddOcorrencia = async () => {
    try {
      if (!rdoId) { setErro('Salve o RDO antes de registrar ocorrências.'); return; }
      await addRdoOcorrencia(rdoId, ocorrenciaForm);
      setOcorrenciaForm({ titulo: '', descricao: '', gravidade: '' });
      try { const refreshed = await getRDO(rdoId); setRdoFull(refreshed.data); } catch (e) {}
      setSucesso('Ocorrência registrada.');
    } catch (err) { setErro('Erro ao registrar ocorrência.'); }
  };

  const handleUploadSignature = async (file, tipo) => {
    try {
      if (!rdoId) { setErro('Salve o RDO antes de assinar.'); return; }
      if (!file) { setErro('Escolha um arquivo de assinatura.'); return; }
      setIsUploadingSignature(true);
      const fd = new FormData();
      fd.append('arquivo', file);
      // enviar como foto para armazenar
      const res = await uploadRdoFoto(rdoId, fd);
      const arquivo = res.data?.arquivo?.caminho_arquivo || res.data?.arquivo?.nome_arquivo || null;
      if (!arquivo) {
        setErro('Upload falhou.');
        setIsUploadingSignature(false);
        return;
      }
      // registrar assinatura apontando para o arquivo
      await addRdoAssinatura(rdoId, { tipo, arquivo_assinatura: arquivo });
      // refresh
      try { const refreshed = await getRDO(rdoId); setRdoFull(refreshed.data); } catch (e) {}
      setSucesso('Assinatura registrada.');
      // clear selection
      setSelectedSignatureFile(null);
      if (signaturePreview) { try { URL.revokeObjectURL(signaturePreview); } catch (e) {} }
      setSignaturePreview(null);
      if (signatureFileRef.current) signatureFileRef.current.value = '';
    } catch (err) { setErro('Erro ao enviar assinatura.'); }
    finally { setIsUploadingSignature(false); }
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
        <div className="flex-between mb-3">
          <div>
            <p className="eyebrow">Projeto #{projetoId}</p>
            <h1>{rdoId ? 'Editar RDO' : 'Novo RDO'}</h1>
          </div>
          <div style={{ marginTop: '18px' }}>
            <p className="eyebrow">👷 Mão de obra detalhada</p>
            {formData.mao_obra_detalhada && formData.mao_obra_detalhada.map((m, idx) => (
              <div key={idx} className="card" style={{ padding: 12, marginBottom: 8 }}>
                <div className="grid grid-2">
                  <div>
                    <label className="form-label">Nome</label>
                    <input className="form-input" value={m.nome || ''} onChange={(e) => {
                      const nova = [...formData.mao_obra_detalhada]; nova[idx] = { ...nova[idx], nome: e.target.value }; setFormData({ ...formData, mao_obra_detalhada: nova });
                    }} />
                  </div>
                  <div>
                    <label className="form-label">Função</label>
                    <input className="form-input" value={m.funcao || ''} onChange={(e) => {
                      const nova = [...formData.mao_obra_detalhada]; nova[idx] = { ...nova[idx], funcao: e.target.value }; setFormData({ ...formData, mao_obra_detalhada: nova });
                    }} />
                  </div>
                </div>
                <div className="grid grid-3" style={{ marginTop: 8 }}>
                  <div>
                    <label className="form-label">Entrada</label>
                    <input type="time" className="form-input" value={m.entrada || ''} onChange={(e) => { const nova = [...formData.mao_obra_detalhada]; nova[idx] = { ...nova[idx], entrada: e.target.value }; nova[idx].horas = calcHorasInterval(nova[idx].entrada, nova[idx].saida, nova[idx].intervalo_inicio, nova[idx].intervalo_fim); setFormData({ ...formData, mao_obra_detalhada: nova }); }} />
                  </div>
                  <div>
                    <label className="form-label">Saída</label>
                    <input type="time" className="form-input" value={m.saida || ''} onChange={(e) => { const nova = [...formData.mao_obra_detalhada]; nova[idx] = { ...nova[idx], saida: e.target.value }; nova[idx].horas = calcHorasInterval(nova[idx].entrada, nova[idx].saida, nova[idx].intervalo_inicio, nova[idx].intervalo_fim); setFormData({ ...formData, mao_obra_detalhada: nova }); }} />
                  </div>
                  <div>
                    <label className="form-label">Horas</label>
                    <input type="number" step="0.25" className="form-input" value={m.horas || 0} onChange={(e) => { const nova = [...formData.mao_obra_detalhada]; nova[idx] = { ...nova[idx], horas: parseFloat(e.target.value) || 0 }; setFormData({ ...formData, mao_obra_detalhada: nova }); }} />
                  </div>
                </div>
                <div className="grid grid-3" style={{ marginTop: 8 }}>
                  <div>
                    <label className="form-label">Intervalo Início</label>
                    <input type="time" className="form-input" value={m.intervalo_inicio || ''} onChange={(e) => { const nova = [...formData.mao_obra_detalhada]; nova[idx] = { ...nova[idx], intervalo_inicio: e.target.value }; nova[idx].horas = calcHorasInterval(nova[idx].entrada, nova[idx].saida, nova[idx].intervalo_inicio, nova[idx].intervalo_fim); setFormData({ ...formData, mao_obra_detalhada: nova }); }} />
                  </div>
                  <div>
                    <label className="form-label">Intervalo Fim</label>
                    <input type="time" className="form-input" value={m.intervalo_fim || ''} onChange={(e) => { const nova = [...formData.mao_obra_detalhada]; nova[idx] = { ...nova[idx], intervalo_fim: e.target.value }; nova[idx].horas = calcHorasInterval(nova[idx].entrada, nova[idx].saida, nova[idx].intervalo_inicio, nova[idx].intervalo_fim); setFormData({ ...formData, mao_obra_detalhada: nova }); }} />
                  </div>
                  <div />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" className="btn btn-danger" onClick={() => { const nova = formData.mao_obra_detalhada.filter((_, i) => i !== idx); setFormData({ ...formData, mao_obra_detalhada: nova }); }}>Remover</button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => { const nova = [...(formData.mao_obra_detalhada || []), { nome: '', funcao: '', entrada: '', saida: '', horas: 0 }]; setFormData({ ...formData, mao_obra_detalhada: nova }); }}>Adicionar colaborador</button>
            </div>
          </div>
          <div>

          <div style={{ marginTop: '18px' }}>
            <p className="eyebrow">📚 Catálogo de Mão de Obra</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {maoObraCatalog.map((m) => (
                <div key={m.id} className="card" style={{ padding: 8 }}>
                  <div><strong>{m.nome}</strong></div>
                  <div style={{ color: 'var(--gray-600)' }}>{m.funcao}</div>
                  <div style={{ marginTop: 6 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => handleAddCatalogToRdo(m.id)}>Adicionar ao RDO</button>
                  </div>
                </div>
              ))}
              <div className="card" style={{ padding: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateMaoModal(true)}>Criar novo</button>
              </div>
            </div>
          </div>

          {rdoFull && (
            <div style={{ marginTop: '18px' }}>
              <p className="eyebrow">🖼️ Galeria de Fotos</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                {(rdoFull.fotos || []).map((f) => (
                  <div key={f.id} className="card" style={{ padding: 8 }}>
                    <img src={`/uploads/${f.caminho_arquivo}`} alt={f.nome_arquivo} style={{ width: '100%', height: 120, objectFit: 'cover', cursor: 'zoom-in' }} onClick={() => { setLightboxSrc(`/uploads/${f.caminho_arquivo}`); setLightboxAlt(f.nome_arquivo); setLightboxOpen(true); }} />
                    <div style={{ fontSize: '0.85rem', marginTop: 6 }}>{f.atividade_descricao || 'Geral'}</div>
                  </div>
                ))}
                  <div className="card" style={{ padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <button className="btn btn-secondary" onClick={() => openPhotoModal(null)}><UploadCloud size={14} /> Enviar foto geral</button>
                  </div>
              </div>
            </div>
          )}
          {rdoFull && (
            <>
              <div style={{ marginTop: 12 }}>
                <p className="eyebrow">✍️ Assinaturas</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input type="file" ref={signatureFileRef} accept="image/*,application/pdf" onChange={onSignatureFileChange} />
                  <select defaultValue="gestor" id="tipoAssinatura" style={{ padding: '8px' }}>
                    <option value="gestor">Gestor</option>
                    <option value="responsavel">Responsável</option>
                  </select>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    const file = selectedSignatureFile; const tipo = document.getElementById('tipoAssinatura')?.value || 'gestor';
                    handleUploadSignature(file, tipo);
                  }} disabled={isUploadingSignature}>{isUploadingSignature ? 'Enviando...' : (<><UploadCloud size={14} /> Enviar assinatura</>)}</button>
                </div>
                {signaturePreview && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)' }}>Preview da assinatura</div>
                    <img src={signaturePreview} alt="preview" style={{ width: 240, height: 120, objectFit: 'contain', marginTop: 6 }} />
                    <div style={{ marginTop: 6 }}>
                      <button className="btn btn-secondary" onClick={() => { if (signaturePreview) try { URL.revokeObjectURL(signaturePreview); } catch(e){} setSignaturePreview(null); setSelectedSignatureFile(null); if (signatureFileRef.current) signatureFileRef.current.value=''; }}>Remover</button>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(rdoFull.assinaturas || []).map((a) => (
                    <div key={a.id} className="card" style={{ padding: 8 }}>
                      <img src={`/uploads/${a.arquivo_assinatura}`} alt={`assinatura-${a.id}`} style={{ width: 160, height: 80, objectFit: 'contain', cursor: 'zoom-in' }} onClick={() => { setLightboxSrc(`/uploads/${a.arquivo_assinatura}`); setLightboxAlt(`Assinatura ${a.tipo}`); setLightboxOpen(true); }} />
                      <div style={{ fontSize: '0.85rem', marginTop: 6 }}>{a.tipo} · {a.usuario_id}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
            <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rdos`)}>Voltar</button>
          </div>
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-2" style={{ marginBottom: '24px' }}>
            <div className="form-group">
              <label className="form-label">Data do relatório *</label>
              <input
                type="date"
                className="form-input"
                value={formData.data_relatorio}
                onChange={(e) => setFormData({ ...formData, data_relatorio: e.target.value, dia_semana: weekdayFromDate(e.target.value) })}
                required
              />
              {formData.dia_semana && <small style={{ color: 'var(--gray-500)' }}>{formData.dia_semana}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                <option value="Em preenchimento">Em preenchimento</option>
                <option value="Em análise">Enviado para aprovação</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Horas trabalhadas</label>
              <input
                type="number"
                className="form-input"
                value={formData.horas_trabalhadas}
                onChange={(e) => setFormData({ ...formData, horas_trabalhadas: parseFloat(e.target.value) || 0 })}
                step="0.5"
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <p className="eyebrow">⏰ Horário de trabalho</p>
            <div className="grid grid-2" style={{ gap: '12px' }}>
              <div>
                <label className="form-label">Entrada</label>
                <input type="time" className="form-input" value={formData.entrada_saida_inicio} onChange={(e) => setFormData({ ...formData, entrada_saida_inicio: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Saída</label>
                <input type="time" className="form-input" value={formData.entrada_saida_fim} onChange={(e) => setFormData({ ...formData, entrada_saida_fim: e.target.value })} />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <p className="eyebrow">☁️ Condições Climáticas</p>
            <div className="grid grid-3" style={{ gap: '12px' }}>
              <div>
                <label className="form-label">Manhã - Condição</label>
                <select className="form-select" value={formData.clima_manha} onChange={(e) => setFormData({ ...formData, clima_manha: e.target.value })}>
                  <option>Claro</option>
                  <option>Nublado</option>
                  <option>Chuvoso</option>
                </select>
                <label className="form-label">Trabalhabilidade</label>
                <select className="form-select" value={formData.praticabilidade_manha} onChange={(e) => setFormData({ ...formData, praticabilidade_manha: e.target.value })}>
                  <option>Praticável</option>
                  <option>Impraticável</option>
                </select>
              </div>
              <div>
                <label className="form-label">Tarde - Condição</label>
                <select className="form-select" value={formData.clima_tarde} onChange={(e) => setFormData({ ...formData, clima_tarde: e.target.value })}>
                  <option>Claro</option>
                  <option>Nublado</option>
                  <option>Chuvoso</option>
                </select>
                <label className="form-label">Trabalhabilidade</label>
                <select className="form-select" value={formData.praticabilidade_tarde} onChange={(e) => setFormData({ ...formData, praticabilidade_tarde: e.target.value })}>
                  <option>Praticável</option>
                  <option>Impraticável</option>
                </select>
              </div>
              <div>
                <label className="form-label">Noite - Condição</label>
                <select className="form-select" value={formData.clima_noite} onChange={(e) => setFormData({ ...formData, clima_noite: e.target.value })}>
                  <option>Claro</option>
                  <option>Nublado</option>
                  <option>Chuvoso</option>
                </select>
                <label className="form-label">Pluviometria diária (mm)</label>
                <input type="number" className="form-input" value={formData.pluviometria_total || 0} onChange={(e) => setFormData({ ...formData, pluviometria_total: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <p className="eyebrow">📋 Atividades executadas</p>
                <div>
                  <label className="form-label">Atividade (clique para expandir)</label>
                  <select className="form-select" value={draftAtividade.atividade_eap_id} onChange={(e) => {
                    const val = e.target.value;
                    const info = atividadesEap.find(a => a.id === Number(val));
                    setDraftAtividade({ ...draftAtividade, atividade_eap_id: val, percentual_executado: info ? (info.percentual_executado || '') : '', quantidade_executada: '' });
                  }}>
                    <option value="">Selecione atividade</option>
                    {atividadeGroups.map((g) => (
                      <optgroup key={g.parent.id} label={`${g.parent.codigo_eap} · ${g.parent.descricao || ''}`}>
                        {g.children.filter(a => (a.percentual_executado || 0) < 100).map((a) => (
                          <option key={a.id} value={a.id} style={{ fontStyle: 'italic' }}>{a.codigo_eap} · {a.descricao}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {/* Modo de inserção simplificado: manter apenas o select para seleção de sub-atividades. */}
                  <div style={{ marginTop: 8 }}>
                    {/** ao selecionar uma atividade, já mostramos o avanço atual (se houver) */}
                    {draftAtividade.atividade_eap_id && (() => {
                      const ativSelecionada = atividadesEap.find(a => a.id === Number(draftAtividade.atividade_eap_id));
                      if (!ativSelecionada) return null;
                      return (
                        <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)', marginTop: 6 }}>
                          Avanço atual: <strong>{(ativSelecionada.percentual_executado || 0).toFixed ? (ativSelecionada.percentual_executado || 0).toFixed(1) + '%' : (ativSelecionada.percentual_executado || 0) + '%'}</strong>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              {draftAtividade.atividade_eap_id && (
                <>
                  <div>
                    <label className="form-label">Previsão</label>
                    <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)' }}>
                      {(() => {
                        const ativSelecionada = atividadesEap.find(a => a.id === Number(draftAtividade.atividade_eap_id));
                        return ativSelecionada ? `${ativSelecionada.quantidade_total || 0} ${ativSelecionada.unidade_medida || ''}` : '-';
                      })()}
                    </div>
                    <input type="number" className="form-input" placeholder="Você executou..." value={draftAtividade.quantidade_executada} onChange={(e) => setDraftAtividade({ ...draftAtividade, quantidade_executada: e.target.value })} style={{ width: 120 }} />
                  </div>
                  <div>
                    <label className="form-label">% Executado</label>
                    <input type="number" className="form-input" placeholder="% executado" value={draftAtividade.percentual_executado} onChange={(e) => setDraftAtividade({ ...draftAtividade, percentual_executado: e.target.value })} min="0" max="100" style={{ width: 120 }} />
                  </div>
                </>
              )}
            </div>
            <input type="text" className="form-input" placeholder="Observação (opcional)" value={draftAtividade.observacao} onChange={(e) => setDraftAtividade({ ...draftAtividade, observacao: e.target.value })} style={{ marginTop: '12px' }} />
            <button type="button" className="btn btn-secondary mt-2" onClick={handleAddAtividade}><Plus size={16} /> Adicionar atividade</button>

            {formData.atividades.length > 0 && (
              <div className="mt-2">
                {formData.atividades.map((a) => {
                  const info = atividadesEap.find((item) => item.id === Number(a.atividade_eap_id));
                  return (
                    <div key={a.atividade_eap_id} className="card" style={{ padding: '12px', marginBottom: '8px', backgroundColor: '#f9fafb' }}>
                      <div className="flex-between">
                        <div style={{ flex: 1 }}>
                          <strong>{info?.codigo_eap}</strong> · {info?.descricao}
                          <p style={{ color: 'var(--gray-500)', marginTop: '4px', fontSize: '0.9rem' }}>{info?.quantidade_total} {info?.unidade_medida} previsto | Executou: <strong>{a.quantidade_executada}</strong> {info?.unidade_medida}</p>
                          <p style={{ color: 'var(--gray-500)', marginTop: '4px', fontSize: '0.9rem' }}>{a.percentual_executado}% | {a.observacao}</p>
                        </div>
                        <button type="button" className="btn btn-danger" onClick={() => removerAtividade(a.atividade_eap_id)}><Trash2 size={14} /></button>
                        <button type="button" className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => openPhotoModal(a.atividade_eap_id)}>Enviar foto</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          
          

          <div style={{ marginTop: '18px' }}>
            <p className="eyebrow">💬 Comentários</p>
            <div className="form-group">
              <textarea className="form-textarea" value={comentarioTexto} onChange={(e) => setComentarioTexto(e.target.value)} placeholder="Adicione um comentário" />
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={handleAddComentario}>Adicionar comentário</button>
              </div>
            </div>

            <p className="eyebrow" style={{ marginTop: 12 }}>📦 Materiais Recebidos</p>
            <div className="grid grid-3" style={{ gap: 8 }}>
              <input className="form-input" placeholder="Nome do material" value={materialForm.nome_material} onChange={(e) => setMaterialForm({ ...materialForm, nome_material: e.target.value })} />
              <input className="form-input" placeholder="Quantidade" value={materialForm.quantidade} onChange={(e) => setMaterialForm({ ...materialForm, quantidade: e.target.value })} />
              <input className="form-input" placeholder="Unidade" value={materialForm.unidade} onChange={(e) => setMaterialForm({ ...materialForm, unidade: e.target.value })} />
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={handleAddMaterial}>Registrar material</button>
            </div>

            <p className="eyebrow" style={{ marginTop: 12 }}>⚠️ Ocorrências</p>
            <div className="form-group">
              <input className="form-input" placeholder="Título" value={ocorrenciaForm.titulo} onChange={(e) => setOcorrenciaForm({ ...ocorrenciaForm, titulo: e.target.value })} />
              <textarea className="form-textarea" placeholder="Descrição" value={ocorrenciaForm.descricao} onChange={(e) => setOcorrenciaForm({ ...ocorrenciaForm, descricao: e.target.value })} />
              <input className="form-input" placeholder="Gravidade" value={ocorrenciaForm.gravidade} onChange={(e) => setOcorrenciaForm({ ...ocorrenciaForm, gravidade: e.target.value })} />
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={handleAddOcorrencia}>Registrar ocorrência</button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="form-group">
                <label className="form-label">Equipamentos</label>
                <input type="text" className="form-input" value={formData.equipamentos} onChange={(e) => setFormData({ ...formData, equipamentos: e.target.value })} placeholder="Equipamentos utilizados" />
              </div>
            <div className="form-group">
              <label className="form-label">Ocorrências</label>
              <textarea className="form-textarea" value={formData.ocorrencias} onChange={(e) => setFormData({ ...formData, ocorrencias: e.target.value })} placeholder="Descreva ocorrências" />
            </div>
            <div className="form-group">
              <label className="form-label">Comentários</label>
              <textarea className="form-textarea" value={formData.comentarios} onChange={(e) => setFormData({ ...formData, comentarios: e.target.value })} placeholder="Comentários gerais" />
            </div>
          </div>

          </div>

            <div style={{ marginTop: 16 }} className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rdos`)}>Cancelar</button>
            <button type="button" className="btn btn-outline" onClick={openRelatorio}>Visualizar Relatório</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>{isSaving ? 'Salvando...' : (rdoId ? 'Salvar alterações' : 'Salvar RDO')}</button>
          </div>
        </form>
        {/* Modais */}
        <Modal open={showCreateMaoModal} title="Criar novo colaborador" onClose={() => setShowCreateMaoModal(false)}>
          <div>
            <label className="form-label">Nome</label>
            <input className="form-input" value={newMaoNome} onChange={(e) => setNewMaoNome(e.target.value)} />
            <label className="form-label">Função</label>
            <input className="form-input" value={newMaoFuncao} onChange={(e) => setNewMaoFuncao(e.target.value)} />
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowCreateMaoModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={async () => {
                if (!newMaoNome) { setErro('Nome requerido.'); return; }
                const id = await handleCreateMaoObra(newMaoNome, newMaoFuncao);
                setNewMaoNome(''); setNewMaoFuncao(''); setShowCreateMaoModal(false);
                if (id && rdoId) {
                  // opcionalmente adicionar ao RDO automaticamente
                }
              }}>Criar</button>
            </div>
          </div>
        </Modal>

        <Modal open={showAddCatalogModal} title="Vincular colaborador ao RDO" onClose={() => setShowAddCatalogModal(false)}>
          <div>
            <div className="form-group">
              <label className="form-label">Entrada</label>
              <input type="time" className="form-input" value={catalogEntrada} onChange={(e) => setCatalogEntrada(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Início do almoço</label>
              <input type="time" className="form-input" value={catalogSaidaAlm} onChange={(e) => setCatalogSaidaAlm(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Retorno do almoço</label>
              <input type="time" className="form-input" value={catalogRetornoAlm} onChange={(e) => setCatalogRetornoAlm(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Saída</label>
              <input type="time" className="form-input" value={catalogSaida} onChange={(e) => setCatalogSaida(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowAddCatalogModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirmAddCatalog}>Vincular</button>
            </div>
          </div>
        </Modal>

        <Modal open={showPhotoModal} title={photoActivityId ? 'Enviar foto para atividade' : 'Enviar foto (Geral)'} onClose={() => setShowPhotoModal(false)}>
          <div>
            <input type="file" accept="image/*" onChange={onPhotoFileChange} />
            {photoPreview && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)' }}>Preview</div>
                <img src={photoPreview} alt="preview" style={{ width: '100%', maxWidth: 480, height: 240, objectFit: 'cover', marginTop: 6 }} />
              </div>
            )}
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => { setShowPhotoModal(false); if (photoPreview) try { URL.revokeObjectURL(photoPreview); } catch(e){} setPhotoPreview(null); setPhotoFile(null); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmPhotoUpload} disabled={isUploadingPhoto}>{isUploadingPhoto ? 'Enviando...' : 'Enviar foto'}</button>
            </div>
          </div>
        </Modal>

        <Lightbox open={lightboxOpen} src={lightboxSrc} alt={lightboxAlt} onClose={() => setLightboxOpen(false)} />
      </div>
    </>
  );
}

export default RDOForm;
