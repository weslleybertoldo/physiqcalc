import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { chavePlano, usePlano } from "@/nutricao/editor/lib/consultas";
import { ArrowDown, ArrowLeftRight, ArrowUp, ChefHat, ChevronDown, ChevronUp, Copy, FileDown, MoreVertical, Pencil, Plus, Repeat, Star, Trash2, Utensils } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import { fotoDaRefeicao } from "@/ui/premium/fotos";
import { Cartao } from "@/ui/premium/Cartao";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import type { Alimento } from "@/nutricao/editor/lib/alimentos";
import { fmtQtd } from "@/nutricao/editor/lib/alimentosUtil";
import {
  ROTULO_SITUACAO, compararComAlvo, descricaoQuantidade, fmtDiferenca, fmtHorario, fmtKcal, fmtNum, lerSubstitutos, macrosDoItem, ordenarItens, ordenarRefeicoes,
  percentuaisMacros, situacaoAlvo, textoItens, textoRefeicoes, totaisDoPlano, totaisDosItens, type SituacaoAlvo,
} from "@/nutricao/editor/lib/dietaUtil";
import {
  copiarParaSemanaToda, duplicarPlano, excluirItem, excluirPlano, excluirRefeicao, favoritarPlano, salvarOrdemRefeicoes, type Item, type Plano, type PlanoRow,
  type Refeicao, type RefeicaoRow,
} from "@/nutricao/editor/lib/planos";
import {
  DIAS_SEMANA, copiarDiaParaSemana, diaDeHoje, diasDaRefeicaoNova, moverRefeicaoNoDia, refeicoesDoDiaDaSemana, textoDiasRefeicao, variaPorDia,
} from "@/nutricao/editor/lib/semanaPlano";
import { Chip } from "@/ui/premium/Chip";
import BuscaAlimento from "./BuscaAlimento";
import ItemDialog from "./ItemDialog";
import PlanoDialog from "./PlanoDialog";
import ReceitaNoPlanoDialog from "./ReceitaNoPlanoDialog";
import RefeicaoDialog from "./RefeicaoDialog";
import SubstitutosDialog from "./SubstitutosDialog";
import { BTN_PERIGO, BTN_SEC, DESCRICAO_JANELA, JANELA, TITULO_JANELA } from "./estilos";

/** As colunas da tabela da refeição (tela 8); sem mouse (celular), a última cresce pra lixeira caber à vista ao lado das trocas. */
const GRADE_ITENS = "grid-cols-[minmax(0,1fr)_58px_42px_46px_58px] [@media(hover:none)]:grid-cols-[minmax(0,1fr)_54px_38px_42px_74px]";

/** As cores da barra da tela 8 (proteína ciano, carboidrato verde, gordura âmbar, fibras violeta). */
const COR = { p: "#22D3EE", c: "#10B981", g: "#F59E0B", f: "#8B5CF6" } as const;

