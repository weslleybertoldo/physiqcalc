import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, Bookmark, ChefHat, ClipboardList, Dumbbell, FileText, FlaskConical, ListChecks, Pill, Receipt, ScrollText, Search, Star, Target, TestTube, Utensils,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { CampoBusca } from "@/painel/dietas/pecas";
import { useQuemMexe } from "@/painel/treinos/useTreinos";
import { TopoPagina } from "@/ui/casca/topo";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { desfavoritar, listarModelos } from "@/ferramentas/modelos/dados";
import {
  abaInicial, abasVisiveis, chaveDoItem, contarPorTipo, filtrarModelos, fontesDaPessoa, formatarAtualizado, infoTipo, textoContagem, tiposComItens,
  type AbaModelo, type ModeloItem, type TipoModelo,
} from "@/ferramentas/modelos/regras";

const ICONES: Record<TipoModelo, LucideIcon> = {
  treino: Dumbbell,
  anamnese: ClipboardList,
  plano: Utensils,
  orientacao: ScrollText,
  recibo: Receipt,
  documento: FileText,
  meta: Target,
  manipulado: FlaskConical,
  exame: TestTube,
  questionario: ListChecks,
  produto: Pill,
  receita: ChefHat,
};

const CHAVE_MODELOS = ["modelos-favoritos"] as const;

/**
 * Ferramentas › Modelos ★ (W26 — spec 4.6 e N-15; padrão das telas 6 e 8): tudo o que a pessoa marcou com ★ nas outras telas — os
 * modelos de anamnese, orientação, recibo, documento, meta e fórmula, o catálogo de exames, os questionários próprios, os planos
 * alimentares, os produtos e as receitas — em abas por tipo, como o "Meus favoritos" do site antigo do Nutri, mais a aba Treinos (os
 * treinos das pastas do Painel › Treinos). Cada aba conforme o módulo da conta e o papel. Sem tabela nova: editar, PDF, duplicar e excluir
 * continuam na tela de origem; aqui dá para tirar a ★ e abrir a tela dona.
 */
