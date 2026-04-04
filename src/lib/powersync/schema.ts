import { column, Schema, Table } from "@powersync/web";

// Tabelas globais (sincronizadas para todos os usuários)
const tb_grupos_treino = new Table({
  created_at: column.text,
  nome: column.text,
});

const tb_exercicios = new Table({
  created_at: column.text,
  emoji: column.text,
  grupo_muscular: column.text,
  nome: column.text,
  tipo: column.text,
});

const tb_semana_treinos = new Table({
  dia_semana: column.text,
  grupo_id: column.text,
});

const tb_grupos_exercicios = new Table({
  exercicio_id: column.text,
  grupo_id: column.text,
  ordem: column.integer,
});

const grupos_musculares = new Table({
  created_at: column.text,
  criado_por: column.text,
  nome: column.text,
});

// Tabelas do usuário (cada um recebe só os seus)
const tb_treino_series = new Table({
  user_id: column.text,
  exercicio_id: column.text,
  exercicio_usuario_id: column.text,
  data_treino: column.text,
  numero_serie: column.integer,
  peso: column.real,
  reps: column.integer,
  tempo_segundos: column.integer,
  distancia_km: column.real,
  pace_segundos_km: column.real,
  concluida: column.integer, // boolean as 0/1
  updated_at: column.text,
});

const tb_treino_concluido = new Table({
  user_id: column.text,
  data_treino: column.text,
  concluido: column.integer,
  created_at: column.text,
});

const tb_treino_dia_override = new Table({
  user_id: column.text,
  data_treino: column.text,
  grupo_id: column.text,
  grupo_usuario_id: column.text,
  created_at: column.text,
});

const treino_historico = new Table({
  user_id: column.text,
  nome_treino: column.text,
  iniciado_em: column.text,
  concluido_em: column.text,
  duracao_segundos: column.integer,
  exercicios_concluidos: column.text,
  created_at: column.text,
});

const physiq_profiles = new Table({
  admin_locked: column.integer,
  ajuste_calorico: column.integer,
  altura: column.real,
  created_at: column.text,
  data_nascimento: column.text,
  dobra_1: column.real,
  dobra_2: column.real,
  dobra_3: column.real,
  email: column.text,
  foto_url: column.text,
  idade: column.integer,
  macro_gordura_percentual: column.real,
  macro_proteina_multiplicador: column.real,
  massa_gorda: column.real,
  massa_magra: column.real,
  nivel_atividade: column.real,
  nome: column.text,
  percentual_gordura: column.real,
  peso: column.real,
  plano_expiracao: column.text,
  plano_nome: column.text,
  sexo: column.text,
  status: column.text,
  tempo_descanso_segundos: column.integer,
  tmb_katch: column.real,
  tmb_metodo: column.text,
  tmb_mifflin: column.real,
  user_code: column.integer,
});

const exercicio_ordem_usuario = new Table({
  user_id: column.text,
  exercicio_id: column.text,
  grupo_id: column.text,
  posicao: column.integer,
  updated_at: column.text,
});

const tb_grupos_treino_usuario = new Table({
  user_id: column.text,
  nome: column.text,
  created_at: column.text,
});

const tb_exercicios_usuario = new Table({
  user_id: column.text,
  nome: column.text,
  emoji: column.text,
  grupo_muscular: column.text,
  tipo: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const tb_grupos_exercicios_usuario = new Table({
  user_id: column.text,
  exercicio_id: column.text,
  exercicio_usuario_id: column.text,
  grupo_usuario_id: column.text,
  ordem: column.integer,
});

const tb_exercicio_comentarios = new Table({
  user_id: column.text,
  exercicio_id: column.text,
  exercicio_usuario_id: column.text,
  comentario: column.text,
  created_at: column.text,
  updated_at: column.text,
});

export const AppSchema = new Schema({
  tb_grupos_treino,
  tb_exercicios,
  tb_semana_treinos,
  tb_grupos_exercicios,
  grupos_musculares,
  tb_treino_series,
  tb_treino_concluido,
  tb_treino_dia_override,
  treino_historico,
  physiq_profiles,
  exercicio_ordem_usuario,
  tb_grupos_treino_usuario,
  tb_exercicios_usuario,
  tb_grupos_exercicios_usuario,
  tb_exercicio_comentarios,
});
