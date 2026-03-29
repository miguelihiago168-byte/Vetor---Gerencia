import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CORES } from '../utils/constants';
import OfflineBanner from '../components/OfflineBanner';
import ProjetosScreen from '../screens/projetos/ProjetosScreen';
import ProjetoDetalhesScreen from '../screens/projetos/ProjetoDetalhesScreen';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import RDOsScreen from '../screens/rdo/RDOsScreen';
import RDODetalhesScreen from '../screens/rdo/RDODetalhesScreen';
import RDOFormScreen from '../screens/rdo/RDOFormScreen';
import RNCsScreen from '../screens/rnc/RNCsScreen';
import RNCDetalhesScreen from '../screens/rnc/RNCDetalhesScreen';
import RNCFormScreen from '../screens/rnc/RNCFormScreen';
import ComprasScreen from '../screens/compras/ComprasScreen';
import ComprasDetalheScreen from '../screens/compras/ComprasDetalheScreen';
import AlmoxDashboardScreen from '../screens/almoxarifado/AlmoxDashboardScreen';
import AlmoxRetiradaScreen from '../screens/almoxarifado/AlmoxRetiradaScreen';
import AlmoxDevolucaoScreen from '../screens/almoxarifado/AlmoxDevolucaoScreen';
import NotificacoesScreen from '../screens/notificacoes/NotificacoesScreen';
import TabNavigator from './TabNavigator';

export type AppStackParamList = {
  Tabs: undefined;
  ProjetoDetalhes: { projetoId: number; projetoNome: string };
  Dashboard: { projetoId: number; projetoNome: string };
  RDOs: { projetoId: number; projetoNome: string };
  RDODetalhes: { rdoId: number; projetoId: number };
  RDOForm: { projetoId: number; rdoId?: number };
  RNCs: { projetoId: number; projetoNome: string };
  RNCDetalhes: { rncId: number; projetoId: number };
  RNCForm: { projetoId: number; rncId?: number };
  Compras: { projetoId: number; projetoNome: string };
  ComprasDetalhe: { requisicaoId: number; projetoId: number };
  AlmoxDashboard: { projetoId: number; projetoNome: string };
  AlmoxRetirada: { projetoId: number };
  AlmoxDevolucao: { projetoId: number };
  Notificacoes: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppNavigator() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: CORES.primaria },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: 'bold' },
          animation: 'slide_from_right',
        }}
      >
      <Stack.Screen
        name="Tabs"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProjetoDetalhes"
        component={ProjetoDetalhesScreen}
        options={({ route }) => ({ title: route.params.projetoNome })}
      />
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Stack.Screen
        name="RDOs"
        component={RDOsScreen}
        options={{ title: 'RDOs' }}
      />
      <Stack.Screen
        name="RDODetalhes"
        component={RDODetalhesScreen}
        options={{ title: 'RDO' }}
      />
      <Stack.Screen
        name="RDOForm"
        component={RDOFormScreen}
        options={({ route }) => ({
          title: route.params.rdoId ? 'Editar RDO' : 'Novo RDO',
        })}
      />
      <Stack.Screen
        name="RNCs"
        component={RNCsScreen}
        options={{ title: 'RNCs' }}
      />
      <Stack.Screen
        name="RNCDetalhes"
        component={RNCDetalhesScreen}
        options={{ title: 'Detalhes da RNC' }}
      />
      <Stack.Screen
        name="RNCForm"
        component={RNCFormScreen}
        options={({ route }) => ({
          title: route.params.rncId ? 'Editar RNC' : 'Nova RNC',
        })}
      />
      <Stack.Screen
        name="Compras"
        component={ComprasScreen}
        options={{ title: 'Compras' }}
      />
      <Stack.Screen
        name="ComprasDetalhe"
        component={ComprasDetalheScreen}
        options={{ title: 'Requisição' }}
      />
      <Stack.Screen
        name="AlmoxDashboard"
        component={AlmoxDashboardScreen}
        options={{ title: 'Almoxarifado' }}
      />
      <Stack.Screen
        name="AlmoxRetirada"
        component={AlmoxRetiradaScreen}
        options={{ title: 'Registrar Retirada' }}
      />
      <Stack.Screen
        name="AlmoxDevolucao"
        component={AlmoxDevolucaoScreen}
        options={{ title: 'Registrar Devolução' }}
      />
      <Stack.Screen
        name="Notificacoes"
        component={NotificacoesScreen}
        options={{ title: 'Notificações' }}
      />
    </Stack.Navigator>
    </View>
  );
}
