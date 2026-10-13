// Physiq W-A P2 (jeito 2, 13/10/2026) — regras PURAS da função `aluno-dia` (banco principal): as ROTINAS (creatina, remédio, hábito…) e a DIETA
// LIVRE (o dia do aluno com a Dieta "Pode mexer") — o app do aluno (P3, P5) e o Painel do profissional (P6). Sem Deno e sem rede: usadas pela
// função (supabase-principal/functions/aluno-dia/) e testadas no Vitest (src/aluno-dia/alunoDiaRegras.test.ts, com o CONTRATO das migrations).
// O desenho (spec W-A §5.2, §5.5, §5.6):
//   · toda LEITURA é { acao: "ler", q, … } (a Guarda dos E2E: leitura pelo corpo) — q numa lista fechada: rotinas { de, ate } · dia { dia } ·
//     biblioteca · alimentos { termo, pagina } · aluno_rotinas { aluno, de, ate } · aluno_dia { aluno, de, ate };
//   · as GRAVAÇÕES numa lista fechada, cada uma com a SUA RPC (migrations 20261012210000_wa2_rotinas e 20261012220000_wa3_dieta_livre) e os
//     campos que aceita, com o tipo e o tamanho DO BANCO; o que vier fora da lista CAI (dono, paciente_id, origem, criada_por nunca vêm do
//     corpo: o dono é o token, a matrícula é o banco que decide);
//   · os parâmetros com tipo do PostgREST (uuid, date, boolean, integer, uuid[]) vão SEMPRE conferidos — o cast de um texto cru leva o valor
//     na mensagem do Postgres, e o log.excecao leva a mensagem; o texto de dentro do p_dados vai CRU (o banco apara e grava; a função só barra
//     o que está fora da forma);
//   · a volta é o jsonb da RPC ({ ok, … }); { ok: false, erro } com o código; o status de cada código (a tela escreve a frase:
//     src/aluno-dia/api.ts). O log leva o código, a ação, o q e o nome do CAMPO recusado — nunca o nome de uma rotina ou de um alimento.
import { ehUuid } from "./nutricao-regras.ts";

type Corpo = Record<string, unknown>;
export type Recusa = { ok: false; erro: string; campo?: string };
type Lido<T> = { ok: true; valor: T } | Recusa;
const certo = <T>(valor: T): Lido<T> => ({ ok: true, valor });
const ruim = (campo: string): Recusa => ({ ok: false, erro: "dados_invalidos", campo });

// ───────────────────────── os limites (os do banco: wa_rotina_campos, wa_texto, wa_numero e os checks das tabelas) ─────────────────────────
export const LIMITES = {
  rotinaNome: [1, 60], detalhe: 120, extraNome: [1, 40], alimentoNome: [1, 80], receitaNome: [1, 80],
  gramas: [0.01, 9999.99], porcoesDoDia: [0.01, 20], porcoesDaReceita: [1, 100], porcaoG: [0.01, 9999.99], kcal: [0, 1000], macro: [0, 100],
  itensDaReceita: [1, 30], idsNaOrdem: 30, termo: 60, pagina: [0, 50], janelaDias: 31,
} as const;
export const TIPOS_DE_ROTINA = ["suplemento", "remedio", "habito", "outro"] as const;
export const MACROS = ["energia_kcal", "proteina_g", "carboidrato_g", "lipidio_g", "fibra_g"] as const;

// ───────────────────────── as leituras e as gravações (cada uma, a sua RPC) ─────────────────────────
export type Modulo = "rotinas" | "dieta" | "profissional";
export const LEITURAS = {
  rotinas: { modulo: "rotinas", rpc: "minhas_rotinas" },
  dia: { modulo: "dieta", rpc: "meu_dia" },
  biblioteca: { modulo: "dieta", rpc: "meus_alimentos" },
  alimentos: { modulo: "dieta", rpc: "buscar_alimentos_do_aluno" },
  aluno_rotinas: { modulo: "profissional", rpc: "rotinas_do_aluno" },
  aluno_dia: { modulo: "profissional", rpc: "dia_do_aluno" },
} as const;
export type Consulta = keyof typeof LEITURAS;

