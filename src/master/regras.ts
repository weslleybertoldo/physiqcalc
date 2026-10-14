/**
 * Painel master (W27) — regras PURAS das telas: rótulos, tons dos chips, o que cada conta deixa fazer, datas e dinheiro, e o texto
 * de cada erro das funções. Testadas no Vitest (src/master/regras.test.ts). W28: a "Cobrança legada até a virada" saiu — as
 * contas legadas são cobradas pelo núcleo (cobranca_legada = false), com o preço e as regras de hoje até trocar de plano.
 */
import { comparacaoDoMes, variacao } from "@/painel/financeiro/resumo";
import type { TomChip } from "@/ui/premium/Chip";
import type { ContaLinha, Faixa, ModuloConta, MpDaContaMaster, Origem, PedidoRecebimentoMaster, PlanoConta, Situacao, VisaoGeral } from "./tipos";

export const ROTULO_PLANO: Record<PlanoConta, string> = { treino: "Só Treino", nutricao: "Só Nutrição", treino_nutricao: "Treino + Nutrição" };
export const ROTULO_FAIXA: Record<Faixa, string> = { f10: "1–10 alunos", f30: "11–30 alunos", f100: "31–100 alunos", livre: "Sem limite" };
export const ROTULO_ORIGEM: Record<Origem, string> = { nova: "Conta nova", legado_calc: "Legado PhysiqCalc", legado_nutri: "Legado PhysiqNutri", app: "App do aluno" };
export const ROTULO_SITUACAO: Record<Situacao, string> = {
  teste: "Em teste", ativa: "Em dia", vencida: "Vencida", isenta: "Isenta", suspensa: "Suspensa", cancelada: "Cancelada",
};
export const TOM_SITUACAO: Record<Situacao, TomChip> = { teste: "c", ativa: "n", vencida: "r", isenta: "g", suspensa: "a", cancelada: "g" };
export const ROTULO_MODULO: Record<ModuloConta, string> = { treino: "Treino", nutricao: "Nutrição" };
export const TOM_MODULO: Record<ModuloConta, TomChip> = { treino: "t", nutricao: "n" };
/**
 * W1: + a InfinitePay (o master vê e desliga; quem liga é o dono, em Configurações › Recebimento). W2: agora são 2 Mercados Pagos — o do
 * Physiq (só o master liga) e o do personal (o dono conecta o dele; o master vê e desliga). A ordem é a das opções do select.
 */
