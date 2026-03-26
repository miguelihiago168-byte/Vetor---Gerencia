import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { getFerramentas, getColaboradoresRetirada, registrarRetiradaFerramenta } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { CORES } from '../../utils/constants';

type Route = RouteProp<AppStackParamList, 'AlmoxRetirada'>;

interface Ferramenta {
  id: number;
  nome: string;
  codigo?: string;
  quantidade_disponivel?: number;
}

interface Colaborador {
  id: string;          // ex: "USR-123" ou "MOD-456"
  usuario_id?: number | null;
  nome: string;
  funcao?: string | null;
  tipo?: string;
}

export default function AlmoxRetiradaScreen() {
  const route = useRoute<Route>();
  const { projetoId } = route.params;
  const { success, error } = useNotification();

  const [ferramentas, setFerramentas] = useState<Ferramenta[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const [ferramentaSelecionada, setFerramentaSelecionada] = useState<Ferramenta | null>(null);
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState<Colaborador | null>(null);
  const [quantidade, setQuantidade] = useState('1');
  const [observacoes, setObservacoes] = useState('');

  // Previsão de devolução: padrão 7 dias a partir de hoje
  const defaultPrevisao = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  })();
  const [previsaoDevolucao, setPrevisaoDevolucao] = useState(defaultPrevisao);

  const [buscaFerramenta, setBuscaFerramenta] = useState('');
  const [buscaColaborador, setBuscaColaborador] = useState('');
  const [mostrarFerramentas, setMostrarFerramentas] = useState(false);
  const [mostrarColaboradores, setMostrarColaboradores] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [fResp, cResp] = await Promise.all([
        getFerramentas({ projeto_id: projetoId }),
        getColaboradoresRetirada(projetoId),
      ]);
      setFerramentas(fResp.data ?? []);
      setColaboradores(cResp.data ?? []);
    } catch {
      error('Erro ao carregar dados.');
    } finally {
      setCarregando(false);
    }
  }, [projetoId, error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const confirmar = () => {
    if (!ferramentaSelecionada) return Alert.alert('Atenção', 'Selecione uma ferramenta.');
    if (!colaboradorSelecionado) return Alert.alert('Atenção', 'Selecione um colaborador.');
    if (!quantidade || Number(quantidade) <= 0) return Alert.alert('Atenção', 'Informe a quantidade.');

    // Monta payload correto: USR-xxx → colaborador_id (número), MOD-xxx → colaborador_nome
    const isUsuario = colaboradorSelecionado.id.startsWith('USR-');
    const colaboradorPayload = isUsuario
      ? { colaborador_id: colaboradorSelecionado.usuario_id ?? Number(colaboradorSelecionado.id.replace('USR-', '')) }
      : { colaborador_nome: colaboradorSelecionado.nome };

    Alert.alert(
      'Confirmar retirada',
      `Registrar retirada de ${quantidade}x ${ferramentaSelecionada.nome} para ${colaboradorSelecionado.nome}?\nPrevisão de devolução: ${previsaoDevolucao}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setEnviando(true);
            try {
              await registrarRetiradaFerramenta({
                projeto_id: projetoId,
                ferramenta_id: ferramentaSelecionada.id,
                ...colaboradorPayload,
                quantidade: Number(quantidade),
                previsao_devolucao: previsaoDevolucao,
                observacao: observacoes,
              });
              success('Retirada registrada!');
              setFerramentaSelecionada(null);
              setColaboradorSelecionado(null);
              setQuantidade('1');
              setObservacoes('');
              setBuscaFerramenta('');
              setBuscaColaborador('');
            } catch {
              error('Erro ao registrar retirada.');
            } finally {
              setEnviando(false);
            }
          },
        },
      ]
    );
  };

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  const ferramentasFiltradas = ferramentas.filter((f) =>
    f.nome.toLowerCase().includes(buscaFerramenta.toLowerCase())
  );
  const colaboradoresFiltrados = colaboradores.filter((c) =>
    c.nome.toLowerCase().includes(buscaColaborador.toLowerCase())
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Ferramenta */}
      <Text style={styles.label}>Ferramenta *</Text>
      <TouchableOpacity
        style={styles.seletor}
        onPress={() => {
          setMostrarFerramentas(!mostrarFerramentas);
          setMostrarColaboradores(false);
        }}
      >
        <Text style={ferramentaSelecionada ? styles.seletorTexto : styles.seletorPlaceholder}>
          {ferramentaSelecionada ? ferramentaSelecionada.nome : 'Selecionar ferramenta...'}
        </Text>
        <MaterialCommunityIcons name={mostrarFerramentas ? 'chevron-up' : 'chevron-down'} size={20} color={CORES.textoSecundario} />
      </TouchableOpacity>
      {mostrarFerramentas && (
        <View style={styles.dropdown}>
          <TextInput
            style={styles.buscaInput}
            placeholder="Buscar ferramenta..."
            value={buscaFerramenta}
            onChangeText={setBuscaFerramenta}
            placeholderTextColor={CORES.textoSecundario}
            autoFocus
          />
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
            {ferramentasFiltradas.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={styles.dropdownItem}
                onPress={() => {
                  setFerramentaSelecionada(f);
                  setMostrarFerramentas(false);
                  setBuscaFerramenta('');
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.dropdownItemTexto}>{f.nome}</Text>
                  {f.quantidade_disponivel != null && (
                    <Text style={styles.dropdownItemSub}>Disp: {f.quantidade_disponivel}</Text>
                  )}
                </View>
                {f.codigo ? <Text style={styles.dropdownItemSub}>{f.codigo}</Text> : null}
              </TouchableOpacity>
            ))}
            {ferramentasFiltradas.length === 0 && (
              <Text style={styles.vazio}>Nenhuma ferramenta encontrada.</Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* Colaborador */}
      <Text style={[styles.label, { marginTop: 16 }]}>Colaborador *</Text>
      <TouchableOpacity
        style={styles.seletor}
        onPress={() => {
          setMostrarColaboradores(!mostrarColaboradores);
          setMostrarFerramentas(false);
        }}
      >
        <Text style={colaboradorSelecionado ? styles.seletorTexto : styles.seletorPlaceholder}>
          {colaboradorSelecionado ? colaboradorSelecionado.nome : 'Selecionar colaborador...'}
        </Text>
        <MaterialCommunityIcons name={mostrarColaboradores ? 'chevron-up' : 'chevron-down'} size={20} color={CORES.textoSecundario} />
      </TouchableOpacity>
      {mostrarColaboradores && (
        <View style={styles.dropdown}>
          <TextInput
            style={styles.buscaInput}
            placeholder="Buscar colaborador..."
            value={buscaColaborador}
            onChangeText={setBuscaColaborador}
            placeholderTextColor={CORES.textoSecundario}
            autoFocus
          />
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
            {colaboradoresFiltrados.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.dropdownItem}
                onPress={() => {
                  setColaboradorSelecionado(c);
                  setMostrarColaboradores(false);
                  setBuscaColaborador('');
                }}
              >
                <Text style={styles.dropdownItemTexto}>{c.nome}</Text>
                {c.funcao ? <Text style={styles.dropdownItemSub}>{c.funcao}</Text> : null}
              </TouchableOpacity>
            ))}
            {colaboradoresFiltrados.length === 0 && (
              <Text style={styles.vazio}>Nenhum colaborador encontrado.</Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* Previsão de devolução */}
      <Text style={[styles.label, { marginTop: 16 }]}>Previsão de devolução *</Text>
      <TextInput
        style={styles.input}
        value={previsaoDevolucao}
        onChangeText={setPrevisaoDevolucao}
        placeholder="AAAA-MM-DD"
        placeholderTextColor={CORES.textoSecundario}
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
      />

      {/* Quantidade */}
      <Text style={[styles.label, { marginTop: 16 }]}>Quantidade *</Text>
      <TextInput
        style={styles.input}
        value={quantidade}
        onChangeText={setQuantidade}
        keyboardType="numeric"
        placeholderTextColor={CORES.textoSecundario}
      />

      {/* Observações */}
      <Text style={[styles.label, { marginTop: 16 }]}>Observações</Text>
      <TextInput
        style={[styles.input, styles.area]}
        value={observacoes}
        onChangeText={setObservacoes}
        placeholder="Observações da retirada..."
        multiline
        numberOfLines={3}
        placeholderTextColor={CORES.textoSecundario}
      />

      {/* Botão confirmar */}
      <TouchableOpacity
        style={[styles.botao, enviando && styles.botaoDesabilitado]}
        onPress={confirmar}
        disabled={enviando}
        activeOpacity={0.8}
      >
        {enviando ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.botaoTexto}>Registrar Retirada</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, paddingBottom: 60 },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: CORES.textoSecundario, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  seletor: {
    backgroundColor: CORES.superficie,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CORES.borda,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seletorTexto: { fontSize: 15, color: CORES.texto },
  seletorPlaceholder: { fontSize: 15, color: CORES.textoSecundario },
  dropdown: {
    backgroundColor: CORES.superficie,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CORES.borda,
    marginTop: 4,
    elevation: 4,
    maxHeight: 280,
  },
  buscaInput: {
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: CORES.texto,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CORES.fundo,
  },
  dropdownItemTexto: { fontSize: 15, color: CORES.texto },
  dropdownItemSub: { fontSize: 12, color: CORES.textoSecundario },
  vazio: { padding: 14, color: CORES.textoSecundario, textAlign: 'center' },
  input: {
    backgroundColor: CORES.superficie,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CORES.borda,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: CORES.texto,
  },
  area: { minHeight: 80, textAlignVertical: 'top' },
  botao: {
    backgroundColor: CORES.primaria,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  botaoDesabilitado: { opacity: 0.7 },
  botaoTexto: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
