import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Copy, Eye, FileDown, FolderOpen, Pencil, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  alternarFavorita, dadosProfissionais, duplicarReceita, excluirReceita, listarGrupos, listarReceitasPagina, nomeDaNutricionista, nomesParaCopia, type FiltrosReceitas,
  type Receita,
} from "@/nutricao/editor/lib/receitas";
import { FILTRO_SEM_GRUPO, calcularReceita, nomeCopia, resumoReceita, textoContagemReceitas } from "@/nutricao/editor/lib/receitasUtil";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Paginacao } from "@/ui/premium/Paginacao";
import type { ContextoDietas } from "./contexto";
import GruposDialog from "./GruposDialog";
import { AcaoLinha, CampoBusca, ConfirmarExclusao, Filtro } from "./pecas";
import ReceitaDialog from "./ReceitaDialog";
import { CHAVE_GRUPOS_RECEITA, CHAVE_RECEITAS } from "./regras";
import { baixarPDFReceita } from "./receitasPdf";
import VerReceitaDialog from "./VerReceitaDialog";

// Physiq W24 — Painel › Dietas › Receitas (N-17): porta da tela "Receitas culinárias" do PhysiqNutri (src/pages/consultorio/Receitas.tsx)
// no visual premium — as receitas CALCULADAS pelos ingredientes (TACO + os seus): "N receitas · N favoritas", busca sem acento, filtro
// por grupo (todos / sem grupo / cada grupo) e Favoritas (na URL: ?q=&grupo=&fav=1), Nova receita e Grupos; a lista com as favoritas
// primeiro, Ver, PDF (marca PHYSIQ), Editar, Duplicar e Excluir (soft). As receitas são de quem criou (a mesma regra do site antigo e
// do "Da receita" do editor da W16): a lista mostra só as SUAS — também para o master.
// hml-14b (B21): 20 por página, do banco (receitas_da_nutricionista: só as suas, separadas ANTES do corte; busca sem acento, grupo,
// favoritas e as contagens lá), com a página no endereço (?pagina=).

