/**
 * Perfil do aluno no painel (W14 — tela 7, spec 4.5): o que a função aluno_perfil do banco principal devolve (a matrícula da
 * rota — id dela ou do Treino —, entre as que quem chama vê). Os mesmos campos do "Perfil do paciente" do site antigo do Nutri
 * (dados, link, acesso, 4 ajustes, resumo) + o que o Calc mostrava no grupo Dados/Perfil.
 */
export type ModuloAluno = "treino" | "nutricao";
export type Genero = "masculino" | "feminino" | "outro";

/** Os 4 ajustes (pacientes.config), com o valor que VALE (o mesmo que a tela mostra). */
export interface AjustesAluno {
  acesso_app: boolean;
  mensagens_automaticas: boolean;
  diario_alimentar: boolean;
  acesso_link: boolean;
}
export type ChaveAjuste = keyof AjustesAluno;

export interface PessoaRef {
  id: string;
  nome: string | null;
}

export interface PerfilAluno {
  ok: true;
  paciente_id: string;
  treino_user_id: string | null;
  rota_id: string;
  conta_id: string | null;
  conta_nome: string | null;
  conta_origem: string | null;
  conta_modulos: ModuloAluno[];
  nome: string;
  apelido: string | null;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  /** yyyy-mm-dd */
  nascimento: string | null;
  genero: Genero | string | null;
  objetivo: string | null;
  objetivo_app: string | null;
  tags: string[];
  foto_url: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
  ativo: boolean;
  bloqueado: boolean;
  bloqueado_em: string | null;
  bloqueio_msg: string | null;
  conta_excluida: boolean;
  origem: string | null;
  tem_login: boolean;
  modulos: ModuloAluno[];
  personal: PessoaRef | null;
  nutricionista: PessoaRef | null;
  ajustes: AjustesAluno;
  link_codigo: string;
  /** resumo privado (o aluno não vê) */
  resumo: string | null;
  ultima_antropometria: { data: string; peso: number | string | null; altura: number | string | null } | null;
  eu: { id: string; dono: boolean; personal: boolean; nutricionista: boolean; master: boolean };
  pode_editar: boolean;
  agora: string;
}

/** O que vem do Banco do Treino para quem tem treino (admin-get-user): altura, peso e o cadastro de lá. */
export interface PerfilTreinoAluno {
  nome: string | null;
  email: string | null;
  sexo: string | null;
  idade: number | null;
  data_nascimento: string | null;
  peso: number | null;
  altura: number | null;
  foto_url: string | null;
  created_at: string | null;
  [chave: string]: unknown;
}

/** O formulário "Editar dados" (strings do jeito que a pessoa digita; o servidor limpa e confere). */
export interface FormDadosAluno {
  nome: string;
  apelido: string;
  nascimento: string;
  genero: "" | Genero;
  cpf: string;
  telefone: string;
  email: string;
  objetivo: string;
  /** só para quem tem treino (gravam no Banco do Treino) */
  altura: string;
  peso: string;
}

export interface AlunoComMensagemDesligada {
  id: string;
  rota_id: string;
  nome: string;
  telefone: string | null;
}

export interface MensagensDesligadas {
  mostrar: boolean;
  whatsapp: boolean;
  visto: unknown;
  total: number;
  alunos: AlunoComMensagemDesligada[];
}
