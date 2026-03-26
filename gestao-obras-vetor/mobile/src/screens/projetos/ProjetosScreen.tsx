import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getProjetos } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { CORES } from '../../utils/constants';
import { AppStackParamList } from '../../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Projeto {
  id: number;
  nome: string;
  cidade?: string;
  status?: string;
  prazo?: string;
  empresa_contratante?: string;
}

export default function ProjetosScreen() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const navigation = useNavigation<Nav>();
  const { usuario, logout } = useAuth();
  const { error } = useNotification();

  const carregar = useCallback(async () => {
    try {
      const resp = await getProjetos();
      setProjetos(resp.data || []);
    } catch {
      error('Erro ao carregar projetos.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const renderItem = ({ item }: { item: Projeto }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        navigation.navigate('ProjetoDetalhes', {
          projetoId: item.id,
          projetoNome: item.nome,
        })
      }
      activeOpacity={0.85}
    >
      <View style={styles.cardIcon}>
        <MaterialCommunityIcons
          name="office-building-outline"
          size={28}
          color={CORES.primaria}
        />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardNome} numberOfLines={2}>
          {item.nome}
        </Text>
        {item.cidade ? (
          <Text style={styles.cardSub}>
            <MaterialCommunityIcons
              name="map-marker-outline"
              size={12}
              color={CORES.textoSecundario}
            />{' '}
            {item.cidade}
          </Text>
        ) : null}
        {item.empresa_contratante ? (
          <Text style={styles.cardSub} numberOfLines={1}>
            {item.empresa_contratante}
          </Text>
        ) : null}
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={22}
        color={CORES.desabilitado}
      />
    </TouchableOpacity>
  );

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header com logout */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerSub}>Olá, {usuario?.nome?.split(' ')[0]}</Text>
          <Text style={styles.headerTitulo}>Meus Projetos</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <MaterialCommunityIcons name="logout" size={22} color={CORES.primaria} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={projetos}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.lista}
        refreshControl={
          <RefreshControl
            refreshing={refresh}
            onRefresh={() => {
              setRefresh(true);
              carregar();
            }}
            colors={[CORES.primaria]}
          />
        }
        ListEmptyComponent={
          <View style={styles.vazio}>
            <MaterialCommunityIcons
              name="briefcase-search-outline"
              size={56}
              color={CORES.desabilitado}
            />
            <Text style={styles.vazioTexto}>Nenhum projeto encontrado</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CORES.superficie,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
    elevation: 2,
  },
  headerTitulo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: CORES.texto,
  },
  headerSub: {
    fontSize: 13,
    color: CORES.textoSecundario,
  },
  logoutBtn: {
    padding: 8,
  },
  lista: { padding: 16, gap: 12 },
  card: {
    backgroundColor: CORES.superficie,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CORES.primariaMuitoClara,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardInfo: { flex: 1, marginRight: 8 },
  cardNome: {
    fontSize: 15,
    fontWeight: '600',
    color: CORES.texto,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 12,
    color: CORES.textoSecundario,
    marginTop: 2,
  },
  vazio: { alignItems: 'center', marginTop: 80 },
  vazioTexto: {
    color: CORES.textoSecundario,
    fontSize: 15,
    marginTop: 12,
  },
});