export function Receitas({ ctx, params, setParams, pedidoNovo, aoAtenderPedido }: {
  ctx: ContextoDietas;
  params: URLSearchParams;
  setParams: (p: URLSearchParams, o?: { replace?: boolean }) => void;
  pedidoNovo: boolean;
  aoAtenderPedido: () => void;
}) {
  const { uid } = ctx;
  const qc = useQueryClient();
  const busca = params.get("q") ?? "";
  const grupoFiltro = params.get("grupo") ?? "";
  const soFavoritas = params.get("fav") === "1";
  const [buscaLocal, setBuscaLocal] = useState(busca);
  const filtros = useMemo<FiltrosReceitas>(() => ({ q: busca, grupo: grupoFiltro, favoritas: soFavoritas }), [busca, grupoFiltro, soFavoritas]);

  // hml-14b (B21): a página do banco; filtro novo volta à 1 e a página além do fim (a lista encolheu) vai para a última
  const [totalLido, setTotalLido] = useState<number | null>(null);
  const { pagina, irPara } = usePaginaNaUrl({ filtro: filtros, total: totalLido });
  const receitasQ = useQuery({
    queryKey: [...CHAVE_RECEITAS, "pagina", uid, filtros, pagina],
    queryFn: () => listarReceitasPagina(filtros, pagina),
    enabled: !!uid,
    placeholderData: keepPreviousData,
  });
  const totalDaResposta = receitasQ.data && !receitasQ.isPlaceholderData ? receitasQ.data.total : null;
  useEffect(() => {
    if (totalDaResposta !== null) setTotalLido(totalDaResposta);
  }, [totalDaResposta]);
  const gruposQ = useQuery({ queryKey: [...CHAVE_GRUPOS_RECEITA, uid], queryFn: () => listarGrupos(uid), enabled: !!uid });
  const perfilQ = useQuery({
    queryKey: ["perfil-pdf", uid],
    enabled: !!uid,
    queryFn: async () => {
      const [nome, profissional] = await Promise.all([nomeDaNutricionista(uid), dadosProfissionais(uid)]);
      return { nome, profissional };
    },
  });
  // só as suas (o master lê as de todos pela regra do banco — aqui é o painel dele de profissional): o banco já separa
  const receitas = useMemo(() => receitasQ.data?.itens ?? [], [receitasQ.data]);
  const grupos = useMemo(() => gruposQ.data ?? [], [gruposQ.data]);
  const total = receitasQ.data?.total ?? 0;
  const totalGeral = receitasQ.data?.totalGeral ?? 0;
  const favoritas = receitasQ.data?.favoritas ?? 0;
  const porGrupo = useMemo(() => receitasQ.data?.porGrupo ?? {}, [receitasQ.data]);
  const carregando = receitasQ.isLoading || gruposQ.isLoading;

  const [salvando, setSalvando] = useState(false);
  const [modalReceita, setModalReceita] = useState<{ aberto: boolean; receita: Receita | null }>({ aberto: false, receita: null });
  const [ver, setVer] = useState<{ aberto: boolean; receita: Receita | null }>({ aberto: false, receita: null });
  const [modalGrupos, setModalGrupos] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<Receita | null>(null);

  // o "Nova receita" do topo da página
  useEffect(() => {
    if (!pedidoNovo) return;
    aoAtenderPedido();
    if (ctx.souNutri) setModalReceita({ aberto: true, receita: null });
  }, [pedidoNovo, aoAtenderPedido, ctx.souNutri]);

  const setFiltro = useCallback(
    (mud: { q?: string; grupo?: string; fav?: boolean }) => {
      const q = mud.q ?? busca;
      const g = mud.grupo ?? grupoFiltro;
      const f = mud.fav ?? soFavoritas;
      const novos = new URLSearchParams();
      novos.set("aba", "receitas");
      if (q.trim()) novos.set("q", q.trim());
      if (g) novos.set("grupo", g);
      if (f) novos.set("fav", "1");
      setParams(novos, { replace: true });
    },
    [busca, grupoFiltro, soFavoritas, setParams],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      if (buscaLocal.trim() !== busca) setFiltro({ q: buscaLocal });
    }, 300);
    return () => clearTimeout(t);
  }, [buscaLocal, busca, setFiltro]);

  const nomeDoGrupo = (id: string | null): string | null => (id ? grupos.find((g) => g.id === id)?.nome ?? null : null);

  const invalidar = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: CHAVE_RECEITAS }), qc.invalidateQueries({ queryKey: CHAVE_GRUPOS_RECEITA })]);
  };
  const rodar = async (acao: () => Promise<void>, erroPadrao: string) => {
    setSalvando(true);
    try {
      await acao();
      await invalidar();
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(/row-level security|violates/i.test(m) ? "Só a nutricionista da conta muda as receitas." : m || erroPadrao);
    } finally {
      setSalvando(false);
    }
  };

  const favoritar = (r: Receita) =>
    rodar(async () => {
      await alternarFavorita(r.id, !r.favorita);
      toast.success(r.favorita ? "Favorito removido" : "Receita favoritada");
    }, "Não foi possível favoritar a receita");
  const duplicar = (r: Receita) =>
    rodar(async () => {
      // o "(cópia N)" livre entre TODAS as suas receitas (não só as da página): os nomes parecidos vêm do banco
      const copia = await duplicarReceita(r, nomeCopia(r.nome, await nomesParaCopia(uid, r.nome)));
      toast.success("Receita duplicada", { description: copia.nome });
    }, "Não foi possível duplicar a receita");
  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    await rodar(async () => {
      await excluirReceita(alvo.id);
      setParaExcluir(null);
      toast.success("Receita excluída");
    }, "Não foi possível excluir a receita");
  };
  const pdf = (r: Receita) => {
    try {
      const nome = baixarPDFReceita({
        nutricionista: perfilQ.data?.nome ?? null,
        profissional: perfilQ.data?.profissional ?? null,
        emitidoEm: new Date(),
        receita: {
          nome: r.nome,
          grupo: nomeDoGrupo(r.grupo_id),
          porcoes: Number(r.porcoes),
          rendimento_g: r.rendimento_g === null ? null : Number(r.rendimento_g),
          tempo_preparo_min: r.tempo_preparo_min,
          modo_preparo: r.modo_preparo ?? "",
          observacao: r.observacao ?? "",
          ingredientes: r.ingredientes,
        },
      });
      toast.success("PDF gerado", { description: nome });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };
  const abrirEdicao = (r: Receita) => {
    setVer({ aberto: false, receita: null });
    setModalReceita({ aberto: true, receita: r });
  };
  const erro = receitasQ.error ?? gruposQ.error;

  return (
    <div className="flex flex-col gap-4" data-pagina-receitas data-total-receitas={totalGeral} data-total-filtradas={total} data-total-grupos={grupos.length}
      data-salvando-receitas={salvando ? "1" : "0"} data-carregando={carregando ? "1" : "0"}>
      <Cartao className="p-4">
        <div className="flex flex-wrap items-end gap-2.5">
          <CampoBusca valor={buscaLocal} aoMudar={setBuscaLocal} placeholder="Buscar pelo nome da receita" data-campo-busca-receitas />
          <Filtro largo rotulo="Grupo" value={grupoFiltro} onChange={(e) => setFiltro({ grupo: e.target.value })} data-campo-filtro-grupo>
            <option value="">Todos os grupos</option>
            <option value={FILTRO_SEM_GRUPO}>Sem grupo</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.nome}</option>
            ))}
          </Filtro>
          <button
            type="button"
            aria-pressed={soFavoritas}
            onClick={() => setFiltro({ fav: !soFavoritas })}
            className={cn("pq-chip h-9 px-3.5 text-[12px] normal-case tracking-normal", soFavoritas ? "pq-chip-a" : "pq-chip-g")}
            data-btn-filtro-favoritas
          >
            <Star aria-hidden className={cn("h-3.5 w-3.5", soFavoritas && "fill-[var(--p-ambar)]")} /> Favoritas
          </button>
          {ctx.souNutri && (
            <Botao icone={FolderOpen} onClick={() => setModalGrupos(true)} data-btn-grupos>Grupos{grupos.length ? ` (${grupos.length})` : ""}</Botao>
          )}
        </div>
        <p className="mt-2.5 text-[12px] text-texto-3">
          Cada receita é calculada pelos ingredientes (TACO + os seus alimentos): kcal e macros por porção saem sozinhos. Use no plano com “Da receita”.
          {!ctx.souNutri && " Só a nutricionista da conta cria receitas."}
        </p>
      </Cartao>

      <Cartao className="px-4 pb-1 pt-4">
        <CabecalhoCartao
          titulo={<span data-contagem-receitas={totalGeral} data-contagem-favoritas={favoritas}>{carregando ? "Contando…" : textoContagemReceitas(totalGeral, favoritas)}</span>}
          extra={soFavoritas ? <Chip tom="a">FAVORITAS</Chip> : undefined}
        />
        {erro ? (
          <EstadoErro texto={`Não foi possível carregar as receitas: ${(erro as Error).message}`} aoTentar={() => void invalidar()} className="my-4" />
        ) : carregando ? (
          <EstadoCarregando linhas={3} rotulo="Carregando as receitas" className="pb-3" />
        ) : totalGeral === 0 ? (
          <EstadoVazio
            icone={ChefHat}
            titulo="Nenhuma receita culinária"
            texto="Crie a primeira receita: os ingredientes viram o valor nutricional por porção."
            acao={ctx.souNutri ? <Botao variante="w" onClick={() => setModalReceita({ aberto: true, receita: null })} data-btn-nova-receita-vazio>Nova receita</Botao> : undefined}
            className="my-4"
          />
        ) : total === 0 ? (
          <EstadoVazio icone={Search} titulo="Nenhuma receita com esse filtro" texto="Mude a busca, o grupo ou tire as Favoritas." className="my-4" />
        ) : (
          <ul className="divide-y divide-linha-3" data-lista="receitas" data-lista-receitas>
            {receitas.map((r) => {
              const calc = calcularReceita({ porcoes: Number(r.porcoes), rendimento_g: r.rendimento_g === null ? null : Number(r.rendimento_g) }, r.ingredientes);
              const grupo = nomeDoGrupo(r.grupo_id);
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                  data-item
                  data-receita={r.id}
                  data-favorita={r.favorita ? "1" : "0"}
                  data-receita-grupo={r.grupo_id ?? ""}
                  data-receita-kcal-porcao={calc.porPorcao.energia_kcal}
                  data-receita-kcal-total={calc.totais.energia_kcal}
                  data-receita-porcoes={calc.porcoes}
                  data-receita-ingredientes={r.ingredientes.length}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-[12px] border border-linha transition-colors",
                        r.favorita ? "bg-[rgba(245,158,11,.12)] text-ambar" : "bg-superficie text-texto-3 hover:text-ambar")}
                      onClick={() => void favoritar(r)}
                      disabled={salvando || !ctx.souNutri}
                      aria-pressed={r.favorita}
                      aria-label={r.favorita ? "Tirar dos favoritos" : "Favoritar"}
                      title={r.favorita ? "Tirar dos favoritos" : "Favoritar"}
                      data-btn-favorita-receita
                    >
                      <Star aria-hidden className={cn("h-4 w-4", r.favorita && "fill-[var(--p-ambar)]")} />
                    </button>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-texto">
                        <span data-receita-nome>{r.nome}</span>
                        {grupo && <Chip tom="g" className="h-[20px] px-2 text-[9.5px]" data-receita-grupo-nome>{grupo.toUpperCase()}</Chip>}
                      </p>
                      <p className="mt-0.5 text-[12px] tabular-nums text-texto-3" data-receita-resumo>{resumoReceita(calc)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AcaoLinha icone={Eye} onClick={() => setVer({ aberto: true, receita: r })} data-btn-ver-receita>Ver</AcaoLinha>
                    <AcaoLinha icone={FileDown} onClick={() => pdf(r)} data-btn-pdf-receita>PDF</AcaoLinha>
                    {ctx.souNutri && (
                      <>
                        <AcaoLinha icone={Pencil} onClick={() => abrirEdicao(r)} data-btn-editar-receita>Editar</AcaoLinha>
                        <AcaoLinha icone={Copy} onClick={() => void duplicar(r)} disabled={salvando} data-btn-duplicar-receita>Duplicar</AcaoLinha>
                        <AcaoLinha icone={Trash2} perigo onClick={() => setParaExcluir(r)} disabled={salvando} data-btn-excluir-receita>Excluir</AcaoLinha>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!erro && !carregando && total > 0 && total < totalGeral && (
          <p className="border-t border-linha-3 pt-3 text-center text-[12px] text-texto-4" data-receitas-filtradas>{total} de {totalGeral} receitas</p>
        )}
        {!erro && <Paginacao nome="receitas" pagina={pagina} total={total} aoMudar={irPara} carregando={receitasQ.isFetching} />}
      </Cartao>

      <ReceitaDialog
        open={modalReceita.aberto}
        onOpenChange={(aberto) => setModalReceita((m) => ({ ...m, aberto }))}
        nutricionistaId={uid}
        receita={modalReceita.receita}
        grupos={grupos}
        onSalvo={() => void invalidar()}
        onGrupoCriado={() => void qc.invalidateQueries({ queryKey: CHAVE_GRUPOS_RECEITA })}
      />
      <VerReceitaDialog
        open={ver.aberto}
        onOpenChange={(aberto) => setVer((m) => ({ ...m, aberto }))}
        receita={ver.receita}
        grupoNome={ver.receita ? nomeDoGrupo(ver.receita.grupo_id) : null}
        podeEditar={ctx.souNutri}
        onPdf={pdf}
        onEditar={abrirEdicao}
      />
      <GruposDialog open={modalGrupos} onOpenChange={setModalGrupos} nutricionistaId={uid} grupos={grupos} porGrupo={porGrupo} onMudou={invalidar} />
      <ConfirmarExclusao
        aberto={!!paraExcluir}
        aoMudar={(a) => !a && setParaExcluir(null)}
        titulo="Excluir esta receita?"
        texto={paraExcluir ? `"${paraExcluir.nome}" vai para a lixeira. Os planos alimentares que já usaram os ingredientes dela continuam iguais.` : ""}
        rotulo="Excluir receita"
        ocupado={salvando}
        aoConfirmar={() => void excluir()}
        data-confirmar-excluir-receita
      />
    </div>
  );
}