export const ACOES = {
  rotina_salvar: { modulo: "rotinas", rpc: "rotina_salvar" },
  rotina_arquivar: { modulo: "rotinas", rpc: "rotina_arquivar" },
  rotina_marcar: { modulo: "rotinas", rpc: "rotina_marcar" },
  rotinas_ordenar: { modulo: "rotinas", rpc: "rotinas_ordenar" },
  dia_adicionar: { modulo: "dieta", rpc: "dia_adicionar" },
  dia_tirar: { modulo: "dieta", rpc: "dia_tirar" },
  dia_desfazer: { modulo: "dieta", rpc: "dia_desfazer" },
  extra_salvar: { modulo: "dieta", rpc: "dia_extra_salvar" },
  extra_excluir: { modulo: "dieta", rpc: "dia_extra_excluir" },
  extra_marcar: { modulo: "dieta", rpc: "dia_extra_marcar" },
  alimento_salvar: { modulo: "dieta", rpc: "meu_alimento_salvar" },
  alimento_excluir: { modulo: "dieta", rpc: "meu_alimento_excluir" },
  receita_salvar: { modulo: "dieta", rpc: "minha_receita_salvar" },
  receita_excluir: { modulo: "dieta", rpc: "minha_receita_excluir" },
  prof_rotina_salvar: { modulo: "profissional", rpc: "rotina_prof_salvar" },
  prof_rotina_arquivar: { modulo: "profissional", rpc: "rotina_prof_arquivar" },
} as const;
export type AcaoDoAlunoDia = keyof typeof ACOES;
export const ACOES_DO_ALUNO_DIA = Object.keys(ACOES) as AcaoDoAlunoDia[];
/** Todas as RPCs que a função chama (o teste confere com as migrations). */
export const RPCS_DO_ALUNO_DIA: readonly string[] = [...Object.values(LEITURAS).map((l) => l.rpc), ...Object.values(ACOES).map((a) => a.rpc)];

export interface PedidoDoAlunoDia {
  modulo: Modulo;
  acao: "ler" | AcaoDoAlunoDia;
  /** a consulta, na leitura; null na gravação */
  q: Consulta | null;
  rpc: string;
  /** os parâmetros da RPC, com os nomes da migration (p_*) */
  args: Record<string, unknown>;
}

// ───────────────────────── os formatos ─────────────────────────
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** yyyy-mm-dd que existe no calendário (2026-02-30 não). */
export function ehData(v: unknown): v is string {
  if (typeof v !== "string" || !DATA.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export const ehHora = (v: unknown): v is string => typeof v === "string" && HORA.test(v);
/** O texto medido como o banco mede (aparado; espaços seguidos viram 1) cabe em [min, max]? Só confere — o texto vai CRU. */
export function textoNoTamanho(v: unknown, min: number, max: number): v is string {
  if (typeof v !== "string") return false;
  const n = v.trim().replace(/\s+/g, " ").length;
  return n >= min && n <= max;
}
export function numeroEntre(v: unknown, faixa: readonly [number, number], inteiro = false): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= faixa[0] && v <= faixa[1] && (!inteiro || Number.isInteger(v));
}
const ehObjeto = (v: unknown): v is Corpo => !!v && typeof v === "object" && !Array.isArray(v);
const tem = (o: Corpo, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

function idOuNulo(c: Corpo, campo = "id"): Lido<string | null> {
  const v = c[campo];
  if (v === undefined || v === null) return certo(null);
  return ehUuid(v) ? certo(v.toLowerCase()) : ruim(campo);
}
function idObrigatorio(c: Corpo, campo = "id"): Lido<string> {
  const v = c[campo];
  return ehUuid(v) ? certo(v.toLowerCase()) : ruim(campo);
}
function dataDo(c: Corpo, campo = "dia"): Lido<string> {
  const v = c[campo];
  return ehData(v) ? certo(v) : ruim(campo);
}
/** de/ate: datas que existem, na ordem, no máximo 31 dias (ate − de ≤ 30 — o "> 30" das RPCs). */
function janela(c: Corpo): Lido<{ p_de: string; p_ate: string }> {
  if (!ehData(c.de)) return ruim("de");
  if (!ehData(c.ate)) return ruim("ate");
  const dias = (Date.parse(`${c.ate}T00:00:00Z`) - Date.parse(`${c.de}T00:00:00Z`)) / 86_400_000;
  return dias >= 0 && dias <= LIMITES.janelaDias - 1 ? certo({ p_de: c.de, p_ate: c.ate }) : ruim("ate");
}

// ───────────────────────── o p_dados de cada gravação (só os campos conhecidos) ─────────────────────────
/** A rotina (wa_rotina_campos): `criar` exige o nome; lembrete exige horário (na criação, no corpo; na mudança, o banco confere com a linha). */
export function dadosDaRotina(v: unknown, criar: boolean): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const s: Corpo = {};
  if (tem(v, "nome")) {
    if (!textoNoTamanho(v.nome, LIMITES.rotinaNome[0], LIMITES.rotinaNome[1])) return ruim("nome");
    s.nome = v.nome;
  } else if (criar) return ruim("nome");
  if (tem(v, "detalhe")) {
    if (v.detalhe !== null && !textoNoTamanho(v.detalhe, 0, LIMITES.detalhe)) return ruim("detalhe");
    s.detalhe = v.detalhe;
  }
  if (tem(v, "tipo")) {
    if (typeof v.tipo !== "string" || !(TIPOS_DE_ROTINA as readonly string[]).includes(v.tipo)) return ruim("tipo");
    s.tipo = v.tipo;
  }
  if (tem(v, "horario")) {
    if (v.horario !== null && !ehHora(v.horario)) return ruim("horario");
    s.horario = v.horario;
  }
  if (tem(v, "dias_semana")) {
    const d = v.dias_semana;
    if (!Array.isArray(d) || d.length < 1 || d.length > 7 || !d.every((x) => Number.isInteger(x) && x >= 1 && x <= 7)) return ruim("dias_semana");
    s.dias_semana = d;
  }
  if (tem(v, "lembrete")) {
    if (typeof v.lembrete !== "boolean") return ruim("lembrete");
    s.lembrete = v.lembrete;
  }
  if (s.lembrete === true && (tem(s, "horario") ? s.horario === null : criar)) return ruim("horario");
  return certo(s);
}

/** O que ele põe no dia: 1 lugar (refeicao_id | extra_id), 1 origem (alimento_id | aluno_alimento_id | aluno_receita_id) e a quantidade
 *  (receita em porções; o resto em gramas). */
export function dadosDoItemDoDia(v: unknown): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const lugares = ["refeicao_id", "extra_id"].filter((k) => tem(v, k));
  if (lugares.length !== 1) return ruim("lugar");
  const origens = ["alimento_id", "aluno_alimento_id", "aluno_receita_id"].filter((k) => tem(v, k));
  if (origens.length !== 1) return ruim("origem");
  const [lugar] = lugares;
  const [origem] = origens;
  const idLugar = v[lugar];
  const idOrigem = v[origem];
  if (!ehUuid(idLugar)) return ruim(lugar);
  if (!ehUuid(idOrigem)) return ruim(origem);
  const s: Corpo = { [lugar]: idLugar.toLowerCase(), [origem]: idOrigem.toLowerCase() };
  if (origem === "aluno_receita_id") {
    if (tem(v, "quantidade_g")) return ruim("quantidade_g");
    if (!numeroEntre(v.porcoes, LIMITES.porcoesDoDia)) return ruim("porcoes");
    s.porcoes = v.porcoes;
  } else {
    if (tem(v, "porcoes")) return ruim("porcoes");
    if (!numeroEntre(v.quantidade_g, LIMITES.gramas)) return ruim("quantidade_g");
    s.quantidade_g = v.quantidade_g;
  }
  return certo(s);
}

