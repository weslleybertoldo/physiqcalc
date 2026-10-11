import { useEffect, useRef } from "react";
import { registro, type ItemRegistro, type NomeGrupo } from "./registro";

/**
 * hml-18a (H-40, E) — a PRÉ-CARGA das telas da área (o papel do `usePreloadRoutes` do NutriTrack, Skill-wbs-navegacao §5): depois do
 * 1º render da casca, no tempo ocioso do navegador (`requestIdleCallback`; sem ele, `setTimeout(1500)`), chama o `carregar()` de
 * cada tela registrada da área, UMA POR VEZ — assim a troca de página não espera o pedaço chegar (o esqueleto aparece na hora).
 *
 *   painel  as páginas do menu da conta + as abas do aluno + os cards do Resumo + as abas das Configurações
 *   app     as 5 abas + os itens do Perfil + os cards do Início
 *   master  as páginas do master
 *
 * Não pré-carrega com o "economia de dados" do aparelho (`navigator.connection.saveData`) nem em 2G (`effectiveType` 2g/slow-2g).
 * hml-18b (H-54, F): `aoCarregar` roda quando o pedaço de cada tela chega — a PRÉ-BUSCA da 1ª dobra (src/painel/preBusca.ts).
 * Rota pesada nunca entra (`NAO_PRECARREGAR`): a Dieta e o Prontuário do aluno trazem os gráficos (charts, ~390 KB) — abrem quando a
 * pessoa toca. Os módulos pesados de verdade (pdf, xlsx, motor, heic2any) são `import()` na ação e não são chamados aqui; até a
 * hml-18b, as páginas que ainda importam o pdf no topo o trazem junto, como já trazem ao abrir.
 */
export type AreaPreCarga = "painel" | "app" | "master";

/** Os grupos do registro de cada área, na ordem em que entram na fila. */
export const GRUPOS_DA_AREA: Record<AreaPreCarga, NomeGrupo[]> = {
  painel: ["paginasPainel", "abasAluno", "resumoAluno", "abasConfig"],
  app: ["abasApp", "perfilApp", "inicioApp"],
  master: ["paginasMaster"],
};

/** "<grupo>/<nome>" das rotas pesadas, que só carregam quando a pessoa abre. */
export const NAO_PRECARREGAR: ReadonlySet<string> = new Set(["abasAluno/Dieta", "abasAluno/Prontuario"]);

/** Espera máxima pelo ocioso antes de carregar mesmo assim (o navegador ocupado não segura a fila para sempre). */
const ESPERA_OCIOSO_MS = 3000;
/** Sem requestIdleCallback (Safari): o próximo carrega depois disto. */
const SEM_OCIOSO_MS = 1500;

interface ConexaoDoAparelho {
  saveData?: boolean;
  effectiveType?: string;
}

/** Pode pré-carregar nesta conexão? Não com a economia de dados ligada nem em 2G. */
export function podePreCarregar(nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  const c = (nav as (Navigator & { connection?: ConexaoDoAparelho }) | undefined)?.connection;
  if (!c) return true;
  if (c.saveData) return false;
  return c.effectiveType !== "2g" && c.effectiveType !== "slow-2g";
}

/**
 * A fila da área: os itens dos grupos, na ordem; no painel, das páginas só as do menu da conta (`paginas` = os arquivos, na ordem
 * do menu); sem as pesadas e sem repetir.
 */
export function filaDaPreCarga(area: AreaPreCarga, paginas?: readonly string[] | null, grupos: Partial<Record<NomeGrupo, Record<string, ItemRegistro>>> = registro): ItemRegistro[] {
  const fila: ItemRegistro[] = [];
  const vistos = new Set<string>();
  for (const grupo of GRUPOS_DA_AREA[area]) {
    const itens = grupos[grupo] ?? {};
    const nomes = grupo === "paginasPainel" && paginas ? paginas.filter((n) => n in itens) : Object.keys(itens);
    for (const nome of nomes) {
      const chave = `${grupo}/${nome}`;
      if (NAO_PRECARREGAR.has(chave) || vistos.has(chave)) continue;
      vistos.add(chave);
      fila.push(itens[nome]);
    }
  }
  return fila;
}

