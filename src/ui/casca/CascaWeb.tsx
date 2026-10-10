import { useCallback, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { Ellipsis, Menu, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/premium/Avatar";
import { BotaoIcone } from "@/ui/premium/Botao";
import { useAtalhoBusca, useTermoDaBusca } from "@/ui/premium/atalhos";
import { BuscaGatilho, GrupoBusca, ItemBusca, PaletaBusca } from "@/ui/premium/Busca";
import { Marca } from "@/ui/premium/Marca";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { Sino } from "@/ui/premium/Sino";
import { RESERVA_TABBAR, TabBar } from "@/ui/premium/TabBar";
import { BlocoTitulo } from "./topo";
import { depoisDaPintura } from "./depoisDaPintura";
import { TopoCtx } from "./topoContexto";
import { LimiteDeErro } from "./LimiteDeErro";
import type { Modulo } from "./dadosCasca";

export interface ItemNav {
  id: string;
  rotulo: string;
  icone: LucideIcon;
  para: string;
  ativo: boolean;
  contador?: number;
  /** "destaque" = número em violeta (precisa de atenção, ex.: envios com falha). */
  contadorTom?: "neutro" | "destaque";
  /** Ponto colorido do módulo (Treinos violeta, Dietas verde — tela 6). */
  ponto?: Modulo;
  /** Entra na barra de baixo do celular (as primeiras 4 marcadas). */
  noCelular?: boolean;
}

export interface SecaoNav {
  titulo?: string;
  itens: ItemNav[];
}

export interface AcaoUsuario {
  id: string;
  rotulo: string;
  icone: LucideIcon;
  aoTocar: () => void;
  perigo?: boolean;
}

export interface UsuarioCasca {
  nome: string;
  fotoUrl: string | null;
  papelRotulo: string;
}

const COR_PONTO: Record<Modulo, string> = { treino: "var(--p-violeta)", nutricao: "var(--p-verde)" };

/** O toque num item do menu: recebe o clique e o destino (a folha "Mais" fecha e troca de página depois da pintura). */
type AoNavegar = (e: MouseEvent<HTMLAnchorElement>, para: string) => void;

function ItemMenu({ item, aoNavegar }: { item: ItemNav; aoNavegar?: AoNavegar }) {
  const Icone = item.icone;
  return (
    <Link
      to={item.para}
      onClick={aoNavegar ? (e) => aoNavegar(e, item.para) : undefined}
      data-nav={item.para}
      aria-current={item.ativo ? "page" : undefined}
      className={cn(
        "flex h-[38px] items-center gap-[11px] rounded-[11px] px-2.5 text-[13.5px] font-medium transition-colors",
        item.ativo ? "bg-superficie-2 text-texto shadow-[inset_0_1px_0_rgba(255,255,255,.06)]" : "text-texto-2 hover:bg-superficie hover:text-texto",
      )}
    >
      <Icone aria-hidden className="h-[18px] w-[18px] flex-none" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{item.rotulo}</span>
      {item.contador ? (
        <span
          data-contador
          className={cn(
            "ml-auto flex h-5 min-w-[22px] flex-none items-center justify-center rounded-[10px] px-[7px] text-[11px] font-semibold tabular-nums",
            item.contadorTom === "destaque" ? "bg-violeta text-white" : "bg-superficie-2 text-suave",
          )}
        >
          {item.contador > 999 ? "999+" : item.contador}
        </span>
      ) : item.ponto ? (
        <span aria-hidden className="ml-auto h-[7px] w-[7px] flex-none rounded-full" style={{ background: COR_PONTO[item.ponto], boxShadow: `0 0 8px ${COR_PONTO[item.ponto]}` }} />
      ) : null}
    </Link>
  );
}

function MenuUsuario({ usuario, acoes, lista }: { usuario: UsuarioCasca; acoes: AcaoUsuario[]; lista?: boolean }) {
  const cabeca = (
    <>
      <Avatar src={usuario.fotoUrl} nome={usuario.nome} tamanho={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-texto">{usuario.nome || "Sua conta"}</div>
        <div className="truncate text-[11.5px] font-medium text-texto-2">{usuario.papelRotulo}</div>
      </div>
    </>
  );
  if (lista) {
    return (
      <div className="mt-3 border-t border-linha pt-3" data-menu-usuario>
        <div className="flex items-center gap-2.5 p-1.5">{cabeca}</div>
        <div className="mt-1 flex flex-col gap-0.5">
          {acoes.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={a.aoTocar}
              data-acao-usuario={a.id}
              className={cn("flex h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-[13.5px] font-medium hover:bg-superficie", a.perigo ? "text-rosa-3" : "text-texto")}
            >
              <a.icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-2.5 p-1.5" data-menu-usuario>
      {cabeca}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label="Menu do usuário" data-menu-usuario-botao className="rounded-lg p-1.5 text-texto-3 transition-colors hover:bg-superficie hover:text-texto">
            <Ellipsis aria-hidden className="h-[18px] w-[18px]" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="end"
            sideOffset={8}
            // hml-18a (H-40, D): o menu sai como entra (fade + zoom-95, 150 ms, a partir do botão) — antes sumia seco
            className="z-50 min-w-[220px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-2xl border border-linha-2 bg-tela p-1.5 text-texto shadow-[0_24px_60px_-20px_rgba(0,0,0,.85)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          >
            {acoes.map((a) => (
              <DropdownMenu.Item
                key={a.id}
                onSelect={a.aoTocar}
                data-acao-usuario={a.id}
                className={cn(
                  "flex h-10 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] font-medium outline-none data-[highlighted]:bg-superficie-2",
                  a.perigo ? "text-rosa-3" : "text-texto",
                )}
              >
                <a.icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                {a.rotulo}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function ConteudoMenu({
  secoes,
  topoMenu,
  rodapeMenu,
  usuario,
  acoesUsuario,
  aoNavegar,
  celular,
}: {
  secoes: SecaoNav[];
  topoMenu?: ReactNode;
  rodapeMenu?: ReactNode;
  usuario: UsuarioCasca;
  acoesUsuario: AcaoUsuario[];
  aoNavegar?: AoNavegar;
  celular?: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col">
      {!celular && (
        <Link to="/" className="px-1.5" aria-label="Physiq — início">
          <Marca />
        </Link>
      )}
      {topoMenu && <div className={celular ? "mb-2" : "mb-3.5 mt-[18px]"}>{topoMenu}</div>}
      {secoes.map((s, i) =>
        s.itens.length === 0 ? null : (
          <div key={s.titulo ?? i}>
            {s.titulo && <div className="px-2.5 pb-1.5 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-texto-4">{s.titulo}</div>}
            <nav className="flex flex-col gap-0.5" aria-label={s.titulo ?? "Menu"}>
              {s.itens.map((it) => (
                <ItemMenu key={it.id} item={it} aoNavegar={aoNavegar} />
              ))}
            </nav>
          </div>
        ),
      )}
      <div className="mt-auto pt-5">{rodapeMenu}</div>
      <MenuUsuario usuario={usuario} acoes={acoesUsuario} lista={celular} />
    </div>
  );
}

/**
 * Casca do site (telas 6–8): menu lateral com a marca, card da conta, itens com contadores e pontos
 * dos módulos, grupo FERRAMENTAS, card do plano e o usuário com o menu; no topo, título/trilha, busca
 * (Ctrl K), sino e o botão da página. Em tela pequena o menu vira a barra de baixo + "Mais".
 */
export function CascaWeb({
  area,
  secoes,
  topoMenu,
  rodapeMenu,
  usuario,
  acoesUsuario,
  tituloPadrao,
  fontesBusca,
  children,
}: {
  area: "painel" | "master";
  secoes: SecaoNav[];
  topoMenu?: ReactNode;
  rodapeMenu?: ReactNode;
  usuario: UsuarioCasca;
  acoesUsuario: AcaoUsuario[];
  tituloPadrao: string;
  /** Grupos extras da busca (páginas que buscam alunos, treinos, alimentos…). */
  fontesBusca?: (termo: string, fechar: () => void) => ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [alvoTitulo, setAlvoTitulo] = useState<HTMLElement | null>(null);
  const [alvoAcoes, setAlvoAcoes] = useState<HTMLElement | null>(null);
  const [proprio, setProprio] = useState(false);
  const ctx = useMemo(() => ({ alvoTitulo, alvoAcoes, definirProprio: setProprio }), [alvoTitulo, alvoAcoes]);
  const [buscaAberta, setBuscaAberta] = useState(false);
  // hml-18a (H-40, D): o termo só volta a "" depois da saída da janela (a lista não pisca vazia enquanto ela esmaece)
  const [termo, setTermo] = useTermoDaBusca(buscaAberta);
  const [maisAberto, setMaisAberto] = useState(false);
  const abrirBusca = useCallback(() => setBuscaAberta(true), []);
  useAtalhoBusca(abrirBusca);

  const todos = secoes.flatMap((s) => s.itens);
  const candidatos = todos.filter((i) => i.noCelular);
  const primeiros = candidatos.slice(0, 4);
  const ativo = todos.find((i) => i.ativo);
  // o item aberto sempre aparece na barra (troca o 4º quando precisa)
  const barra = ativo && !primeiros.includes(ativo) && candidatos.includes(ativo) ? [...primeiros.slice(0, 3), ativo] : primeiros;
  const maisAtivo = Boolean(ativo && !barra.includes(ativo));

  const fecharBusca = () => setBuscaAberta(false);
  // hml-18a (H-40, E): o toque num item da folha "Mais" fecha a folha no próprio toque (a 1ª mudança na tela) e só troca de página
  // depois da pintura — no mesmo toque, o render da página nova (ex.: a Agenda, ~100 ms) segurava até a folha começar a fechar.
  // Com tecla (Ctrl/⌘/Shift/Alt) ou outro botão, o Link segue sozinho (nova aba/janela).
  const navegarDaFolha: AoNavegar = (e, para) => {
    setMaisAberto(false);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const aqui = `${window.location.pathname}${window.location.search}` === para; // como o Link: a mesma página substitui
    depoisDaPintura(() => navigate(para, { replace: aqui }));
  };

  return (
    <TopoCtx.Provider value={ctx}>
      <div data-casca={area} className="relative isolate min-h-screen text-texto lg:grid lg:grid-cols-[262px_minmax(0,1fr)]">
        <div aria-hidden className="pq-halo-web pointer-events-none fixed inset-0 -z-10" />

        <aside
          data-menu-lateral
          className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-linha px-4 pb-[18px] pt-[22px] lg:flex"
          style={{ background: "var(--p-menu-lateral)" }}
        >
          <ConteudoMenu secoes={secoes} topoMenu={topoMenu} rodapeMenu={rodapeMenu} usuario={usuario} acoesUsuario={acoesUsuario} />
        </aside>

        <div className="flex min-w-0 flex-col">
          <header
            data-topo
            className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-linha bg-[var(--p-vidro)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top,0px))] backdrop-blur-xl lg:static lg:border-0 lg:bg-transparent lg:px-[30px] lg:pb-0 lg:pt-[26px] lg:backdrop-blur-none"
          >
            <Link to="/" className="flex-none lg:hidden" aria-label="Physiq — início">
              <Marca tamanho={30} soIcone />
            </Link>
            <div className="min-w-0 flex-1">
              <div ref={setAlvoTitulo} className="min-w-0 empty:hidden" />
              {!proprio && <BlocoTitulo titulo={tituloPadrao} />}
            </div>
            <BuscaGatilho className="hidden md:flex" aoAbrir={abrirBusca} />
            <BotaoIcone className="md:hidden" icone={Search} rotulo="Buscar" onClick={abrirBusca} />
            <Sino />
            {/* hml-18a (H-40): no celular os botões da página descem para uma 2ª linha do topo, com o texto (antes empurravam a
                página para fora da tela e o título sumia) */}
            <div
              ref={setAlvoAcoes}
              className="flex min-w-0 flex-none items-center gap-2.5 empty:hidden max-lg:order-last max-lg:basis-full max-lg:flex-wrap max-lg:justify-end"
              data-acoes-topo
            />
          </header>

          <main
            data-conteudo
            className="min-w-0 flex-1 px-4 pb-[var(--reserva-baixo)] pt-4 lg:px-[30px] lg:pb-[30px] lg:pt-[22px]"
            style={{ "--reserva-baixo": RESERVA_TABBAR } as CSSProperties}
          >
            <LimiteDeErro nome={`casca ${area}`}>{children}</LimiteDeErro>
          </main>
        </div>

        <TabBar
          className="lg:hidden"
          rotulo="Menu do painel"
          itens={[
            ...barra.map((i) => ({ id: i.id, rotulo: i.rotulo, icone: i.icone, para: i.para, ativo: i.ativo })),
            { id: "mais", rotulo: "Mais", icone: Menu, aoTocar: () => setMaisAberto(true), ativo: maisAtivo || maisAberto },
          ]}
        />

        <PainelDeslizante aberto={maisAberto} aoMudar={setMaisAberto} titulo="Menu" lado="baixo">
          <ConteudoMenu
            celular
            secoes={secoes}
            topoMenu={topoMenu}
            rodapeMenu={rodapeMenu}
            usuario={usuario}
            acoesUsuario={acoesUsuario.map((a) => ({ ...a, aoTocar: () => { setMaisAberto(false); a.aoTocar(); } }))}
            aoNavegar={navegarDaFolha}
          />
        </PainelDeslizante>

        <PaletaBusca aberto={buscaAberta} aoMudar={(v) => (v ? setBuscaAberta(true) : fecharBusca())} termo={termo} aoMudarTermo={setTermo}>
          <GrupoBusca titulo="Ir para">
            {todos.map((i) => (
              // a busca também: começa a fechar na escolha e a página nova vem depois da pintura (como a folha "Mais")
              <ItemBusca key={i.id} icone={i.icone} rotulo={i.rotulo} aoEscolher={() => { fecharBusca(); depoisDaPintura(() => navigate(i.para)); }} />
            ))}
          </GrupoBusca>
          {fontesBusca?.(termo, fecharBusca)}
          <GrupoBusca titulo="Conta">
            {acoesUsuario.map((a) => (
              <ItemBusca key={a.id} icone={a.icone} rotulo={a.rotulo} aoEscolher={() => { fecharBusca(); a.aoTocar(); }} />
            ))}
          </GrupoBusca>
        </PaletaBusca>
      </div>
    </TopoCtx.Provider>
  );
}