/** A barra de macros e fibras (NF5): cada pedaço do tamanho das kcal dele (P e C × 4, G × 9, fibras × 2). */
export function BarraMacros({ proteina, carboidrato, gordura, fibras, comPercentual = false }: { proteina: number; carboidrato: number; gordura: number; fibras: number; comPercentual?: boolean }) {
  // H5 (achado 8 do FIM-1b): o % das kcal de cada macro, como o editor do Nutri mostrava ao lado das gramas
  const pct = comPercentual ? percentuaisMacros({ proteina_g: proteina, carboidrato_g: carboidrato, lipidio_g: gordura }) : null;
  const pctDe: Record<string, number | null> = { p: pct?.proteina ?? null, c: pct?.carboidrato ?? null, g: pct?.lipidio ?? null, f: null };
  const partes = [
    { k: "p", rotulo: "Proteína", g: proteina, kcal: proteina * 4 },
    { k: "c", rotulo: "Carboidrato", g: carboidrato, kcal: carboidrato * 4 },
    { k: "g", rotulo: "Gordura", g: gordura, kcal: gordura * 9 },
    { k: "f", rotulo: "Fibras", g: fibras, kcal: fibras * 2 },
  ] as const;
  const total = partes.reduce((s, x) => s + x.kcal, 0);
  return (
    <div data-barra-macros>
      <div className="flex h-[9px] w-full gap-[3px] overflow-hidden rounded-full bg-superficie-2" aria-hidden>
        {total > 0 &&
          partes.map((x) => (
            <span key={x.k} className="h-full rounded-full" style={{ width: `${(x.kcal / total) * 100}%`, background: COR[x.k], minWidth: x.kcal > 0 ? 4 : 0 }} />
          ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-texto-2">
        {partes.map((x) => (
          <span key={x.k} className="inline-flex items-center gap-[5px] whitespace-nowrap" data-macro={x.k} data-macro-g={Math.round(x.g)}>
            <i aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: COR[x.k] }} />
            {x.rotulo} <b className="font-semibold text-texto">{fmtQtd(Math.round(x.g))} g</b>
            {pctDe[x.k] !== null && <span className="text-texto-3 tabular-nums" data-macro-pct={pctDe[x.k]}>· {fmtNum(pctDe[x.k] ?? 0, 0)} %</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Aba de um dia da semana (a mesma da aba de treino da tela 8: branca quando aberta). */
function AbaDia({ rotulo, nome, ativa, aoAbrir, marcado }: { rotulo: string; nome: string; ativa: boolean; aoAbrir: () => void; marcado?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      title={nome}
      onClick={aoAbrir}
      data-dia-aba={rotulo}
      className={cn(
        "relative h-[28px] min-w-[34px] flex-none rounded-[9px] border px-[7px] text-[11.5px] font-semibold tracking-[-0.005em] transition-colors",
        ativa ? "border-[#FAFAFA] bg-[#FAFAFA] text-[#09090B]" : "border-linha bg-[rgba(255,255,255,.04)] text-texto-2 hover:text-texto",
      )}
    >
      {rotulo}
      {marcado && !ativa && <i aria-hidden className="absolute right-1 top-1 h-1 w-1 rounded-full bg-verde" />}
    </button>
  );
}

const COR_SITUACAO: Record<SituacaoAlvo, string> = { sem_alvo: "var(--p-texto-3)", no_alvo: "#10B981", abaixo: "#F59E0B", acima: "#F43F5E" };

/**
 * H5 (achado 8 do FIM-1b): os totais que o editor do Nutri mostrava e a tela 8 não — as kcal do dia × a meta do plano (barra, %, a
 * diferença e abaixo/dentro/acima, com a tolerância de 5 % do Nutri), o sódio e quantos alimentos e refeições. O PDF já tinha tudo.
 */
function TotaisDoDia({ kcal, alvo, sodio, alimentos, refeicoes }: { kcal: number; alvo: number | null | undefined; sodio: number; alimentos: number; refeicoes: number }) {
  const comp = compararComAlvo(kcal, alvo);
  const situacao = situacaoAlvo(comp);
  return (
    <div className="mt-3 flex flex-col gap-2" data-dieta-totais data-situacao-alvo={situacao} data-total-sodio={Math.round(sodio)} data-total-itens={alimentos} data-total-refeicoes={refeicoes}>
      {comp && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1" data-dieta-meta-kcal={Math.round(comp.pct)} data-dieta-diferenca={Math.round(comp.diferenca)}>
          <span className="h-[5px] min-w-[120px] flex-1 overflow-hidden rounded-full bg-superficie-2" role="progressbar" aria-label="Kcal do dia em relação à meta"
            aria-valuenow={Math.round(comp.pct)} aria-valuemin={0} aria-valuemax={100}>
            <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, comp.pct))}%`, background: COR_SITUACAO[situacao] }} />
          </span>
          <span className="text-[11.5px] tabular-nums text-texto-2">
            {fmtNum(comp.pct, 0)} % da meta · {fmtDiferenca(comp.diferenca)} kcal ·{" "}
            <b className="font-semibold" style={{ color: COR_SITUACAO[situacao] }} data-dieta-situacao>{ROTULO_SITUACAO[situacao]}</b>
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Chip tom="g" data-total-sodio-chip>SÓDIO {fmtQtd(Math.round(sodio))} MG</Chip>
        <Chip tom="g">{textoItens(alimentos).toUpperCase()}</Chip>
        <Chip tom="g">{textoRefeicoes(refeicoes).toUpperCase()}</Chip>
      </div>
    </div>
  );
}

export interface EditorDietaProps {
  planoId: string;
  paciente: { id: string; nome: string; objetivo?: string | null };
  nomeNutricionista: string | null;
  /** ver sem mudar (personal responsável, dono sem papel de nutri — spec 4.1) */
  somenteLeitura?: boolean;
  /** cada mudança gravada (a página "Editar treino e dieta" usa para o aviso do aluno) */
  onMudou?: () => void;
  /** o plano saiu (excluído) ou virou outro (duplicado): a tela de fora troca o que mostra */
  onTrocarPlano?: (novoId: string | null) => void;
  /** o plano que o app do aluno mostra (chip "NO APP") */
  noApp?: boolean;
  className?: string;
}

/**
 * Editor do plano alimentar (tela 8, lado direito — spec 4.5 › Dieta, N-38, N-61, NF3, NF5): os dias Seg–Dom (o plano pode mudar
 * por dia; "Copiar pra semana toda" volta a um só), as kcal do dia com a meta, a barra de macros e fibras e as refeições com foto;
 * a refeição aberta mostra a tabela Alimento · Qtde. · kcal · Prot. · Trocas e a busca da tabela TACO e dos alimentos próprios,
 * "Da receita", até 6 substitutos por alimento e o menu ⋮. Grava item a item nas mesmas tabelas do site antigo do Nutri
 * (planos_alimentares → refeicoes → itens_refeicao), que abre o mesmo plano; o app do aluno lê pela minha_dieta (W11).
 */
export function EditorDieta({ planoId, paciente, nomeNutricionista, somenteLeitura = false, onMudou, onTrocarPlano, noApp, className }: EditorDietaProps) {
  const qc = useQueryClient();
  const q = usePlano(planoId);
  const plano = q.data ?? null;
  const [dia, setDia] = useState<number>(() => diaDeHoje());
  const [aberta, setAberta] = useState<string | null>(null);
  const [modalPlano, setModalPlano] = useState(false);
  const [modalRefeicao, setModalRefeicao] = useState<{ aberto: boolean; refeicao: RefeicaoRow | null }>({ aberto: false, refeicao: null });
  const [modalItem, setModalItem] = useState<{ aberto: boolean; refeicao: Refeicao | null; item: Item | null; alimento: Alimento | null }>({ aberto: false, refeicao: null, item: null, alimento: null });
  const [modalSubst, setModalSubst] = useState<{ aberto: boolean; item: Item | null }>({ aberto: false, item: null });
  const [modalReceita, setModalReceita] = useState<Refeicao | null>(null);
  const [confirmar, setConfirmar] = useState<null | { tipo: "refeicao"; refeicao: Refeicao } | { tipo: "item"; refeicaoId: string; item: Item } | { tipo: "semana" } | { tipo: "plano" }>(null);
  const [ocupado, setOcupado] = useState(false);
  const [salvandoOrdem, setSalvandoOrdem] = useState(false);

  const refeicoes = useMemo(() => (plano ? ordenarRefeicoes(plano.refeicoes) : []), [plano]);
  const doDia = useMemo(() => refeicoesDoDiaDaSemana(refeicoes, dia), [refeicoes, dia]);
  const totais = useMemo(() => totaisDoPlano(doDia), [doDia]);
  const varia = variaPorDia(refeicoes);
  const copia = useMemo(() => copiarDiaParaSemana(refeicoes, dia), [refeicoes, dia]);
  const nomeDia = DIAS_SEMANA.find((d) => d.n === dia)?.nome ?? "";

  const trocar = (fn: (p: Plano) => Plano) => {
    qc.setQueryData<Plano | null>(chavePlano(planoId), (p) => (p ? fn(p) : p));
    onMudou?.();
  };
  const trocarRefeicao = (id: string, fn: (r: Refeicao) => Refeicao) => trocar((p) => ({ ...p, refeicoes: p.refeicoes.map((r) => (r.id === id ? fn(r) : r)) }));
  const recarregar = () => qc.invalidateQueries({ queryKey: chavePlano(planoId) });

  const onRefeicaoSalva = (r: Refeicao | RefeicaoRow, modo: "criada" | "editada") => {
    if (modo === "criada") {
      trocar((p) => ({ ...p, refeicoes: [...p.refeicoes, { ...(r as Refeicao), itens: (r as Refeicao).itens ?? [] }] }));
      setAberta(r.id);
    } else trocarRefeicao(r.id, (x) => ({ ...x, ...r, itens: x.itens }));
  };
  const onItemSalvo = (refeicaoId: string, item: Item, modo: "criado" | "editado") =>
    trocarRefeicao(refeicaoId, (r) => ({ ...r, itens: ordenarItens(modo === "criado" ? [...r.itens, item] : r.itens.map((i) => (i.id === item.id ? item : i))) }));
  const onItensDeReceita = (refeicaoId: string, novos: Item[]) => trocarRefeicao(refeicaoId, (r) => ({ ...r, itens: ordenarItens([...r.itens, ...novos]) }));
  const onSubstitutosSalvos = (item: Item) => trocarRefeicao(item.refeicao_id, (r) => ({ ...r, itens: r.itens.map((i) => (i.id === item.id ? item : i)) }));
  const onPlanoEditado = (row: PlanoRow) => trocar((p) => ({ ...p, ...row }));

  /** H5 (N-61): Subir/Descer refeição — troca com a vizinha do dia aberto; grava só as ordens que mudaram; se o banco recusar, volta. */
  const mover = async (id: string, direcao: -1 | 1) => {
    if (!plano) return;
    const ordens = moverRefeicaoNoDia(refeicoes, dia, id, direcao);
    if (!ordens || !ordens.length) return;
    const anterior = plano;
    const nova = new Map(ordens.map((o) => [o.id, o.ordem]));
    trocar((p) => ({ ...p, refeicoes: p.refeicoes.map((r) => (nova.has(r.id) ? { ...r, ordem: nova.get(r.id)! } : r)) }));
    setSalvandoOrdem(true);
    try {
      await salvarOrdemRefeicoes(ordens);
    } catch (e) {
      qc.setQueryData<Plano | null>(chavePlano(planoId), anterior);
      toast.error(e instanceof Error ? e.message : "Não foi possível mudar a ordem");
    } finally {
      setSalvandoOrdem(false);
    }
  };

  const rodar = async (fn: () => Promise<void>, ok: string, erro: string) => {
    setOcupado(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : erro);
    } finally {
      setOcupado(false);
    }
  };

  const confirmarAcao = async () => {
    if (!confirmar || !plano) return;
    const c = confirmar;
    if (c.tipo === "refeicao") {
      await rodar(async () => {
        await excluirRefeicao(c.refeicao.id);
        trocar((p) => ({ ...p, refeicoes: p.refeicoes.filter((r) => r.id !== c.refeicao.id) }));
      }, `Refeição ${c.refeicao.nome} removida`, "Não foi possível remover a refeição");
    } else if (c.tipo === "item") {
      await rodar(async () => {
        await excluirItem(c.item.id);
        trocarRefeicao(c.refeicaoId, (r) => ({ ...r, itens: r.itens.filter((i) => i.id !== c.item.id) }));
      }, "Alimento removido", "Não foi possível remover o alimento");
    } else if (c.tipo === "semana") {
      await rodar(async () => {
        await copiarParaSemanaToda(copia.paraTodosOsDias, copia.paraApagar);
        onMudou?.();
        await recarregar();
      }, `O plano de ${nomeDia.toLowerCase()} vale agora para a semana toda`, "Não foi possível copiar para a semana");
    } else if (c.tipo === "plano") {
      await rodar(async () => {
        await excluirPlano(plano.id);
        onMudou?.();
        onTrocarPlano?.(null);
      }, "Plano excluído (foi para a lixeira)", "Não foi possível excluir o plano");
    }
    setConfirmar(null);
  };

  const pdf = async () => {
    if (!plano) return;
    try {
      const { baixarPDFDieta } = await import("@/nutricao/app/pdf/dietaPdf");
      const nome = await baixarPDFDieta({ aluno: paciente.nome, nutricionista: nomeNutricionista, plano: plano as unknown as PlanoAlimentar });
      toast.success(`PDF gerado: ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  if (q.isLoading) {
    return (
      <Cartao brilho className={cn("flex flex-col gap-3 px-[18px] py-[18px]", className)} data-editor-dieta="carregando">
        <Esqueleto className="h-8 w-3/4" />
        <Esqueleto className="h-10 w-1/2" />
        <Esqueleto className="h-3 w-full" />
        {[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-14 w-full" />)}
      </Cartao>
    );
  }
  if (q.error) return <EstadoErro titulo="Não deu para abrir o plano" texto={q.error instanceof Error ? q.error.message : undefined} aoTentar={() => void q.refetch()} className={className} />;
  if (!plano) {
    return <EstadoVazio icone={Utensils} titulo="Plano não encontrado" texto="Ele pode ter sido excluído ou pertencer a outro aluno." className={className} />;
  }

  const objetivo = paciente.objetivo?.trim();
  return (
    <Cartao brilho className={cn("px-[18px] py-[18px]", className)} data-editor-dieta={plano.id} data-dia={dia} data-varia-por-dia={varia || undefined} data-somente-leitura={somenteLeitura || undefined}>
      {/* cabeçalho: Plano alimentar · Seg … Dom · ⋮ */}
      <div className="mb-3 flex items-start gap-2">
        <h3 className="mt-[4px] flex-none font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">Plano alimentar</h3>
        <div role="tablist" aria-label="Dias da semana" className="pq-sem-barra ml-0.5 flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto" data-dieta-dias>
          {DIAS_SEMANA.map((d) => (
            <AbaDia key={d.n} rotulo={d.curto} nome={d.nome} ativa={d.n === dia} aoAbrir={() => setDia(d.n)} marcado={varia && refeicoes.some((r) => (r.dias_semana ?? []).includes(d.n))} />
          ))}
        </div>
      </div>

      {/* kcal do dia · meta · Copiar pra semana toda */}
      <div className="flex items-end justify-between gap-x-3">
        <div className="min-w-0 truncate" data-dieta-kcal={Math.round(totais.energia_kcal)}>
          <span className="text-[28px] font-semibold leading-none tracking-[-0.03em] text-texto tabular-nums">{fmtKcal(totais.energia_kcal)}</span>
          <span className="ml-1.5 text-[13px] text-texto-3">
            kcal por dia{objetivo ? ` · meta: ${objetivo}` : ""}
          </span>
        </div>
        {!somenteLeitura && (
          <button
            type="button"
            onClick={() => (copia.nadaAFazer ? toast.message("O plano já é igual todos os dias.") : setConfirmar({ tipo: "semana" }))}
            className="mb-0.5 flex-none text-[12.5px] font-semibold text-violeta-3 hover:text-violeta-2"
            data-dieta-copiar-semana
          >
            Copiar pra semana toda
          </button>
        )}
      </div>
      <div className="mb-2.5 mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[11.5px] text-texto-3" data-dieta-titulo>
          {plano.titulo}
          {plano.kcal_alvo ? <span className="text-texto-4"> · alvo {fmtKcal(plano.kcal_alvo)} kcal</span> : null}
          {noApp && <span className="ml-1.5 rounded-[6px] border border-verde/40 px-1.5 py-px text-[10px] font-semibold tracking-[0.04em] text-verde-3">NO APP</span>}
          {plano.favorito && <Star aria-label="Modelo ★" className="ml-1.5 inline h-3 w-3 fill-current text-ambar-3" />}
          {varia && <span className="ml-1.5 text-texto-4">· muda por dia</span>}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Ações do plano" title="Ações do plano" className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-texto-3 hover:text-texto" data-plano-menu>
              <MoreVertical aria-hidden className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-linha-2 bg-tela font-body text-texto" data-plano-menu-itens>
            {!somenteLeitura && (
              <DropdownMenuItem onSelect={() => setModalPlano(true)} className="cursor-pointer" data-plano-titulo-meta>
                <Pencil size={14} className="mr-2" /> Título e meta
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void pdf()} className="cursor-pointer" data-plano-pdf>
              <FileDown size={14} className="mr-2" /> PDF do plano
            </DropdownMenuItem>
            {!somenteLeitura && (
              <>
                <DropdownMenuItem
                  onSelect={() =>
                    void rodar(async () => {
                      const row = await favoritarPlano(plano.id, !plano.favorito);
                      onPlanoEditado(row);
                      await qc.invalidateQueries({ queryKey: ["dieta-planos", paciente.id] });
                    }, plano.favorito ? "Plano tirado dos modelos ★" : "Plano salvo nos modelos ★", "Não foi possível mudar o ★")
                  }
                  className="cursor-pointer"
                  data-plano-favoritar
                >
                  <Star size={14} className={cn("mr-2", plano.favorito && "fill-current")} /> {plano.favorito ? "Tirar dos modelos ★" : "Salvar como modelo ★"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void rodar(async () => {
                      const copiaPlano = await duplicarPlano(plano.nutricionista_id, plano);
                      await qc.invalidateQueries({ queryKey: ["dieta-planos", paciente.id] });
                      onMudou?.();
                      onTrocarPlano?.(copiaPlano.id);
                    }, "Plano duplicado", "Não foi possível duplicar o plano")
                  }
                  className="cursor-pointer"
                  data-plano-duplicar
                >
                  <Copy size={14} className="mr-2" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-linha" />
                <DropdownMenuItem onSelect={() => setConfirmar({ tipo: "plano" })} className="cursor-pointer text-rosa-3 focus:text-rosa-3" data-plano-excluir>
                  <Trash2 size={14} className="mr-2" /> Excluir plano
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <BarraMacros proteina={totais.proteina_g} carboidrato={totais.carboidrato_g} gordura={totais.lipidio_g} fibras={totais.fibra_g} comPercentual />
      <TotaisDoDia kcal={totais.energia_kcal} alvo={plano.kcal_alvo} sodio={totais.sodio_mg} alimentos={totais.itens} refeicoes={doDia.length} />

      {/* refeições do dia */}
      <div className="mt-3" data-dieta-refeicoes={doDia.length} data-salvando-ordem={salvandoOrdem ? "1" : "0"}>
        {doDia.length === 0 && (
          <p className="border-t border-[rgba(255,255,255,.06)] py-5 text-[13px] text-texto-3" data-dieta-sem-refeicao>
            Nenhuma refeição em {nomeDia.toLowerCase()}.
          </p>
        )}
        {doDia.map((r, pos) => {
          const itens = ordenarItens(r.itens);
          const t = totaisDosItens(itens);
          const aberto = aberta === r.id;
          const horario = fmtHorario(r.horario);
          return (
            <div key={r.id} className="border-t border-[rgba(255,255,255,.06)]" data-refeicao={r.id} data-refeicao-nome={r.nome} data-refeicao-kcal={Math.round(t.energia_kcal)} data-refeicao-itens={itens.length} data-refeicao-posicao={pos} data-aberta={aberto || undefined}>
              <div className="flex items-center gap-3 py-2.5">
                <button type="button" onClick={() => setAberta(aberto ? null : r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={aberto} data-refeicao-abrir>
                  <img src={fotoDaRefeicao(r.nome, r.horario)} alt="" className="h-[46px] w-[46px] flex-none rounded-[13px] object-cover" loading="lazy" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] font-semibold tracking-[-0.01em] text-texto">{horario ? `${horario} · ${r.nome}` : r.nome}</b>
                    <span className="mt-0.5 block truncate text-[12px] text-texto-3">
                      {itens.length === 1 ? "1 item" : `${itens.length} itens`}
                      {aberto && !somenteLeitura ? " · editando" : ""}
                      {varia && (r.dias_semana ?? []).length ? ` · ${textoDiasRefeicao(r.dias_semana)}` : ""}
                    </span>
                  </span>
                  <span className="flex-none text-[14px] font-semibold tabular-nums text-texto">{fmtKcal(t.energia_kcal)} kcal</span>
                  {aberto ? <ChevronUp aria-hidden className="h-4 w-4 flex-none text-texto-3" /> : <ChevronDown aria-hidden className="h-4 w-4 flex-none text-texto-3" />}
                </button>
              </div>

              {aberto && (
                <div className="mb-3 rounded-[16px] border border-linha bg-[rgba(255,255,255,.02)] px-3.5 pb-3 pt-2.5" data-refeicao-tabela>
                  <div className={cn("grid items-center gap-2 border-b border-[rgba(255,255,255,.06)] pb-2 text-[10.5px] font-semibold tracking-[0.06em] text-texto-3", GRADE_ITENS)}>
                    <span>ALIMENTO</span>
                    <span>QTDE.</span>
                    <span className="text-right">KCAL</span>
                    <span className="text-right">PROT.</span>
                    <span className="text-right">TROCAS</span>
                  </div>
                  {itens.length === 0 && <p className="py-3 text-[12.5px] text-texto-3" data-refeicao-vazia>Sem alimentos ainda.</p>}
                  {itens.map((i) => {
                    const m = macrosDoItem(i);
                    const subs = lerSubstitutos(i.substitutos);
                    return (
                      <div key={i.id} className={cn("group grid items-center gap-2 border-b border-[rgba(255,255,255,.05)] py-2 last:border-b-0", GRADE_ITENS)} data-item={i.id} data-item-nome={i.alimento?.nome ?? ""} data-item-kcal={Math.round(m.energia_kcal ?? 0)} data-item-substitutos={subs.length}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <button
                            type="button"
                            disabled={somenteLeitura}
                            onClick={() => setModalItem({ aberto: true, refeicao: r, item: i, alimento: null })}
                            className="min-w-0 truncate text-left text-[13.5px] text-texto enabled:hover:text-verde-3"
                            title={i.observacao ? `${i.alimento?.nome ?? ""} — ${i.observacao}` : (i.alimento?.nome ?? "")}
                            data-item-editar
                          >
                            {i.alimento?.nome ?? "Alimento removido"}
                          </button>
                          {i.receita_id && <ChefHat aria-label="Da receita" className="h-3.5 w-3.5 flex-none text-texto-4" />}
                        </span>
                        <span className="truncate text-[12.5px] text-texto-2" title={descricaoQuantidade(i)}>{descricaoQuantidade(i).split(" = ").pop()}</span>
                        <span className="text-right text-[13px] font-semibold tabular-nums text-texto">{fmtQtd(Math.round(m.energia_kcal ?? 0))}</span>
                        <span className="text-right text-[13px] tabular-nums" style={{ color: COR.p }}>{fmtQtd(Math.round(m.proteina_g ?? 0))} g</span>
                        <span className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setModalSubst({ aberto: true, item: i })}
                            disabled={somenteLeitura && subs.length === 0}
                            className="inline-flex h-[26px] items-center gap-1 rounded-[8px] border border-linha bg-[rgba(255,255,255,.04)] px-1.5 text-[11.5px] font-semibold text-texto-2 enabled:hover:text-texto"
                            title={subs.length ? `${subs.length} substituto(s)` : "Substitutos"}
                            data-item-trocas={subs.length}
                          >
                            <ArrowLeftRight aria-hidden className="h-3 w-3" /> {subs.length}
                          </button>
                          {!somenteLeitura && (
                            <button type="button" aria-label={`Remover ${i.alimento?.nome ?? "alimento"}`} title="Remover o alimento" onClick={() => setConfirmar({ tipo: "item", refeicaoId: r.id, item: i })}
                              className="-mr-1 inline-flex h-7 w-7 flex-none items-center justify-center rounded-[8px] text-texto-3 transition-opacity hover:text-rosa-3 focus-visible:opacity-100 [@media(hover:hover)]:text-texto-4 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                              data-item-remover>
                              <Trash2 aria-hidden className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {!somenteLeitura && (
                    <>
                      <div className="mt-2.5" data-refeicao-busca>
                        <BuscaAlimento
                          autoFocus={false}
                          placeholder="Adicionar alimento da tabela TACO ou dos seus"
                          onEscolher={(a) => setModalItem({ aberto: true, refeicao: r, item: null, alimento: a })}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-texto-3">
                        <button type="button" className="inline-flex items-center gap-1.5 hover:text-texto" onClick={() => setModalReceita(r)} title="Os ingredientes de uma receita entram como alimentos desta refeição" data-refeicao-da-receita>
                          <ChefHat aria-hidden className="h-3.5 w-3.5" /> Da receita
                        </button>
                        <button type="button" className="inline-flex items-center gap-1.5 hover:text-texto" onClick={() => setModalRefeicao({ aberto: true, refeicao: r })} title="Nome, horário, dias da semana e observação" data-refeicao-editar>
                          <Pencil aria-hidden className="h-3.5 w-3.5" /> Refeição e dias
                        </button>
                        <button type="button" className="inline-flex items-center gap-1.5 hover:text-texto disabled:opacity-35" onClick={() => void mover(r.id, -1)}
                          disabled={pos === 0 || salvandoOrdem} title="Subir a refeição (antes da anterior)" data-refeicao-subir>
                          <ArrowUp aria-hidden className="h-3.5 w-3.5" /> Subir
                        </button>
                        <button type="button" className="inline-flex items-center gap-1.5 hover:text-texto disabled:opacity-35" onClick={() => void mover(r.id, 1)}
                          disabled={pos === doDia.length - 1 || salvandoOrdem} title="Descer a refeição (depois da próxima)" data-refeicao-descer>
                          <ArrowDown aria-hidden className="h-3.5 w-3.5" /> Descer
                        </button>
                        <button type="button" aria-label={`Remover a refeição ${r.nome}`} title="Remover a refeição" onClick={() => setConfirmar({ tipo: "refeicao", refeicao: r })} className="ml-auto inline-flex items-center gap-1.5 hover:text-rosa-3" data-refeicao-remover>
                          <Trash2 aria-hidden className="h-3.5 w-3.5" /> Remover refeição
                        </button>
                      </div>
                    </>
                  )}
                  {r.observacao?.trim() && <p className="mt-2 text-[12px] text-texto-3" data-refeicao-observacao>{r.observacao}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!somenteLeitura && (
        <button
          type="button"
          onClick={() => setModalRefeicao({ aberto: true, refeicao: null })}
          className="mt-2 flex h-[42px] w-full items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-dashed border-[rgba(16,185,129,.4)] bg-[rgba(16,185,129,.05)] text-[13px] font-semibold text-verde-3 transition-colors hover:bg-[rgba(16,185,129,.1)]"
          data-dieta-adicionar-refeicao
        >
          <Plus aria-hidden className="h-4 w-4" />
          Adicionar refeição{varia ? ` em ${nomeDia.toLowerCase()}` : ""}
        </button>
      )}

      {!somenteLeitura && (
        <>
          <PlanoDialog open={modalPlano} onOpenChange={setModalPlano} pacienteId={paciente.id} ultimoCalculo={null} plano={plano} onEditado={onPlanoEditado} />
          <RefeicaoDialog
            open={modalRefeicao.aberto}
            onOpenChange={(a) => setModalRefeicao((m) => ({ ...m, aberto: a }))}
            planoId={plano.id}
            refeicao={modalRefeicao.refeicao}
            ordem={refeicoes.length ? Math.max(...refeicoes.map((x) => x.ordem)) + 1 : 0}
            diasNovos={diasDaRefeicaoNova(refeicoes, dia)}
            onSalvo={onRefeicaoSalva}
          />
          <ItemDialog
            open={modalItem.aberto}
            onOpenChange={(a) => setModalItem((m) => ({ ...m, aberto: a }))}
            refeicao={modalItem.refeicao ? { id: modalItem.refeicao.id, nome: modalItem.refeicao.nome } : null}
            item={modalItem.item}
            alimentoInicial={modalItem.alimento}
            ordem={modalItem.refeicao ? (modalItem.refeicao.itens.length ? Math.max(...modalItem.refeicao.itens.map((i) => i.ordem)) + 1 : 0) : 0}
            onSalvo={onItemSalvo}
          />
          <ReceitaNoPlanoDialog
            open={!!modalReceita}
            onOpenChange={(a) => !a && setModalReceita(null)}
            refeicao={modalReceita ? { id: modalReceita.id, nome: modalReceita.nome, ordemProxima: modalReceita.itens.length ? Math.max(...modalReceita.itens.map((i) => i.ordem)) + 1 : 0 } : null}
            onInseridos={onItensDeReceita}
          />
        </>
      )}
      <SubstitutosDialog open={modalSubst.aberto} onOpenChange={(a) => setModalSubst((m) => ({ ...m, aberto: a }))} item={modalSubst.item} onSalvo={onSubstitutosSalvos} somenteLeitura={somenteLeitura} />

      <AlertDialog open={!!confirmar} onOpenChange={(a) => !a && setConfirmar(null)}>
        <AlertDialogContent className={JANELA}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>
              {confirmar?.tipo === "refeicao" ? "Remover esta refeição?" : confirmar?.tipo === "item" ? "Remover este alimento?" : confirmar?.tipo === "semana" ? "Copiar pra semana toda?" : "Excluir este plano?"}
            </AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA}>
              {confirmar?.tipo === "refeicao" && <>{confirmar.refeicao.nome} e {textoItens(confirmar.refeicao.itens.length)} dela saem do plano (todos os dias).</>}
              {confirmar?.tipo === "item" && <>{confirmar.item.alimento?.nome ?? "O alimento"} ({descricaoQuantidade(confirmar.item)}) sai da refeição.</>}
              {confirmar?.tipo === "semana" && (
                <>
                  As refeições de {nomeDia.toLowerCase()} passam a valer todos os dias
                  {copia.paraApagar.length ? ` e ${copia.paraApagar.length === 1 ? "1 refeição que era só de outros dias sai" : `${copia.paraApagar.length} refeições que eram só de outros dias saem`} do plano` : ""}.
                </>
              )}
              {confirmar?.tipo === "plano" && <>{plano.titulo} sai do perfil do aluno e vai para a lixeira.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={confirmar?.tipo === "semana" ? "pq-botao pq-botao-w pq-botao-sm" : BTN_PERIGO} disabled={ocupado} onClick={(e) => { e.preventDefault(); void confirmarAcao(); }} data-confirmar-acao-dieta>
              {ocupado ? "..." : confirmar?.tipo === "semana" ? <><Repeat aria-hidden /> Copiar</> : confirmar?.tipo === "plano" ? "Excluir" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Cartao>
  );
}