/** A refeição extra: criar = dia + nome (a matrícula é a do plano ativo — o banco decide); mudar = nome, horário, "já comi" (o dia, nunca). */
export function dadosDaExtra(v: unknown, criar: boolean): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const s: Corpo = {};
  if (tem(v, "nome")) {
    if (!textoNoTamanho(v.nome, LIMITES.extraNome[0], LIMITES.extraNome[1])) return ruim("nome");
    s.nome = v.nome;
  } else if (criar) return ruim("nome");
  if (tem(v, "horario")) {
    if (v.horario !== null && !ehHora(v.horario)) return ruim("horario");
    s.horario = v.horario;
  }
  if (tem(v, "ja_comi")) {
    if (typeof v.ja_comi !== "boolean") return ruim("ja_comi");
    s.ja_comi = v.ja_comi;
  }
  if (criar) {
    if (!ehData(v.dia)) return ruim("dia");
    s.dia = v.dia;
  } else if (tem(v, "dia")) return ruim("dia");
  return certo(s);
}

/** O alimento dele (por 100 g; porcao_g = a porção de referência): criar exige o nome. */
export function dadosDoAlimento(v: unknown, criar: boolean): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const s: Corpo = {};
  if (tem(v, "nome")) {
    if (!textoNoTamanho(v.nome, LIMITES.alimentoNome[0], LIMITES.alimentoNome[1])) return ruim("nome");
    s.nome = v.nome;
  } else if (criar) return ruim("nome");
  if (tem(v, "porcao_g")) {
    if (!numeroEntre(v.porcao_g, LIMITES.porcaoG)) return ruim("porcao_g");
    s.porcao_g = v.porcao_g;
  }
  for (const k of MACROS) {
    if (!tem(v, k)) continue;
    if (!numeroEntre(v[k], k === "energia_kcal" ? LIMITES.kcal : LIMITES.macro)) return ruim(k);
    s[k] = v[k];
  }
  return certo(s);
}

