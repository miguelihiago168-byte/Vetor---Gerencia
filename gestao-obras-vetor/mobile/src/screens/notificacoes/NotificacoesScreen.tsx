import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getNotificacoes, marcarNotificacaoLida } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { CORES } from '../../utils/constants';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Notificacao {
  id: number;
  titulo: string;
  mensagem?: string;
  tipo?: string;
  lida: boolean | number;
  created_at: string;
}

const TIPO_ICONE: Record<string, { icone: string; cor: string }> = {
  rdo: { icone: 'file-document-outline', cor: CORES.primaria },
  rnc: { icone: 'alert-circle-outline', cor: CORES.erro },
  compra: { icone: 'cart-outline', cor: CORES.aviso },
  almox: { icone: 'toolbox-outline', cor: CORES.sucesso },
  geral: { icone: 'bell-outline', cor: CORES.textoSecundario },
};

export default function NotificacoesScreen() {
  const { error } = useNotification();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resp = await getNotificacoes();
      setNotificacoes(resp.data ?? []);
    } catch {
      error('Erro ao carregar notificações.');
    } finally {
      setCarregando(false);
      setRefresh(false);
    }
  }, [error]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const marcarLida = async (notif: Notificacao) => {
    if (notif.lida) return;
    try {
      await marcarNotificacaoLida(notif.id);
      setNotificacoes((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, lida: true } : n))
      );
    } catch {
      // silent fail
    }
  };

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={notificacoes}
      keyExtractor={(item) => String(item.id)}
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
          <MaterialCommunityIcons name="bell-sleep-outline" size={52} color={CORES.textoSecundario} />
          <Text style={styles.vazioTexto}>Nenhuma notificação.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const tipoKey = item.tipo ?? 'geral';
        const { icone, cor } = TIPO_ICONE[tipoKey] ?? TIPO_ICONE.geral;
        const lida = Boolean(item.lida);

        const tempo = (() => {
          try {
            return formatDistanceToNow(parseISO(item.created_at), {
              addSuffix: true,
              locale: ptBR,
            });
          } catch {
            return '';
          }
        })();

        return (
          <TouchableOpacity
            style={[styles.card, !lida && styles.cardNaoLida]}
            onPress={() => marcarLida(item)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconeCont, { backgroundColor: `${cor}22` }]}>
              <MaterialCommunityIcons name={icone as any} size={22} color={cor} />
            </View>
            <View style={styles.corpo}>
              <View style={styles.topoRow}>
                <Text style={[styles.titulo, !lida && styles.tituloBold]} numberOfLines={1}>
                  {item.titulo}
                </Text>
                {!lida && <View style={styles.ponto} />}
              </View>
              {item.mensagem ? (
                <Text style={styles.mensagem} numberOfLines={2}>
                  {item.mensagem}
                </Text>
              ) : null}
              <Text style={styles.tempo}>{tempo}</Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  content: { padding: 16, gap: 0, paddingBottom: 40 },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  vazio: { alignItems: 'center', paddingTop: 80, gap: 12 },
  vazioTexto: { fontSize: 15, color: CORES.textoSecundario },
  card: {
    backgroundColor: CORES.superficie,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    elevation: 1,
  },
  cardNaoLida: {
    backgroundColor: CORES.primariaMuitoClara,
    elevation: 2,
  },
  iconeCont: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  corpo: { flex: 1, gap: 3 },
  topoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titulo: { flex: 1, fontSize: 14, color: CORES.texto },
  tituloBold: { fontWeight: '700' },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CORES.primaria,
  },
  mensagem: { fontSize: 13, color: CORES.textoSecundario, lineHeight: 18 },
  tempo: { fontSize: 11, color: CORES.textoSecundario, marginTop: 2 },
});
