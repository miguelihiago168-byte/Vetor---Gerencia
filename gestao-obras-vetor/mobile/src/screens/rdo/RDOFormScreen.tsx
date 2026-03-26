import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image, Modal, FlatList,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppStackParamList } from '../../navigation/AppNavigator';
import {
  getRDO, createRDO, updateRDO, getAtividadesEAP,
  getRdoColaboradores, getExecucaoAcumulada,
  getRdoEquipamentos, addRdoEquipamento, deleteRdoEquipamento,
  addRdoClima, addRdoMaterial, addRdoOcorrencia, addRdoComentario,
  uploadRdoFoto,
} from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { CORES } from '../../utils/constants';

type Route = RouteProp<AppStackParamList, 'RDOForm'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface ClimaPeriodo {
  periodo: string;
  condicao_tempo: string;
  condicao_trabalho: string;
  pluviometria_mm: string;
}
interface MaoObraItem {
  nome: string;
  funcao: string;
  classificacao: string;
  entrada: string;
  saida: string;
}
interface AtividadeItem {
  atividade_eap_id: number;
  avulsa?: boolean;
  descricao: string;
  codigo_eap: string;
  unidade_medida: string;
  percentual_executado: string;
  quantidade_executada: string;
  observacao: string;
}
interface MaterialItem { nome: string; quantidade: string; unidade: string }
interface OcorrenciaItem { titulo: string; descricao: string; gravidade: string }
interface EapAtividade {
  id: number; codigo_eap: string; nome?: string; descricao?: string;
  unidade_medida?: string; quantidade_total?: number; pai_id?: number;
}
interface Colaborador { nome: string; funcao: string }

const CONDICAO_TEMPO = ['Ensolarado', 'Nublado', 'Chuvoso', 'Parcialmente nublado', 'Tempestuoso'];
const CONDICAO_TRABALHO = ['Praticável', 'Impraticável'];
const PERIODOS = ['Manhã', 'Tarde', 'Noite'];
const GRAVIDADES = ['Alta', 'Média', 'Baixa'];
const CLASSIFICACOES = ['Direta', 'Indireta', 'Terceiros'];

const climaInicial = (): ClimaPeriodo[] =>
  PERIODOS.map(p => ({ periodo: p, condicao_tempo: 'Ensolarado', condicao_trabalho: 'Praticável', pluviometria_mm: '' }));