/** A receita dele: nome, porções inteiras 1–100 e 1–30 itens (cada um: alimento_id OU aluno_alimento_id + quantidade_g); criar exige nome e itens. */
export function dadosDaReceita(v: unknown, criar: boolean): Lido<Corpo> {
  if (!ehObjeto(v)) return ruim("dados");
  const s: Corpo = {};
  if (tem(v, "nome")) {
    if (!textoNoTamanho(v.nome, LIMITES.receitaNome[0], LIMITES.receitaNome[1])) return ruim("nome");
    s.nome = v.nome;
  } else if (criar) return ruim("nome");
  if (tem(v, "porcoes")) {
    if (!numeroEntre(v.porcoes, LIMITES.porcoesDaReceita, true)) return ruim("porcoes");
    s.porcoes = v.porcoes;
  }
  if (tem(v, "itens")) {
    const itens = v.itens;
    if (!Array.isArray(itens) || itens.length < LIMITES.itensDaReceita[0] || itens.length > LIMITES.itensDaReceita[1]) return ruim("itens");
    const lista: Corpo[] = [];
    for (const it of itens) {
      if (!ehObjeto(it)) return ruim("itens");
      const chaves = ["alimento_id", "aluno_alimento_id"].filter((k) => tem(it, k));
      const id = chaves.length === 1 ? it[chaves[0]] : null;
      if (!ehUuid(id) || !numeroEntre(it.quantidade_g, LIMITES.gramas)) return ruim("itens");
      lista.push({ [chaves[0]]: id.toLowerCase(), quantidade_g: it.quantidade_g });
    }
    s.itens = lista;
  } else if (criar) return ruim("itens");
  return certo(s);
}

// ───────────────────────── o pedido inteiro ─────────────────────────
function leitura(c: Corpo): Lido<PedidoDoAlunoDia> {
  const q = c.q;
  if (typeof q !== "string" || !Object.prototype.hasOwnProperty.call(LEITURAS, q)) return ruim("q");
  const consulta = q as Consulta;
  const def = LEITURAS[consulta];
  const base = { modulo: def.modulo as Modulo, acao: "ler" as const, q: consulta, rpc: def.rpc };
  switch (consulta) {
    case "rotinas": {
      const j = janela(c);
      return j.ok === false ? j : certo({ ...base, args: { ...j.valor } });
    }
    case "dia": {
      const d = dataDo(c);
      return d.ok === false ? d : certo({ ...base, args: { p_dia: d.valor } });
    }
    case "biblioteca":
      return certo({ ...base, args: {} });
    case "alimentos": {
      if (!textoNoTamanho(c.termo, 0, LIMITES.termo)) return ruim("termo");
      const pagina = c.pagina === undefined ? 0 : c.pagina;
      if (!numeroEntre(pagina, LIMITES.pagina, true)) return ruim("pagina");
      return certo({ ...base, args: { p_termo: c.termo, p_pagina: pagina } });
    }
    case "aluno_rotinas":
    case "aluno_dia": {
      const a = idObrigatorio(c, "aluno");
      if (a.ok === false) return a;
      const j = janela(c);
      return j.ok === false ? j : certo({ ...base, args: { p_aluno: a.valor, ...j.valor } });
    }
  }
}

