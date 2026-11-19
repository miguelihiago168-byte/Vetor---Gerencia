require('dotenv').config({path:require('node:path').join(__dirname,'../.env')});
const assert = require('node:assert/strict');
const { pool } = require('../config/database');
const { cadastrarPessoasDoRdo } = require('../services/rdoHseService');

async function main() {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE usuarios (id BIGINT,nome TEXT) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE usuario_tenants (usuario_id BIGINT,tenant_id BIGINT,ativo INTEGER) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE mao_obra_direta (id BIGSERIAL,tenant_id BIGINT,identificador TEXT,projeto_id BIGINT,nome TEXT,funcao TEXT,ativo INTEGER,criado_por BIGINT) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE hse_classificacoes (tenant_id BIGINT,origem TEXT,pessoa_id BIGINT,funcao TEXT,tipo TEXT,atualizado_por BIGINT) ON COMMIT DROP');
    await client.query("INSERT INTO usuarios VALUES (1,'Pessoa existente')");
    await client.query('INSERT INTO usuario_tenants VALUES (1,7,1)');
    const args={tenantId:7,usuarioId:9,pessoas:[{nome:'Pessoa existente',funcao:'Fiscal',tipo:'Indireta'},{nome:'Nova pessoa',funcao:'Administrativo',classificacao:'Indireta'}]};
    await cadastrarPessoasDoRdo(client,args);
    await cadastrarPessoasDoRdo(client,args);
    const result=await client.query('SELECT m.nome,m.projeto_id,h.funcao,h.tipo FROM mao_obra_direta m JOIN hse_classificacoes h ON h.pessoa_id=m.id');
    assert.deepEqual(result.rows,[{nome:'Nova pessoa',projeto_id:null,funcao:'Administrativo',tipo:'Indireta'}]);
    console.log('RDO e HSE: SQL PostgreSQL e repetição validados em tabelas temporárias.');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