const toMinutes = (t: string) => {
  const m = t?.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

const calcHoras = (ini: string, fim: string, intIni: string, intFim: string) => {
  const a = toMinutes(ini), b = toMinutes(fim), c = toMinutes(intIni), d = toMinutes(intFim);
  if (a == null || b == null) return 0;
  let total = Math.max(0, b - a);
  if (c != null && d != null && d > c) total = Math.max(0, total - (d - c));
  return Math.round((total / 60) * 100) / 100;
};

const minParaHHMM = (hDecimal: number) => {
  const totalMin = Math.round(hDecimal * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
};

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const diaSemana = (data: string) => {
  const m = data?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return DIAS[new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).getDay()];
};

// ─── Componentes auxiliares ───────────────────────────────────────────────────
function Secao({ titulo, badge, aberta, onToggle, children }: {
  titulo: string; badge?: number | string; aberta: boolean;
  onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <View style={s.secao}>
      <TouchableOpacity style={s.secaoHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={s.secaoHeaderEsquerda}>
          <Text style={s.secaoTitulo}>{titulo}</Text>
          {badge != null && <View style={s.badge}><Text style={s.badgeTexto}>{badge}</Text></View>}
        </View>
        <MaterialCommunityIcons name={aberta ? 'chevron-up' : 'chevron-down'} size={20} color={CORES.textoSecundario} />
      </TouchableOpacity>
      {aberta && <View style={s.secaoCorpo}>{children}</View>}
    </View>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.campo}>
      <Text style={s.campoLabel}>{label}</Text>
      {children}
    </View>
  );
}

function InputTexto({ value, onChange, placeholder, teclado, multiline }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  teclado?: 'default' | 'numeric' | 'numbers-and-punctuation'; multiline?: boolean;
}) {
  return (
    <TextInput
      style={[s.input, multiline && s.textarea]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={CORES.desabilitado}
      keyboardType={teclado}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      textAlignVertical={multiline ? 'top' : 'auto'}
    />
  );
}

function Chips({ opcoes, valor, onSelect }: { opcoes: string[]; valor: string; onSelect: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={s.chips}>
        {opcoes.map(op => (
          <TouchableOpacity key={op} style={[s.chip, valor === op && s.chipAtivo]} onPress={() => onSelect(op)}>
            <Text style={[s.chipTexto, valor === op && s.chipTextoAtivo]}>{op}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function SelectExpansivel({ opcoes, valor, onSelect }: { opcoes: string[]; valor: string; onSelect: (v: string) => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <View style={s.selectWrapper}>
      <TouchableOpacity style={s.selectBtn} onPress={() => setAberto(p => !p)} activeOpacity={0.7}>
        <Text style={s.selectValor}>{valor || 'Selecionar...'}</Text>
        <MaterialCommunityIcons name={aberto ? 'chevron-up' : 'chevron-down'} size={16} color={CORES.textoSecundario} />
      </TouchableOpacity>
      {aberto && (
        <View style={s.selectLista}>
          {opcoes.map(op => (
            <TouchableOpacity key={op} style={[s.selectItem, valor === op && s.selectItemAtivo]}
              onPress={() => { onSelect(op); setAberto(false); }}>
              <Text style={[s.selectItemTexto, valor === op && s.selectItemTextoAtivo]}>{op}</Text>
              {valor === op && <MaterialCommunityIcons name="check" size={14} color={CORES.primaria} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────
export default function RDOFormScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { projetoId, rdoId } = route.params;
  const { success, error } = useNotification();

  // Dados carregados do servidor
  const [eapAtividades, setEapAtividades] = useState<EapAtividade[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [execucaoAcum, setExecucaoAcum] = useState<Record<number, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Seções abertas/fechadas
  const [abertas, setAbertas] = useState<Record<string, boolean>>({
    horario: true, clima: true, maoObra: true, equip: true,
    atividades: true, materiais: false, ocorrencias: true, fotos: false, comentario: false,
  });
  const toggle = (k: string) => setAbertas(p => ({ ...p, [k]: !p[k] }));

  // ── Dados do formulário ───────────────────────────────────────────────────
  const [dataRdo, setDataRdo] = useState(new Date().toISOString().split('T')[0]);
  const [horaInicio, setHoraInicio] = useState('07:00');
  const [horaFim, setHoraFim] = useState('17:00');
  const [intervaloInicio, setIntervaloInicio] = useState('12:00');
  const [intervaloFim, setIntervaloFim] = useState('13:00');

  const [climaRegistros, setClimaRegistros] = useState<ClimaPeriodo[]>(climaInicial());
  const [maoObra, setMaoObra] = useState<MaoObraItem[]>([]);
  const [equipamentos, setEquipamentos] = useState<{ id?: number; nome: string; quantidade: string; unidade: string }[]>([]);
  const [atividades, setAtividades] = useState<AtividadeItem[]>([]);
  const [materiais, setMateriais] = useState<MaterialItem[]>([]);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaItem[]>([]);
  const [fotos, setFotos] = useState<{ uri: string; name: string }[]>([]);
  const [comentario, setComentario] = useState('');

  // Modais de seleção
  const [modalEap, setModalEap] = useState(false);
  const [modalColab, setModalColab] = useState(false);
  const [buscaEap, setBuscaEap] = useState('');
  const [buscaColab, setBuscaColab] = useState('');
  const [maoObraExpandida, setMaoObraExpandida] = useState<number | null>(null);

  const horasTrabalhadas = useMemo(
    () => calcHoras(horaInicio, horaFim, intervaloInicio, intervaloFim),
    [horaInicio, horaFim, intervaloInicio, intervaloFim],
  );

  // ── EAP disponíveis (não selecionadas) ────────────────────────────────────
  const eapDisponiveis = useMemo(() => {
    const ids = new Set(atividades.filter(a => !a.avulsa).map(a => a.atividade_eap_id));
    const folhas = eapAtividades.filter(e => !eapAtividades.some(x => x.pai_id === e.id));
    return folhas
      .filter(e => !ids.has(e.id) && (
        buscaEap.length < 2 ||
        (e.nome || e.descricao || '').toLowerCase().includes(buscaEap.toLowerCase()) ||
        e.codigo_eap.toLowerCase().includes(buscaEap.toLowerCase())
      ))
      .sort((a, b) => a.codigo_eap.localeCompare(b.codigo_eap, undefined, { numeric: true }));
  }, [eapAtividades, atividades, buscaEap]);

  const colabDisponiveis = useMemo(() => {
    const nomes = new Set(maoObra.map(m => m.nome));
    return colaboradores.filter(c => !nomes.has(c.nome) && (
      buscaColab.length < 2 || c.nome.toLowerCase().includes(buscaColab.toLowerCase())
    ));
  }, [colaboradores, maoObra, buscaColab]);

  // ── Carregamento inicial ───────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    try {
      const [eapRes, colabRes] = await Promise.all([
        getAtividadesEAP(projetoId),
        getRdoColaboradores(projetoId),
      ]);
      setEapAtividades(eapRes.data || []);
      setColaboradores(Array.isArray(colabRes.data) ? colabRes.data : []);

      try {
        const acumRes = await getExecucaoAcumulada(projetoId);
        const map: Record<number, number> = {};
        (acumRes.data || []).forEach((r: { atividade_eap_id: number; total_executado: number }) => {
          map[r.atividade_eap_id] = Number(r.total_executado || 0);
        });
        setExecucaoAcum(map);
      } catch { /* ignora */ }

      if (rdoId) {
        const [rdoRes, equipRes] = await Promise.all([
          getRDO(rdoId),
          getRdoEquipamentos(rdoId).catch(() => ({ data: [] })),
        ]);
        const r = rdoRes.data;

        setDataRdo(String(r.data_relatorio || '').split('T')[0]);
        setHoraInicio(r.entrada_saida_inicio || '07:00');
        setHoraFim(r.entrada_saida_fim || '17:00');
        setIntervaloInicio(r.intervalo_almoco_inicio || '12:00');
        setIntervaloFim(r.intervalo_almoco_fim || '13:00');

        // Clima
        if (Array.isArray(r.clima) && r.clima.length > 0) {
          const clima = PERIODOS.map(p => {
            const c = r.clima.find((x: Record<string, unknown>) => x.periodo === p);
            return {
              periodo: p,
              condicao_tempo: c?.condicao_tempo || 'Ensolarado',
              condicao_trabalho: c?.condicao_trabalho || 'Praticável',
              pluviometria_mm: String(c?.pluviometria_mm || ''),
            };
          });
          setClimaRegistros(clima);
        }

        // Mão de obra
        if (Array.isArray(r.mao_obra_detalhada) && r.mao_obra_detalhada.length > 0) {
          setMaoObra(r.mao_obra_detalhada.map((m: Record<string, string>) => ({
            nome: m.nome || '', funcao: m.funcao || '', classificacao: m.classificacao || '',
            entrada: m.entrada || '', saida: m.saida || '',
          })));
        }

        // Atividades
        const eapData: EapAtividade[] = eapRes.data || [];
        if (Array.isArray(r.atividades)) {
          setAtividades(r.atividades.map((a: Record<string, unknown>) => {
            const eap = eapData.find(e => e.id === a.atividade_eap_id);
            return {
              atividade_eap_id: Number(a.atividade_eap_id),
              descricao: eap ? (eap.nome || eap.descricao || '') : String(a.descricao || ''),
              codigo_eap: eap?.codigo_eap || String(a.codigo_eap || ''),
              unidade_medida: eap?.unidade_medida || '',
              percentual_executado: String(a.percentual_executado || ''),
              quantidade_executada: String(a.quantidade_executada || ''),
              observacao: String(a.observacao || ''),
            };
          }));
        }

        // Equipamentos
        setEquipamentos((equipRes.data || []).map((e: Record<string, unknown>) => ({
          id: Number(e.id), nome: String(e.nome || ''),
          quantidade: String(e.quantidade || ''), unidade: String(e.unidade || ''),
        })));

        // Materiais
        if (Array.isArray(r.materiais)) {
          setMateriais(r.materiais.map((m: Record<string, unknown>) => ({
            nome: String(m.nome_material || m.nome || ''),
            quantidade: String(m.quantidade || ''),
            unidade: String(m.unidade || ''),
          })));
        }

        // Ocorrências
        if (Array.isArray(r.ocorrencias)) {
          setOcorrencias(r.ocorrencias.map((o: Record<string, unknown>) => ({
            titulo: String(o.titulo || ''),
            descricao: String(o.descricao || ''),
            gravidade: String(o.gravidade || 'Baixa'),
          })));
        }
      }
    } catch {
      error('Erro ao carregar dados.');
    } finally {
      setCarregando(false);
    }
  }, [projetoId, rdoId, error]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Ações de lista ─────────────────────────────────────────────────────────
  const adicionarMaoObra = (c: Colaborador) => {
    setMaoObra(p => [...p, { nome: c.nome, funcao: c.funcao, classificacao: 'Direta', entrada: '07:00', saida: '17:00' }]);
    setMaoObraExpandida(null);
    setModalColab(false);
  };

  const adicionarMaoObraManual = () => {
    setMaoObra(p => { const idx = p.length; setMaoObraExpandida(idx); return [...p, { nome: '', funcao: '', classificacao: 'Direta', entrada: '07:00', saida: '17:00' }]; });
  };

  const removerMaoObra = (idx: number) => setMaoObra(p => p.filter((_, i) => i !== idx));

  const atualizarMaoObra = (idx: number, campo: keyof MaoObraItem, val: string) =>
    setMaoObra(p => p.map((m, i) => i === idx ? { ...m, [campo]: val } : m));

  const adicionarAtividade = (e: EapAtividade) => {
    setAtividades(p => [...p, {
      atividade_eap_id: e.id,
      descricao: e.nome || e.descricao || '',
      codigo_eap: e.codigo_eap,
      unidade_medida: e.unidade_medida || '',
      percentual_executado: '',
      quantidade_executada: '',
      observacao: '',
    }]);
    setModalEap(false);
    setBuscaEap('');
  };

  const adicionarAtividadeAvulsa = () => {
    setAtividades(p => [...p, {
      atividade_eap_id: 0, avulsa: true,
      descricao: '', codigo_eap: '', unidade_medida: '',
      percentual_executado: '', quantidade_executada: '', observacao: '',
    }]);
  };

  const removerAtividade = (idx: number) => setAtividades(p => p.filter((_, i) => i !== idx));

  const atualizarAtividade = (idx: number, campo: keyof AtividadeItem, val: string) =>
    setAtividades(p => p.map((a, i) => i === idx ? { ...a, [campo]: val } : a));

  const adicionarEquipamento = () =>
    setEquipamentos(p => [...p, { nome: '', quantidade: '1', unidade: 'un' }]);

  const removerEquipamento = (idx: number) => setEquipamentos(p => p.filter((_, i) => i !== idx));

  const atualizarEquipamento = (idx: number, campo: string, val: string) =>
    setEquipamentos(p => p.map((e, i) => i === idx ? { ...e, [campo]: val } : e));

  const adicionarMaterial = () => setMateriais(p => [...p, { nome: '', quantidade: '', unidade: '' }]);
  const removerMaterial = (idx: number) => setMateriais(p => p.filter((_, i) => i !== idx));
  const atualizarMaterial = (idx: number, campo: keyof MaterialItem, val: string) =>
    setMateriais(p => p.map((m, i) => i === idx ? { ...m, [campo]: val } : m));

  const adicionarOcorrencia = () =>
    setOcorrencias(p => [...p, { titulo: '', descricao: '', gravidade: 'Baixa' }]);
  const removerOcorrencia = (idx: number) => setOcorrencias(p => p.filter((_, i) => i !== idx));
  const atualizarOcorrencia = (idx: number, campo: keyof OcorrenciaItem, val: string) =>
    setOcorrencias(p => p.map((o, i) => i === idx ? { ...o, [campo]: val } : o));

  // ── Fotos ──────────────────────────────────────────────────────────────────
  const tirarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Permita o acesso à câmera.'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled) {
      const a = r.assets[0];
      setFotos(p => [...p, { uri: a.uri, name: a.fileName ?? `foto_${Date.now()}.jpg` }]);
    }
  };

  const selecionarFoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Permita o acesso à galeria.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsMultipleSelection: true });
    if (!r.canceled) {
      setFotos(p => [...p, ...r.assets.map(a => ({ uri: a.uri, name: a.fileName ?? `foto_${Date.now()}.jpg` }))]);
    }
  };

  // ── Salvar ─────────────────────────────────────────────────────────────────
  const salvar = async () => {
    if (!dataRdo) { error('Informe a data do RDO.'); return; }
    if (atividades.length === 0) { error('Adicione ao menos uma atividade (EAP ou avulsa).'); return; }

    setSalvando(true);
    try {
      const eapAtivs = atividades.filter(a => !a.avulsa && a.atividade_eap_id > 0);
      const avulsas = atividades.filter(a => a.avulsa);
      const payload: Record<string, unknown> = {
        projeto_id: projetoId,
        data_relatorio: dataRdo,
        entrada_saida_inicio: horaInicio,
        entrada_saida_fim: horaFim,
        intervalo_almoco_inicio: intervaloInicio,
        intervalo_almoco_fim: intervaloFim,
        horas_trabalhadas: horasTrabalhadas,
        mao_obra_detalhada: maoObra,
        atividades: eapAtivs.map(a => ({
          atividade_eap_id: a.atividade_eap_id,
          percentual_executado: a.percentual_executado ? Number(a.percentual_executado) : 0,
          quantidade_executada: a.quantidade_executada ? Number(a.quantidade_executada) : undefined,
          observacao: a.observacao,
        })),
        atividades_avulsas: avulsas.map(a => ({
          descricao: a.descricao,
          quantidade_executada: a.quantidade_executada || '',
          observacao: a.observacao,
        })),
      };

      let id = rdoId;
      if (rdoId) {
        await updateRDO(rdoId, payload);
      } else {
        const resp = await createRDO(payload);
        id = resp.data.id;
      }

      if (!id) throw new Error('RDO sem ID');

      // Sub-recursos assíncronos (best-effort)
      await Promise.allSettled([
        // Clima
        ...climaRegistros.map(c => addRdoClima(id!, {
          periodo: c.periodo, condicao_tempo: c.condicao_tempo,
          condicao_trabalho: c.condicao_trabalho,
          pluviometria_mm: c.pluviometria_mm ? Number(c.pluviometria_mm) : 0,
        })),
        // Materiais
        ...materiais.filter(m => m.nome).map(m => addRdoMaterial(id!, {
          nome_material: m.nome, quantidade: Number(m.quantidade) || 0, unidade: m.unidade,
        })),
        // Ocorrências
        ...ocorrencias.filter(o => o.titulo).map(o => addRdoOcorrencia(id!, {
          titulo: o.titulo, descricao: o.descricao, gravidade: o.gravidade,
        })),
        // Equipamentos (novos - sem id)
        ...equipamentos.filter(e => !e.id && e.nome).map(e => addRdoEquipamento(id!, {
          nome: e.nome, quantidade: Number(e.quantidade) || 1, unidade: e.unidade,
        })),
        // Comentário
        ...(comentario.trim() ? [addRdoComentario(id!, { comentario: comentario.trim() })] : []),
      ]);

      // Fotos (sequencial para evitar sobrecarga)
      for (const foto of fotos) {
        const fd = new FormData();
        fd.append('arquivo', { uri: foto.uri, name: foto.name, type: 'image/jpeg' } as unknown as Blob);
        await uploadRdoFoto(id!, fd).catch(() => { /* ignora falha de upload */ });
      }

      success(rdoId ? 'RDO atualizado!' : 'RDO criado com sucesso!');
      navigation.goBack();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro ?? 'Erro ao salvar RDO.';
      error(msg);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <View style={s.centro}><ActivityIndicator size="large" color={CORES.primaria} /></View>;
  }

  const horasText = `${minParaHHMM(horasTrabalhadas)}h trabalhadas`;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {/* ── 1. HORÁRIO ──────────────────────────────────────────────────── */}
        <Secao titulo="Horário" aberta={abertas.horario} onToggle={() => toggle('horario')}>
          <Campo label="Data do RDO *">
            <InputTexto value={dataRdo} onChange={setDataRdo} placeholder="AAAA-MM-DD" teclado="numbers-and-punctuation" />
          </Campo>
          {diaSemana(dataRdo) !== '' && (
            <Text style={s.infoTexto}>{diaSemana(dataRdo)}</Text>
          )}
          <View style={s.linhaGrid}>
            <View style={{ flex: 1 }}>
              <Campo label="Entrada">
                <InputTexto value={horaInicio} onChange={setHoraInicio} placeholder="07:00" teclado="numbers-and-punctuation" />
              </Campo>
            </View>
            <View style={{ flex: 1 }}>
              <Campo label="Saída">
                <InputTexto value={horaFim} onChange={setHoraFim} placeholder="17:00" teclado="numbers-and-punctuation" />
              </Campo>
            </View>
          </View>
          <View style={s.linhaGrid}>
            <View style={{ flex: 1 }}>
              <Campo label="Início intervalo">
                <InputTexto value={intervaloInicio} onChange={setIntervaloInicio} placeholder="12:00" teclado="numbers-and-punctuation" />
              </Campo>
            </View>
            <View style={{ flex: 1 }}>
              <Campo label="Fim intervalo">
                <InputTexto value={intervaloFim} onChange={setIntervaloFim} placeholder="13:00" teclado="numbers-and-punctuation" />
              </Campo>
            </View>
          </View>
          <View style={s.kpiBox}>
            <MaterialCommunityIcons name="clock-outline" size={16} color={CORES.primaria} />
            <Text style={s.kpiTexto}>{horasText}</Text>
          </View>
        </Secao>

        {/* ── 2. CLIMA ────────────────────────────────────────────────────── */}
        <Secao titulo="Clima" aberta={abertas.clima} onToggle={() => toggle('clima')}>
          {climaRegistros.map((c, i) => (
            <View key={c.periodo} style={i > 0 ? s.climaSeparador : undefined}>
              <Text style={s.climaPeriodo}>{c.periodo}</Text>
              <Campo label="Condição do tempo">
                <SelectExpansivel opcoes={CONDICAO_TEMPO} valor={c.condicao_tempo} onSelect={v =>
                  setClimaRegistros(p => p.map((x, j) => j === i ? { ...x, condicao_tempo: v } : x))
                } />
              </Campo>
              <Campo label="Praticabilidade">
                <SelectExpansivel opcoes={CONDICAO_TRABALHO} valor={c.condicao_trabalho} onSelect={v =>
                  setClimaRegistros(p => p.map((x, j) => j === i ? { ...x, condicao_trabalho: v } : x))
                } />
              </Campo>
              <Campo label="Pluviometria (mm)">
                <InputTexto value={c.pluviometria_mm} onChange={v =>
                  setClimaRegistros(p => p.map((x, j) => j === i ? { ...x, pluviometria_mm: v } : x))
                } placeholder="0" teclado="numeric" />
              </Campo>
            </View>
          ))}
        </Secao>

        {/* ── 3. MÃO DE OBRA ──────────────────────────────────────────────── */}
        <Secao titulo="Mão de Obra" badge={maoObra.length || undefined} aberta={abertas.maoObra} onToggle={() => toggle('maoObra')}>
          {maoObra.map((m, i) => {
            const expandido = maoObraExpandida === i;
            const horasM = calcHoras(m.entrada || '07:00', m.saida || '17:00', '12:00', '13:00');
            return (
              <View key={i} style={s.itemCard}>
                <TouchableOpacity style={s.itemCardHeader}
                  onPress={() => setMaoObraExpandida(expandido ? null : i)} activeOpacity={0.7}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemCardTitulo}>{m.nome || `Colaborador ${i + 1}`}</Text>
                    <Text style={s.infoTexto}>{m.funcao || ''}{m.classificacao ? ` • ${m.classificacao}` : ''} • {minParaHHMM(horasM)}h</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name={expandido ? 'chevron-up' : 'chevron-down'} size={18} color={CORES.textoSecundario} />
                    <TouchableOpacity onPress={() => { removerMaoObra(i); if (maoObraExpandida === i) setMaoObraExpandida(null); }}>
                      <MaterialCommunityIcons name="delete-outline" size={20} color={CORES.erro} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                {expandido && (
                  <View style={s.itemCardCorpo}>
                    <Campo label="Nome">
                      <InputTexto value={m.nome} onChange={v => atualizarMaoObra(i, 'nome', v)} placeholder="Nome" />
                    </Campo>
                    <Campo label="Função">
                      <InputTexto value={m.funcao} onChange={v => atualizarMaoObra(i, 'funcao', v)} placeholder="Função" />
                    </Campo>
                    <Campo label="Classificação">
                      <Chips opcoes={CLASSIFICACOES} valor={m.classificacao} onSelect={v => atualizarMaoObra(i, 'classificacao', v)} />
                    </Campo>
                    <View style={s.linhaGrid}>
                      <View style={{ flex: 1 }}>
                        <Campo label="Entrada">
                          <InputTexto value={m.entrada} onChange={v => atualizarMaoObra(i, 'entrada', v)} placeholder="07:00" teclado="numbers-and-punctuation" />
                        </Campo>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Campo label="Saída">
                          <InputTexto value={m.saida} onChange={v => atualizarMaoObra(i, 'saida', v)} placeholder="17:00" teclado="numbers-and-punctuation" />
                        </Campo>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
          <View style={s.botoesLinha}>
            <TouchableOpacity style={[s.btnAdicionar, { flex: 1 }]} onPress={() => { setBuscaColab(''); setModalColab(true); }}>
              <MaterialCommunityIcons name="account-plus-outline" size={16} color={CORES.primaria} />
              <Text style={s.btnAdicionarTexto}>Da lista</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnAdicionar, { flex: 1 }]} onPress={adicionarMaoObraManual}>
              <MaterialCommunityIcons name="plus" size={16} color={CORES.primaria} />
              <Text style={s.btnAdicionarTexto}>Inserir manualmente</Text>
            </TouchableOpacity>
          </View>
        </Secao>

        {/* ── 4. EQUIPAMENTOS ─────────────────────────────────────────────── */}
        <Secao titulo="Equipamentos" badge={equipamentos.length || undefined} aberta={abertas.equip} onToggle={() => toggle('equip')}>
          {equipamentos.map((e, i) => (
            <View key={i} style={s.itemCard}>
              <View style={s.itemCardHeader}>
                <Text style={s.itemCardTitulo}>{e.nome || `Equipamento ${i + 1}`}</Text>
                <TouchableOpacity onPress={() => removerEquipamento(i)}>
                  <MaterialCommunityIcons name="delete-outline" size={20} color={CORES.erro} />
                </TouchableOpacity>
              </View>
              <View style={s.linhaGrid}>
                <View style={{ flex: 2 }}>
                  <Campo label="Nome">
                    <InputTexto value={e.nome} onChange={v => atualizarEquipamento(i, 'nome', v)} placeholder="Ex: Escavadeira" />
                  </Campo>
                </View>
                <View style={{ flex: 1 }}>
                  <Campo label="Qtd">
                    <InputTexto value={e.quantidade} onChange={v => atualizarEquipamento(i, 'quantidade', v)} teclado="numeric" />
                  </Campo>
                </View>
                <View style={{ flex: 1 }}>
                  <Campo label="Un">
                    <InputTexto value={e.unidade} onChange={v => atualizarEquipamento(i, 'unidade', v)} placeholder="un" />
                  </Campo>
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity style={s.btnAdicionar} onPress={adicionarEquipamento}>
            <MaterialCommunityIcons name="plus" size={18} color={CORES.primaria} />
            <Text style={s.btnAdicionarTexto}>Adicionar equipamento</Text>
          </TouchableOpacity>
        </Secao>

        {/* ── 5. ATIVIDADES EAP ───────────────────────────────────────────── */}
        <Secao titulo="Atividades *" badge={atividades.length || undefined} aberta={abertas.atividades} onToggle={() => toggle('atividades')}>
          {atividades.map((a, i) => {
            const acum = !a.avulsa ? (execucaoAcum[a.atividade_eap_id] || 0) : 0;
            return (
              <View key={i} style={s.itemCard}>
                <View style={s.itemCardHeader}>
                  <View style={{ flex: 1 }}>
                    {!a.avulsa && <Text style={s.itemCardCodigo}>{a.codigo_eap}</Text>}
                    {a.avulsa
                      ? <Text style={[s.itemCardCodigo, { color: CORES.aviso }]}>● Atividade Avulsa</Text>
                      : <Text style={s.itemCardTitulo}>{a.descricao}</Text>
                    }
                    {acum > 0 && <Text style={s.infoTexto}>Acumulado: {acum} {a.unidade_medida}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => removerAtividade(i)}>
                    <MaterialCommunityIcons name="delete-outline" size={20} color={CORES.erro} />
                  </TouchableOpacity>
                </View>
                {a.avulsa && (
                  <Campo label="Descrição / Nome da atividade">
                    <InputTexto value={a.descricao} onChange={v => atualizarAtividade(i, 'descricao', v)} placeholder="Ex: Limpeza do canteiro..." />
                  </Campo>
                )}
                <View style={s.linhaGrid}>
                  <View style={{ flex: 1 }}>
                    <Campo label={`Qtd${a.unidade_medida ? ` (${a.unidade_medida})` : ''}`}>
                      <InputTexto value={a.quantidade_executada} onChange={v => atualizarAtividade(i, 'quantidade_executada', v)} teclado="numeric" placeholder="0" />
                    </Campo>
                  </View>
                  {!a.avulsa && (
                    <View style={{ flex: 1 }}>
                      <Campo label="% Executado">
                        <InputTexto value={a.percentual_executado} onChange={v => atualizarAtividade(i, 'percentual_executado', v)} teclado="numeric" placeholder="0" />
                      </Campo>
                    </View>
                  )}
                </View>
                <Campo label="Observação">
                  <InputTexto value={a.observacao} onChange={v => atualizarAtividade(i, 'observacao', v)} placeholder="Opcional..." multiline />
                </Campo>
              </View>
            );
          })}
          <View style={s.botoesLinha}>
            <TouchableOpacity style={[s.btnAdicionar, { flex: 1 }]} onPress={() => { setBuscaEap(''); setModalEap(true); }}>
              <MaterialCommunityIcons name="plus" size={16} color={CORES.primaria} />
              <Text style={s.btnAdicionarTexto}>EAP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnAdicionar, { flex: 1, borderColor: CORES.aviso }]} onPress={adicionarAtividadeAvulsa}>
              <MaterialCommunityIcons name="plus" size={16} color={CORES.aviso} />
              <Text style={[s.btnAdicionarTexto, { color: CORES.aviso }]}>Avulsa</Text>
            </TouchableOpacity>
          </View>
        </Secao>

        {/* ── 6. MATERIAIS ────────────────────────────────────────────────── */}
        <Secao titulo="Materiais" badge={materiais.length || undefined} aberta={abertas.materiais} onToggle={() => toggle('materiais')}>
          {materiais.map((m, i) => (
            <View key={i} style={s.itemCard}>
              <View style={s.itemCardHeader}>
                <Text style={s.itemCardTitulo}>{m.nome || `Material ${i + 1}`}</Text>
                <TouchableOpacity onPress={() => removerMaterial(i)}>
                  <MaterialCommunityIcons name="delete-outline" size={20} color={CORES.erro} />
                </TouchableOpacity>
              </View>
              <View style={s.linhaGrid}>
                <View style={{ flex: 2 }}>
                  <Campo label="Material">
                    <InputTexto value={m.nome} onChange={v => atualizarMaterial(i, 'nome', v)} placeholder="Nome do material" />
                  </Campo>
                </View>
                <View style={{ flex: 1 }}>
                  <Campo label="Qtd">
                    <InputTexto value={m.quantidade} onChange={v => atualizarMaterial(i, 'quantidade', v)} teclado="numeric" />
                  </Campo>
                </View>
                <View style={{ flex: 1 }}>
                  <Campo label="Un">
                    <InputTexto value={m.unidade} onChange={v => atualizarMaterial(i, 'unidade', v)} placeholder="m³" />
                  </Campo>
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity style={s.btnAdicionar} onPress={adicionarMaterial}>
            <MaterialCommunityIcons name="plus" size={18} color={CORES.primaria} />
            <Text style={s.btnAdicionarTexto}>Adicionar material</Text>
          </TouchableOpacity>
        </Secao>

        {/* ── 7. OCORRÊNCIAS ──────────────────────────────────────────────── */}
        <Secao titulo="Ocorrências" badge={ocorrencias.length || undefined} aberta={abertas.ocorrencias} onToggle={() => toggle('ocorrencias')}>
          {ocorrencias.map((o, i) => (
            <View key={i} style={s.itemCard}>
              <View style={s.itemCardHeader}>
                <Text style={s.itemCardTitulo}>{o.titulo || `Ocorrência ${i + 1}`}</Text>
                <TouchableOpacity onPress={() => removerOcorrencia(i)}>
                  <MaterialCommunityIcons name="delete-outline" size={20} color={CORES.erro} />
                </TouchableOpacity>
              </View>
              <Campo label="Título">
                <InputTexto value={o.titulo} onChange={v => atualizarOcorrencia(i, 'titulo', v)} placeholder="Título da ocorrência" />
              </Campo>
              <Campo label="Descrição">
                <InputTexto value={o.descricao} onChange={v => atualizarOcorrencia(i, 'descricao', v)} placeholder="Descreva a ocorrência..." multiline />
              </Campo>
              <Campo label="Gravidade">
                <Chips opcoes={GRAVIDADES} valor={o.gravidade} onSelect={v => atualizarOcorrencia(i, 'gravidade', v)} />
              </Campo>
            </View>
          ))}
          <TouchableOpacity style={s.btnAdicionar} onPress={adicionarOcorrencia}>
            <MaterialCommunityIcons name="plus" size={18} color={CORES.primaria} />
            <Text style={s.btnAdicionarTexto}>Adicionar ocorrência</Text>
          </TouchableOpacity>
        </Secao>

        {/* ── 8. FOTOS ────────────────────────────────────────────────────── */}
        <Secao titulo="Fotos" badge={fotos.length || undefined} aberta={abertas.fotos} onToggle={() => toggle('fotos')}>
          <View style={s.fotoAcoes}>
            <TouchableOpacity style={s.fotoBtn} onPress={tirarFoto}>
              <MaterialCommunityIcons name="camera-outline" size={20} color={CORES.primaria} />
              <Text style={s.fotoBtnTexto}>Câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.fotoBtn} onPress={selecionarFoto}>
              <MaterialCommunityIcons name="image-outline" size={20} color={CORES.primaria} />
              <Text style={s.fotoBtnTexto}>Galeria</Text>
            </TouchableOpacity>
          </View>
          {fotos.length > 0 && (
            <View style={s.fotosGrid}>
              {fotos.map((f, i) => (
                <View key={i} style={s.fotoWrapper}>
                  <Image source={{ uri: f.uri }} style={s.fotoPreview} resizeMode="cover" />
                  <TouchableOpacity style={s.fotoRemover} onPress={() => setFotos(p => p.filter((_, j) => j !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={22} color={CORES.erro} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </Secao>

        {/* ── 9. COMENTÁRIO ───────────────────────────────────────────────── */}
        <Secao titulo="Comentário" aberta={abertas.comentario} onToggle={() => toggle('comentario')}>
          <Campo label="Adicionar comentário">
            <InputTexto value={comentario} onChange={setComentario} placeholder="Escreva um comentário..." multiline />
          </Campo>
        </Secao>

        {/* ── BOTÃO SALVAR ─────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.salvarBtn, salvando && s.botaoDesabilitado]}
          onPress={salvar}
          disabled={salvando}
          activeOpacity={0.85}
        >
          {salvando ? <ActivityIndicator color="#FFF" /> : (
            <>
              <MaterialCommunityIcons name="content-save-outline" size={20} color="#FFF" />
              <Text style={s.salvarTexto}>{rdoId ? 'Atualizar RDO' : 'Criar RDO'}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── MODAL: Selecionar Atividade EAP ───────────────────────────────── */}
      <Modal visible={modalEap} animationType="slide" onRequestClose={() => setModalEap(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitulo}>Selecionar Atividade</Text>
            <TouchableOpacity onPress={() => setModalEap(false)}>
              <MaterialCommunityIcons name="close" size={24} color={CORES.texto} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.modalBusca}
            value={buscaEap}
            onChangeText={setBuscaEap}
            placeholder="Buscar atividade..."
            placeholderTextColor={CORES.desabilitado}
          />
          <FlatList
            data={eapDisponiveis}
            keyExtractor={e => String(e.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.modalItem} onPress={() => adicionarAtividade(item)}>
                <Text style={s.modalItemCodigo}>{item.codigo_eap}</Text>
                <Text style={s.modalItemTexto}>{item.nome || item.descricao}</Text>
                {item.unidade_medida && <Text style={s.modalItemSub}>{item.unidade_medida}</Text>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.modalVazio}>Nenhuma atividade disponível</Text>}
          />
        </View>
      </Modal>

      {/* ── MODAL: Selecionar Colaborador ─────────────────────────────────── */}
      <Modal visible={modalColab} animationType="slide" onRequestClose={() => setModalColab(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitulo}>Selecionar Colaborador</Text>
            <TouchableOpacity onPress={() => setModalColab(false)}>
              <MaterialCommunityIcons name="close" size={24} color={CORES.texto} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.modalBusca}
            value={buscaColab}
            onChangeText={setBuscaColab}
            placeholder="Buscar colaborador..."
            placeholderTextColor={CORES.desabilitado}
          />
          <FlatList
            data={colabDisponiveis}
            keyExtractor={(c, i) => `${c.nome}_${i}`}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.modalItem} onPress={() => adicionarMaoObra(item)}>
                <Text style={s.modalItemTexto}>{item.nome}</Text>
                {item.funcao && <Text style={s.modalItemSub}>{item.funcao}</Text>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.modalVazio}>Nenhum colaborador disponível</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 12, paddingBottom: 48 },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Seção
  secao: { backgroundColor: CORES.superficie, borderRadius: 10, marginBottom: 10, elevation: 1, overflow: 'hidden' },
  secaoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  secaoHeaderEsquerda: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secaoTitulo: { fontSize: 15, fontWeight: '700', color: CORES.texto },
  secaoCorpo: { paddingHorizontal: 14, paddingBottom: 14 },
  badge: { backgroundColor: CORES.primaria, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTexto: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  // Campo
  campo: { marginBottom: 12 },
  campoLabel: { fontSize: 11, fontWeight: '600', color: CORES.textoSecundario, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: CORES.borda, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: CORES.texto, backgroundColor: CORES.fundo },
  textarea: { minHeight: 80, paddingTop: 10 },

  // Chips
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: CORES.borda, backgroundColor: CORES.superficie },
  chipAtivo: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  chipTexto: { fontSize: 13, color: CORES.textoSecundario },
  chipTextoAtivo: { color: '#FFF', fontWeight: '600' },

  // Layout
  linhaGrid: { flexDirection: 'row', gap: 10 },
  infoTexto: { fontSize: 12, color: CORES.textoSecundario, marginBottom: 8, marginTop: -4 },
  kpiBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CORES.primariaMuitoClara, borderRadius: 8, padding: 10, marginTop: 4 },
  kpiTexto: { fontSize: 14, color: CORES.primaria, fontWeight: '600' },

  // Item card
  itemCard: { backgroundColor: CORES.fundo, borderRadius: 8, borderWidth: 1, borderColor: CORES.borda, padding: 12, marginBottom: 10 },
  itemCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  itemCardCodigo: { fontSize: 11, color: CORES.primaria, fontWeight: '700', textTransform: 'uppercase' },
  itemCardTitulo: { fontSize: 14, fontWeight: '600', color: CORES.texto, flex: 1 },

  // Clima
  climaSeparador: { borderTopWidth: 1, borderTopColor: CORES.borda, marginTop: 12, paddingTop: 12 },
  climaPeriodo: { fontSize: 13, fontWeight: '700', color: CORES.primaria, marginBottom: 8 },

  // Select expansível
  selectWrapper: { marginBottom: 2 },
  selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: CORES.borda, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: CORES.fundo },
  selectValor: { fontSize: 15, color: CORES.texto, flex: 1 },
  selectLista: { borderWidth: 1, borderColor: CORES.borda, borderRadius: 8, marginTop: 4, backgroundColor: CORES.superficie, overflow: 'hidden' },
  selectItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  selectItemAtivo: { backgroundColor: CORES.primariaMuitoClara },
  selectItemTexto: { fontSize: 14, color: CORES.texto },
  selectItemTextoAtivo: { color: CORES.primaria, fontWeight: '600' },

  // Layout extras
  botoesLinha: { flexDirection: 'row', gap: 8, marginTop: 4 },
  itemCardCorpo: { paddingTop: 10, borderTopWidth: 1, borderTopColor: CORES.borda, marginTop: 2 },

  // Adicionar
  btnAdicionar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: CORES.primaria, borderStyle: 'dashed', justifyContent: 'center', marginTop: 4 },
  btnAdicionarTexto: { fontSize: 14, color: CORES.primaria, fontWeight: '600' },

  // Fotos
  fotoAcoes: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  fotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: CORES.primaria, backgroundColor: CORES.primariaMuitoClara },
  fotoBtnTexto: { fontSize: 14, color: CORES.primaria, fontWeight: '600' },
  fotosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fotoWrapper: { position: 'relative' },
  fotoPreview: { width: 90, height: 90, borderRadius: 8, backgroundColor: CORES.borda },
  fotoRemover: { position: 'absolute', top: -6, right: -6, backgroundColor: '#FFF', borderRadius: 12 },

  // Salvar
  salvarBtn: { backgroundColor: CORES.primaria, borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: 8, elevation: 3 },
  salvarTexto: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  botaoDesabilitado: { opacity: 0.6 },

  // Modal
  modal: { flex: 1, backgroundColor: CORES.fundo },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: CORES.superficie, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  modalTitulo: { fontSize: 17, fontWeight: '700', color: CORES.texto },
  modalBusca: { margin: 12, borderWidth: 1, borderColor: CORES.borda, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: CORES.texto, backgroundColor: CORES.superficie },
  modalItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  modalItemCodigo: { fontSize: 11, color: CORES.primaria, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  modalItemTexto: { fontSize: 15, color: CORES.texto },
  modalItemSub: { fontSize: 12, color: CORES.textoSecundario, marginTop: 2 },
  modalVazio: { padding: 24, textAlign: 'center', color: CORES.textoSecundario },
});
