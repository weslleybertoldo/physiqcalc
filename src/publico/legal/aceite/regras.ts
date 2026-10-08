import { plataformaAtual, type PlataformaDoApp } from "@/lib/avisoDeErro";
import { ROTA_EXCLUIR_CONTA } from "@/lib/pedidoExclusao";
import type { LegalSituacao, MenorSituacao } from "@/nucleo/situacao";
import { ROTA_ASSINATURA, ROTA_POLITICA, ROTA_TERMOS, VERSAO_TEXTOS } from "../versao";

/**
 * hml-12 (H-30) — as regras puras da porta do aceite (testadas em regras.test.ts). A porta (PortaDoAceite.tsx) fica na frente de
 * toda área logada SÓ no build de staging até a virada: quem não aceitou a versão vigente dos Termos de Uso e da Política de
 * Privacidade (a do banco, `situacao.legal`) vê a tela do aceite; quem tem a trava de idade vê a tela da trava. As páginas públicas,
 * o Sair e o Excluir minha conta passam sempre.
 */

export type DecisaoDaPorta = "segue" | "carregando" | "aceite" | MenorSituacao;

/**
 * O que a porta mostra (spec §4.2):
 * 1. sem login, sem `legal` (servidor antigo, cache de antes) ou versão nula (desligado) → segue;
 * 2. rota livre (as públicas e as de exclusão) → segue;
 * 3. aceite, saúde ou data pendente, com internet → a tela do aceite (a situação ainda carregando → a tela de carregar: o cache velho
 *    não pisca a tela). Sem internet, o aceite pendente não barra: o treino abre e a tela vem quando a internet volta (D9);
 * 4. a trava de idade → a tela da trava, mesmo sem internet (é o cache); com a situação carregando, espera a nova (o profissional
 *    pode ter registrado o responsável);
 * 5. senão → segue (e as travas de sempre rodam por dentro).
 * Quem não tem login chega aqui com `legal` nulo.
 */
export function decisaoDaPorta(
  legal: LegalSituacao | null | undefined,
  { rotaLivre, online, carregando }: { rotaLivre: boolean; online: boolean; carregando: boolean },
): DecisaoDaPorta {
  if (!legal || legal.versao === null) return "segue";
  if (rotaLivre) return "segue";
  const pendente = legal.aceite_pendente || legal.saude_pendente || legal.nascimento_pendente;
  if (pendente && online) return carregando ? "carregando" : "aceite";
  if (legal.menor) return carregando && online ? "carregando" : legal.menor;
  return "segue";
}

/** A tela de exclusão do profissional (a do aluno é o /perfil?excluir=1) — as 2 de destinoDaExclusao (excluirConta/regras.ts). */
export const ROTA_EXCLUSAO_DO_PAINEL = "/painel/configuracoes/excluir-conta";

const LIVRES = [ROTA_POLITICA, ROTA_TERMOS, ROTA_ASSINATURA, ROTA_EXCLUIR_CONTA, "/calculator", "/erro-teste", "/entrar", ROTA_EXCLUSAO_DO_PAINEL];
const LIVRES_POR_PREFIXO = ["/f/", "/d/", "/c/", "/p/", "/entrar/"];

const semBarraNoFim = (pathname: string) => pathname.replace(/\/+$/, "") || "/";

/** A rota abre uma das 2 telas de exclusão (as de destinoDaExclusao): o /perfil?excluir=1 do aluno ou a do painel. */
export function abreAExclusao(pathname: string, search = ""): boolean {
  const caminho = semBarraNoFim(pathname);
  return caminho === ROTA_EXCLUSAO_DO_PAINEL || (caminho === "/perfil" && new URLSearchParams(search).get("excluir") === "1");
}

/**
 * A rota passa pela porta sem o aceite? As páginas públicas (os textos, a pré-consulta, o diário, o cadastro, o link antigo, a
 * calculadora, a página de erro do staging e a entrada) e as 2 telas de exclusão: quem não concorda pode excluir a conta
 * (Política §15). As Boas-vindas, o app, o painel e o master não passam.
 */
export function rotaLivreDoAceite(pathname: string, search = ""): boolean {
  const caminho = semBarraNoFim(pathname);
  if (LIVRES.includes(caminho)) return true;
  if (LIVRES_POR_PREFIXO.some((p) => caminho.startsWith(p))) return true;
  return abreAExclusao(caminho, search);
}

/**
 * hml-12 (H-30): a exclusão está aberta? Abre numa das 2 rotas de exclusão e continua aberta enquanto a pessoa fica no /perfil (ou
 * na exclusão do painel): o Perfil apaga o ?excluir=1 ao abrir (a URL vira /perfil) e a /excluir-conta com login leva até lá, e a
 * folha de exclusão não pode sumir por isso. Saiu para outra rota → fecha, e a porta volta a valer (a PortaDoAceite guarda o estado).
 */
export function exclusaoAberta(antes: boolean, pathname: string, search = ""): boolean {
  if (abreAExclusao(pathname, search)) return true;
  const caminho = semBarraNoFim(pathname);
  return antes && (caminho === "/perfil" || caminho === ROTA_EXCLUSAO_DO_PAINEL);
}

