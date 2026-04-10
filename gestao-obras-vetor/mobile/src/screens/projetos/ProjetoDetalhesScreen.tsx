import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { CORES } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';

type Route = RouteProp<AppStackParamList, 'ProjetoDetalhes'>;
type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Modulo {
  key: keyof AppStackParamList;
  label: string;
  descricao: string;
  icon: string;
  cor: string;
  adminOnly?: boolean;
}

const MODULOS: Modulo[] = [
  {
    key: 'Dashboard',
    label: 'Dashboard',
    descricao: 'Avanço físico e estatísticas',
    icon: 'chart-line',
    cor: '#1565C0',
  },
  {
    key: 'RDOs',
    label: 'RDO',
    descricao: 'Relatórios Diários de Obra',
    icon: 'clipboard-text-outline',
    cor: '#2E7D32',
  },
  {
    key: 'RNCs',
    label: 'RNC',
    descricao: 'Relatórios de Não Conformidade',
    icon: 'alert-circle-outline',
    cor: '#C62828',
  },
  {
    key: 'Compras',
    label: 'Compras',
    descricao: 'Requisições e cotações',
    icon: 'cart-outline',
    cor: '#6A1B9A',
  },
  {
    key: 'Planejamento',
    label: 'Planejamento',
    descricao: 'Curva S e cronograma',
    icon: 'timeline-text-outline',
    cor: '#00897B',
  },
  {
    key: 'AlmoxDashboard',
    label: 'Almoxarifado',
    descricao: 'Ferramentas e retiradas',
    icon: 'toolbox-outline',
    cor: '#E65100',
  },
];

export default function ProjetoDetalhesScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { projetoId, projetoNome } = route.params;
  const { perfil } = useAuth();

  const navegar = (key: keyof AppStackParamList) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigation.navigate as any)(key, { projetoId, projetoNome });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Banner do projeto */}
      <View style={styles.banner}>
        <MaterialCommunityIcons
          name="office-building-outline"
          size={40}
          color="#FFF"
        />
        <Text style={styles.bannerNome} numberOfLines={2}>
          {projetoNome}
        </Text>
        <Text style={styles.bannerSub}>Selecione um módulo</Text>
      </View>

      {/* Grade de módulos */}
      <View style={styles.grade}>
        {MODULOS.map((mod) => (
          <TouchableOpacity
            key={mod.key}
            style={[styles.modulo, { borderLeftColor: mod.cor }]}
            onPress={() => navegar(mod.key)}
            activeOpacity={0.85}
          >
            <View style={[styles.moduloIcon, { backgroundColor: mod.cor + '18' }]}>
              <MaterialCommunityIcons
                name={mod.icon as never}
                size={28}
                color={mod.cor}
              />
            </View>
            <View style={styles.moduloInfo}>
              <Text style={styles.moduloLabel}>{mod.label}</Text>
              <Text style={styles.moduloDesc}>{mod.descricao}</Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={CORES.desabilitado}
            />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { paddingBottom: 32 },
  banner: {
    backgroundColor: CORES.primaria,
    padding: 24,
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 32,
  },
  bannerNome: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  bannerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  grade: { padding: 16, gap: 12 },
  modulo: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  moduloIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  moduloInfo: { flex: 1, marginRight: 8 },
  moduloLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: 3,
  },
  moduloDesc: {
    fontSize: 12,
    color: CORES.textoSecundario,
  },
});