export const ROTULO_RECEBIMENTO: Record<string, string> = {
  pix_manual: "Pix manual", nenhum: "Não cobra pelo app", mercadopago: "Mercado Pago do Physiq", mercadopago_conta: "Mercado Pago do personal",
  infinitepay: "InfinitePay",
};
export const PLANOS: PlanoConta[] = ["treino", "nutricao", "treino_nutricao"];
export const FAIXAS: Faixa[] = ["f10", "f30", "f100", "livre"];

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : "—";
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function moeda(v: number | string | null | undefined): string {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * H4 (N-22): "Último acesso" de cada profissional, como no "Profissionais" do Nutri (masterUtil.textoUltimoAcesso): hoje · ontem ·
 * há N dias · há N meses · há N anos · nunca acessou. Os dias contam pelo calendário de São Paulo.
 */
export function textoUltimoAcesso(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return "nunca acessou";
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return "nunca acessou";
  const dia = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const ms = Date.parse(`${dia(agora)}T12:00:00Z`) - Date.parse(`${dia(quando)}T12:00:00Z`);
  const d = Math.round(ms / 86_400_000);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  if (d < 365) {
    const m = Math.floor(d / 30);
    return `há ${m} ${m === 1 ? "mês" : "meses"}`;
  }
  const a = Math.floor(d / 365);
  return `há ${a} ${a === 1 ? "ano" : "anos"}`;
}

/** AAAA-MM-DD + n dias (calendário, sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * "Vence em 12/11/2026", "Teste até …", "Isenta · motivo", "Venceu em …" — a linha do vencimento de uma conta, pelas datas do
 * núcleo (W28: também nas legadas; as datas do site antigo do Nutri não valem mais).
 */
export function linhaVencimento(c: Pick<ContaLinha, "situacao_efetiva" | "vence_em" | "teste_ate" | "isenta_motivo">): string {
  if (c.situacao_efetiva === "isenta") return c.isenta_motivo ? `Isenta · ${c.isenta_motivo}` : "Isenta";
  if (c.situacao_efetiva === "suspensa") return "Suspensa pelo master";
  if (c.situacao_efetiva === "teste") return `Teste até ${dataCurta(c.teste_ate)}`;
  if (c.situacao_efetiva === "vencida") return c.vence_em ? `Venceu em ${dataCurta(c.vence_em)}` : `Teste acabou em ${dataCurta(c.teste_ate)}`;
  return c.vence_em ? `Vence em ${dataCurta(c.vence_em)}` : "—";
}

export interface ReceitaDoMes {
  valor: number;
  variacao: number | null;
  /** "1–2 set" (o período do mês anterior) — null no servidor antigo (comparação com o mês anterior inteiro) */
  rotulo: string | null;
  /** "1º a 2 de setembro" (a dica do cartão) */
  rotuloLongo: string | null;
}

/**
 * KPI "Receita do mês" da Visão geral (W28 — o "−86 % sobre o mês anterior" do dia 2): com os recebimentos por dia, a regra ÚNICA
 * do painel (comparacaoDoMes — de 1º até hoje contra de 1º até o mesmo dia do mês anterior); sem eles (servidor antigo), o mês
 * contra o mês anterior inteiro, como antes.
 */
export function receitaDoMes(r: VisaoGeral["receita"], hoje: string): ReceitaDoMes {
  if (Array.isArray(r.recebimentos)) {
    const recs = r.recebimentos.map((x) => ({ dia: String(x.dia ?? "").slice(0, 10), valor: Number.isFinite(Number(x.valor)) ? Number(x.valor) : 0 }));
    const c = comparacaoDoMes(recs, hoje);
    return { valor: c.atual, variacao: c.variacao, rotulo: c.rotulo, rotuloLongo: c.rotuloLongo };
  }
  const mes = Number(r.mes) || 0;
  return { valor: mes, variacao: variacao(mes, Number(r.mes_anterior) || 0), rotulo: null, rotuloLongo: null };
}

/** "8 de 10" / "8 · sem limite" */
export function linhaAlunos(c: Pick<ContaLinha, "alunos_ativos" | "limite_alunos">): string {
  return c.limite_alunos === null || c.limite_alunos === undefined ? `${c.alunos_ativos} · sem limite` : `${c.alunos_ativos} de ${c.limite_alunos}`;
}

export type AcaoMaster =
  | "plano" | "vencimento" | "liberar" | "isentar" | "tirar_isencao" | "suspender" | "reativar" | "bloquear_alunos" | "desbloquear_alunos"
  | "registrar_pagamento" | "reenviar_aviso" | "cancelar_assinatura" | "mover_alunos" | "excluir";

/**
 * O que o master pode fazer na conta (a mesma regra do banco — master_conta_acao): conta do app só aparece; as demais (a nova e,
 * desde a virada — W28 —, a legada) têm as ações de cobrança e acesso; excluir só sem alunos.
 */
export function acoesDaConta(c: ContaLinha): AcaoMaster[] {
  if (c.eh_app) return [];
  const mover: AcaoMaster[] = ["mover_alunos"];
  const a: AcaoMaster[] = ["plano", "vencimento", "liberar", "registrar_pagamento"];
  a.push(c.situacao === "isenta" || c.isenta_motivo ? "tirar_isencao" : "isentar");
  a.push(c.situacao === "suspensa" ? "reativar" : "suspender");
  a.push(c.alunos_bloqueados_em ? "desbloquear_alunos" : "bloquear_alunos");
  a.push("reenviar_aviso");
  if (c.assinatura && ["authorized", "pending", "paused"].includes(c.assinatura.status)) a.push("cancelar_assinatura");
  a.push(...mover);
  if (c.alunos_total === 0) a.push("excluir");
  return a;
}

/** Chave Pix com o meio escondido (o master vê de quem é; a chave inteira fica nas Configurações da conta). */
export function chaveMascarada(chave: string): string {
  const c = chave.trim();
  if (c.length <= 6) return c;
  return `${c.slice(0, 3)}…${c.slice(-3)}`;
}

/** Descer de faixa só se os alunos ativos couberem (regra de hoje do Calc, W4). */
export function faixaCabe(faixa: Faixa, alunosAtivos: number): boolean {
  const max: Record<Faixa, number | null> = { f10: 10, f30: 30, f100: 100, livre: null };
  const m = max[faixa];
  return m === null || alunosAtivos <= m;
}

// ───────────────────────── W2 — o Mercado Pago do personal em Integrações (vê e desliga com o OK) ─────────────────────────

/** Um número inteiro positivo que veio do servidor (a contagem de uma resposta); qualquer outra coisa = 0. */
function contagem(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
const alunos = (n: number) => (n === 1 ? "1 aluno" : `${n} alunos`);

/** A marca da situação (o data-mp-conta-situacao do E2E): as mesmas palavras do chip da tela do dono (chipDaConexaoMp). */
export type MarcaMpDaConta = "conectado" | "renove" | "caiu" | "desconectado";

/**
 * W2 — a situação do Mercado Pago do personal na linha da conta: a marca, o tom e o texto curto com o apelido ("RAFAEL.TREINOS ·
 * Conectado"). "Renovar" = o acesso vale, mas o Mercado Pago não renova sozinho (o dono conecta de novo até a data — a de São Paulo).
 */
export function situacaoDoMpDaConta(mp: MpDaContaMaster | null | undefined): { marca: MarcaMpDaConta; tom: TomChip; texto: string } {
  const apelido = (mp?.apelido ?? "").trim();
  const com = (s: string) => (apelido ? `${apelido} · ${s}` : s);
  if (!mp?.status || mp.status === "desconectada") return { marca: "desconectado", tom: "g", texto: com("Desconectado") };
  if (mp.status === "erro") return { marca: "caiu", tom: "r", texto: com("Conexão caída") };
  if (mp.erro === "renovacao_recusada" || mp.erro === "sem_renovacao") {
    const d = mp.expira_em ? new Date(mp.expira_em) : null;
    const ate = d && !Number.isNaN(d.getTime())
      ? ` até ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })}` : "";
    return { marca: "renove", tom: "a", texto: com(`Conectado · renovar${ate}`) };
  }
  return { marca: "conectado", tom: "n", texto: com("Conectado") };
}

/** Uma confirmação do master (as opções do useConfirmar, com o texto puro — a tela põe a marca do passo na descrição). */
export interface PerguntaDoMaster {
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  rotuloCancelar: string;
  perigo: true;
}

/**
 * W2 — o 1º OK: sair do Mercado Pago do personal (o "Desligar" da linha ou outra forma escolhida no select). A conexão dele sai junto
 * (contas_saiu_do_mp_conta): voltar a ela só pelo dono, conectando de novo.
 */
export function perguntaDeSairDoMpConta(nome: string, modo: string, temChave: boolean): PerguntaDoMaster {
  const destino = modo === "mercadopago" ? "Os alunos passam a pagar pelo Mercado Pago do Physiq."
    : modo === "pix_manual"
      ? (temChave ? "Os alunos voltam a pagar por Pix na chave ligada." : "Os alunos passam ao Pix manual, mas a conta não tem chave Pix ligada.")
      : (temChave ? "A conta passa a não cobrar pelo app." : "Sem chave Pix ligada: a conta passa a não cobrar pelo app.");
  return {
    titulo: `Desligar o Mercado Pago do personal de ${nome}?`, rotuloConfirmar: "Desligar", rotuloCancelar: "Voltar", perigo: true,
    descricao: `${destino} A conexão com o Mercado Pago dele sai: para voltar a ele, o dono conecta de novo em Configurações › Recebimento.`,
  };
}

/**
 * W2 (MENOR 7 da W1 + decisão 11) — a pergunta seguinte quando a troca volta recusada por causa das cobranças automáticas (o servidor não
 * muda nada sem o OK — master-contas/recebimento.ts):
 * - automaticas_ativas { alunos } → a 2ª: desligar as cobranças no Mercado Pago e avisar os alunos → { modo, cancelar_automaticas: true }.
 *   Também na corrida (uma nasceu entre a conferência e a troca) — e sem o forçar de antes: forçar pede o OK de novo;
 * - automaticas_sem_acesso { alunos, canceladas } (só depois do OK das automáticas) → a 3ª, com perigo: forçar → { …, forcar_sem_acesso: true };
 * - qualquer outro código (o 502 automaticas_nao_canceladas, o sem acesso que voltasse mesmo forçando) → null: a tela mostra o textoErro.
 */
export function perguntaDasAutomaticas(codigo: string | null | undefined, extra: Record<string, unknown>, pedido: PedidoRecebimentoMaster):
  (PerguntaDoMaster & { passo: "automaticas" | "forcar"; pedido: PedidoRecebimentoMaster }) | null {
  if (codigo === "automaticas_ativas") {
    const n = contagem(extra.alunos);
    return {
      passo: "automaticas", pedido: { modo: pedido.modo, cancelar_automaticas: true },
      titulo: n ? `Desligar as cobranças automáticas de ${alunos(n)}?` : "Desligar as cobranças automáticas?",
      descricao: `${n ? alunos(n) : "Há alunos"} com cobrança automática no cartão: desligar cancela essas cobranças no Mercado Pago e avisa os alunos. Sem isso, a forma de receber não muda.`,
      rotuloConfirmar: "Desligar as cobranças", rotuloCancelar: "Voltar", perigo: true,
    };
  }
  if (codigo === "automaticas_sem_acesso" && pedido.cancelar_automaticas === true && pedido.forcar_sem_acesso !== true) {
    const s = contagem(extra.alunos);
    const c = contagem(extra.canceladas);
    return {
      passo: "forcar", pedido: { modo: pedido.modo, cancelar_automaticas: true, forcar_sem_acesso: true },
      titulo: "Forçar sem o Mercado Pago do personal?",
      descricao: `O Physiq não alcança o Mercado Pago do personal para desligar as cobranças automáticas de ${s ? alunos(s) : "alguns alunos"}. `
        + "Forçar marca como desligadas no Physiq e avisa o personal (para desligar no app do Mercado Pago) e os alunos — a cobrança pode continuar "
        + `no cartão até ele desligar.${c ? ` Já desligadas no Mercado Pago: ${c}.` : ""}`,
      rotuloConfirmar: "Forçar", rotuloCancelar: "Voltar", perigo: true,
    };
  }
  return null;
}

/**
 * W2 — o que a troca com o OK fez nas cobranças automáticas (o 200 { automaticas: { canceladas, forcadas } } — canceladas = desligadas no
 * Mercado Pago; forcadas = ALUNOS marcados à força): a 2ª linha do aviso. Nada (ou sem o campo) → null.
 */
export function textoDasAutomaticas(resposta: unknown): string | null {
  const a = (resposta as { automaticas?: Record<string, unknown> | null } | null)?.automaticas;
  const c = contagem(a?.canceladas);
  const f = contagem(a?.forcadas);
  const partes: string[] = [];
  if (c) partes.push(`${c === 1 ? "1 cobrança automática desligada" : `${c} cobranças automáticas desligadas`} no Mercado Pago — cada aluno recebeu um aviso.`);
  if (f) partes.push(`${f === 1 ? "1 aluno marcado" : `${f} alunos marcados`} sem a cobrança automática à força: o personal e os alunos foram avisados.`);
  return partes.length ? partes.join(" ") : null;
}

const ERROS: Record<string, string> = {
  so_master: "Só o master pode fazer isto.",
  // hml-22 (H-22): a verificação em 2 etapas ligada e a sessão sem o código (a tela do código aparece em seguida)
  precisa_2fa: "Digite o código do app autenticador para continuar.",
  sem_login: "Sua sessão acabou. Entre de novo.",
  sem_internet: "Sem internet. Tente quando a conexão voltar.",
  conta_inexistente: "Esta conta não existe mais.",
  conta_do_app: "A conta do app do aluno não muda por aqui.",
  cobranca_legada: "A cobrança desta conta ainda é a antiga: passe a conta para o núcleo (a virada) antes de mexer nela por aqui.",
  plano_invalido: "Escolha um plano e uma faixa válidos.",
  alunos_acima_do_limite: "A conta tem mais alunos ativos do que essa faixa permite.",
  data_invalida: "Escolha uma data válida.",
  ja_tem_acesso: "A conta já tem acesso até essa data (ou depois).",
  motivo_obrigatorio: "Escreva o motivo (pelo menos 3 letras).",
  nao_isenta: "A conta não está isenta.",
  tem_alunos: "Só dá para excluir uma conta sem nenhum aluno (nem na lixeira).",
  assinatura_ativa: "Cancele a cobrança automática no cartão antes de excluir.",
  // W2: o master liga o Pix, o "não cobrar" e o MP do Physiq; o MP do personal e a InfinitePay, só o dono (o OAuth / a InfiniteTag)
  modo_invalido: "O Mercado Pago do personal e a InfinitePay só o dono liga.",
  acao_invalida: "Ação inválida.",
  email_invalido: "E-mail inválido.",
  conta_real_no_staging: "O staging só aceita e-mails de teste.",
  nome_invalido: "Escreva o nome (pelo menos 2 letras).",
  tipo_invalido: "Escolha o tipo de profissional.",
  senha_curta: "A senha precisa de pelo menos 8 caracteres.",
  ja_tem_conta: "Esta pessoa já é profissional de uma conta.",
  plano_sem_o_modulo_do_tipo: "O plano precisa ter o módulo do tipo de profissional (personal → Treino; nutricionista → Nutrição).",
  erro_criar_login: "Não deu para criar o login. Confira o e-mail.",
  usuario_inexistente: "Pessoa não encontrada.",
  nao_pode_a_si_mesmo: "Você não pode fazer isto em você mesmo.",
  conta_suspensa: "A conta de destino está suspensa.",
  selecao_invalida: "Selecione de 1 a 200 alunos.",
  responsavel_invalido: "O responsável precisa ser da conta, com o papel do módulo.",
  sem_responsavel: "Escolha quem vai acompanhar os alunos na conta nova.",
  limite_plano: "A conta de destino chegou no limite de alunos da faixa.",
  outro_profissional: "O aluno já está ativo com outro profissional.",
  ja_esta_na_conta: "O aluno já tem matrícula na conta de destino.",
  sem_login_aluno: "Aluno sem login.",
  valor_invalido: "Valor inválido.",
  meses_invalido: "Escolha 1, 2, 3, 6 ou 12 meses.",
  sem_assinatura: "A conta não tem cobrança automática no cartão.",
  mp_error: "O Mercado Pago não respondeu. Tente de novo.",
  sem_dono: "A conta não tem dono para receber o aviso.",
  chave_invalida: "Configuração inválida.",
  preco_inexistente: "Esse preço não existe na tabela.",
  itens_invalidos: "O prato precisa de 1 a 30 itens.",
  item_invalido: "Confira os itens: alimento da TACO e gramas entre 1 e 2000.",
  refeicao_invalida: "Escolha a refeição.",
  objetivo_invalido: "Marque pelo menos um objetivo.",
  muitas_acoes: "Muitas ações seguidas. Espere um pouco.",
  // hml-14d (B21): a página do banco
  pagina_invalida: "Página inválida. Volte para a primeira página.",
  formato_inesperado: "A lista veio num formato inesperado. Atualize a página.",
  // W2 (Task 12): trocar a forma saindo de um Mercado Pago com cobrança automática viva (master-contas › recebimento)
  automaticas_ativas: "A conta tem alunos com cobrança automática no cartão. Confirme para desligar essas cobranças antes de trocar a forma de receber.",
  automaticas_nao_canceladas: "Algumas cobranças automáticas não desligaram no Mercado Pago. A forma de receber não mudou. Tente de novo.",
  automaticas_sem_acesso: "O Physiq não consegue desligar no Mercado Pago do personal algumas cobranças automáticas. Você pode forçar: o personal e os alunos são avisados.",
};

/** A frase do erro de uma função do master. W2: o `extra` (o corpo do erro) dá a contagem ao 502 automaticas_nao_canceladas { falhas }. */
export function textoErro(codigo: string | null | undefined, extra: Record<string, unknown> = {}): string {
  const falhas = codigo === "automaticas_nao_canceladas" ? contagem(extra.falhas) : 0;
  if (falhas) {
    return `${falhas === 1 ? "1 cobrança automática não desligou" : `${falhas} cobranças automáticas não desligaram`} no Mercado Pago. A forma de receber não mudou. Tente de novo.`;
  }
  return (codigo && ERROS[codigo]) || "Não deu certo agora. Tente de novo.";
}
