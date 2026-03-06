import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { useDialog } from '../context/DialogContext';
import {
  getProjeto,
  getAtividadesEAP, getRDO, createRDO, updateRDO,
  addRdoClima, addRdoComentario, addRdoOcorrencia, addRdoMaterial,
  uploadRdoFoto, updateStatusRDO, getExecucaoAcumulada,
  getRdoColaboradores, createRdoColaborador,
  getRdoEquipamentos, addRdoEquipamento, deleteRdoEquipamento,
  getAnexos, uploadAnexo, deleteAnexo
} from '../services/api';
import { ChevronDown, Plus, Trash2, Upload, FileText } from 'lucide-react';
import './RDO.css';

const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const weekdayFromLocalDateInput = (val) => {
  if (!val) return '';
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return dias[dt.getDay()];
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : dias[d.getDay()];
};

const Section = ({ id, num, title, badge, children, isOpen, onToggle }) => (
  <div className="rdo-section">
    <div className="rdo-section-header" onClick={() => onToggle(id)}>
      <div className="rdo-section-header-left">
        <span className="rdo-section-title">{title}</span>
        {badge != null && <span className="rdo-section-badge">{badge}</span>}
      </div>
      <ChevronDown size={16} className={`rdo-chevron${isOpen ? ' open' : ''}`} />
    </div>
    <div className={`rdo-section-body${isOpen ? '' : ' collapsed'}`}>
      {children}
    </div>
  </div>
);