function gravacao(acao: AcaoDoAlunoDia, c: Corpo): Lido<PedidoDoAlunoDia> {
  const def = ACOES[acao];
  const base = { modulo: def.modulo as Modulo, acao, q: null, rpc: def.rpc };
  const com = (args: Record<string, unknown>) => certo({ ...base, args });
  switch (acao) {
    case "rotina_salvar": {
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const d = dadosDaRotina(c.dados, id.valor === null);
      return d.ok === false ? d : com({ p_id: id.valor, p_dados: d.valor });
    }
    case "rotina_arquivar":
    case "dia_desfazer":
    case "extra_excluir":
    case "alimento_excluir":
    case "receita_excluir": {
      const id = idObrigatorio(c);
      return id.ok === false ? id : com({ p_id: id.valor });
    }
    case "rotina_marcar": {
      const id = idObrigatorio(c);
      if (id.ok === false) return id;
      const d = dataDo(c);
      if (d.ok === false) return d;
      if (typeof c.feita !== "boolean") return ruim("feita");
      return com({ p_id: id.valor, p_dia: d.valor, p_feita: c.feita });
    }
    case "rotinas_ordenar": {
      const ids = c.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > LIMITES.idsNaOrdem || !ids.every(ehUuid)) return ruim("ids");
      const minusculos = ids.map((x) => (x as string).toLowerCase());
      if (new Set(minusculos).size !== minusculos.length) return ruim("ids");
      return com({ p_ids: minusculos });
    }
    case "dia_adicionar": {
      const d = dataDo(c);
      if (d.ok === false) return d;
      const dados = dadosDoItemDoDia(c.dados);
      return dados.ok === false ? dados : com({ p_dia: d.valor, p_dados: dados.valor });
    }
    case "dia_tirar": {
      const d = dataDo(c);
      if (d.ok === false) return d;
      const item = idObrigatorio(c, "item");
      return item.ok === false ? item : com({ p_dia: d.valor, p_item: item.valor });
    }
    case "extra_salvar": {
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const dados = dadosDaExtra(c.dados, id.valor === null);
      return dados.ok === false ? dados : com({ p_id: id.valor, p_dados: dados.valor });
    }
    case "extra_marcar": {
      const id = idObrigatorio(c);
      if (id.ok === false) return id;
      if (typeof c.feita !== "boolean") return ruim("feita");
      return com({ p_id: id.valor, p_feita: c.feita });
    }
    case "alimento_salvar": {
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const dados = dadosDoAlimento(c.dados, id.valor === null);
      return dados.ok === false ? dados : com({ p_id: id.valor, p_dados: dados.valor });
    }
    case "receita_salvar": {
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const dados = dadosDaReceita(c.dados, id.valor === null);
      return dados.ok === false ? dados : com({ p_id: id.valor, p_dados: dados.valor });
    }
    case "prof_rotina_salvar": {
      const aluno = idObrigatorio(c, "aluno");
      if (aluno.ok === false) return aluno;
      const id = idOuNulo(c);
      if (id.ok === false) return id;
      const dados = dadosDaRotina(c.dados, id.valor === null);
      return dados.ok === false ? dados : com({ p_aluno: aluno.valor, p_id: id.valor, p_dados: dados.valor });
    }
    case "prof_rotina_arquivar": {
      const aluno = idObrigatorio(c, "aluno");
      if (aluno.ok === false) return aluno;
      const id = idObrigatorio(c);
      return id.ok === false ? id : com({ p_aluno: aluno.valor, p_id: id.valor });
    }
  }
}

/** O pedido na forma (a RPC e os p_*) ou a recusa: acao_invalida (fora da lista; o { action: "ler" } também) · dados_invalidos com o campo. */
export function pedidoDoAlunoDia(corpo: Corpo): { ok: true; pedido: PedidoDoAlunoDia } | Recusa {
  if (corpo.acao === "ler") {
    const r = leitura(corpo);
    return r.ok === false ? r : { ok: true, pedido: r.valor };
  }
  const acao = corpo.acao;
  if (typeof acao !== "string" || !Object.prototype.hasOwnProperty.call(ACOES, acao)) return { ok: false, erro: "acao_invalida" };
  const r = gravacao(acao as AcaoDoAlunoDia, corpo);
  return r.ok === false ? r : { ok: true, pedido: r.valor };
}

// ───────────────────────── a volta e o status ─────────────────────────
export const STATUS_DO_ERRO_ALUNO_DIA: Readonly<Record<string, number>> = {
  dados_invalidos: 400, acao_invalida: 400, schema_invalido: 400,
  sem_login: 401,
  sem_acesso: 403,
  nao_encontrado: 404, aluno_inexistente: 404,
  metodo: 405,
  dieta_travada: 409, sem_login_do_aluno: 409, so_do_aluno: 409, limite: 409, conflito: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  tempo_esgotado: 504,
};
export const statusDoErroAlunoDia = (erro: unknown): number => STATUS_DO_ERRO_ALUNO_DIA[String(erro ?? "")] ?? 500;

/** O jsonb da RPC como resposta: { ok: true, … } como veio · { ok: false, erro } conhecido · o resto → erro_interno (inesperado: log.erro). */
export function voltaDoAlunoDia(data: unknown): { ok: true; [campo: string]: unknown } | { ok: false; erro: string; inesperado: boolean } {
  if (!ehObjeto(data)) return { ok: false, erro: "erro_interno", inesperado: true };
  if (data.ok === true) return data as { ok: true; [campo: string]: unknown };
  const erro = typeof data.erro === "string" ? data.erro : "";
  return erro && erro !== "erro_interno" && Object.prototype.hasOwnProperty.call(STATUS_DO_ERRO_ALUNO_DIA, erro)
    ? { ok: false, erro, inesperado: false }
    : { ok: false, erro: "erro_interno", inesperado: true };
}
