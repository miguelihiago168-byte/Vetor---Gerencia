# Guia de Implementação Frontend - Tarefas Pendentes

## Visão Geral
Este documento descreve as tarefas pendentes de frontend para completar a implementação de requisitos do sistema de Gestão de Obras.

---

## 1. Dashboard - Menus e Navegação

### 1.1 Adicionar Menu Lateral de Navegação

**Arquivo:** `frontend/src/pages/Dashboard.jsx`

```jsx
// Adicionar componente de menu lateral
const menuItems = [
  { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
  { label: 'Projetos', path: '/projetos', icon: 'FolderOpen' },
  { label: 'RDO', path: '/rdos', icon: 'FileText' },
  { label: 'EAP', path: '/eap', icon: 'Layers' },
  { label: 'RNC', path: '/rnc', icon: 'AlertTriangle' },
  { label: 'Usuários', path: '/usuarios', icon: 'Users' }
];
```

### 1.2 Seção de Informações de Atividades

**Adicionar ao Dashboard:**
- Card mostrando total de atividades (EAP)
- Filtro por status (Não iniciada, Em andamento, Concluída)
- Mini-gráfico de evolução por semana

```jsx
const ActivityCard = ({ totalAtividades, emProgresso, concluidas }) => (
  <div className="activity-card">
    <h3>Atividades da EAP</h3>
    <div className="stat-row">
      <span>Total: {totalAtividades}</span>
      <span>Em Progresso: {emProgresso}</span>
      <span>Concluídas: {concluidas}</span>
    </div>
  </div>
);
```

---

## 2. RDO - Funcionalidades Adicionais

### 2.1 Exportação em PDF

**Biblioteca sugerida:** `pdfkit` ou `react-pdf`

```bash
npm install pdfkit
```

**Implementação:**
```jsx
const exportarRDOPDF = async (rdoId) => {
  const rdo = await getRDO(rdoId);
  // Gerar PDF com dados do RDO
  // Incluir: data, atividades, clima, mão de obra, anexos
};
```

### 2.2 Remover Botão "Ver"

**Arquivo:** `frontend/src/pages/RDOs.jsx`

Buscar e remover:
```jsx
<button onClick={() => verRDO(rdo.id)}>Ver</button>
```

Manter apenas: Editar, Exportar PDF, Deletar (se aplicável)

---

## 3. Remover Campo "Equipe de Projeto"

### 3.1 Auditoria de Código

**Buscar por:**
```bash
grep -r "equipe" frontend/src/
grep -r "Equipe" frontend/src/
```

**Arquivos prováveis:**
- `frontend/src/pages/ProjetoDetalhes.jsx`
- `frontend/src/pages/Projetos.jsx`
- `frontend/src/pages/RDOForm.jsx`

### 3.2 Remover do Formulário

```jsx
// REMOVER:
<label>Equipe do Projeto</label>
<select>
  {/* opções de usuários */}
</select>

// Verificar se campo está na tabela do banco (se sim, migração necessária)
```

---

## 4. Gráfico de Curva S

### 4.1 Implementação

**Biblioteca sugerida:** `recharts` (já instalada)

```jsx
import { ComposedChart, Line, Area, XAxis, YAxis } from 'recharts';

const CurvaSChart = ({ data }) => (
  <ComposedChart width={600} height={300} data={data}>
    <XAxis dataKey="data" />
    <YAxis />
    <Area type="monotone" dataKey="previsto" fill="#8884d8" />
    <Line type="monotone" dataKey="executado" stroke="#82ca9d" />
  </ComposedChart>
);
```

**Dados esperados:**
```javascript
[
  { data: '2026-01-20', previsto: 5, executado: 3 },
  { data: '2026-01-21', previsto: 15, executado: 12 },
  // ... mais dados
]
```

### 4.2 Integração no Dashboard

```jsx
const [curvaSData, setCurvaSData] = useState([]);

useEffect(() => {
  // Buscar dados da EAP e formatar para Curva S
  const dados = calcularCurvaS(atividadesEap, rdos);
  setCurvaSData(dados);
}, [projetoId]);
```

---

## 5. Validações de RDO

### 5.1 Obrigatoriedade de Salvamento

**Arquivo:** `frontend/src/pages/RDOForm.jsx`

```jsx
// Impedir adição de ocorrências/comentários/materiais sem salvar
const [rdoSalvo, setRdoSalvo] = useState(false);

const handleAddOcorrencia = () => {
  if (!rdoSalvo && !rdoId) {
    setErro('Salve o RDO antes de adicionar ocorrências');
    return;
  }
  // ... adicionar ocorrência
};
```

### 5.2 Indicador de Pluviometria

**Melhorias visuais:**
- Mostrar escala visual (0-100mm)
- Ícone de chuva proporcionalmente ao valor
- Cor dinâmica (verde → amarelo → vermelho)

