import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { getAtividadesEAP, getRDO, createRDO, updateRDO, addRdoClima, addRdoComentario, addRdoOcorrencia, addRdoMaterial, uploadRdoFoto, updateStatusRDO, getExecucaoAcumulada, getRdoColaboradores, createRdoColaborador } from '../services/api';
import { Plus, Trash2 } from 'lucide-react';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { useDialog } from '../context/DialogContext';

const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const weekdayFromLocalDateInput = (val) => {
  if (!val) return '';
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const dt = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
    return dias[dt.getDay()];
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : dias[d.getDay()];
};

function RDOForm2() {
  const { projetoId, rdoId } = useParams();
  const navigate = useNavigate();
  const { setDirty } = useLeaveGuard();
  const { usuario } = useAuth();
  const { alert, confirm } = useDialog();

  const [atividadesEap, setAtividadesEap] = useState([]);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [execucaoAcum, setExecucaoAcum] = useState({}); // { atividade_eap_id: total_executado }
  const [colaboradoresDisponiveis, setColaboradoresDisponiveis] = useState([]);

  const [formData, setFormData] = useState({
    data_relatorio: '',
    dia_semana: '',
    entrada_saida_inicio: '07:00',
    entrada_saida_fim: '17:00',
    intervalo_almoco_inicio: '12:00',
    intervalo_almoco_fim: '13:00',
    atividades: [],
    climaRegistros: [],
    mao_obra_detalhada: [],
    equipamentos_detalhados: [],
    ocorrencias_lista: [],
    comentarios_lista: [],
    materiais_lista: []
  });

  const [draftAtividade, setDraftAtividade] = useState({ atividade_eap_id: '', quantidade_executada: '', unidade_medida: '', percentual_executada: '', observacao: '' });
  const [atividadeFotosQueue, setAtividadeFotosQueue] = useState({}); // {atividade_eap_id: { file, descricao }}

  // Helpers de formatação (pt-BR)
  const nf0 = useMemo(() => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }), []);
  const nf2 = useMemo(() => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), []);
  const pf = useMemo(() => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }), []);
  const formatQtd = (n) => {
    const num = Number(n || 0);
    return Number.isInteger(num) ? nf0.format(num) : nf2.format(num);
  };
  const formatPerc = (p) => `${pf.format(Math.min(Math.max(Number(p || 0), 0), 100))}%`;

  useEffect(() => {
    const carregar = async () => {
      try {
        const eapRes = await getAtividadesEAP(projetoId);
        setAtividadesEap(eapRes.data || []);
        // carregar execução acumulada das atividades com base em RDOs aprovados
        try {
          const exRes = await getExecucaoAcumulada(projetoId);
          const map = {};
          (exRes.data || []).forEach(row => { map[String(row.atividade_eap_id)] = Number(row.total_executado || 0); });
          setExecucaoAcum(map);
        } catch {}
        try {
          const colabRes = await getRdoColaboradores(projetoId);
          setColaboradoresDisponiveis(Array.isArray(colabRes.data) ? colabRes.data : []);
        } catch {
          setColaboradoresDisponiveis([]);
        }
        if (rdoId) {
          let rdo;
          try {
            const res = await getRDO(rdoId);
            rdo = res.data;
          } catch (err) {
            setErro(err?.response?.status === 404 ? 'RDO removido ou não encontrado.' : 'Erro ao carregar dados do formulário.');
            rdo = null;
          }
          if (!rdo) return;
          setFormData({
            data_relatorio: rdo.data_relatorio,
            dia_semana: rdo.dia_semana,
            entrada_saida_inicio: rdo.entrada_saida_inicio || '07:00',
            entrada_saida_fim: rdo.entrada_saida_fim || '17:00',
            intervalo_almoco_inicio: rdo.intervalo_almoco_inicio || '12:00',
            intervalo_almoco_fim: rdo.intervalo_almoco_fim || '13:00',
            atividades: (rdo.atividades || []).map(a => ({
              atividade_eap_id: a.atividade_eap_id,
              percentual_executado: a.percentual_executado,
              quantidade_executada: a.quantidade_executada || '',
              unidade_medida: (() => {
                const sel = eapRes.data?.find(x => String(x.id) === String(a.atividade_eap_id));
                return sel ? (sel.unidade_medida || '') : '';
              })(),
              observacao: a.observacao || ''
            })),
            climaRegistros: (rdo.clima || []).map(c => ({ periodo: c.periodo, condicao_tempo: c.condicao_tempo || 'Claro', condicao_trabalho: c.condicao_trabalho || 'Praticável', pluviometria_mm: c.pluviometria_mm || 0 })),
            mao_obra_detalhada: Array.isArray(rdo.mao_obra_detalhada) ? rdo.mao_obra_detalhada : [],
            equipamentos_detalhados: (() => { try { return rdo.equipamentos && rdo.equipamentos.startsWith('[') ? JSON.parse(rdo.equipamentos) : []; } catch { return []; } })(),
            ocorrencias_lista: (rdo.ocorrencias || []).map((o) => ({
              id: o.id,
              titulo: o.titulo || '',
              descricao: o.descricao || '',
              gravidade: o.gravidade || 'Baixa'
            })),
            comentarios_lista: []
            ,
            materiais_lista: (rdo.materiais || []).map((m) => ({
              id: m.id,
              nome: m.nome_material || '',
              quantidade: Number(m.quantidade || 0),
              unidade: m.unidade || null
            }))
          });
          setComentariosExistentes((rdo.comentarios || []).map(c => ({ id: c.id, comentario: c.comentario, autor_nome: c.autor_nome, criado_em: c.criado_em })));

          // Não exibir último avanço/recalculado no formulário; manter somente avanço do dia
        } else {
          // Novo RDO: copiar mão de obra detalhada, atividades e equipamentos do último RDO do projeto
          try {
            const { getRDOs } = await import('../services/api');
            const lista = (await getRDOs(projetoId)).data || [];
            if (lista.length > 0) {
              const listaAprovados = lista.filter((item) => String(item.status || '') === 'Aprovado');
              const baseLista = listaAprovados.length > 0 ? listaAprovados : lista;
              const ultimo = baseLista.reduce((acc, cur) => {
                const toDate = (s) => { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10)) : new Date(s); };
                const dAcc = acc ? toDate(acc.data_relatorio) : null;
                const dCur = toDate(cur.data_relatorio);
                return (!acc || (dCur.getTime() > dAcc.getTime())) ? cur : acc;
              }, null);
              if (ultimo) {
                const equipamentos = (() => { try { return ultimo.equipamentos && String(ultimo.equipamentos).startsWith('[') ? JSON.parse(ultimo.equipamentos) : []; } catch { return []; } })();
                const atividadesCopia = (await (async () => {
                  try {
                    const det = await getRDO(ultimo.id);
                    const atvs = det.data?.atividades || [];
                    return atvs
                      .map(a => {
                        const sel = (eapRes.data || []).find(x => String(x.id) === String(a.atividade_eap_id));
                        return { atividade_eap_id: a.atividade_eap_id, quantidade_executada: '', unidade_medida: sel ? (sel.unidade_medida || '') : '', percentual_executado: 0, observacao: '' };
                      });
                  } catch { return []; }
                })());
                const maoObraDetalhada = (() => {
                  if (Array.isArray(ultimo.mao_obra_detalhada)) return ultimo.mao_obra_detalhada;
                  try {
                    const parsed = ultimo.mao_obra_detalhada ? JSON.parse(ultimo.mao_obra_detalhada) : [];
                    return Array.isArray(parsed) ? parsed : [];
                  } catch {
                    return [];
                  }
                })();
                setFormData(prev => ({
                  ...prev,
                  mao_obra_detalhada: maoObraDetalhada,
                  equipamentos_detalhados: equipamentos,
                  atividades: atividadesCopia
                }));
              }
            }
          } catch {}
        }
      } catch (e) {
        setErro('Erro ao carregar dados do formulário.');
      }
    };
    carregar();
    return () => { try { setDirty(false); } catch {} };
  }, [projetoId, rdoId]);

  // Ordenação por código EAP (ex.: 1.2 < 1.10 < 2.1)
  const compareCodigo = (a, b) => {
    const sa = String(a).split('.').map(n => parseInt(n, 10));
    const sb = String(b).split('.').map(n => parseInt(n, 10));
    const len = Math.max(sa.length, sb.length);
    for (let i = 0; i < len; i++) {
      const va = sa[i] ?? 0;
      const vb = sb[i] ?? 0;
      if (va !== vb) return va - vb;
    }
    return 0;
  };

  // Selecionáveis: apenas folhas com pai (não permitir selecionar atividade mãe)
  const groupedLeafsByParent = useMemo(() => {
    if (!Array.isArray(atividadesEap) || atividadesEap.length === 0) return [];
    const parentIds = new Set(atividadesEap.map(a => a.pai_id).filter(id => id != null));
    const leaves = atividadesEap.filter(a => a.pai_id != null && !atividadesEap.some(x => x.pai_id === a.id));

    // Agrupar folhas por pai
    const groupsMap = new Map();
    for (const leaf of leaves) {
      const pid = leaf.pai_id;
      if (!groupsMap.has(pid)) groupsMap.set(pid, []);
      groupsMap.get(pid).push(leaf);
    }

    // Montar grupos com pai e ordenar
    let groups = Array.from(groupsMap.entries()).map(([pid, children]) => {
      const parent = atividadesEap.find(a => a.id === pid) || null;
      children.sort((c1, c2) => compareCodigo(c1.codigo_eap, c2.codigo_eap));
      return { parentId: pid, parent, children };
    });

    groups.sort((g1, g2) => compareCodigo(g1.parent?.codigo_eap || '0', g2.parent?.codigo_eap || '0'));
    return groups;
  }, [atividadesEap]);

  const toMinutes = (t) => {
    if (!t) return null;
    const m = t.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
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

  const getAtividadeLimites = (atividadeEapId) => {
    const atividadeSel = atividadesEap.find((atividade) => String(atividade.id) === String(atividadeEapId));
    const quantidadeTotal = atividadeSel ? Number(atividadeSel.quantidade_total || 0) : 0;
    const execAprovado = atividadeSel ? Number(execucaoAcum[String(atividadeSel.id)] || 0) : 0;
    const restante = quantidadeTotal > 0 ? Math.max(quantidadeTotal - execAprovado, 0) : null;
    return { atividadeSel, quantidadeTotal, execAprovado, restante };
  };

  const handleAddAtividade = () => {
    if (!draftAtividade.atividade_eap_id) return;
    const { atividadeSel, quantidadeTotal, restante } = getAtividadeLimites(draftAtividade.atividade_eap_id);
    const qtdExec = draftAtividade.quantidade_executada !== '' ? Number(draftAtividade.quantidade_executada) : null;
    if (qtdExec !== null && !Number.isFinite(qtdExec)) {
      setErro('Quantidade executada inválida.');
      return;
    }
    if (qtdExec !== null && qtdExec < 0) {
      setErro('Quantidade executada não pode ser negativa.');
      return;
    }
    if (qtdExec !== null && quantidadeTotal > 0 && restante != null && qtdExec > restante) {
      setErro(`Quantidade acima do permitido para esta atividade. Restante disponível: ${formatQtd(restante)} ${atividadeSel?.unidade_medida || ''}.`);
      return;
    }
    let percAuto = 0;
    if (qtdExec !== null && quantidadeTotal > 0) {
      percAuto = Math.min(Math.round((qtdExec / quantidadeTotal) * 10000) / 100, 100);
    }
    const item = {
      atividade_eap_id: draftAtividade.atividade_eap_id,
      quantidade_executada: draftAtividade.quantidade_executada,
      unidade_medida: draftAtividade.unidade_medida || (atividadeSel ? (atividadeSel.unidade_medida || '') : ''),
      percentual_executado: percAuto,
      observacao: draftAtividade.observacao || ''
    };
    const jaExiste = formData.atividades.some((a) => a.atividade_eap_id === item.atividade_eap_id);
    const novaLista = jaExiste
      ? formData.atividades.map((a) => a.atividade_eap_id === item.atividade_eap_id ? item : a)
      : [...formData.atividades, item];
    setFormData({ ...formData, atividades: novaLista });
    setErro('');
    setDraftAtividade({ atividade_eap_id: '', quantidade_executada: '', percentual_executada: '', observacao: '' });
    setDirty(true);
  };

  const removerAtividade = (id) => {
    setFormData({ ...formData, atividades: formData.atividades.filter((a) => a.atividade_eap_id !== id) });
  };

  // Clima
  const [draftClima, setDraftClima] = useState({ periodo: 'Manhã', condicao_tempo: 'Claro', condicao_trabalho: 'Praticável', pluviometria_mm: 0 });
  const [climaFotosQueue, setClimaFotosQueue] = useState({}); // {periodo: { file, descricao }}
  const addClimaRegistro = () => {
    const existe = formData.climaRegistros.some(c => c.periodo === draftClima.periodo);
    const lista = existe ? formData.climaRegistros.map(c => c.periodo === draftClima.periodo ? draftClima : c) : [...formData.climaRegistros, draftClima];
    setFormData({ ...formData, climaRegistros: lista });
    setDraftClima({ periodo: 'Manhã', condicao_tempo: 'Claro', condicao_trabalho: 'Praticável', pluviometria_mm: 0 });
    setDirty(true);
  };
  const removeClimaRegistro = (periodo) => {
    setFormData({ ...formData, climaRegistros: formData.climaRegistros.filter(c => c.periodo !== periodo) });
  };

  // Mão de obra detalhada
  const [draftColab, setDraftColab] = useState({ nome: '', funcao: '', tipo: 'Direta', entrada: '07:00', saida_almoco: '12:00', retorno_almoco: '13:00', saida_final: '17:00' });
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState('');
  const chaveColaborador = (nome, funcao) => `${String(nome || '').trim().toLowerCase()}|${String(funcao || '').trim().toLowerCase()}`;
  const colaboradoresSelecionaveis = useMemo(() => {
    return colaboradoresDisponiveis.filter((item) => {
      const chaveItem = chaveColaborador(item?.nome, item?.funcao);
      return !formData.mao_obra_detalhada.some((c) => chaveColaborador(c?.nome, c?.funcao) === chaveItem);
    });
  }, [colaboradoresDisponiveis, formData.mao_obra_detalhada]);

  const onSelecionarColaborador = (valorSelecionado) => {
    setColaboradorSelecionado(valorSelecionado);
    if (valorSelecionado === '') return;
    const item = colaboradoresSelecionaveis.find((colab) => chaveColaborador(colab?.nome, colab?.funcao) === valorSelecionado);
    if (!item) return;
    setDraftColab((prev) => ({
      ...prev,
      nome: item.nome || prev.nome,
      funcao: item.funcao || prev.funcao
    }));
  };
  const addColab = async () => {
    if (!draftColab.nome) return;

    const nomeDigitado = String(draftColab.nome || '').trim();
    const funcaoDigitada = String(draftColab.funcao || '').trim();
    const nomeExisteNaLista = colaboradoresDisponiveis.some((item) => String(item?.nome || '').trim().toLowerCase() === nomeDigitado.toLowerCase());

    if (!nomeExisteNaLista) {
      const desejaCadastrar = await confirm({
        title: 'Cadastrar nova mão de obra?',
        message: `"${nomeDigitado}" não está na lista de colaboradores. Deseja cadastrar agora como mão de obra direta?`,
        confirmText: 'Cadastrar',
        cancelText: 'Não cadastrar'
      });

      if (desejaCadastrar) {
        if (!funcaoDigitada) {
          await alert({ title: 'Função obrigatória', message: 'Para cadastrar nova mão de obra, informe a função.' });
          return;
        }
        try {
          const resp = await createRdoColaborador(projetoId, { nome: nomeDigitado, funcao: funcaoDigitada });
          const novo = resp?.data?.item;
          if (novo?.nome) {
            setColaboradoresDisponiveis((prev) => {
              const jaExiste = prev.some((item) =>
                String(item.nome || '').trim().toLowerCase() === String(novo.nome || '').trim().toLowerCase()
                && String(item.funcao || '').trim().toLowerCase() === String(novo.funcao || '').trim().toLowerCase()
              );
              return jaExiste ? prev : [...prev, { nome: novo.nome, funcao: novo.funcao || '', origem: 'mao_obra_direta' }];
            });
          }
        } catch (e) {
          await alert({ title: 'Erro', message: `Não foi possível cadastrar a mão de obra: ${e?.response?.data?.erro || e?.message || 'erro inesperado'}` });
          return;
        }
      }
    }

    setFormData({ ...formData, mao_obra_detalhada: [...formData.mao_obra_detalhada, draftColab] });
    setDraftColab({ nome: '', funcao: '', tipo: 'Direta', entrada: '07:00', saida_almoco: '12:00', retorno_almoco: '13:00', saida_final: '17:00' });
    setColaboradorSelecionado('');
    setDirty(true);
  };
  const removeColab = (idx) => {
    const arr = [...formData.mao_obra_detalhada];
    arr.splice(idx, 1);
    setFormData({ ...formData, mao_obra_detalhada: arr });
  };

  // Equipamentos detalhados
  const [draftEquip, setDraftEquip] = useState({ nome: '', quantidade: 1 });
  const addEquip = () => {
    if (!draftEquip.nome) return;
    setFormData({ ...formData, equipamentos_detalhados: [...formData.equipamentos_detalhados, { nome: draftEquip.nome, quantidade: Number(draftEquip.quantidade || 0) }] });
    setDraftEquip({ nome: '', quantidade: 1 });
    setDirty(true);
  };
  const removeEquip = (idx) => {
    const arr = [...formData.equipamentos_detalhados];
    arr.splice(idx, 1);
    setFormData({ ...formData, equipamentos_detalhados: arr });
  };

  // Ocorrências e Comentários
    // Materiais Recebidos
    const [draftMaterial, setDraftMaterial] = useState({ nome: '', quantidade: '', unidade: '' });
  const [draftOcorrencia, setDraftOcorrencia] = useState({ titulo: '', descricao: '', gravidade: 'Baixa' });
  const addOcorrencia = () => {
    if (!draftOcorrencia.descricao) return;
    setFormData({ ...formData, ocorrencias_lista: [...formData.ocorrencias_lista, draftOcorrencia] });
    setDraftOcorrencia({ titulo: '', descricao: '', gravidade: 'Baixa' });
    setDirty(true);
  };
  const removeOcorrencia = (idx) => {
    const arr = [...formData.ocorrencias_lista];
    arr.splice(idx, 1);
    setFormData({ ...formData, ocorrencias_lista: arr });
  };

  const [draftComentario, setDraftComentario] = useState('');
  const [comentariosExistentes, setComentariosExistentes] = useState([]);
  const addComentario = async () => {
    const texto = draftComentario.trim();
    if (!texto) return;
    if (rdoId) {
      try {
        const { addRdoComentario } = await import('../services/api');
        const resp = await addRdoComentario(rdoId, { comentario: texto });
        const novo = { id: resp.data?.id || Math.random(), comentario: texto, autor_nome: usuario?.nome || 'Você', criado_em: new Date().toISOString() };
        setComentariosExistentes(prev => [novo, ...prev]);
        setDraftComentario('');
      } catch (e) {
        await alert({ title: 'Erro', message: 'Falha ao comentar: ' + (e.response?.data?.erro || e.message) });
      }
    } else {
      setFormData({ ...formData, comentarios_lista: [...formData.comentarios_lista, texto] });
      setDraftComentario('');
      setDirty(true);
    }
  };
  const removeComentario = (idx) => {
    if (rdoId) {
      const arr = [...comentariosExistentes]; arr.splice(idx,1); setComentariosExistentes(arr);
    } else {
      const arr = [...formData.comentarios_lista];
      arr.splice(idx, 1);
      setFormData({ ...formData, comentarios_lista: arr });
    }
  };
  const salvar = async () => {
    try {
      setErro('');
      setSucesso('');
      setIsSaving(true);

      const body = {
        projeto_id: Number(projetoId),
        data_relatorio: formData.data_relatorio,
        dia_semana: weekdayFromLocalDateInput(formData.data_relatorio),
        entrada_saida_inicio: formData.entrada_saida_inicio,
        entrada_saida_fim: formData.entrada_saida_fim,
        intervalo_almoco_inicio: formData.intervalo_almoco_inicio,
        intervalo_almoco_fim: formData.intervalo_almoco_fim,
        horas_trabalhadas: calcHorasInterval(
          formData.entrada_saida_inicio,
          formData.entrada_saida_fim,
          formData.intervalo_almoco_inicio,
          formData.intervalo_almoco_fim
        ),
        // Totais calculados automaticamente com base nos colaboradores detalhados
        mao_obra_direta: formData.mao_obra_detalhada.filter(c => String(c.tipo).toLowerCase() === 'direta').length,
        mao_obra_indireta: formData.mao_obra_detalhada.filter(c => String(c.tipo).toLowerCase() === 'indireta').length,
        mao_obra_terceiros: formData.mao_obra_detalhada.filter(c => String(c.tipo).toLowerCase() === 'terceiros').length,
        mao_obra_detalhada: formData.mao_obra_detalhada,
        equipamentos: JSON.stringify(formData.equipamentos_detalhados),
        ocorrencias: '',
        comentarios: '',
        atividades: formData.atividades.map(a => {
          const sel = atividadesEap.find(x => String(x.id) === String(a.atividade_eap_id));
          const total = sel ? Number(sel.quantidade_total || 0) : 0;
          const q = a.quantidade_executada === '' ? null : Number(a.quantidade_executada);
          const perc = (q !== null && total > 0) ? Math.min(Math.round((q / total) * 10000) / 100, 100) : (a.percentual_executado ? Number(a.percentual_executado) : 0);
          return {
            atividade_eap_id: Number(a.atividade_eap_id),
            percentual_executado: perc,
            quantidade_executada: q,
            observacao: a.observacao || ''
          };
        })
      };

      for (const atividade of body.atividades) {
        if (atividade.quantidade_executada == null) continue;
        const { atividadeSel, quantidadeTotal, restante } = getAtividadeLimites(atividade.atividade_eap_id);
        if (!Number.isFinite(atividade.quantidade_executada) || atividade.quantidade_executada < 0) {
          throw new Error(`Quantidade inválida na atividade ${atividadeSel?.codigo_eap || atividade.atividade_eap_id}.`);
        }
        if (quantidadeTotal > 0 && restante != null && atividade.quantidade_executada > restante) {
          throw new Error(`Atividade ${atividadeSel?.codigo_eap || atividade.atividade_eap_id}: quantidade executada maior que o restante (${formatQtd(restante)} ${atividadeSel?.unidade_medida || ''}).`);
        }
      }

      let finalId = rdoId;
      if (rdoId) {
        await updateRDO(rdoId, body);
        for (const c of formData.climaRegistros) {
          await addRdoClima(rdoId, { periodo: c.periodo, condicao_tempo: c.condicao_tempo, condicao_trabalho: c.condicao_trabalho, pluviometria_mm: Number(c.pluviometria_mm || 0) });
        }
        for (const o of (formData.ocorrencias_lista || []).filter(item => !item.id)) {
          await addRdoOcorrencia(rdoId, { titulo: o.titulo || null, descricao: o.descricao, gravidade: o.gravidade || null });
        }
        for (const m of (formData.materiais_lista || []).filter(item => !item.id)) {
          await addRdoMaterial(rdoId, { nome_material: m.nome, quantidade: Number(m.quantidade || 0), unidade: m.unidade || null });
        }
        // Ao salvar, enviar para análise
        try { await updateStatusRDO(rdoId, 'Em análise'); } catch {}
        setSucesso('RDO atualizado e enviado para análise.');
      } else {
        const res = await createRDO(body);
        finalId = res.data?.rdo?.id;
        for (const c of formData.climaRegistros) {
          await addRdoClima(finalId, { periodo: c.periodo, condicao_tempo: c.condicao_tempo, condicao_trabalho: c.condicao_trabalho, pluviometria_mm: Number(c.pluviometria_mm || 0) });
        }
        for (const o of formData.ocorrencias_lista) {
          await addRdoOcorrencia(finalId, { titulo: o.titulo || null, descricao: o.descricao, gravidade: o.gravidade || null });
        }
        for (const c of formData.comentarios_lista) {
          await addRdoComentario(finalId, { comentario: c });
        }
        for (const m of (formData.materiais_lista || [])) {
          await addRdoMaterial(finalId, { nome_material: m.nome, quantidade: Number(m.quantidade || 0), unidade: m.unidade || null });
        }
        // Ao salvar, enviar para análise
        try { if (finalId) await updateStatusRDO(finalId, 'Em análise'); } catch {}
        setSucesso('RDO criado e enviado para análise.');
      }

      // Upload de fotos desativado temporariamente

      try { setDirty(false); } catch {}
    } catch (error) {
      setErro(error.response?.data?.erro || error.message || 'Erro ao salvar RDO.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div className="flex-between mb-4">
          <h1>{rdoId ? 'Editar RDO' : 'Novo RDO'}</h1>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rdos`)}>Voltar</button>
            <button className="btn btn-success" onClick={salvar} disabled={isSaving || !formData.data_relatorio}>{isSaving ? 'Salvando...' : (rdoId ? 'Salvar alterações' : 'Salvar RDO')}</button>
          </div>
        </div>

        {erro && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{erro}</div>}
        {sucesso && <div className="alert alert-success" style={{ marginBottom: '12px' }}>{sucesso}</div>}

        <div className="card">
          <h3 className="card-title mb-3">Cabeçalho</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Data do relatório</label>
              <input className="form-input" type="date" value={formData.data_relatorio} onChange={(e) => {
                const val = e.target.value;
                setFormData({ ...formData, data_relatorio: val, dia_semana: weekdayFromLocalDateInput(val) });
              }} />
              {formData.dia_semana && <small style={{ color: 'var(--gray-500)' }}>Dia da semana: {formData.dia_semana}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Entrada</label>
              <input className="form-input" type="time" value={formData.entrada_saida_inicio} onChange={(e) => setFormData({ ...formData, entrada_saida_inicio: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Saída</label>
              <input className="form-input" type="time" value={formData.entrada_saida_fim} onChange={(e) => setFormData({ ...formData, entrada_saida_fim: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Horas trabalhadas</label>
              <input className="form-input" type="number" value={calcHorasInterval(formData.entrada_saida_inicio, formData.entrada_saida_fim, formData.intervalo_almoco_inicio, formData.intervalo_almoco_fim)} readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Almoço (início)</label>
              <input className="form-input" type="time" value={formData.intervalo_almoco_inicio} onChange={(e) => setFormData({ ...formData, intervalo_almoco_inicio: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Almoço (fim)</label>
              <input className="form-input" type="time" value={formData.intervalo_almoco_fim} onChange={(e) => setFormData({ ...formData, intervalo_almoco_fim: e.target.value })} />
            </div>
          </div>
        </div>

        {/* (Removido) Card de Registros Fotográficos gerais; manter upload apenas por atividade */}

        <div className="card">
          <h3 className="card-title mb-3">Condições Climáticas</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Período</label>
              <select className="form-select" value={draftClima.periodo} onChange={(e) => setDraftClima({ ...draftClima, periodo: e.target.value })}>
                <option>Manhã</option>
                <option>Tarde</option>
                <option>Noite</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Clima</label>
              <select className="form-select" value={draftClima.condicao_tempo} onChange={(e) => setDraftClima({ ...draftClima, condicao_tempo: e.target.value })}>
                <option>Claro</option>
                <option>Nublado</option>
                <option>Chuva</option>
                <option>Vento</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Praticabilidade</label>
              <select className="form-select" value={draftClima.condicao_trabalho} onChange={(e) => setDraftClima({ ...draftClima, condicao_trabalho: e.target.value })}>
                <option>Praticável</option>
                <option>Impraticável</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Pluviometria (mm)</label>
              <input className="form-input" type="number" value={draftClima.pluviometria_mm} onChange={(e) => setDraftClima({ ...draftClima, pluviometria_mm: e.target.value })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addClimaRegistro}><Plus size={16} /> Registrar</button>
            </div>
          </div>
          {formData.climaRegistros.length === 0 ? (
            <div className="card" style={{ padding: '12px', background: 'var(--gray-50)' }}>Nenhum registro climático.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Clima</th>
                  <th>Praticabilidade</th>
                  <th>Pluviometria</th>
                  <th style={{ width: '80px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {formData.climaRegistros.map((c) => (
                  <tr key={c.periodo}>
                    <td><strong>{c.periodo}</strong></td>
                    <td>{c.condicao_tempo}</td>
                    <td>{c.condicao_trabalho}</td>
                    <td>{Number(c.pluviometria_mm || 0)} mm</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-danger" onClick={() => removeClimaRegistro(c.periodo)} title="Remover"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Mão de Obra</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Selecionar da lista (opcional)</label>
              <select className="form-select" value={colaboradorSelecionado} onChange={(e) => onSelecionarColaborador(e.target.value)}>
                <option value="">Selecione...</option>
                {colaboradoresSelecionaveis.map((item, idx) => (
                  <option key={`${item.origem || 'origem'}-${item.nome}-${item.funcao}-${idx}`} value={chaveColaborador(item.nome, item.funcao)}>
                    {item.nome}{item.funcao ? ` - ${item.funcao}` : ''}
                  </option>
                ))}
              </select>
              <small style={{ color: 'var(--gray-600)' }}>Nome e função podem ser ajustados manualmente após selecionar.</small>
            </div>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" type="text" value={draftColab.nome} onChange={(e) => setDraftColab({ ...draftColab, nome: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Função</label>
              <input className="form-input" type="text" value={draftColab.funcao} onChange={(e) => setDraftColab({ ...draftColab, funcao: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <select className="form-select" value={draftColab.tipo} onChange={(e) => setDraftColab({ ...draftColab, tipo: e.target.value })}>
                <option>Direta</option>
                <option>Indireta</option>
                <option>Terceiros</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Entrada</label>
              <input className="form-input" type="time" value={draftColab.entrada} onChange={(e) => setDraftColab({ ...draftColab, entrada: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Saída almoço</label>
              <input className="form-input" type="time" value={draftColab.saida_almoco} onChange={(e) => setDraftColab({ ...draftColab, saida_almoco: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Retorno almoço</label>
              <input className="form-input" type="time" value={draftColab.retorno_almoco} onChange={(e) => setDraftColab({ ...draftColab, retorno_almoco: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Saída final</label>
              <input className="form-input" type="time" value={draftColab.saida_final} onChange={(e) => setDraftColab({ ...draftColab, saida_final: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button className="btn btn-primary" onClick={addColab}><Plus size={16} /> Adicionar colaborador</button>
          </div>
          {formData.mao_obra_detalhada.length === 0 ? (
            <div className="card" style={{ padding: '12px', background: 'var(--gray-50)' }}>Nenhum colaborador adicionado.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Função</th>
                  <th>Categoria</th>
                  <th>Entrada</th>
                  <th>Saída almoço</th>
                  <th>Retorno almoço</th>
                  <th>Saída final</th>
                  <th>Horas</th>
                  <th style={{ width: '80px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {formData.mao_obra_detalhada.map((c, idx) => (
                  <tr key={idx}>
                    <td><strong>{c.nome}</strong></td>
                    <td><span style={{ color: 'var(--gray-600)' }}>{c.funcao}</span></td>
                    <td>{c.tipo || '-'}</td>
                    <td>{c.entrada}</td>
                    <td>{c.saida_almoco}</td>
                    <td>{c.retorno_almoco}</td>
                    <td>{c.saida_final}</td>
                    <td>{(() => { const tm = (t) => { const m=t.match(/(\d{1,2}):(\d{2})/); return m? (parseInt(m[1])*60+parseInt(m[2])):null; }; const ini=tm(c.entrada); const fim=tm(c.saida_final); const i1=tm(c.saida_almoco); const i2=tm(c.retorno_almoco); let tot=0; if(ini!=null&&fim!=null&&fim>ini){ tot=Math.max(0,fim-ini); if(i1!=null&&i2!=null&&i2>i1){ tot=Math.max(0,tot-(i2-i1)); } } return Math.round((tot/60)*100)/100; })()} h</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-danger" onClick={() => removeColab(idx)} title="Remover"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Atividades Executadas</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Atividade</label>
              <select className="form-select" value={draftAtividade.atividade_eap_id} onChange={(e) => {
                const id = e.target.value;
                const sel = atividadesEap.find(a => String(a.id) === String(id));
                setDraftAtividade({ ...draftAtividade, atividade_eap_id: id, unidade_medida: sel ? (sel.unidade_medida || '') : '' });
              }}>
                <option value="">Selecione...</option>
                {groupedLeafsByParent.map(group => (
                  <optgroup key={group.parentId} label={`${group.parent?.codigo_eap || ''} - ${group.parent?.descricao || 'Atividade mãe'}`}>
                    {group.children.map(a => (
                      <option key={a.id} value={a.id}>{a.codigo_eap} - {a.descricao}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quantidade executada</label>
              <input
                className="form-input"
                type="number"
                min="0"
                max={(() => {
                  const { restante } = getAtividadeLimites(draftAtividade.atividade_eap_id);
                  return restante != null ? restante : undefined;
                })()}
                value={draftAtividade.quantidade_executada}
                onChange={(e) => setDraftAtividade({ ...draftAtividade, quantidade_executada: e.target.value })}
              />
              <small style={{ color: 'var(--gray-600)' }}>
                {(() => {
                  const { atividadeSel, quantidadeTotal, execAprovado, restante } = getAtividadeLimites(draftAtividade.atividade_eap_id);
                  if (!atividadeSel || !quantidadeTotal) return 'Selecione uma atividade para ver o limite.';
                  return `Limite no RDO: até ${formatQtd(restante)} ${atividadeSel.unidade_medida || ''} (Previsto ${formatQtd(quantidadeTotal)} - Aprovado ${formatQtd(execAprovado)}).`;
                })()}
              </small>
            </div>
            <div className="form-group">
              <label className="form-label">Unidade de medida</label>
              <input className="form-input" type="text" value={draftAtividade.unidade_medida} onChange={(e) => setDraftAtividade({ ...draftAtividade, unidade_medida: e.target.value })} placeholder="Ex.: m, m³, un" />
            </div>
            <div className="form-group">
              <label className="form-label">% Executado (auto)</label>
              <input className="form-input" type="number" value={(function(){
                const sel = atividadesEap.find(a => String(a.id) === String(draftAtividade.atividade_eap_id));
                const total = sel ? Number(sel.quantidade_total || 0) : 0;
                const q = draftAtividade.quantidade_executada !== '' ? Number(draftAtividade.quantidade_executada) : 0;
                if (!total || !q) return 0;
                return Math.min(Math.round((q / total) * 10000) / 100, 100);
              })()} readOnly />
              <small style={{ color: 'var(--gray-600)' }}>{(function(){
                const sel = atividadesEap.find(a => String(a.id) === String(draftAtividade.atividade_eap_id));
                const acum = sel ? Number(sel.percentual_executado || 0) : 0;
                const status = sel ? (sel.percentual_executado >= 100 ? 'Concluída' : (sel.percentual_executado > 0 ? 'Em andamento' : 'Não iniciada')) : 'N/A';
                const total = sel ? Number(sel.quantidade_total || 0) : 0;
                const exec = total ? Number(execucaoAcum[String(sel.id)] || 0) : 0;
                const unidade = sel ? (sel.unidade_medida || '') : '';
                return `Acumulado: ${acum}% — Quant.: ${total ? `${exec}/${total} ${unidade}` : '—'} — Status: ${status}`;
              })()}</small>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Observação</label>
            <textarea className="form-textarea" value={draftAtividade.observacao} onChange={(e) => setDraftAtividade({ ...draftAtividade, observacao: e.target.value })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button className="btn btn-primary" onClick={handleAddAtividade}>
              <Plus size={16} /> Adicionar atividade
            </button>
          </div>
          {formData.atividades.length === 0 ? (
            <div className="card" style={{ padding: '16px', background: 'var(--gray-50)' }}>
              Nenhuma atividade adicionada.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Atividade</th>
                  <th>Qtd. Executada</th>
                  <th>Unidade</th>
                  <th>% Exec. (auto)</th>
                  <th>% Acumulado</th>
                  <th>Status</th>
                  <th style={{ width: '80px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {formData.atividades.map(a => {
                  const sel = atividadesEap.find(x => String(x.id) === String(a.atividade_eap_id));
                  const acumulado = sel ? Number(sel.percentual_executado || 0) : 0;
                  const status = sel ? (acumulado >= 100 ? 'Concluída' : (acumulado > 0 ? 'Em andamento' : 'Não iniciada')) : 'N/A';
                  return (
                    <React.Fragment key={a.atividade_eap_id}>
                      <tr>
                        <td>
                          <div style={{ fontWeight: 600 }}>{sel?.descricao || 'Atividade'}</div>
                          <div style={{ color: 'var(--gray-600)', fontSize: '12px' }}>{sel?.codigo_eap || ''}</div>
                          <div style={{ color: 'var(--gray-600)', fontSize: '12px', marginTop: '2px' }}>{(function(){
                            const total = sel ? Number(sel.quantidade_total || 0) : 0;
                            const unidade = sel ? (sel.unidade_medida || '') : '';
                            const execAprov = total ? Number(execucaoAcum[String(sel?.id)] || 0) : 0;
                            const execDia = (a.quantidade_executada !== '' ? Number(a.quantidade_executada) : 0);
                            const execComDia = execAprov + execDia;
                            if (!total) return 'Total não definido';
                            const percComDia = total ? Math.min(Math.round((execComDia / total) * 10000) / 100, 100) : 0;
                            return `Realizado: ${formatQtd(execComDia)}/${formatQtd(total)} ${unidade} (${formatPerc(percComDia)})`;
                          })()}</div>
                        </td>
                        <td>
                          <input className="form-input" type="number" min="0" max={(() => {
                            const total = sel ? Number(sel.quantidade_total || 0) : 0;
                            const execAprov = total ? Number(execucaoAcum[String(sel?.id)] || 0) : 0;
                            return total ? Math.max(total - execAprov, 0) : undefined;
                          })()} value={a.quantidade_executada} onChange={(e) => {
                            const valor = e.target.value;
                            const q = valor !== '' ? Number(valor) : 0;
                            const total = sel ? Number(sel.quantidade_total || 0) : 0;
                            const execAprov = total ? Number(execucaoAcum[String(sel?.id)] || 0) : 0;
                            const restante = total ? Math.max(total - execAprov, 0) : null;
                            if (valor !== '' && (!Number.isFinite(q) || q < 0)) {
                              setErro('Quantidade executada inválida.');
                              return;
                            }
                            if (valor !== '' && total > 0 && restante != null && q > restante) {
                              setErro(`Atividade ${sel?.codigo_eap || ''}: máximo permitido neste RDO é ${formatQtd(restante)} ${sel?.unidade_medida || ''}.`);
                              return;
                            }
                            setFormData({
                              ...formData,
                              atividades: formData.atividades.map(x => {
                                if (x.atividade_eap_id === a.atividade_eap_id) {
                                  const percAuto = (total && q) ? Math.min(Math.round((q / total) * 10000) / 100, 100) : 0;
                                  return { ...x, quantidade_executada: valor, percentual_executado: percAuto };
                                }
                                return x;
                              })
                            });
                            setErro('');
                          }} />
                        </td>
                        <td>
                          <input className="form-input" type="text" value={a.unidade_medida || ''} onChange={(e) => setFormData({ ...formData, atividades: formData.atividades.map(x => x.atividade_eap_id === a.atividade_eap_id ? { ...x, unidade_medida: e.target.value } : x) })} placeholder="Ex.: m, m³, un" />
                        </td>
                        <td>
                          <input className="form-input" type="number" value={(function(){
                            const total = sel ? Number(sel.quantidade_total || 0) : 0;
                            const q = a.quantidade_executada !== '' ? Number(a.quantidade_executada) : 0;
                            if (!total || !q) return a.percentual_executado || 0;
                            return Math.min(Math.round((q / total) * 10000) / 100, 100);
                          })()} readOnly />
                        </td>
                        <td>
                          <input className="form-input" type="number" value={(function(){
                            const total = sel ? Number(sel.quantidade_total || 0) : 0;
                            const execAprov = total ? Number(execucaoAcum[String(sel?.id)] || 0) : 0;
                            const q = a.quantidade_executada !== '' ? Number(a.quantidade_executada) : 0;
                            const acumVirt = total ? Math.min(Math.round(((execAprov + q) / total) * 10000) / 100, 100) : acumulado;
                            return acumVirt;
                          })()} readOnly />
                        </td>
                        <td>
                          <span style={{ padding: '4px 8px', borderRadius: '12px', whiteSpace: 'nowrap', background: (function(){
                            const total = sel ? Number(sel.quantidade_total || 0) : 0;
                            const q = a.quantidade_executada !== '' ? Number(a.quantidade_executada) : 0;
                            const auto = (total && q) ? Math.min(Math.round((q / total) * 10000) / 100, 100) : 0;
                            const acumVirt = Math.min(acumulado + auto, 100);
                            return acumVirt >= 100 ? '#2E7D32' : (acumVirt > 0 ? '#2962FF' : '#888');
                          })(), color: '#fff', fontSize: '12px' }}>{(function(){
                            const total = sel ? Number(sel.quantidade_total || 0) : 0;
                            const q = a.quantidade_executada !== '' ? Number(a.quantidade_executada) : 0;
                            const auto = (total && q) ? Math.min(Math.round((q / total) * 10000) / 100, 100) : 0;
                            const execAprov = total ? Number(execucaoAcum[String(sel?.id)] || 0) : 0;
                            const acumVirt = total ? Math.min(Math.round(((execAprov + q) / total) * 10000) / 100, 100) : (acumulado + auto);
                            return acumVirt >= 100 ? 'Concluída' : (acumVirt > 0 ? 'Em andamento' : 'Não iniciada');
                          })()}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-danger" onClick={() => removerAtividade(a.atividade_eap_id)} title="Remover">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={6}>
                          <div className="form-group" style={{ marginTop: '8px' }}>
                            <label className="form-label">Observação</label>
                            <textarea className="form-textarea" value={a.observacao} onChange={(e) => setFormData({ ...formData, atividades: formData.atividades.map(x => x.atividade_eap_id === a.atividade_eap_id ? { ...x, observacao: e.target.value } : x) })} />
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Equipamentos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" type="text" value={draftEquip.nome} onChange={(e) => setDraftEquip({ ...draftEquip, nome: e.target.value })} />
            </div>
            
            <div className="form-group">
              <label className="form-label">Quantidade</label>
              <input className="form-input" type="number" value={draftEquip.quantidade} onChange={(e) => setDraftEquip({ ...draftEquip, quantidade: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button className="btn btn-primary" onClick={addEquip}><Plus size={16} /> Adicionar equipamento</button>
          </div>
          {formData.equipamentos_detalhados.length === 0 ? (
            <div className="card" style={{ padding: '12px', background: 'var(--gray-50)' }}>Nenhum equipamento adicionado.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Quantidade</th>
                  <th style={{ width: '80px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {formData.equipamentos_detalhados.map((eq, idx) => (
                  <tr key={idx}>
                    <td><strong>{eq.nome}</strong></td>
                    <td>{eq.quantidade}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-danger" onClick={() => removeEquip(idx)} title="Remover"><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Ocorrências</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Título</label>
              <input className="form-input" type="text" value={draftOcorrencia.titulo} onChange={(e) => setDraftOcorrencia({ ...draftOcorrencia, titulo: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" type="text" value={draftOcorrencia.descricao} onChange={(e) => setDraftOcorrencia({ ...draftOcorrencia, descricao: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Gravidade</label>
              <select className="form-select" value={draftOcorrencia.gravidade} onChange={(e) => setDraftOcorrencia({ ...draftOcorrencia, gravidade: e.target.value })}>
                <option>Baixa</option>
                <option>Média</option>
                <option>Alta</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button className="btn btn-primary" onClick={addOcorrencia}><Plus size={16} /> Adicionar ocorrência</button>
          </div>
          {formData.ocorrencias_lista.length === 0 ? (
            <div className="card" style={{ padding: '12px', background: 'var(--gray-50)' }}>Nenhuma ocorrência adicionada.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Descrição</th>
                  <th>Gravidade</th>
                  <th style={{ width: '80px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {formData.ocorrencias_lista.map((o, idx) => (
                  <tr key={idx}>
                    <td><strong>{o.titulo}</strong></td>
                    <td>{o.descricao}</td>
                    <td>{o.gravidade}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-danger" onClick={() => removeOcorrencia(idx)} title="Remover"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Comentários</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Adicionar comentário</label>
              <input className="form-input" type="text" placeholder="Digite o comentário" value={draftComentario} onChange={(e) => setDraftComentario(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addComentario}><Plus size={16} /> Adicionar</button>
            </div>
          </div>
          {(() => {
            const lista = rdoId ? comentariosExistentes : (formData.comentarios_lista || []).map((c, i) => ({ id: i, comentario: c, autor_nome: usuario?.nome || 'Você', criado_em: new Date().toISOString() }));
            if (!lista || lista.length === 0) return (<div className="card" style={{ padding: '12px', background: 'var(--gray-50)' }}>Nenhum comentário.</div>);
            return (
              <table className="table">
                <thead>
                  <tr>
                    <th>Comentário</th>
                    <th>Autor</th>
                    <th>Data/Hora</th>
                    <th style={{ width: '80px' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c, idx) => (
                    <tr key={c.id || idx}>
                      <td>{c.comentario}</td>
                      <td style={{ color: 'var(--gray-600)' }}>{c.autor_nome || '-'}</td>
                      <td style={{ color: 'var(--gray-600)' }}>{new Date(c.criado_em).toLocaleString('pt-BR')}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-danger" onClick={() => removeComentario(idx)} title="Remover"><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Materiais Recebidos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 140px', gap: '12px', marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" type="text" value={draftMaterial.nome} onChange={(e) => setDraftMaterial({ ...draftMaterial, nome: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Quantidade</label>
              <input className="form-input" type="number" value={draftMaterial.quantidade} onChange={(e) => setDraftMaterial({ ...draftMaterial, quantidade: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Unidade</label>
              <input className="form-input" type="text" value={draftMaterial.unidade} onChange={(e) => setDraftMaterial({ ...draftMaterial, unidade: e.target.value })} placeholder="Ex.: bobinas, m, m³, un" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => {
                if (!draftMaterial.nome) return;
                setFormData({ ...formData, materiais_lista: [...(formData.materiais_lista || []), { nome: draftMaterial.nome, quantidade: Number(draftMaterial.quantidade || 0), unidade: draftMaterial.unidade || null }] });
                setDraftMaterial({ nome: '', quantidade: '', unidade: '' });
              }}><Plus size={16} /> Adicionar</button>
            </div>
          </div>
          {(!formData.materiais_lista || formData.materiais_lista.length === 0) ? (
            <div className="card" style={{ padding: '12px', background: 'var(--gray-50)' }}>Nenhum material.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Quantidade</th>
                  <th>Unidade</th>
                  <th style={{ width: '80px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {formData.materiais_lista.map((m, idx) => (
                  <tr key={idx}>
                    <td><strong>{m.nome}</strong></td>
                    <td>{m.quantidade}</td>
                    <td>{m.unidade || '-'}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-danger" onClick={() => {
                      const arr = [...formData.materiais_lista]; arr.splice(idx,1); setFormData({ ...formData, materiais_lista: arr });
                    }} title="Remover"><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </>
  );
}

export default RDOForm2;