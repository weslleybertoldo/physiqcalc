// Physiq W-A P2 — a porta da TELA para a função aluno-dia (as rotinas e a dieta livre): o app do aluno (P3, P5) e o painel (P6) chamam daqui. O
// molde do src/financeiro/gravar.ts: 1 chamada só (função não repete — src/integrations/repeticao.ts: na gravação, o servidor pode ter gravado e
// só a resposta se perdido; a leitura também vai 1 vez — o ACOES_DE_LEITURA é da hml-21); sem internet → sem_internet ANTES de chamar; a rede
// que cai (FunctionsFetchError) → rede; o erro vira ErroAlunoDia(codigo) com a FRASE fixa do código. A ação vai por ÚLTIMO no corpo (nenhum
// campo troca a ação); toda leitura é { acao: "ler", q, … }. Nada fala com o banco daqui (src/aluno-dia/semBancoDireto.test.ts).
import { principal } from "@/integrations/principal/client";
import type { AcaoDoAlunoDia, Consulta } from "../../supabase-principal/functions/_shared/aluno-dia-regras";
import type {
  BuscaDoAluno, DadosDaExtra, DadosDaReceita, DadosDaRotina, DadosDoAlimento, DadosDoItemDoDia, DiaDoAluno, ExtraDoDia, ItemDoDia, MeuAlimento,
  MeuDia, MinhaBiblioteca, MinhaReceita, MinhasRotinas, Rotina, RotinasDoAluno,
} from "./tipos";

/** A frase de cada código (STATUS_DO_ERRO_ALUNO_DIA da função e os que nascem aqui). */
export const MENSAGEM_ERRO_ALUNO_DIA: Record<string, string> = {
  sem_internet: "Sem internet. Confira a conexão e tente de novo.",
  rede: "Não foi possível falar com o servidor agora. Tente de novo.",
  sem_login: "Sua sessão expirou. Entre de novo para continuar.",
  sem_acesso: "Você não tem permissão para fazer isso.",
  nao_encontrado: "Não encontrado: foi apagado ou não é seu.",
  aluno_inexistente: "Aluno não encontrado.",
  dados_invalidos: "Confira os dados e tente de novo.",
  acao_invalida: "Esta ação não está disponível. Atualize o app.",
  schema_invalido: "Ambiente inválido. Atualize o app.",
  metodo: "Esta ação não está disponível. Atualize o app.",
  dieta_travada: "A sua dieta voltou a ser só para ver.",
  sem_login_do_aluno: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos.",
  so_do_aluno: "Essa rotina foi criada pelo aluno: só ele muda ou apaga.",
  limite: "Chegou ao limite (30 rotinas; 100 itens e 10 refeições extras por dia; 300 alimentos; 100 receitas).",
  conflito: "Já existe um registro igual.",
  corpo_grande: "Dados grandes demais para enviar de uma vez.",
  muitas_acoes: "Muitas ações seguidas. Espere um pouco e tente de novo.",
  tempo_esgotado: "O servidor demorou para responder. Tente de novo.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemErroAlunoDia(codigo: string | null | undefined, padrao = "Não deu certo agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_ALUNO_DIA[codigo]) || padrao;
}

/** O erro de uma chamada da aluno-dia: `codigo` = o da função (ou sem_internet/rede); `message` = a frase fixa do código. */
export class ErroAlunoDia extends Error {
  readonly codigo: string;
  constructor(codigo: string) {
    super(mensagemErroAlunoDia(codigo));
    this.name = "ErroAlunoDia";
    this.codigo = codigo;
  }
}

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** UMA chamada à aluno-dia; a ação vai por último no corpo. */
async function chamar<T>(acao: AcaoDoAlunoDia | "ler", corpo: Record<string, unknown>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroAlunoDia("sem_internet");
  const { data, error } = await principal.functions.invoke("aluno-dia", { body: { ...corpo, acao } });
  if (error) {
    const c = await corpoDoErro(error);
    const rede = (error as { name?: unknown })?.name === "FunctionsFetchError";
    throw new ErroAlunoDia(typeof c?.erro === "string" ? c.erro : rede ? "rede" : "erro_interno");
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) throw new ErroAlunoDia(typeof d.erro === "string" ? d.erro : "erro_interno");
  return d as T;
}
const ler = <T>(q: Consulta, params: Record<string, unknown> = {}) => chamar<T & { ok: true }>("ler", { ...params, q });