type Ocioso = (fn: () => void) => () => void;

/** Agenda no tempo ocioso (com teto); devolve o cancelamento. */
const quandoOcioso: Ocioso = (fn) => {
  if (typeof window.requestIdleCallback === "function") {
    const cancelar = typeof window.cancelIdleCallback === "function" ? window.cancelIdleCallback.bind(window) : null;
    const id = window.requestIdleCallback(() => fn(), { timeout: ESPERA_OCIOSO_MS });
    return () => cancelar?.(id);
  }
  const id = window.setTimeout(fn, SEM_OCIOSO_MS);
  return () => window.clearTimeout(id);
};

/**
 * Liga a pré-carga da área. `ligado` = a casca já mostrou a área (a sessão chegou); `paginas` = os arquivos das páginas do menu da
 * conta (painel). Roda uma vez por área/menu: cada tela entra 1 vez (o import() do navegador guarda o módulo).
 */
export function usePreCarga(
  area: AreaPreCarga,
  { ligado = true, paginas, aoCarregar }: { ligado?: boolean; paginas?: readonly string[] | null; aoCarregar?: (item: ItemRegistro) => void } = {},
): void {
  const chavePaginas = paginas ? paginas.join("|") : "";
  // o mais novo (a sessão/conta pode mudar no meio da fila; a fila não recomeça por isso)
  const aoCarregarRef = useRef(aoCarregar);
  aoCarregarRef.current = aoCarregar;
  useEffect(() => {
    // nos testes (Vitest, MODE "test") a pré-carga não roda: ela importaria as telas de verdade no fundo de qualquer teste que monte a
    // casca (o usePreCarga.test liga com vi.stubEnv). No build, o Vite troca o MODE pelo valor e a linha some.
    if (!ligado || import.meta.env.MODE === "test" || !podePreCarregar()) return;
    const fila = filaDaPreCarga(area, chavePaginas ? chavePaginas.split("|") : null);
    let vivo = true;
    let cancelar: () => void = () => {};
    const proximo = () => {
      const item = fila.shift();
      if (!item || !vivo) return;
      item
        .carregar()
        .then(() => {
          if (vivo) aoCarregarRef.current?.(item);
        })
        .catch(() => undefined) // sem rede agora: a tela carrega quando a pessoa abrir
        .finally(() => {
          if (vivo) cancelar = quandoOcioso(proximo);
        });
    };
    cancelar = quandoOcioso(proximo);
    return () => {
      vivo = false;
      cancelar();
    };
  }, [area, ligado, chavePaginas]);
}

/**
 * hml-18b (H-54, F) — o pedaço da tela que o ENDEREÇO abre começa a baixar no 1º render da casca, junto com a sessão (e não depois dela,
 * como na abertura fria antes). Pronto quando a sessão chega, a tela monta direto (o `telaRegistrada` do registro): sem o esqueleto do
 * Suspense e sem o título da página entrando depois e empurrando o conteúdo (o CLS de 0,08 do Dashboard, medido). Não depende do
 * "economia de dados": é a tela que a pessoa está abrindo. `ligado` = tem sessão (quem vai para a /entrar não baixa nada).
 */
export function useAquecerTelaDoEndereco(itens: readonly (ItemRegistro | undefined)[], ligado: boolean): void {
  const chave = itens.map((i) => i?.caminho ?? "").join("|");
  const itensRef = useRef(itens);
  itensRef.current = itens;
  useEffect(() => {
    if (!ligado || import.meta.env.MODE === "test") return;
    for (const item of itensRef.current) item?.carregar().catch(() => undefined);
  }, [chave, ligado]);
}
