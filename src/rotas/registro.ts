import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";

/**
 * Registro por convenção (spec 11.1, regra 2). Cada worktree só cria os arquivos dela nas pastas
 * abaixo e a casca acha sozinha (`import.meta.glob`, resolvido no build) — ninguém edita este arquivo
 * nem as cascas para plugar uma tela nova.
 *
 *   Pasta                                   O que é                                 Quem monta
 *   src/entrada/<Tela>.tsx                  Entrar, EntrarEmail, BoasVindas          rotas /entrar, /entrar/email, /boas-vindas
 *   src/entrada/onboarding/<Opcao>.tsx      opções das Boas-vindas                    a tela BoasVindas (W3) via `registro.onboarding`
 *   src/ui/avisos/<Aviso>.tsx               janelas globais (ex.: "o Physiq mudou")   a casca, em qualquer área logada
 *   src/app-aluno/abas/<Aba>.tsx            Inicio, Treino, Dieta, Evolucao, Perfil   AppAlunoLayout (barra de abas)
 *   src/app-aluno/perfil/<Item>.tsx         Pagamentos, Agenda, Conta, Aparencia…     rotas /perfil/<item>
 *   src/app-aluno/inicio/<Card>.tsx         cards do Início                           a aba Inicio (W12) via `registro.inicioApp`
 *   src/app-aluno/avisos/<Aviso>.tsx        faixas do topo                            AppAlunoLayout, no alto da aba de abertura
 *   src/app-aluno/gates/<Gate>.tsx          travas do app                             AppAlunoLayout, em volta de todas as abas
 *   src/painel/paginas/<Pagina>.tsx         páginas do painel                         PainelLayout (menu em src/painel/menu.ts)
 *   src/painel/aluno/abas/<Aba>.tsx         Treino, Dieta, Avaliacao, Prontuario…     AlunoLayout (6 abas; Resumo é da casca)
 *   src/painel/aluno/resumo/<Card>.tsx      cards do Resumo                           AlunoLayout
 *   src/painel/aluno/kpis/<Kpi>.tsx         números do cabeçalho do aluno             AlunoLayout
 *   src/painel/configuracoes/<Aba>.tsx      Perfil, Conta, Equipe, Plano…             ConfiguracoesLayout
 *   src/painel/gates/<Gate>.tsx             travas e faixas do painel                 PainelLayout
 *   src/master/paginas/<Pagina>.tsx         páginas do master                         MasterLayout
 *   src/publico/<Pagina>.tsx                páginas sem login (/f, /d, /c, /p…)       PublicoLayout
 *
 * Extensões da W1 (mesma ideia, para não precisar editar a casca depois):
 *   src/painel/contadores/<Item>.ts         `export default function useContador(): number | undefined` — número no item do menu
 *   src/painel/busca/<Fonte>.tsx            `export default function Fonte({ termo, fechar })` — grupos da busca Ctrl K (use GrupoBusca/ItemBusca)
 *   src/painel/aluno/Cabecalho.tsx          substitui o cabeçalho padrão do perfil do aluno (recebe { alunoId })
 *   src/painel/aluno/Editores.tsx           página "Editar treino e dieta" (/painel/alunos/:id/editar)
 *   src/nucleo/casca.ts                     `export function useDadosCasca(): DadosCasca` — dados da conta/sessão (W3; desde a
 *                                           W28 o src/ui/casca/dadosCasca.ts reexporta direto — o padrão da W1 saiu)
 *
 * Contratos: telas, abas, cards, KPIs e avisos exportam `default` um componente. Travas (gates)
 * exportam `default function Gate({ children })` e devolvem `children` (libera), outra coisa (trava)
 * ou `<>{faixa}{children}</>` (faixa). Arquivos de teste (`*.test.tsx`) e os que começam com "_" são
 * ignorados; peças auxiliares ficam em subpastas.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as telas registradas têm props próprias
export type ComponenteQualquer = ComponentType<any>;
export type Carregador = () => Promise<{ default: ComponenteQualquer }>;

export interface ItemRegistro {
  /** Nome do arquivo sem extensão ("Treino", "PreConsulta"). */
  nome: string;
  caminho: string;
  carregar: Carregador;
  Componente: LazyExoticComponent<ComponenteQualquer>;
}