```jsx
const PluviometroWidget = ({ valor }) => {
  const corPluviometria = valor <= 10 ? 'green' : valor <= 50 ? 'yellow' : 'red';
  return (
    <div className={`pluviometro ${corPluviometria}`}>
      <div className="nivel" style={{ height: `${Math.min(valor, 100)}%` }}>
        {valor}mm
      </div>
    </div>
  );
};
```

---

## 6. Projetos - Funcionalidade de Arquivamento

### 6.1 Interface de Arquivo

**Arquivo:** `frontend/src/pages/Projetos.jsx`

```jsx
const handleArquivarProjeto = async (projetoId) => {
  try {
    await arquivarProjeto(projetoId);
    setSucesso('Projeto arquivado com sucesso');
    // Recarregar lista
  } catch (error) {
    setErro('Erro ao arquivar projeto');
  }
};

// Botão na interface
<button onClick={() => handleArquivarProjeto(projeto.id)}>
  Arquivar
</button>
```

### 6.2 Filtrar Projetos Arquivados

```jsx
const [mostrarArquivados, setMostrarArquivados] = useState(false);

const projetosFiltrados = projetos.filter(p => 
  mostrarArquivados ? p.arquivado : !p.arquivado
);
```

---

## 7. Usuários - Visualizar Deletados

### 7.1 Página de Usuários Deletados

**Arquivo:** `frontend/src/pages/UsuariosDeleted.jsx` (novo)

```jsx
import { getUsuariosDeletados } from '../services/api';

function UsuariosDeleted() {
  const [usuariosDeleted, setUsuariosDeleted] = useState([]);

  useEffect(() => {
    const carregar = async () => {
      const res = await getUsuariosDeletados();
      setUsuariosDeleted(res.data);
    };
    carregar();
  }, []);

  return (
    <div>
      <h2>Usuários Deletados (Soft Delete)</h2>
      <table>
        <thead>
          <tr>
            <th>Login</th>
            <th>Nome</th>
            <th>Deletado em</th>
            <th>Deletado por</th>
          </tr>
        </thead>
        <tbody>
          {usuariosDeleted.map(u => (
            <tr key={u.id}>
              <td>{u.login}</td>
              <td>{u.nome}</td>
              <td>{new Date(u.deletado_em).toLocaleString()}</td>
              <td>{u.deletado_por}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UsuariosDeleted;
```

### 7.2 Link de Acesso

Adicionar no menu lateral ou em Usuários:
```jsx
<Link to="/usuarios-deleted">Usuários Deletados</Link>
```

---

## 8. RNC - Restrições Visuais

### 8.1 Desabilitar Edição em RNC Encerrada

**Arquivo:** `frontend/src/pages/RNC.jsx`

```jsx
const podeEditar = rnc.status !== 'Encerrada';

<button disabled={!podeEditar}>Editar</button>
<button disabled={!podeEditar}>Deletar</button>

{!podeEditar && (
  <div className="alert alert-info">
    RNC encerrada - Apenas visualização permitida
  </div>
)}
```

### 8.2 Botões de Ação Limitados

```jsx
const acoesPorStatus = {
  'Aberta': ['Editar', 'Enviar Análise', 'Deletar'],
  'Em análise': ['Consultar', 'Alterar Status'],
  'Em andamento': ['Editar', 'Corrigir', 'Encerrar'],
  'Encerrada': ['Ver', 'PDF'] // Apenas visualização
};
```

---

## 9. Checklist de Implementação

- [ ] Menu lateral de navegação
- [ ] Seção de informações de atividades
- [ ] Exportação PDF de RDO
- [ ] Remover botão "Ver" de RDO
- [ ] Auditar e remover "Equipe de Projeto"
- [ ] Gráfico de Curva S no Dashboard
- [ ] Validação de salvamento de RDO
- [ ] Melhorar indicador de pluviometria
- [ ] Interface de arquivamento de projetos
- [ ] Página de usuários deletados
- [ ] Restrições visuais em RNC encerrada
- [ ] Testes de integração

---

## 10. Testes Sugeridos

```bash
# Testar new login UI
npm run dev
# Navegar para /login
# Verificar responsividade e visual

# Testar geração de ID RDO
# Criar novo RDO e verificar número_rdo

# Testar soft delete
# Excluir usuário e verificar em /usuarios/deletados/lista

# Testar RNC encerrada
# Encerrar RNC e tentar editar (deve falhar)

# Testar arquivamento de projeto
# Arquivar projeto e verificar listagem
```

---

**Próximas Ações:**
1. Priorizar implementações por impacto do usuário
2. Revisar designs antes de implementar
3. Testes em cada funcionalidade
4. Deploy em staging antes de produção