export default function Modelos() {
  const { conta, ehMaster } = useConta();
  const { usuario, treino } = useSessao();
  const quem = useQuemMexe();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [busca, setBusca] = useState(sp.get("q") ?? "");
  const [salvando, setSalvando] = useState(false);
  const uid = usuario?.id ?? "";
  const contaId = conta?.id ?? "";
  const fontes = useMemo(
    () => fontesDaPessoa({ modulos: conta?.modulos ?? [], papeis: conta?.papeis ?? [], master: ehMaster }),
    [conta?.modulos, conta?.papeis, ehMaster],
  );
  // a aba Treinos lê o Banco do Treino com a sessão dele (troca de token): espera ela ficar pronta
  const treinoPronto = !fontes.has("treino") || treino.estado === "pronto" || treino.estado === "erro" || treino.estado === "desnecessario";
  const treinoId = fontes.has("treino") && treino.estado === "pronto" ? quem.meuId : null;
  const pronto = !!uid && !!contaId && treinoPronto;

  const consulta = useQuery({
    queryKey: [...CHAVE_MODELOS, contaId, uid, treinoId ?? "", [...fontes].sort().join(",")],
    queryFn: () => listarModelos({ uid, contaId, treinoId, fontes }),
    enabled: pronto,
    staleTime: 30_000,
    retry: 1,
  });
  const itens = useMemo(() => consulta.data?.itens ?? [], [consulta.data]);
  const erros = consulta.data?.erros ?? {};
  const contagem = useMemo(() => contarPorTipo(itens), [itens]);
  const abas = abasVisiveis(contagem);
  const aba = abaInicial(contagem, sp.get("tipo"));
  const filtrados = useMemo(() => filtrarModelos(itens, busca, aba), [itens, busca, aba]);
  const nTipos = tiposComItens(contagem).length;

  useEffect(() => {
    const t = setTimeout(() => {
      const atual = sp.get("q") ?? "";
      if (busca.trim() === atual) return;
      const n = new URLSearchParams(sp);
      if (busca.trim()) n.set("q", busca.trim());
      else n.delete("q");
      setSp(n, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [busca, sp, setSp]);

  const irPara = (a: AbaModelo) => {
    const n = new URLSearchParams(sp);
    if (a === "todos") n.delete("tipo");
    else n.set("tipo", a);
    setSp(n, { replace: false });
  };

  const tirar = async (i: ModeloItem) => {
    if (salvando) return;
    setSalvando(true);
    try {
      await desfavoritar(i.tipo, i.id);
      // as telas donas têm as próprias chaves de cache (receitas, modelos…): invalida tudo para nenhuma ficar velha
      await qc.invalidateQueries();
      toast.success("Estrela tirada", { description: i.titulo });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível tirar a estrela");
    } finally {
      setSalvando(false);
    }
  };

  if (!conta) {
    return (
      <div data-pagina-modelos data-estado="sem-conta">
        <TopoPagina titulo="Modelos" />
        <EstadoVazio icone={Bookmark} titulo="Nenhuma conta ativa" texto="Os modelos aparecem aqui quando você faz parte de uma conta de profissional." />
      </div>
    );
  }

  const listaErros = Object.entries(erros) as [TipoModelo, string][];
  return (
    <div className="flex flex-col gap-4" data-pagina-modelos data-aba-modelos={aba} data-total-modelos={itens.length} data-total-filtrados={filtrados.length}
      data-total-tipos={nTipos} data-carregando={consulta.isLoading || !pronto ? "1" : "0"} data-salvando={salvando ? "1" : "0"}>
      <TopoPagina titulo="Modelos"
        subtitulo={<span data-subtitulo-modelos>{consulta.isLoading || !pronto ? "Juntando os seus modelos…" : `Tudo o que você marcou com ★ · ${textoContagem(itens.length, nTipos)}`}</span>} />

      <Cartao className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Busque pelo nome do modelo" data-campo-busca-modelos />
        </div>
        {itens.length > 0 && (
          <div role="tablist" aria-label="Tipos de modelo" className="mt-3.5 flex flex-wrap gap-1.5" data-abas-modelos>
            {abas.map((a) => {
              const ativa = a === aba;
              const n = a === "todos" ? itens.length : contagem[a];
              const rotulo = a === "todos" ? "Todos" : infoTipo(a).rotuloPlural;
              const Icone = a === "todos" ? Star : ICONES[a];
              return (
                <button key={a} type="button" role="tab" aria-selected={ativa} onClick={() => irPara(a)} data-aba-modelo={a} data-aba-total={n}
                  className={cn("pq-chip h-8 gap-1.5 px-3 text-[12px] normal-case tracking-normal", ativa ? "pq-chip-t" : "pq-chip-g")}>
                  <Icone aria-hidden className="h-3.5 w-3.5" /> {rotulo} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-2.5 text-[12px] text-texto-3">
          Marque ★ nos modelos, planos, produtos e receitas que você mais usa nas outras telas: eles aparecem aqui. Editar, PDF e excluir continuam na tela de origem.
        </p>
      </Cartao>

      {listaErros.map(([tipo, msg]) => (
        <p key={tipo} role="alert" className="text-[12.5px] font-medium text-rosa-3" data-modelos-erro={tipo}>
          Não foi possível carregar {infoTipo(tipo).rotuloPlural.toLowerCase()}: {msg}
        </p>
      ))}

      <Cartao className="px-4 pb-1 pt-4">
        <CabecalhoCartao titulo={aba === "todos" ? "Todos os modelos" : infoTipo(aba).rotuloPlural} extra={<Chip tom="g">{filtrados.length}</Chip>} />
        {consulta.error ? (
          <EstadoErro texto="Não foi possível juntar os seus modelos." aoTentar={() => void consulta.refetch()} className="my-4" />
        ) : consulta.isLoading || !pronto ? (
          <EstadoCarregando linhas={3} rotulo="Juntando os seus modelos" className="pb-3" />
        ) : itens.length === 0 ? (
          <EstadoVazio icone={Star} titulo="Nenhum modelo ainda" texto="Marque ★ nos modelos, planos, produtos e receitas que você mais usa — eles aparecem aqui." className="my-4" />
        ) : filtrados.length === 0 ? (
          <EstadoVazio icone={Search} titulo="Nenhum modelo com essa busca" texto="Mude a busca ou volte para Todos." className="my-4" />
        ) : (
          <ul className="divide-y divide-linha-3" data-lista-modelos>
            {filtrados.map((i) => {
              const info = infoTipo(i.tipo);
              const Icone = ICONES[i.tipo];
              const rodape = [formatarAtualizado(i.atualizado_em), i.rota ? null : `edite em: ${info.onde}`].filter(Boolean).join(" · ");
              return (
                <li key={chaveDoItem(i)} className="flex flex-wrap items-center justify-between gap-2 py-3" data-modelo={chaveDoItem(i)} data-modelo-tipo={i.tipo}>
                  <div className="flex min-w-0 items-center gap-3">
                    {i.desfavoritavel ? (
                      <button type="button" onClick={() => void tirar(i)} disabled={salvando} aria-label="Tirar a estrela" title="Tirar a estrela" data-btn-desfavoritar
                        className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] border border-linha bg-[rgba(245,158,11,.12)] text-ambar transition-colors hover:bg-superficie disabled:opacity-50">
                        <Star aria-hidden className="h-4 w-4 fill-[var(--p-ambar)]" />
                      </button>
                    ) : (
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] border border-linha bg-[rgba(139,92,246,.12)] text-violeta-3">
                        <Dumbbell aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-texto">
                        <span className="truncate" data-modelo-titulo>{i.titulo}</span>
                        <Chip tom={i.tipo === "treino" ? "t" : i.tipo === "recibo" ? "g" : "n"} icone={Icone} className="h-[20px] px-2 text-[9.5px]" data-modelo-chip={i.tipo}>
                          {info.rotulo.toUpperCase()}
                        </Chip>
                      </p>
                      <p className="mt-0.5 text-[12px] text-texto-3" data-modelo-resumo>{i.resumo}</p>
                      {rodape && <p className="mt-0.5 text-[11.5px] text-texto-4" data-modelo-rodape>{rodape}</p>}
                    </div>
                  </div>
                  {i.rota && (
                    <Link to={i.rota} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-linha-2 px-2.5 text-[12px] font-semibold text-texto-2 transition-colors hover:border-linha hover:text-texto" data-btn-abrir-modelo>
                      Abrir <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