function RDOForm2() {
  const { projetoId, rdoId } = useParams();
  const navigate = useNavigate();
  const { setDirty } = useLeaveGuard();
  const { usuario } = useAuth();
  const { alert, confirm } = useDialog();

  /* ── Estado existente ───────────────────────────── */
  const [atividadesEap, setAtividadesEap] = useState([]);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [execucaoAcum, setExecucaoAcum] = useState({});
  const [colaboradoresDisponiveis, setColaboradoresDisponiveis] = useState([]);

  /* ── Novo estado ────────────────────────────────── */
  const [projeto, setProjeto] = useState(null);
  const [equipamentosLista, setEquipamentosLista] = useState([]);
  const [rdoFotos, setRdoFotos] = useState([]);
  const [fotoPendente, setFotoPendente] = useState({ file: null, atividadeId: '', descricao: '' });
  const [fotosQueue, setFotosQueue] = useState([]);
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);
  const [anexos, setAnexos] = useState([]);
  const [anexosQueue, setAnexosQueue] = useState([]);
  const [isUploadingAnexo, setIsUploadingAnexo] = useState(false);
  const fotoInputRef = useRef(null);
  const anexoInputRef = useRef(null);

  const [openSections, setOpenSections] = useState({
    horario: true, clima: true, maoObra: true, equip: true,
    atividades: true, fotos: false, materiais: true,
    ocorrencias: true, comentarios: false, anexos: false
  });
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  /* ── formData ───────────────────────────────────── */
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
    ocorrencias_lista: [],
    comentarios_lista: [],
    materiais_lista: []
  });

  const [draftAtividade, setDraftAtividade] = useState({
    atividade_eap_id: '', quantidade_executada: '', unidade_medida: '', percentual_executada: '', observacao: ''
  });

  /* ── Helpers de tempo ──────────────────────────────── */
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

  /* ── Helpers de formatação ───────────────────────── */
  const nf0 = useMemo(() => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }), []);
  const nf2 = useMemo(() => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), []);
  const pf = useMemo(() => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }), []);
  const formatQtd = (n) => {
    const num = Number(n || 0);
    return Number.isInteger(num) ? nf0.format(num) : nf2.format(num);
  };
  const formatPerc = (p) => `${pf.format(Math.min(Math.max(Number(p || 0), 0), 100))}%`;

  /* ── KPIs calculados ────────────────────────────── */
  const kpis = useMemo(() => {
    const horasTrab = calcHorasInterval(
      formData.entrada_saida_inicio,
      formData.entrada_saida_fim,
      formData.intervalo_almoco_inicio,
      formData.intervalo_almoco_fim
    );
    const totalPessoas = (formData.mao_obra_detalhada || []).length;
    const totalEquip = equipamentosLista.length;
    const totalAtiv = (formData.atividades || []).length;
    const totalOcorr = (formData.ocorrencias_lista || []).length;
    const percMedio = totalAtiv > 0
      ? Math.round((formData.atividades.reduce((sum, a) => sum + Number(a.percentual_executado || 0), 0) / totalAtiv) * 10) / 10
      : 0;
    return { horasTrab, totalPessoas, totalEquip, totalAtiv, totalOcorr, percMedio };
  }, [formData, equipamentosLista]);

  const statusObra = useMemo(() => {
    if (!projeto?.prazo_termino) return null;
    const hoje = new Date();
    const fim = new Date(projeto.prazo_termino);
    const diffDias = Math.floor((fim - hoje) / 86400000);
    if (diffDias < 0) return { label: 'Prazo vencido', cls: 'vermelho' };
    if (diffDias <= 30) return { label: `Vence em ${diffDias}d`, cls: 'amarelo' };
    return { label: `${diffDias} dias restantes`, cls: 'verde' };
  }, [projeto]);

  const responsavel = useMemo(() => {
    if (!projeto?.usuarios) return null;
    const gestorLocal = projeto.usuarios.find(u => u.perfil === 'Gestor da Obra');
    if (gestorLocal?.nome) return gestorLocal.nome;
    const gestorGeral = projeto.usuarios.find(u => u.perfil === 'Gestor Geral');
    if (gestorGeral?.nome) return gestorGeral.nome;
    const anyGestor = projeto.usuarios.find(u => Number(u.is_gestor) === 1);
    return anyGestor?.nome || null;
  }, [projeto]);

  /* ── useEffect principal ────────────────────────── */
  useEffect(() => {
    const carregar = async () => {
      try {
        // Carregar projeto para cabeçalho
        try {
          const projRes = await getProjeto(projetoId);
          setProjeto(projRes.data || null);
        } catch {}

        const eapRes = await getAtividadesEAP(projetoId);
        setAtividadesEap(eapRes.data || []);

        let acumMap = {};
        try {
          const exRes = await getExecucaoAcumulada(projetoId);
          (exRes.data || []).forEach(row => { acumMap[String(row.atividade_eap_id)] = Number(row.total_executado || 0); });
          setExecucaoAcum(acumMap);
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
            setErro(err?.response?.status === 404
              ? 'RDO removido ou não encontrado.'
              : 'Erro ao carregar dados do formulário.');
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
            climaRegistros: (rdo.clima || []).map(c => ({
              periodo: c.periodo,
              condicao_tempo: c.condicao_tempo || 'Claro',
              condicao_trabalho: c.condicao_trabalho || 'Praticável',
              pluviometria_mm: c.pluviometria_mm || 0
            })),
            mao_obra_detalhada: Array.isArray(rdo.mao_obra_detalhada) ? rdo.mao_obra_detalhada : [],
            ocorrencias_lista: (rdo.ocorrencias || []).map(o => ({
              id: o.id,
              titulo: o.titulo || '',
              descricao: o.descricao || '',
              gravidade: o.gravidade || 'Baixa'
            })),
            comentarios_lista: [],
            materiais_lista: (rdo.materiais || []).map(m => ({
              id: m.id,
              nome: m.nome_material || '',
              quantidade: Number(m.quantidade || 0),
              unidade: m.unidade || null
            }))
          });

          // Equipamentos vêm da nova tabela
          setEquipamentosLista(rdo.equipamentos_lista || []);

          // Fotos
          setRdoFotos(rdo.fotos || []);

          // Comentários existentes
          setComentariosExistentes((rdo.comentarios || []).map(c => ({
            id: c.id, comentario: c.comentario, autor_nome: c.autor_nome, criado_em: c.criado_em
          })));

          // Anexos
          try {
            const anx = await getAnexos(rdoId);
            setAnexos(anx.data || []);
          } catch {}

        } else {
          // Novo RDO: copiar mão de obra e equipamentos do último RDO
          try {
            const { getRDOs } = await import('../services/api');
            const lista = (await getRDOs(projetoId)).data || [];
            if (lista.length > 0) {
              const listaAprovados = lista.filter(item => String(item.status || '') === 'Aprovado');
              const baseLista = listaAprovados.length > 0 ? listaAprovados : lista;
              const ultimo = baseLista.reduce((acc, cur) => {
                const toDate = (s) => {
                  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
                  return m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : new Date(s);
                };
                const dAcc = acc ? toDate(acc.data_relatorio) : null;
                const dCur = toDate(cur.data_relatorio);
                return (!acc || dCur.getTime() > dAcc.getTime()) ? cur : acc;
              }, null);
              if (ultimo) {
                const equipamentosJson = (() => {
                  try {
                    return ultimo.equipamentos && String(ultimo.equipamentos).startsWith('[')
                      ? JSON.parse(ultimo.equipamentos) : [];
                  } catch { return []; }
                })();
                const atividadesCopia = await (async () => {
                  try {
                    const det = await getRDO(ultimo.id);
                    return (det.data?.atividades || [])
                      .filter(a => {
                        const sel = (eapRes.data || []).find(x => String(x.id) === String(a.atividade_eap_id));
                        const total = sel ? Number(sel.quantidade_total || 0) : 0;
                        const execAprov = Number(acumMap[String(a.atividade_eap_id)] || 0);
                        return !(total > 0 && execAprov >= total);
                      })
                      .map(a => {
                        const sel = (eapRes.data || []).find(x => String(x.id) === String(a.atividade_eap_id));
                        return {
                          atividade_eap_id: a.atividade_eap_id,
                          quantidade_executada: '',
                          unidade_medida: sel ? (sel.unidade_medida || '') : '',
                          percentual_executado: 0,
                          observacao: ''
                        };
                      });
                  } catch { return []; }
                })();
                const maoObraDetalhada = (() => {
                  if (Array.isArray(ultimo.mao_obra_detalhada)) return ultimo.mao_obra_detalhada;
                  try {
                    const parsed = ultimo.mao_obra_detalhada ? JSON.parse(ultimo.mao_obra_detalhada) : [];
                    return Array.isArray(parsed) ? parsed : [];
                  } catch { return []; }
                })();
                setFormData(prev => ({
                  ...prev,
                  mao_obra_detalhada: maoObraDetalhada,
                  atividades: atividadesCopia
                }));
                setEquipamentosLista(equipamentosJson);
              }
            }
          } catch {}
        }
      } catch {
        setErro('Erro ao carregar dados do formulário.');
      }
    };
    carregar();
    return () => { try { setDirty(false); } catch {} };
  }, [projetoId, rdoId]);

  /* ── Ordenação EAP ──────────────────────────────── */
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

  const groupedLeafsByParent = useMemo(() => {
    if (!Array.isArray(atividadesEap) || atividadesEap.length === 0) return [];
    const leaves = atividadesEap.filter(a => {
      if (a.pai_id == null || atividadesEap.some(x => x.pai_id === a.id)) return false;
      // Excluir atividades 100% concluídas
      const qtdTotal = Number(a.quantidade_total || 0);
      if (qtdTotal > 0) {
        const execAprov = Number(execucaoAcum[String(a.id)] || 0);
        if (execAprov >= qtdTotal) return false;
      } else {
        if (Number(a.percentual_executado || 0) >= 100) return false;
      }
      return true;
    });
    const groupsMap = new Map();
    for (const leaf of leaves) {
      const pid = leaf.pai_id;
      if (!groupsMap.has(pid)) groupsMap.set(pid, []);
      groupsMap.get(pid).push(leaf);
    }
    let groups = Array.from(groupsMap.entries()).map(([pid, children]) => {
      const parent = atividadesEap.find(a => a.id === pid) || null;
      children.sort((c1, c2) => compareCodigo(c1.codigo_eap, c2.codigo_eap));
      return { parentId: pid, parent, children };
    });
    groups.sort((g1, g2) => compareCodigo(g1.parent?.codigo_eap || '0', g2.parent?.codigo_eap || '0'));
    return groups;
  }, [atividadesEap, execucaoAcum]);

  /* ── Atividades ─────────────────────────────────── */
  const getAtividadeLimites = (atividadeEapId) => {
    const atividadeSel = atividadesEap.find(a => String(a.id) === String(atividadeEapId));
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
      setErro('Quantidade executada inválida.'); return;
    }
    if (qtdExec !== null && qtdExec < 0) {
      setErro('Quantidade executada não pode ser negativa.'); return;
    }
    if (qtdExec !== null && quantidadeTotal > 0 && restante != null && qtdExec > restante) {
      setErro(`Quantidade acima do permitido. Restante: ${formatQtd(restante)} ${atividadeSel?.unidade_medida || ''}.`); return;
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
    const jaExiste = formData.atividades.some(a => a.atividade_eap_id === item.atividade_eap_id);
    const novaLista = jaExiste
      ? formData.atividades.map(a => a.atividade_eap_id === item.atividade_eap_id ? item : a)
      : [...formData.atividades, item];
    setFormData({ ...formData, atividades: novaLista });
    setErro('');
    setDraftAtividade({ atividade_eap_id: '', quantidade_executada: '', percentual_executada: '', observacao: '' });
    setDirty(true);
  };

  const removerAtividade = (id) => {
    setFormData({ ...formData, atividades: formData.atividades.filter(a => a.atividade_eap_id !== id) });
  };

  /* ── Clima ──────────────────────────────────────── */
  const [draftClima, setDraftClima] = useState({
    periodo: 'Manhã', condicao_tempo: 'Claro', condicao_trabalho: 'Praticável', pluviometria_mm: 0
  });

  const addClimaRegistro = () => {
    const existe = formData.climaRegistros.some(c => c.periodo === draftClima.periodo);
    const lista = existe
      ? formData.climaRegistros.map(c => c.periodo === draftClima.periodo ? draftClima : c)
      : [...formData.climaRegistros, draftClima];
    setFormData({ ...formData, climaRegistros: lista });
    setDraftClima({ periodo: 'Manhã', condicao_tempo: 'Claro', condicao_trabalho: 'Praticável', pluviometria_mm: 0 });
    setDirty(true);
  };

  const removeClimaRegistro = (periodo) => {
    setFormData({ ...formData, climaRegistros: formData.climaRegistros.filter(c => c.periodo !== periodo) });
  };

  /* ── Mão de obra ────────────────────────────────── */
  const [draftColab, setDraftColab] = useState({
    nome: '', funcao: '', tipo: 'Direta',
    entrada: '07:00', saida_almoco: '12:00', retorno_almoco: '13:00', saida_final: '17:00'
  });
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState('');

  const chaveColaborador = (nome, funcao) =>
    `${String(nome || '').trim().toLowerCase()}|${String(funcao || '').trim().toLowerCase()}`;

  const colaboradoresSelecionaveis = useMemo(() => {
    return colaboradoresDisponiveis.filter(item => {
      const chaveItem = chaveColaborador(item?.nome, item?.funcao);
      return !formData.mao_obra_detalhada.some(c => chaveColaborador(c?.nome, c?.funcao) === chaveItem);
    });
  }, [colaboradoresDisponiveis, formData.mao_obra_detalhada]);

  const onSelecionarColaborador = (valorSelecionado) => {
    setColaboradorSelecionado(valorSelecionado);
    if (valorSelecionado === '') return;
    const item = colaboradoresSelecionaveis.find(c => chaveColaborador(c?.nome, c?.funcao) === valorSelecionado);
    if (!item) return;
    setDraftColab(prev => ({ ...prev, nome: item.nome || prev.nome, funcao: item.funcao || prev.funcao }));
  };

  const addColab = async () => {
    if (!draftColab.nome) return;
    const nomeDigitado = String(draftColab.nome || '').trim();
    const funcaoDigitada = String(draftColab.funcao || '').trim();
    const nomeExisteNaLista = colaboradoresDisponiveis.some(
      item => String(item?.nome || '').trim().toLowerCase() === nomeDigitado.toLowerCase()
    );
    if (!nomeExisteNaLista) {
      const desejaCadastrar = await confirm({
        title: 'Cadastrar nova mão de obra?',
        message: `"${nomeDigitado}" não está na lista. Deseja cadastrar como mão de obra direta?`,
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
            setColaboradoresDisponiveis(prev => {
              const jaExiste = prev.some(
                item =>
                  String(item.nome || '').trim().toLowerCase() === String(novo.nome || '').trim().toLowerCase() &&
                  String(item.funcao || '').trim().toLowerCase() === String(novo.funcao || '').trim().toLowerCase()
              );
              return jaExiste ? prev : [...prev, { nome: novo.nome, funcao: novo.funcao || '', origem: 'mao_obra_direta' }];
            });
          }
        } catch (e) {
          await alert({
            title: 'Erro',
            message: `Não foi possível cadastrar: ${e?.response?.data?.erro || e?.message || 'erro inesperado'}`
          });
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

  const calcHorasColab = (c) => {
    const tm = (t) => { const m = t?.match(/(\d{1,2}):(\d{2})/); return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null; };
    const ini = tm(c.entrada); const fim = tm(c.saida_final);
    const i1 = tm(c.saida_almoco); const i2 = tm(c.retorno_almoco);
    if (ini == null || fim == null) return 0;
    let tot = Math.max(0, fim - ini);
    if (i1 != null && i2 != null && i2 > i1) tot = Math.max(0, tot - (i2 - i1));
    return Math.round((tot / 60) * 100) / 100;
  };

  /* ── Equipamentos ───────────────────────────────── */
  const [draftEquip, setDraftEquip] = useState({ nome: '', quantidade: 1 });

  const addEquip = async () => {
    if (!draftEquip.nome.trim()) return;
    const item = { nome: draftEquip.nome.trim(), quantidade: Number(draftEquip.quantidade || 1) };
    if (rdoId) {
      try {
        const resp = await addRdoEquipamento(rdoId, item);
        setEquipamentosLista(prev => [...prev, { ...item, id: resp.data?.id }]);
      } catch (e) {
        setErro('Erro ao adicionar equipamento: ' + (e?.response?.data?.erro || e.message));
        return;
      }
    } else {
      setEquipamentosLista(prev => [...prev, item]);
      setDirty(true);
    }
    setDraftEquip({ nome: '', quantidade: 1 });
  };

  const removeEquip = async (idx) => {
    const item = equipamentosLista[idx];
    if (rdoId && item?.id) {
      try { await deleteRdoEquipamento(rdoId, item.id); } catch (e) {
        setErro('Erro ao remover equipamento: ' + (e?.response?.data?.erro || e.message));
        return;
      }
    }
    setEquipamentosLista(prev => prev.filter((_, i) => i !== idx));
  };

  /* ── Ocorrências ────────────────────────────────── */
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

  /* ── Materiais ──────────────────────────────────── */
  const [draftMaterial, setDraftMaterial] = useState({ nome: '', quantidade: '', unidade: '' });

  const addMaterial = () => {
    if (!draftMaterial.nome) return;
    setFormData({ ...formData, materiais_lista: [...formData.materiais_lista, { ...draftMaterial }] });
    setDraftMaterial({ nome: '', quantidade: '', unidade: '' });
    setDirty(true);
  };

  const removeMaterial = (idx) => {
    const arr = [...formData.materiais_lista];
    arr.splice(idx, 1);
    setFormData({ ...formData, materiais_lista: arr });
  };

  /* ── Comentários ────────────────────────────────── */
  const [draftComentario, setDraftComentario] = useState('');
  const [comentariosExistentes, setComentariosExistentes] = useState([]);

  const addComentario = async () => {
    const texto = draftComentario.trim();
    if (!texto) return;
    if (rdoId) {
      try {
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
      const arr = [...comentariosExistentes]; arr.splice(idx, 1); setComentariosExistentes(arr);
    } else {
      const arr = [...formData.comentarios_lista]; arr.splice(idx, 1);
      setFormData({ ...formData, comentarios_lista: arr });
    }
  };

  /* ── Fotos ──────────────────────────────────────── */
  const handleFotoUpload = async () => {
    if (!fotoPendente.file) return;
    const { file, atividadeId, descricao } = fotoPendente;
    if (rdoId) {
      setIsUploadingFoto(true);
      const fd = new FormData();
      fd.append('arquivo', file);
      if (atividadeId) fd.append('rdo_atividade_id', atividadeId);
      if (descricao) fd.append('descricao', descricao);
      try {
        const resp = await uploadRdoFoto(rdoId, fd);
        setRdoFotos(prev => [...prev, {
          id: resp.data?.id,
          nome_arquivo: resp.data?.arquivo?.nome_arquivo || file.name,
          descricao: descricao || file.name,
          atividade_eap_id: atividadeId || null,
          criado_em: new Date().toISOString()
        }]);
      } catch (e) {
        setErro('Erro ao enviar foto: ' + (e?.response?.data?.erro || e.message));
      } finally {
        setIsUploadingFoto(false);
      }
    } else {
      setFotosQueue(prev => [...prev, { file, atividadeId, descricao }]);
    }
    setFotoPendente({ file: null, atividadeId: '', descricao: '' });
    if (fotoInputRef.current) fotoInputRef.current.value = '';
  };

  /* ── Anexos ─────────────────────────────────────── */
  const handleAnexoUpload = async (file) => {
    if (!file) return;
    if (!rdoId) {
      setAnexosQueue(prev => [...prev, file]);
      if (anexoInputRef.current) anexoInputRef.current.value = '';
      return;
    }
    setIsUploadingAnexo(true);
    const fd = new FormData();
    fd.append('arquivo', file);
    fd.append('nome', file.name);
    try {
      await uploadAnexo(rdoId, fd);
      const lista = await getAnexos(rdoId);
      setAnexos(lista.data || []);
    } catch (e) {
      setErro('Erro ao enviar anexo: ' + (e?.response?.data?.erro || e.message));
    } finally {
      setIsUploadingAnexo(false);
      if (anexoInputRef.current) anexoInputRef.current.value = '';
    }
  };

  const handleRemoveAnexo = async (id) => {
    try {
      await deleteAnexo(id);
      setAnexos(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      setErro('Erro ao remover anexo: ' + (e?.response?.data?.erro || e.message));
    }
  };

  /* ── Salvar ─────────────────────────────────────── */
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
          formData.entrada_saida_inicio, formData.entrada_saida_fim,
          formData.intervalo_almoco_inicio, formData.intervalo_almoco_fim
        ),
        mao_obra_direta: formData.mao_obra_detalhada.filter(c => String(c.tipo).toLowerCase() === 'direta').length,
        mao_obra_indireta: formData.mao_obra_detalhada.filter(c => String(c.tipo).toLowerCase() === 'indireta').length,
        mao_obra_terceiros: formData.mao_obra_detalhada.filter(c => String(c.tipo).toLowerCase() === 'terceiros').length,
        mao_obra_detalhada: formData.mao_obra_detalhada,
        equipamentos: JSON.stringify(equipamentosLista.map(e => ({ nome: e.nome, quantidade: e.quantidade }))),
        ocorrencias: '',
        comentarios: '',
        atividades: formData.atividades.map(a => {
          const sel = atividadesEap.find(x => String(x.id) === String(a.atividade_eap_id));
          const total = sel ? Number(sel.quantidade_total || 0) : 0;
          const q = a.quantidade_executada === '' ? null : Number(a.quantidade_executada);
          const perc = (q !== null && total > 0)
            ? Math.min(Math.round((q / total) * 10000) / 100, 100)
            : (a.percentual_executado ? Number(a.percentual_executado) : 0);
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
          throw new Error(`Atividade ${atividadeSel?.codigo_eap || atividade.atividade_eap_id}: quantidade maior que restante (${formatQtd(restante)} ${atividadeSel?.unidade_medida || ''}).`);
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
        // Sincronizar equipamentos na nova tabela
        for (const eq of equipamentosLista) {
          try { await addRdoEquipamento(finalId, { nome: eq.nome, quantidade: eq.quantidade }); } catch {}
        }
        // Upload fotos da fila
        for (const { file, atividadeId, descricao } of fotosQueue) {
          try {
            const fd = new FormData();
            fd.append('arquivo', file);
            if (atividadeId) fd.append('rdo_atividade_id', atividadeId);
            if (descricao) fd.append('descricao', descricao);
            await uploadRdoFoto(finalId, fd);
          } catch {}
        }
        setFotosQueue([]);
        // Upload anexos da fila
        for (const file of anexosQueue) {
          try {
            const fd = new FormData();
            fd.append('arquivo', file);
            fd.append('nome', file.name);
            await uploadAnexo(finalId, fd);
          } catch {}
        }
        setAnexosQueue([]);
        if (finalId) {
          try { const lista = await getAnexos(finalId); setAnexos(lista.data || []); } catch {}
        }
        try { if (finalId) await updateStatusRDO(finalId, 'Em análise'); } catch {}
        setSucesso('RDO criado e enviado para análise.');
      }

      try { setDirty(false); } catch {}
    } catch (error) {
      setErro(error.response?.data?.erro || error.message || 'Erro ao salvar RDO.');
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Helpers de render ──────────────────────────── */
  const gravBadgeCls = (g) => {
    if (!g) return 'baixa';
    const s = String(g).toLowerCase();
    if (s === 'crítica' || s === 'critica') return 'critica';
    if (s === 'alta') return 'alta';
    if (s === 'média' || s === 'media') return 'media';
    return 'baixa';
  };

  /* ══════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════ */
  return (
    <>
      <Navbar />
      <div className="rdo-page container">

        {/* ── Cabeçalho Inteligente ────────────────────── */}
        <div className="rdo-header-card" style={{ marginBottom: '16px' }}>
          <div className="rdo-header-left">
            {projeto && (
              <div className="rdo-header-meta">
                <div className="rdo-header-meta-row">
                  <span className="lbl">Obra</span>
                  <span className="val">{projeto.nome}</span>
                </div>
                {responsavel && (
                  <div className="rdo-header-meta-row">
                    <span className="lbl">Responsável</span>
                    <span className="val">{responsavel}</span>
                  </div>
                )}
                {projeto.empresa_responsavel && (
                  <div className="rdo-header-meta-row">
                    <span className="lbl">Contratante</span>
                    <span className="val">{projeto.empresa_responsavel}</span>
                  </div>
                )}
                {projeto.cidade && (
                  <div className="rdo-header-meta-row">
                    <span className="lbl">Local</span>
                    <span className="val">{projeto.cidade}</span>
                  </div>
                )}
                {projeto.prazo_termino && (
                  <div className="rdo-header-meta-row">
                    <span className="lbl">Prazo</span>
                    <span className="val">{new Date(projeto.prazo_termino).toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
              </div>
            )}
            {formData.data_relatorio && (
              <div style={{ marginTop: '12px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                  {formData.dia_semana}, {new Date(formData.data_relatorio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>
            )}
            {statusObra && (
              <div className="rdo-obra-status">
                <span className={`rdo-obra-status-badge ${statusObra.cls}`}>{statusObra.label}</span>
              </div>
            )}
          </div>

          <div className="rdo-header-right">
            <div className="rdo-kpi blue">
              <div className="rdo-kpi-val">{kpis.totalPessoas}</div>
              <div className="rdo-kpi-label">Pessoas</div>
            </div>
            <div className="rdo-kpi blue">
              <div className="rdo-kpi-val">{kpis.totalEquip}</div>
              <div className="rdo-kpi-label">Equip.</div>
            </div>
            <div className="rdo-kpi blue">
              <div className="rdo-kpi-val">{kpis.totalAtiv}</div>
              <div className="rdo-kpi-label">Atividades</div>
            </div>
            <div className={`rdo-kpi ${kpis.totalOcorr > 0 ? 'yellow' : 'green'}`}>
              <div className="rdo-kpi-val">{kpis.totalOcorr}</div>
              <div className="rdo-kpi-label">Ocorrências</div>
            </div>
            <div className={`rdo-kpi ${kpis.percMedio >= 80 ? 'green' : kpis.percMedio >= 40 ? 'yellow' : 'blue'}`}>
              <div className="rdo-kpi-val">{kpis.percMedio}%</div>
              <div className="rdo-kpi-label">Avanço médio</div>
            </div>
            <div className={`rdo-kpi ${(projeto?.eap_percentual || 0) >= 80 ? 'green' : (projeto?.eap_percentual || 0) >= 40 ? 'yellow' : 'blue'}`}>
              <div className="rdo-kpi-val">{projeto?.eap_percentual ?? 0}%</div>
              <div className="rdo-kpi-label">Avanço da Obra</div>
            </div>
          </div>
        </div>

        {/* Alertas */}
        {erro && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{erro}</div>}
        {sucesso && <div className="alert alert-success" style={{ marginBottom: '12px' }}>{sucesso}</div>}

        {/* ══ SEÇÃO 1 — Horário do Dia ══════════════════ */}
        <Section id="horario" num="1" title="Horário do Dia" isOpen={openSections.horario} onToggle={toggleSection}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 140px', minWidth: '130px' }}>
              <label className="form-label">Data *</label>
              <input className="form-input" type="date" value={formData.data_relatorio}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, data_relatorio: val, dia_semana: weekdayFromLocalDateInput(val) });
                  setDirty(true);
                }} />
              {formData.dia_semana && (
                <small style={{ color: 'var(--gray-500)' }}>{formData.dia_semana}</small>
              )}
            </div>
            <div className="form-group" style={{ flex: '1 1 100px', minWidth: '90px' }}>
              <label className="form-label">Entrada</label>
              <input className="form-input" type="time" value={formData.entrada_saida_inicio}
                onChange={(e) => { setFormData({ ...formData, entrada_saida_inicio: e.target.value }); setDirty(true); }} />
            </div>
            <div className="form-group" style={{ flex: '1 1 115px', minWidth: '105px' }}>
              <label className="form-label">Saída almoço</label>
              <input className="form-input" type="time" value={formData.intervalo_almoco_inicio}
                onChange={(e) => { setFormData({ ...formData, intervalo_almoco_inicio: e.target.value }); setDirty(true); }} />
            </div>
            <div className="form-group" style={{ flex: '1 1 115px', minWidth: '105px' }}>
              <label className="form-label">Retorno almoço</label>
              <input className="form-input" type="time" value={formData.intervalo_almoco_fim}
                onChange={(e) => { setFormData({ ...formData, intervalo_almoco_fim: e.target.value }); setDirty(true); }} />
            </div>
            <div className="form-group" style={{ flex: '1 1 100px', minWidth: '90px' }}>
              <label className="form-label">Saída</label>
              <input className="form-input" type="time" value={formData.entrada_saida_fim}
                onChange={(e) => { setFormData({ ...formData, entrada_saida_fim: e.target.value }); setDirty(true); }} />
            </div>
          </div>
        </Section>

        {/* ══ SEÇÃO 2 — Condições Climáticas ═══════════ */}
        <Section id="clima" num="2" title="Condições Climáticas" badge={formData.climaRegistros.length || null} isOpen={openSections.clima} onToggle={toggleSection}>
          <div className="rdo-add-row">
            <div className="form-group">
              <label className="form-label">Período</label>
              <select className="form-select" value={draftClima.periodo} onChange={(e) => setDraftClima({ ...draftClima, periodo: e.target.value })}>
                <option>Manhã</option><option>Tarde</option><option>Noite</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Clima</label>
              <select className="form-select" value={draftClima.condicao_tempo} onChange={(e) => setDraftClima({ ...draftClima, condicao_tempo: e.target.value })}>
                <option>Claro</option><option>Nublado</option><option>Chuva</option><option>Vento</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Praticabilidade</label>
              <select className="form-select" value={draftClima.condicao_trabalho} onChange={(e) => setDraftClima({ ...draftClima, condicao_trabalho: e.target.value })}>
                <option>Praticável</option><option>Impraticável</option>
              </select>
            </div>
            <div className="form-group" style={{ minWidth: '100px' }}>
              <label className="form-label">Pluviometria (mm)</label>
              <input className="form-input" type="number" value={draftClima.pluviometria_mm}
                onChange={(e) => setDraftClima({ ...draftClima, pluviometria_mm: e.target.value })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addClimaRegistro}><Plus size={15} /> Registrar</button>
            </div>
          </div>
          {formData.climaRegistros.length === 0 ? (
            <div className="rdo-empty">Nenhum registro climático adicionado.</div>
          ) : (
            <table className="rdo-table">
              <thead><tr>
                <th>Período</th><th>Clima</th><th>Praticabilidade</th><th>Pluviometria</th>
                <th className="td-actions"></th>
              </tr></thead>
              <tbody>
                {formData.climaRegistros.map(c => (
                  <tr key={c.periodo}>
                    <td><strong>{c.periodo}</strong></td>
                    <td>{c.condicao_tempo}</td>
                    <td>{c.condicao_trabalho}</td>
                    <td>{Number(c.pluviometria_mm || 0)} mm</td>
                    <td className="td-actions">
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeClimaRegistro(c.periodo)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ══ SEÇÃO 3 — Mão de Obra ════════════════════ */}
        <Section id="maoObra" num="3" title="Mão de Obra" badge={formData.mao_obra_detalhada.length || null} isOpen={openSections.maoObra} onToggle={toggleSection}>
          <div className="form-group" style={{ marginBottom: '10px' }}>
            <label className="form-label">Selecionar da lista (opcional)</label>
            <select className="form-select" value={colaboradorSelecionado} onChange={(e) => onSelecionarColaborador(e.target.value)}>
              <option value="">Selecione para preencher campos abaixo...</option>
              {colaboradoresSelecionaveis.map((item, idx) => (
                <option key={`${item.origem || 'o'}-${item.nome}-${idx}`} value={chaveColaborador(item.nome, item.funcao)}>
                  {item.nome}{item.funcao ? ` — ${item.funcao}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="rdo-add-row">
            <div className="form-group" style={{ flex: '2' }}>
              <label className="form-label">Nome</label>
              <input className="form-input" type="text" value={draftColab.nome}
                onChange={(e) => setDraftColab({ ...draftColab, nome: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '2' }}>
              <label className="form-label">Função</label>
              <input className="form-input" type="text" value={draftColab.funcao}
                onChange={(e) => setDraftColab({ ...draftColab, funcao: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <select className="form-select" value={draftColab.tipo} onChange={(e) => setDraftColab({ ...draftColab, tipo: e.target.value })}>
                <option>Direta</option><option>Indireta</option><option>Terceiros</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Entrada</label>
              <input className="form-input" type="time" value={draftColab.entrada}
                onChange={(e) => setDraftColab({ ...draftColab, entrada: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Saída almoço</label>
              <input className="form-input" type="time" value={draftColab.saida_almoco}
                onChange={(e) => setDraftColab({ ...draftColab, saida_almoco: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Retorno</label>
              <input className="form-input" type="time" value={draftColab.retorno_almoco}
                onChange={(e) => setDraftColab({ ...draftColab, retorno_almoco: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Saída final</label>
              <input className="form-input" type="time" value={draftColab.saida_final}
                onChange={(e) => setDraftColab({ ...draftColab, saida_final: e.target.value })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addColab}><Plus size={15} /> Adicionar</button>
            </div>
          </div>
          {formData.mao_obra_detalhada.length === 0 ? (
            <div className="rdo-empty">Nenhum colaborador adicionado.</div>
          ) : (
            <table className="rdo-table">
              <thead><tr>
                <th>Nome</th><th>Função</th><th>Categoria</th>
                <th>Entrada</th><th>Saída almoço</th><th>Retorno</th><th>Saída final</th><th>Horas</th>
                <th className="td-actions"></th>
              </tr></thead>
              <tbody>
                {formData.mao_obra_detalhada.map((c, idx) => (
                  <tr key={idx}>
                    <td><strong>{c.nome}</strong></td>
                    <td style={{ color: '#64748b' }}>{c.funcao}</td>
                    <td>{c.tipo || '—'}</td>
                    <td>{c.entrada}</td><td>{c.saida_almoco}</td><td>{c.retorno_almoco}</td><td>{c.saida_final}</td>
                    <td><strong>{calcHorasColab(c)}h</strong></td>
                    <td className="td-actions">
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeColab(idx)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ══ SEÇÃO 4 — Equipamentos ═══════════════════ */}
        <Section id="equip" num="4" title="Equipamentos" badge={equipamentosLista.length || null} isOpen={openSections.equip} onToggle={toggleSection}>
          <div className="rdo-add-row">
            <div className="form-group" style={{ flex: '3' }}>
              <label className="form-label">Nome do equipamento</label>
              <input className="form-input" type="text" placeholder="Ex.: Guindaste, Retroescavadeira"
                value={draftEquip.nome} onChange={(e) => setDraftEquip({ ...draftEquip, nome: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addEquip()} />
            </div>
            <div className="form-group" style={{ flex: '1', minWidth: '80px' }}>
              <label className="form-label">Quantidade</label>
              <input className="form-input" type="number" min="1" value={draftEquip.quantidade}
                onChange={(e) => setDraftEquip({ ...draftEquip, quantidade: e.target.value })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addEquip}><Plus size={15} /> Adicionar</button>
            </div>
          </div>
          {equipamentosLista.length === 0 ? (
            <div className="rdo-empty">Nenhum equipamento adicionado.</div>
          ) : (
            <table className="rdo-table">
              <thead><tr><th>Equipamento</th><th style={{ width: '120px' }}>Quantidade</th><th className="td-actions"></th></tr></thead>
              <tbody>
                {equipamentosLista.map((eq, idx) => (
                  <tr key={idx}>
                    <td><strong>{eq.nome}</strong></td>
                    <td>{eq.quantidade}</td>
                    <td className="td-actions">
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeEquip(idx)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ══ SEÇÃO 5 — Atividades Executadas ══════════ */}
        <Section id="atividades" num="5" title="Atividades Executadas" badge={formData.atividades.length || null} isOpen={openSections.atividades} onToggle={toggleSection}>
          <div className="rdo-grid-3" style={{ marginBottom: '8px' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Atividade</label>
              <select className="form-select" value={draftAtividade.atividade_eap_id}
                onChange={(e) => {
                  const id = e.target.value;
                  const sel = atividadesEap.find(a => String(a.id) === String(id));
                  setDraftAtividade({ ...draftAtividade, atividade_eap_id: id, unidade_medida: sel ? (sel.unidade_medida || '') : '' });
                }}>
                <option value="">Selecione a atividade...</option>
                {groupedLeafsByParent.map(group => (
                  <optgroup key={group.parentId} label={`${group.parent?.codigo_eap || ''} — ${group.parent?.nome || group.parent?.descricao || ''}`}>
                    {group.children.map(a => (
                      <option key={a.id} value={a.id}>{a.codigo_eap} — {a.nome || a.descricao}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Unidade de medida</label>
              <select className="form-select" value={draftAtividade.unidade_medida}
                onChange={(e) => setDraftAtividade({ ...draftAtividade, unidade_medida: e.target.value })}>
                <option value="">—</option>
                <option value="m">m — metro</option>
                <option value="m²">m² — metro quadrado</option>
                <option value="m³">m³ — metro cúbico</option>
                <option value="un">un — unidade</option>
                <option value="kg">kg — quilograma</option>
                <option value="t">t — tonelada</option>
                <option value="L">L — litro</option>
                <option value="h">h — hora</option>
                <option value="cm">cm — centímetro</option>
                <option value="mm">mm — milímetro</option>
                <option value="vb">vb — verba</option>
              </select>
            </div>
          </div>
          <div className="rdo-grid-2" style={{ marginBottom: '8px' }}>
            <div className="form-group">
              <label className="form-label">Quantidade executada</label>
              <input className="form-input" type="number" min="0"
                max={(() => { const { restante } = getAtividadeLimites(draftAtividade.atividade_eap_id); return restante != null ? restante : undefined; })()}
                value={draftAtividade.quantidade_executada}
                onChange={(e) => setDraftAtividade({ ...draftAtividade, quantidade_executada: e.target.value })} />
              <small style={{ color: 'var(--gray-600)', fontSize: '11px' }}>
                {(() => {
                  const { atividadeSel, quantidadeTotal, execAprovado, restante } = getAtividadeLimites(draftAtividade.atividade_eap_id);
                  if (!atividadeSel || !quantidadeTotal) return 'Selecione uma atividade.';
                  return `Restante: ${formatQtd(restante)} ${atividadeSel.unidade_medida || ''} (total ${formatQtd(quantidadeTotal)} − aprovado ${formatQtd(execAprovado)})`;
                })()}
              </small>
            </div>
            <div className="form-group">
              <label className="form-label">% Executado (calculado)</label>
              <input className="form-input" type="number" readOnly value={(function () {
                const sel = atividadesEap.find(a => String(a.id) === String(draftAtividade.atividade_eap_id));
                const total = sel ? Number(sel.quantidade_total || 0) : 0;
                const q = draftAtividade.quantidade_executada !== '' ? Number(draftAtividade.quantidade_executada) : 0;
                if (!total || !q) return 0;
                return Math.min(Math.round((q / total) * 10000) / 100, 100);
              })()} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '10px' }}>
            <label className="form-label">Observação</label>
            <textarea className="form-input" style={{ resize: 'vertical', minHeight: '52px' }}
              value={draftAtividade.observacao}
              onChange={(e) => setDraftAtividade({ ...draftAtividade, observacao: e.target.value })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
            <button className="btn btn-primary" onClick={handleAddAtividade}><Plus size={15} /> Adicionar atividade</button>
          </div>
          {formData.atividades.length === 0 ? (
            <div className="rdo-empty">Nenhuma atividade adicionada.</div>
          ) : (
            <table className="rdo-table">
              <thead><tr>
                <th>Atividade</th><th>Qtd. Exec.</th><th>Unidade</th>
                <th>% Exec.</th><th>% Acumulado</th><th>Status</th><th className="td-actions"></th>
              </tr></thead>
              <tbody>
                {formData.atividades.map(a => {
                  const sel = atividadesEap.find(x => String(x.id) === String(a.atividade_eap_id));
                  const total = sel ? Number(sel.quantidade_total || 0) : 0;
                  const execAprov = total ? Number(execucaoAcum[String(sel?.id)] || 0) : 0;
                  const q = a.quantidade_executada !== '' ? Number(a.quantidade_executada) : 0;
                  const percDia = (total && q) ? Math.min(Math.round((q / total) * 10000) / 100, 100) : (Number(a.percentual_executado || 0));
                  const percAcum = total ? Math.min(Math.round(((execAprov + q) / total) * 10000) / 100, 100) : Number(sel?.percentual_executado || 0);
                  const statusLabel = percAcum >= 100 ? 'Concluída' : percAcum > 0 ? 'Em andamento' : 'Não iniciada';
                  const statusCls = percAcum >= 100 ? 'aprovado' : percAcum > 0 ? 'em-analise' : 'preenchimento';
                  return (
                    <React.Fragment key={a.atividade_eap_id}>
                      <tr>
                        <td>
                          <div style={{ fontWeight: 600 }}>{sel?.codigo_eap ? `${sel.codigo_eap} — ` : ''}{sel?.nome || sel?.descricao || ''}</div>
                          {total > 0 && (
                            <div style={{ color: '#64748b', fontSize: '11px' }}>
                              {formatQtd(execAprov + q)}/{formatQtd(total)} {sel?.unidade_medida || ''}
                            </div>
                          )}
                        </td>
                        <td>
                          <input className="form-input" type="number" min="0"
                            max={total ? Math.max(total - execAprov, 0) : undefined}
                            value={a.quantidade_executada}
                            onChange={(e) => {
                              const valor = e.target.value;
                              const qv = valor !== '' ? Number(valor) : 0;
                              const restante = total ? Math.max(total - execAprov, 0) : null;
                              if (valor !== '' && (!Number.isFinite(qv) || qv < 0)) { setErro('Quantidade inválida.'); return; }
                              if (valor !== '' && total > 0 && restante != null && qv > restante) {
                                setErro(`Máximo: ${formatQtd(restante)} ${sel?.unidade_medida || ''}.`); return;
                              }
                              const percAuto = (total && qv) ? Math.min(Math.round((qv / total) * 10000) / 100, 100) : 0;
                              setFormData({ ...formData, atividades: formData.atividades.map(x => x.atividade_eap_id === a.atividade_eap_id ? { ...x, quantidade_executada: valor, percentual_executado: percAuto } : x) });
                              setErro('');
                            }} />
                        </td>
                        <td>{a.unidade_medida || '—'}</td>
                        <td><input className="form-input" type="number" value={percDia} readOnly style={{ width: '70px' }} /></td>
                        <td><input className="form-input" type="number" value={percAcum} readOnly style={{ width: '70px' }} /></td>
                        <td><span className={`rdo-badge ${statusCls}`}>{statusLabel}</span></td>
                        <td className="td-actions">
                          <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removerAtividade(a.atividade_eap_id)}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={7} style={{ paddingTop: 0, paddingBottom: '8px' }}>
                          <textarea className="form-input" style={{ resize: 'vertical', minHeight: '36px', fontSize: '12px' }}
                            placeholder="Observação sobre a atividade..."
                            value={a.observacao}
                            onChange={(e) => setFormData({ ...formData, atividades: formData.atividades.map(x => x.atividade_eap_id === a.atividade_eap_id ? { ...x, observacao: e.target.value } : x) })} />
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        {/* ══ SEÇÃO 6 — Fotos do RDO ═══════════════════ */}
        <Section id="fotos" num="6" title="Fotos do RDO" badge={(rdoFotos.length + fotosQueue.length) || null} isOpen={openSections.fotos} onToggle={toggleSection}>
          <div className="rdo-add-row">
            <div className="form-group" style={{ flex: '2' }}>
              <label className="form-label">Arquivo</label>
              <input ref={fotoInputRef} type="file" accept="image/*" className="form-input"
                onChange={(e) => setFotoPendente(prev => ({ ...prev, file: e.target.files?.[0] || null }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Atividade (opcional)</label>
              <select className="form-select" value={fotoPendente.atividadeId}
                onChange={(e) => setFotoPendente(prev => ({ ...prev, atividadeId: e.target.value }))}>
                <option value="">Nenhuma</option>
                {formData.atividades.map(a => {
                  const sel = atividadesEap.find(x => String(x.id) === String(a.atividade_eap_id));
                  return <option key={a.atividade_eap_id} value={a.atividade_eap_id}>{sel?.codigo_eap} — {sel?.nome || sel?.descricao || ''}</option>;
                })}
              </select>
            </div>
            <div className="form-group" style={{ flex: '2' }}>
              <label className="form-label">Descrição</label>
              <input className="form-input" type="text" placeholder="Legenda da foto..."
                value={fotoPendente.descricao}
                onChange={(e) => setFotoPendente(prev => ({ ...prev, descricao: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleFotoUpload} disabled={!fotoPendente.file || isUploadingFoto}>
                <Upload size={15} /> {isUploadingFoto ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
          {!rdoId && fotosQueue.length > 0 && (
            <div className="alert alert-info" style={{ marginBottom: '8px', fontSize: '12px' }}>
              {fotosQueue.length} foto(s) na fila — serão enviadas ao salvar o RDO.
            </div>
          )}
          {rdoFotos.length === 0 && fotosQueue.length === 0 ? (
            <div className="rdo-empty">Nenhuma foto adicionada.</div>
          ) : (
            <table className="rdo-table" style={{ marginTop: '8px' }}>
              <thead><tr><th>Arquivo</th><th>Descrição</th><th>Atividade</th><th>Data</th></tr></thead>
              <tbody>
                {rdoFotos.map(f => (
                  <tr key={f.id}>
                    <td><FileText size={14} style={{ marginRight: '6px', color: '#94a3b8' }} />{f.nome_arquivo}</td>
                    <td>{f.descricao || '—'}</td>
                    <td style={{ color: '#64748b', fontSize: '12px' }}>{(() => { const a = atividadesEap.find(x => String(x.id) === String(f.atividade_eap_id)); return a ? `${a.codigo_eap} — ${a.nome || a.descricao || ''}` : (f.atividade_descricao || '—'); })()}</td>
                    <td style={{ color: '#94a3b8', fontSize: '12px' }}>{f.criado_em ? new Date(f.criado_em).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}
                {fotosQueue.map((f, i) => (
                  <tr key={`q-${i}`} style={{ background: '#fefce8' }}>
                    <td><FileText size={14} style={{ marginRight: '6px', color: '#94a3b8' }} />{f.file.name}</td>
                    <td>{f.descricao || '—'}</td>
                    <td style={{ color: '#64748b', fontSize: '12px' }}>{(() => { const a = atividadesEap.find(x => String(x.id) === String(f.atividadeId)); return a ? `${a.codigo_eap} — ${a.nome || a.descricao || ''}` : (f.atividadeId ? '—' : '—'); })()}</td>
                    <td style={{ color: '#94a3b8', fontSize: '12px' }}>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ══ SEÇÃO 7 — Materiais Recebidos ════════════ */}
        <Section id="materiais" num="7" title="Materiais Recebidos" badge={formData.materiais_lista.length || null} isOpen={openSections.materiais} onToggle={toggleSection}>
          <div className="rdo-add-row">
            <div className="form-group" style={{ flex: '3' }}>
              <label className="form-label">Material</label>
              <input className="form-input" type="text" value={draftMaterial.nome}
                onChange={(e) => setDraftMaterial({ ...draftMaterial, nome: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '1', minWidth: '80px' }}>
              <label className="form-label">Qtd.</label>
              <input className="form-input" type="number" value={draftMaterial.quantidade}
                onChange={(e) => setDraftMaterial({ ...draftMaterial, quantidade: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Unidade</label>
              <input className="form-input" type="text" placeholder="m, kg, un" value={draftMaterial.unidade}
                onChange={(e) => setDraftMaterial({ ...draftMaterial, unidade: e.target.value })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addMaterial}><Plus size={15} /> Adicionar</button>
            </div>
          </div>
          {formData.materiais_lista.length === 0 ? (
            <div className="rdo-empty">Nenhum material registrado.</div>
          ) : (
            <table className="rdo-table">
              <thead><tr><th>Material</th><th>Quantidade</th><th>Unidade</th><th className="td-actions"></th></tr></thead>
              <tbody>
                {formData.materiais_lista.map((m, idx) => (
                  <tr key={idx}>
                    <td><strong>{m.nome}</strong></td>
                    <td>{m.quantidade}</td>
                    <td>{m.unidade || '—'}</td>
                    <td className="td-actions">
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeMaterial(idx)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ══ SEÇÃO 8 — Ocorrências ═════════════════════ */}
        <Section id="ocorrencias" num="8" title="Ocorrências" badge={formData.ocorrencias_lista.length || null} isOpen={openSections.ocorrencias} onToggle={toggleSection}>
          <div className="rdo-add-row">
            <div className="form-group" style={{ flex: '2' }}>
              <label className="form-label">Título</label>
              <input className="form-input" type="text" value={draftOcorrencia.titulo}
                onChange={(e) => setDraftOcorrencia({ ...draftOcorrencia, titulo: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '3' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" type="text" value={draftOcorrencia.descricao}
                onChange={(e) => setDraftOcorrencia({ ...draftOcorrencia, descricao: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Gravidade</label>
              <select className="form-select" value={draftOcorrencia.gravidade}
                onChange={(e) => setDraftOcorrencia({ ...draftOcorrencia, gravidade: e.target.value })}>
                <option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addOcorrencia}><Plus size={15} /> Adicionar</button>
            </div>
          </div>
          {formData.ocorrencias_lista.length === 0 ? (
            <div className="rdo-empty">Nenhuma ocorrência registrada.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {formData.ocorrencias_lista.map((o, idx) => (
                <div key={idx} className="rdo-ocorrencia-item">
                  <div className="ocorr-content">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span className={`rdo-badge ${gravBadgeCls(o.gravidade)}`}>{o.gravidade}</span>
                      {o.titulo && <span className="ocorr-titulo">{o.titulo}</span>}
                    </div>
                    <div className="ocorr-desc">{o.descricao}</div>
                  </div>
                  <button className="btn btn-danger" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => removeOcorrencia(idx)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ══ SEÇÃO 9 — Comentários ════════════════════ */}
        <Section id="comentarios" num="9" title="Comentários"
          badge={rdoId ? comentariosExistentes.length : formData.comentarios_lista.length || null}
          isOpen={openSections.comentarios} onToggle={toggleSection}>
          <div className="rdo-add-row">
            <div className="form-group" style={{ flex: '1' }}>
              <label className="form-label">Novo comentário</label>
              <input className="form-input" type="text" placeholder="Digite o comentário..."
                value={draftComentario} onChange={(e) => setDraftComentario(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addComentario()} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addComentario}><Plus size={15} /> Adicionar</button>
            </div>
          </div>
          {(() => {
            const lista = rdoId
              ? comentariosExistentes
              : (formData.comentarios_lista || []).map((c, i) => ({ id: i, comentario: c, autor_nome: usuario?.nome || 'Você', criado_em: new Date().toISOString() }));
            if (!lista || lista.length === 0) return <div className="rdo-empty">Nenhum comentário.</div>;
            return (
              <table className="rdo-table" style={{ marginTop: '8px' }}>
                <thead><tr><th>Comentário</th><th>Autor</th><th>Data/Hora</th><th className="td-actions"></th></tr></thead>
                <tbody>
                  {lista.map((c, idx) => (
                    <tr key={c.id || idx}>
                      <td>{c.comentario}</td>
                      <td style={{ color: '#64748b' }}>{c.autor_nome || '—'}</td>
                      <td style={{ color: '#94a3b8', fontSize: '12px' }}>{new Date(c.criado_em).toLocaleString('pt-BR')}</td>
                      <td className="td-actions">
                        <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeComentario(idx)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </Section>

        {/* ══ SEÇÃO 10 — Anexos ═════════════════════════ */}
        <Section id="anexos" num="10" title="Anexos do RDO" badge={(anexos.length + anexosQueue.length) || null} isOpen={openSections.anexos} onToggle={toggleSection}>
          {!rdoId && anexosQueue.length > 0 && (
            <div className="alert alert-info" style={{ marginBottom: '8px', fontSize: '12px' }}>
              {anexosQueue.length} arquivo(s) na fila — serão enviados ao salvar o RDO.
            </div>
          )}
          <label className="rdo-upload-zone">
            <input ref={anexoInputRef} type="file" multiple
              onChange={(e) => { Array.from(e.target.files || []).forEach(f => handleAnexoUpload(f)); }}
              disabled={isUploadingAnexo} />
            <Upload size={24} style={{ marginBottom: '6px', color: '#94a3b8' }} />
            <div>{isUploadingAnexo ? 'Enviando...' : 'Clique ou arraste arquivos aqui'}</div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>PDF, DOC, XLS, imagens — máx. 10 MB cada</div>
          </label>
          {!rdoId && anexosQueue.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              {anexosQueue.map((f, i) => (
                <div key={i} className="rdo-anexo-item">
                  <span className="anexo-icon"><FileText size={18} color="#94a3b8" /></span>
                  <div className="anexo-info">
                    <div className="anexo-nome">{f.name}</div>
                    <div className="anexo-meta" style={{ color: '#f59e0b' }}>Na fila — será enviado ao salvar</div>
                  </div>
                  <button className="btn btn-danger" style={{ padding: '4px 8px', flexShrink: 0 }}
                    onClick={() => setAnexosQueue(prev => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {anexos.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              {anexos.map(a => (
                <div key={a.id} className="rdo-anexo-item">
                  <span className="anexo-icon"><FileText size={18} color="#64748b" /></span>
                  <div className="anexo-info">
                    <div className="anexo-nome">{a.nome_original || a.nome_arquivo || a.nome || 'Arquivo'}</div>
                    <div className="anexo-meta">
                      {a.tipo || a.tipo_arquivo || ''}{a.tamanho ? ` — ${(a.tamanho / 1024).toFixed(0)} KB` : ''}
                    </div>
                  </div>
                  <button className="btn btn-danger" style={{ padding: '4px 8px', flexShrink: 0 }}
                    onClick={() => handleRemoveAnexo(a.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {anexos.length === 0 && anexosQueue.length === 0 && <div className="rdo-empty" style={{ marginTop: '10px' }}>Nenhum anexo adicionado.</div>}
        </Section>

        {/* ── Barra de ações ───────────────────────────── */}
        <div className="rdo-actions-bar">
          <div className="rdo-status-chip">
            <span>RDO {rdoId ? `#${rdoId}` : 'novo'}</span>
            {formData.data_relatorio && (
              <span style={{ color: '#94a3b8' }}>— {new Date(formData.data_relatorio + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rdos`)}>
              Voltar
            </button>
            <button className="btn btn-success" onClick={salvar}
              disabled={isSaving || !formData.data_relatorio}>
              {isSaving ? 'Salvando...' : rdoId ? 'Salvar alterações' : 'Salvar RDO'}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}

export default RDOForm2;