export type OrigemDoAceite = "site" | "apk" | "loja";

/** De onde veio o aceite (gravado com ele, D11): a versão da Google Play, o APK ou o site — a mesma regra do aviso de erro. */
export function origemDoAceite(plataforma: PlataformaDoApp = plataformaAtual()): OrigemDoAceite {
  return plataforma === "loja" ? "loja" : plataforma === "app" ? "apk" : "site";
}

/** A versão do app que vai com o aceite (o banco guarda até 20 caracteres). */
export function versaoDoApp(): string | null {
  return typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__.slice(0, 20) : null;
}

// ───────────────────────── a data de nascimento (o aluno do app: 18+) ─────────────────────────

export type ErroNascimento = "nascimento_invalido" | "menor_de_18";

/** "AAAA-MM-DD" do dia (no fuso do aparelho). */
export function dataDeHoje(hoje: Date = new Date()): string {
  const d = (n: number) => String(n).padStart(2, "0");
  return `${hoje.getFullYear()}-${d(hoje.getMonth() + 1)}-${d(hoje.getDate())}`;
}

/** A idade na data de hoje (o aniversário de 29/02 vira em 01/03, como o age() do banco); data impossível → null. */
export function idadeEm(nascimento: string, hoje: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nascimento);
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  const [ha, hm, hd] = [hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()];
  return ha - ano - (hm < mes || (hm === mes && hd < dia) ? 1 : 0);
}

/**
 * A data do plano sem profissional: vazia, impossível ou fora de 1900-01-01 até hoje → nascimento_invalido; menos de 18 anos →
 * menor_de_18 (P4: o plano do app é só para 18+). O banco confere de novo (aceitar_no_acesso, entrar_sem_profissional e o gatilho).
 */
export function erroDoNascimento(nascimento: string, hoje: Date = new Date()): ErroNascimento | null {
  const idade = idadeEm(nascimento, hoje);
  if (idade === null || nascimento < "1900-01-01" || nascimento > dataDeHoje(hoje)) return "nascimento_invalido";
  return idade < 18 ? "menor_de_18" : null;
}

// ───────────────────────── os erros da tela do aceite ─────────────────────────

/** Os códigos do aceitar_no_acesso (o banco) e os da tela: sem internet, o banco com a versão atrás da do app e o resto. */
export const MENSAGEM_ACEITE: Record<string, string> = {
  sem_login: "Entre de novo para continuar.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste entram.",
  textos_desligados: "Não deu para registrar agora. Tente mais tarde.",
  versao_desatualizada: "Os termos foram atualizados. Recarregue para ler a versão nova.",
  // hml-12 (H-30): no APK e na versão da Google Play, recarregar abre o mesmo pacote (com o texto velho) — só atualizar o app resolve
  atualize_o_app: "Os termos foram atualizados. Atualize o app para continuar.",
  origem_invalida: "Não deu para registrar agora. Tente mais tarde.",
  sem_consentimento_saude: "Marque o consentimento dos seus dados de saúde para continuar.",
  nascimento_invalido: "Confira a sua data de nascimento.",
  menor_de_18:
    "O plano sem profissional é para maiores de 18 anos. Se você tem 16 ou 17 anos, treine com um profissional: peça o código a ele.",
  sem_internet: "Conecte-se à internet para aceitar.",
  erro_interno: "Não deu para registrar agora. Tente mais tarde.",
};

const conhecido = (codigo: string | null | undefined): codigo is string =>
  !!codigo && Object.prototype.hasOwnProperty.call(MENSAGEM_ACEITE, codigo);

export function mensagemAceite(codigo: string | null | undefined): string {
  return conhecido(codigo) ? MENSAGEM_ACEITE[codigo] : MENSAGEM_ACEITE.erro_interno;
}

/**
 * O que a tela faz com a recusa do banco. versao_desatualizada: o banco na frente do app = os textos mudaram → no site, "Recarregue";
 * no APK e na loja, "Atualize o app" (hml-12, H-30: recarregar abriria o mesmo pacote, com o texto velho — um laço). O banco ATRÁS do
 * app = a versão esquecida na virada (ninguém consegue aceitar) → a frase genérica e o aviso de erro ao Weslley (risco 2).
 */
export function tratarRecusa(
  erro: string,
  versaoDoBanco: string | null | undefined,
  versaoDaTela: string = VERSAO_TEXTOS,
  origem: OrigemDoAceite = origemDoAceite(),
): { codigo: string; recarregar: boolean; avisar: boolean } {
  if (erro !== "versao_desatualizada") return { codigo: conhecido(erro) ? erro : "erro_interno", recarregar: false, avisar: false };
  if (versaoDoBanco && versaoDoBanco > versaoDaTela) {
    return origem === "site"
      ? { codigo: "versao_desatualizada", recarregar: true, avisar: false }
      : { codigo: "atualize_o_app", recarregar: false, avisar: false };
  }
  return { codigo: "erro_interno", recarregar: false, avisar: !!versaoDoBanco && versaoDoBanco < versaoDaTela };
}