export type Grupo = Record<string, ItemRegistro>;

/** "/src/app-aluno/abas/Treino.tsx" → "Treino" */
export function nomeDoArquivo(caminho: string): string {
  const base = caminho.split("/").pop() ?? caminho;
  return base.replace(/\.(tsx|ts)$/, "");
}

/** Monta o grupo a partir do mapa do `import.meta.glob` (preguiçoso). */
export function montarGrupo(mapa: Record<string, () => Promise<unknown>>): Grupo {
  const grupo: Grupo = {};
  for (const [caminho, carregar] of Object.entries(mapa)) {
    const nome = nomeDoArquivo(caminho);
    if (nome.startsWith("_") || /\.(test|spec)$/.test(nome)) continue;
    const c = carregar as Carregador;
    grupo[nome] = { nome, caminho, carregar: c, Componente: lazy(c) };
  }
  return grupo;
}

/** Itens do grupo na ordem conhecida (a da spec); os desconhecidos vão para o fim, em ordem alfabética. */
export function ordenar<T extends { nome: string }>(itens: T[], ordemConhecida: readonly string[] = []): T[] {
  const pos = (n: string) => {
    const i = ordemConhecida.indexOf(n);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...itens].sort((a, b) => pos(a.nome) - pos(b.nome) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** "PreConsulta" → "pre-consulta"; "Pagamentos" → "pagamentos" */
export function slug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export const registro = {
  entrada: montarGrupo(import.meta.glob(["/src/entrada/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  onboarding: montarGrupo(import.meta.glob(["/src/entrada/onboarding/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  avisosGlobais: montarGrupo(import.meta.glob(["/src/ui/avisos/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  abasApp: montarGrupo(import.meta.glob(["/src/app-aluno/abas/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  perfilApp: montarGrupo(import.meta.glob(["/src/app-aluno/perfil/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  inicioApp: montarGrupo(import.meta.glob(["/src/app-aluno/inicio/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  avisosApp: montarGrupo(import.meta.glob(["/src/app-aluno/avisos/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  paginasPainel: montarGrupo(import.meta.glob(["/src/painel/paginas/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  abasAluno: montarGrupo(import.meta.glob(["/src/painel/aluno/abas/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  resumoAluno: montarGrupo(import.meta.glob(["/src/painel/aluno/resumo/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  kpisAluno: montarGrupo(import.meta.glob(["/src/painel/aluno/kpis/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  abasConfig: montarGrupo(import.meta.glob(["/src/painel/configuracoes/*.tsx", "!/src/painel/configuracoes/ConfiguracoesLayout.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  // hml-08 (H-22): o master é só do site — no build do app (VITE_APP_NATIVO=1) as páginas dele nem entram no bundle
  // (src/lib/plataforma.ts; a expressão fica aqui, direto na condição, para o Rollup cortar o glob)
  paginasMaster: import.meta.env.VITE_APP_NATIVO === "1" ? ({} as Grupo) : montarGrupo(import.meta.glob(["/src/master/paginas/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  // hml-10 (D5): a página de teste das telas de erro (ErroDeTeste.tsx) fica de fora — o glob a poria em /erro-de-teste em todo build,
  // produção inclusive; a rota /erro-teste é do Rotas.tsx, só no build de staging
  publico: montarGrupo(import.meta.glob(["/src/publico/*.tsx", "!/src/publico/PublicoLayout.tsx", "!/src/publico/ErroDeTeste.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"])),
  cabecalhoAluno: montarGrupo(import.meta.glob(["/src/painel/aluno/Cabecalho.tsx"])),
  editoresAluno: montarGrupo(import.meta.glob(["/src/painel/aluno/Editores.tsx"])),
};

export type NomeGrupo = keyof typeof registro;

/** Componente registrado (ou null se a worktree dele ainda não entrou). */
export function tela(grupo: NomeGrupo, nome: string): LazyExoticComponent<ComponenteQualquer> | null {
  return registro[grupo][nome]?.Componente ?? null;
}

export function existe(grupo: NomeGrupo, nome: string): boolean {
  return Boolean(registro[grupo][nome]);
}

/** Itens do grupo, ordenados. */
export function listar(grupo: NomeGrupo, ordemConhecida: readonly string[] = []): ItemRegistro[] {
  return ordenar(Object.values(registro[grupo]), ordemConhecida);
}

// ───────────────────────── travas (carregadas junto: decidem antes de a tela aparecer) ─────────────────────────

export type Gate = ComponentType<{ children: ReactNode }>;

function montarGates(mapa: Record<string, unknown>): { nome: string; Gate: Gate }[] {
  return ordenar(
    Object.entries(mapa)
      .map(([caminho, mod]) => ({ nome: nomeDoArquivo(caminho), Gate: (mod as { default?: Gate }).default }))
      .filter((g): g is { nome: string; Gate: Gate } => Boolean(g.Gate) && !g.nome.startsWith("_") && !/\.(test|spec)$/.test(g.nome)),
    // ordem: bloqueios de acesso primeiro, depois cobrança e faixas
    ["GateBloqueioMaster", "GateBloqueioAluno", "GateAcessoApp", "GateSemModulo", "GatePlano", "GatePagamentoPendente", "FaixaAvisoPlano"],
  );
}

export const gatesApp = montarGates(import.meta.glob(["/src/app-aluno/gates/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"], { eager: true }));
export const gatesPainel = montarGates(import.meta.glob(["/src/painel/gates/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"], { eager: true }));

// ───────────────────────── contadores do menu e fontes da busca (pequenos: carregados junto) ─────────────────────────

export type UseContador = () => number | undefined;
export type FonteBusca = ComponentType<{ termo: string; fechar: () => void }>;

function montarPadrao<T>(mapa: Record<string, unknown>): Record<string, T> {
  const saida: Record<string, T> = {};
  for (const [caminho, mod] of Object.entries(mapa)) {
    const nome = nomeDoArquivo(caminho);
    const valor = (mod as { default?: T }).default;
    if (valor && !nome.startsWith("_") && !/\.(test|spec)$/.test(nome)) saida[nome] = valor;
  }
  return saida;
}

export const contadoresPainel = montarPadrao<UseContador>(import.meta.glob(["/src/painel/contadores/*.ts", "!/src/**/*.test.ts"], { eager: true }));
export const fontesBusca = montarPadrao<FonteBusca>(import.meta.glob(["/src/painel/busca/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.spec.tsx"], { eager: true }));

// ───────────────────────── rotas por convenção ─────────────────────────

/** Rotas das telas de entrada (spec 4.8). Nome desconhecido → /entrar/<slug>. */
export const ROTAS_ENTRADA: Record<string, string> = {
  Entrar: "/entrar",
  EntrarEmail: "/entrar/email",
  BoasVindas: "/boas-vindas",
};

/** Rotas das páginas públicas (spec 4.8). Nome desconhecido → /<slug>. */
export const ROTAS_PUBLICAS: Record<string, string[]> = {
  Formulario: ["/f/:slug"],
  Diario: ["/d/:codigo"],
  Cadastro: ["/c/:codigo"],
  LinkAntigo: ["/p/:codigo"],
  Calculadora: ["/calculator"],
  Privacidade: ["/privacidade", "/termos"],
};

export function rotasDaEntrada(nome: string): string {
  return ROTAS_ENTRADA[nome] ?? `/entrar/${slug(nome)}`;
}

export function rotasDaPaginaPublica(nome: string): string[] {
  return ROTAS_PUBLICAS[nome] ?? [`/${slug(nome)}`];
}
