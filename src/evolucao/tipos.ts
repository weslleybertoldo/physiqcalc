/**
 * Evolução do aluno (W10 — spec 4.3 Evolução, tela 4): a SÉRIE ÚNICA de avaliações e fotos dos 2 bancos, com o autor e em
 * ordem de data. Nada é copiado de um banco para o outro: o app lê as do Banco do Treino (`physiq_avaliacoes`,
 * `physiq_registros_fotos` e o perfil do aluno, `physiq_profiles`) e as do banco principal (`antropometrias`,
 * `fotos_evolucao`, pela função `minha_evolucao()`) e soma aqui. Módulo reusável: a aba Evolução (W10), o card do peso do
 * Início (W12) e o Perfil do aluno › Avaliação no painel (W17) usam os mesmos tipos e regras (`serie.ts`) — cada um com a
 * sua forma de buscar (`fontes.ts` é a do próprio aluno).
 */
import type { MedidaKey } from "@/lib/medidas";

export type Origem = "treino" | "principal";
export type PapelAutor = "personal" | "nutricionista";

/** Quem fez a avaliação ou subiu a foto. No Treino não há o autor na linha: é o personal do aluno (a regra do Calc). */
export interface Autor {
  id: string | null;
  nome: string | null;
  papel: PapelAutor;
}

/** Tipo da avaliação: os 3 do Calc, os protocolos da antropometria do Nutri e os registros sem composição. */
export type MetodoAvaliacao =
  | "dobras_3"
  | "dobras_7"
  | "bioimpedancia"
  | "pollock3"
  | "pollock7"
  | "faulkner"
  | "guedes"
  | "medidas"
  | "fisica";

/** As 13 medidas do Calc + o abdômen (a antropometria do Nutri mede; o Calc guarda a coluna). */
export type ChaveMedida = MedidaKey | "medida_abdomen";

export interface TmbAvaliacao {
  metodo: string;
  rotulo: string;
  valor: number;
}

export interface DobraAvaliacao {
  rotulo: string;
  valor: number;
}

/** Uma avaliação da série (as 2 origens no mesmo formato). */
export interface Avaliacao {
  /** `treino:<id>` ou `principal:<id>` (único na série) */
  id: string;
  idOriginal: string;
  origem: Origem;
  /** yyyy-mm-dd */
  data: string;
  criadoEm: string | null;
  metodo: MetodoAvaliacao;
  /** "Avaliação por 7 dobras", "Avaliação por bioimpedância", "Antropometria"… */
  titulo: string;
  /** "7 dobras", "Bioimpedância", "Jackson & Pollock — 3 dobras"… (o "Tipo de avaliação" da tela antiga) */
  tipo: string;
  autor: Autor;
  sexo: "M" | "F" | null;
  idade: number | null;
  peso: number | null;
  /** cm */
  altura: number | null;
  /** % de gordura */
  gordura: number | null;
  massaGorda: number | null;
  massaMagra: number | null;
  massaMuscular: number | null;
  agua: number | null;
  visceral: number | null;
  imc: number | null;
  classificacaoImc: string | null;
  tmb: TmbAvaliacao | null;
  dobras: DobraAvaliacao[];
  medidas: Partial<Record<ChaveMedida, number>>;
  observacao: string | null;
  /** A última do Treino com os números ATUAIS do perfil do aluno (o que a tela antiga mostrava em "Composição Corporal"). */
  atual?: boolean;
}

export type Posicao = "frente" | "lado_d" | "lado_e" | "costas";

export interface Foto {
  id: string;
  origem: Origem;
  /** yyyy-mm-dd (no Treino, o 1º dia do mês das fotos mensais) */
  data: string;
  /** fotos mensais do Calc (o mês vale, não o dia) */
  mensal: boolean;
  posicao: Posicao;
  caminho: string;
  /** URL assinada (bucket privado) — null quando não deu para assinar ou está sem internet */
  url: string | null;
  autor: Autor;
  criadoEm: string | null;
}

/** As fotos de uma data de uma origem (1 card com até 4 posições). */
export interface SessaoFotos {
  chave: string;
  origem: Origem;
  data: string;
  mensal: boolean;
  autor: Autor;
  fotos: Partial<Record<Posicao, Foto>>;
}

export interface Serie {
  /** em ordem de data (a mais antiga primeiro) */
  avaliacoes: Avaliacao[];
  fotos: Foto[];
  /** a mais recente primeiro */
  sessoes: SessaoFotos[];
  /** Perfil do Treino com dados e nenhuma avaliação registrada (a tela antiga mostrava "Dados pessoais" mesmo assim). */
  composicaoAtual: Avaliacao | null;
  /** objetivo da matrícula (NF8): decide se o peso descendo é bom ou ruim */
  objetivo: string | null;
}

export type Periodo = "3m" | "6m" | "1a" | "tudo";

// ───────────────────────── o que cada banco devolve (bruto) ─────────────────────────

/** Linha de `physiq_profiles` ou `physiq_avaliacoes` do Banco do Treino. */
export type LinhaTreino = Record<string, unknown>;

export interface LinhaFotoTreino {
  id: string;
  mes_ref: string;
  tipo: string;
  storage_path: string;
  created_at?: string | null;
  url?: string | null;
}

export interface AntropometriaPrincipal {
  id: string;
  data: string;
  peso: number | string | null;
  altura: number | string | null;
  sexo: string | null;
  idade: number | null;
  circunferencias: Record<string, unknown> | null;
  dobras: Record<string, unknown> | null;
  protocolo: string | null;
  resultados: Record<string, unknown> | null;
  autor_id: string | null;
  autor_nome: string | null;
  criado_em: string | null;
}

export interface FotoPrincipal {
  id: string;
  data: string;
  posicao: string;
  path: string;
  autor_id: string | null;
  autor_nome: string | null;
  criado_em: string | null;
  url?: string | null;
}

export interface ParteTreino {
  perfil: LinhaTreino | null;
  avaliacoes: LinhaTreino[];
  fotos: LinhaFotoTreino[];
}

export interface PartePrincipal {
  objetivo: string | null;
  antropometrias: AntropometriaPrincipal[];
  fotos: FotoPrincipal[];
}