// ───────────────────────── leituras ─────────────────────────
/** As rotinas vivas do aluno + as feitas do intervalo (≤ 31 dias). */
export const lerMinhasRotinas = (de: string, ate: string) => ler<MinhasRotinas>("rotinas", { de, ate });
/** O dia dele (lê mesmo travada: diz se está liberada, por matrícula). */
export const lerMeuDia = (dia: string) => ler<MeuDia>("dia", { dia });
/** Os alimentos e as receitas dele. */
export const lerMinhaBiblioteca = () => ler<MinhaBiblioteca>("biblioteca");
/** A busca do aluno (TACO, os dele, os dos planos dele, as receitas dele): 20 por página. */
export const buscarAlimentosDoAluno = (termo: string, pagina = 0) => ler<BuscaDoAluno>("alimentos", { termo, pagina });
/** O painel: as rotinas do aluno da rota (com as arquivadas e o histórico). */
export const lerRotinasDoAluno = (aluno: string, de: string, ate: string) => ler<RotinasDoAluno>("aluno_rotinas", { aluno, de, ate });
/** O painel: o dia a dia do aluno da rota (só leitura; o personal também). */
export const lerDiaDoAluno = (aluno: string, de: string, ate: string) => ler<DiaDoAluno>("aluno_dia", { aluno, de, ate });

// ───────────────────────── gravações do aluno ─────────────────────────
export const salvarRotina = (id: string | null, dados: DadosDaRotina) => chamar<{ ok: true; rotina: Rotina }>("rotina_salvar", { id, dados });
export const arquivarRotina = (id: string) => chamar<{ ok: true }>("rotina_arquivar", { id });
export const marcarRotina = (id: string, dia: string, feita: boolean) => chamar<{ ok: true; feita: boolean }>("rotina_marcar", { id, dia, feita });
export const ordenarRotinas = (ids: string[]) => chamar<{ ok: true }>("rotinas_ordenar", { ids });
export const adicionarNoDia = (dia: string, dados: DadosDoItemDoDia) => chamar<{ ok: true; item: ItemDoDia }>("dia_adicionar", { dia, dados });
export const tirarDoDia = (dia: string, item: string) => chamar<{ ok: true; item: ItemDoDia }>("dia_tirar", { dia, item });
export const desfazerNoDia = (id: string) => chamar<{ ok: true }>("dia_desfazer", { id });
export const salvarExtra = (id: string | null, dados: DadosDaExtra) => chamar<{ ok: true; extra: ExtraDoDia }>("extra_salvar", { id, dados });
export const excluirExtra = (id: string) => chamar<{ ok: true }>("extra_excluir", { id });
export const marcarExtra = (id: string, feita: boolean) => chamar<{ ok: true; concluida_em: string | null }>("extra_marcar", { id, feita });
export const salvarAlimento = (id: string | null, dados: DadosDoAlimento) => chamar<{ ok: true; alimento: MeuAlimento }>("alimento_salvar", { id, dados });
export const excluirAlimento = (id: string) => chamar<{ ok: true }>("alimento_excluir", { id });
export const salvarReceita = (id: string | null, dados: DadosDaReceita) => chamar<{ ok: true; receita: MinhaReceita }>("receita_salvar", { id, dados });
export const excluirReceita = (id: string) => chamar<{ ok: true }>("receita_excluir", { id });

// ───────────────────────── gravações do profissional (a matrícula da rota) ─────────────────────────
export const profSalvarRotina = (aluno: string, id: string | null, dados: DadosDaRotina) =>
  chamar<{ ok: true; rotina: Rotina }>("prof_rotina_salvar", { aluno, id, dados });
export const profArquivarRotina = (aluno: string, id: string) => chamar<{ ok: true }>("prof_rotina_arquivar", { aluno, id });
