import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Apple, ChevronDown, ChevronUp, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePaginado } from "@/components/ListaPaginada";
import { cn } from "@/lib/utils";
import { listarGrupos, type Alimento, type GrupoAlimentos } from "@/nutricao/editor/lib/alimentos";
import {
  FILTROS_PADRAO, FONTES, MACROS, TACO_DESCRICAO, etiquetaAlimento, filtrosAtivos, fmtComUnidade, fmtQtd, inserirOrdenado, macrosPorGramas, nutrientesListados,
  porGramas, resumoMacros, rotuloMedida, textoTotal, type FiltroFonte, type FiltrosAlimentos,
} from "@/nutricao/editor/lib/alimentosUtil";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import AlimentoDialog from "./AlimentoDialog";
import { alimentoEhMeu, excluirAlimentoDoPainel, listarAlimentosDoPainel } from "./alimentosPainel";
import type { ContextoDietas } from "./contexto";
import { AcaoLinha, CampoBusca, ConfirmarExclusao, Filtro, VerMais } from "./pecas";

// Physiq W24 — Painel › Dietas › Alimentos (N-16): porta da tela "Meus alimentos" do PhysiqNutri (src/pages/consultorio/Alimentos.tsx)
// no visual premium — a base pública TACO (597 itens, só leitura) + os alimentos próprios (marca e medidas caseiras): busca pelo nome
// (sem acento, inclui a marca), filtros de fonte e grupo, total, lista de 20 com "Ver mais", Ver (por 100 g, demais nutrientes, porção
// de referência e medidas caseiras com os macros de cada uma) e cadastrar/editar/excluir SÓ os seus (a TACO nem mostra os botões).

/** Etiqueta do alimento: a MARCA quando é próprio e tem marca, senão a fonte (TACO / Meu alimento). */
function Etiqueta({ a }: { a: { fonte: string; marca: string | null } }) {
  const marca = a.fonte === "proprio" ? (a.marca ?? "").trim() : "";
  return (
    <Chip tom={a.fonte === "proprio" ? "n" : "g"} className="h-[20px] px-2 text-[9.5px]" data-alimento-fonte={a.fonte} data-alimento-marca={marca || undefined}
      title={marca ? `Marca: ${marca} — alimento cadastrado por você` : undefined}>
      {etiquetaAlimento(a).toUpperCase()}
    </Chip>
  );
}

const Bloco = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <div>
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-3">{titulo}</p>
    <dl className="grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">{children}</dl>
  </div>
);
const Par = ({ rotulo, valor }: { rotulo: string; valor: string }) => (
  <div className="flex justify-between gap-2 border-b border-dotted border-linha-2 pb-1 text-[12.5px]">
    <dt className="text-texto-3">{rotulo}</dt>
    <dd className="text-right tabular-nums text-texto">{valor}</dd>
  </div>
);

/** "Ver": por 100 g, demais nutrientes, porção de referência (só quando ≠ 100 g) e medidas caseiras com os macros de cada uma. */
function Detalhe({ a, meu }: { a: Alimento; meu: boolean }) {
  const nutrientes = nutrientesListados(a.nutrientes);
  const naPorcao = macrosPorGramas(a, a.porcao_g);
  const porcaoDiferente = Number(a.porcao_g) !== 100;
  return (
    <div className="mt-3 flex flex-col gap-4 rounded-[16px] border border-linha bg-superficie p-4" data-alimento-detalhe>
      <Bloco titulo="Por 100 g">
        {MACROS.map((m) => (
          <Par key={m.chave} rotulo={m.rotulo} valor={fmtComUnidade(a[m.chave], m.unidade)} />
        ))}
      </Bloco>
      {nutrientes.length > 0 && (
        <Bloco titulo="Demais nutrientes (por 100 g)">
          {nutrientes.map((n) => (
            <Par key={n.chave} rotulo={n.rotulo} valor={fmtComUnidade(n.valor, n.unidade)} />
          ))}
        </Bloco>
      )}
      {porcaoDiferente && (
        <div data-porcao-referencia={fmtQtd(a.porcao_g)}>
          <Bloco titulo={`Por porção de referência (${fmtQtd(a.porcao_g)} g)`}>
            <Par rotulo="Energia" valor={fmtComUnidade(naPorcao.energia_kcal, "kcal")} />
            <Par rotulo="Proteína" valor={fmtComUnidade(naPorcao.proteina_g, "g")} />
            <Par rotulo="Carboidrato" valor={fmtComUnidade(naPorcao.carboidrato_g, "g")} />
            <Par rotulo="Lipídios" valor={fmtComUnidade(naPorcao.lipidio_g, "g")} />
          </Bloco>
        </div>
      )}
      <div data-medidas-detalhe={a.medidas_caseiras.length}>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-3">Medidas caseiras</p>
        {a.medidas_caseiras.length === 0 ? (
          <p className="text-[12.5px] text-texto-3">Nenhuma medida caseira cadastrada{meu ? " — use Editar para adicionar." : "."}</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2">
            {a.medidas_caseiras.map((m, i) => {
              const kcal = porGramas(a.energia_kcal, m.gramas);
              const p = porGramas(a.proteina_g, m.gramas);
              const c = porGramas(a.carboidrato_g, m.gramas);
              const l = porGramas(a.lipidio_g, m.gramas);
              const valor = `${kcal === null ? "—" : `${fmtQtd(kcal)} kcal`}${p !== null || c !== null || l !== null ? ` · P ${fmtQtd(p)} · C ${fmtQtd(c)} · L ${fmtQtd(l)} g` : ""}`;
              return (
                <div key={m.id} className="flex justify-between gap-2 border-b border-dotted border-linha-2 pb-1 text-[12.5px]" data-medida-detalhe={i}>
                  <dt className="text-texto-3">{rotuloMedida(m)}</dt>
                  <dd className="text-right tabular-nums text-texto">{valor}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
      <p className="text-[11.5px] text-texto-4" data-alimento-origem={a.fonte}>
        {a.fonte === "taco" ? `Fonte: ${TACO_DESCRICAO}.` : a.marca ? `Marca: ${a.marca} · alimento cadastrado por você.` : "Alimento cadastrado por você."}
      </p>
    </div>
  );
}

export function Alimentos({ ctx, pedidoNovo, aoAtenderPedido }: { ctx: ContextoDietas; pedidoNovo: boolean; aoAtenderPedido: () => void }) {
  const { uid } = ctx;
  const [filtros, setFiltros] = useState<FiltrosAlimentos>(FILTROS_PADRAO);
  const [busca, setBusca] = useState("");
  const [grupos, setGrupos] = useState<GrupoAlimentos[]>([]);
  const [modal, setModal] = useState<{ aberto: boolean; alimento: Alimento | null }>({ aberto: false, alimento: null });
  const [abertos, setAbertos] = useState<string[]>([]);
  const [paraExcluir, setParaExcluir] = useState<Alimento | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.q === busca.trim() ? f : { ...f, q: busca.trim() })), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // o "Novo alimento" do topo da página
  useEffect(() => {
    if (!pedidoNovo) return;
    aoAtenderPedido();
    if (ctx.souNutri) setModal({ aberto: true, alimento: null });
  }, [pedidoNovo, aoAtenderPedido, ctx.souNutri]);

  const fetchPage = useCallback((offset: number, limit: number) => listarAlimentosDoPainel(filtros, uid, offset, limit), [filtros, uid]);
  const { itens, total, loading, carregandoMais, erro, verMais, recarregar, setItens } = usePaginado<Alimento>(fetchPage, [filtros, uid]);

  const carregarGrupos = useCallback(async () => {
    try {
      setGrupos(await listarGrupos());
    } catch {
      setGrupos([]);
    }
  }, []);
  useEffect(() => {
    void carregarGrupos();
  }, [carregarGrupos]);

  const comFiltro = filtrosAtivos(filtros);
  const alternar = (id: string) => setAbertos((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const onSalvo = (a: Alimento, modo: "criado" | "editado") => {
    if (modo === "editado") setItens((prev) => inserirOrdenado(prev, a));
    else void recarregar();
    void carregarGrupos();
  };
  const excluir = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirAlimentoDoPainel(paraExcluir.id);
      setParaExcluir(null);
      toast.success("Alimento excluído");
      void recarregar();
      void carregarGrupos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o alimento");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-pagina-alimentos data-total-alimentos={total} data-carregando={loading ? "1" : "0"}>
      <Cartao className="p-4">
        <div className="flex flex-wrap items-end gap-2.5">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar pelo nome ou pela marca" data-busca-alimentos />
          <Filtro rotulo="Fonte" value={filtros.fonte} onChange={(e) => setFiltros((f) => ({ ...f, fonte: e.target.value as FiltroFonte }))} data-filtro-fonte>
            {FONTES.map((o) => (
              <option key={o.valor} value={o.valor}>{o.rotulo}</option>
            ))}
          </Filtro>
          <Filtro largo rotulo="Grupo" value={filtros.grupo} onChange={(e) => setFiltros((f) => ({ ...f, grupo: e.target.value }))} data-filtro-grupo>
            <option value="">Todos os grupos</option>
            {grupos.map((g) => (
              <option key={g.grupo} value={g.grupo}>{g.grupo} ({g.total})</option>
            ))}
          </Filtro>
        </div>
        <p className="mt-2.5 text-[12px] text-texto-3">
          Base pública TACO (4ª ed., NEPA/Unicamp), só para consulta, + os alimentos que você cadastrar. Valores por 100 g.
          {!ctx.souNutri && " Só a nutricionista da conta cadastra alimentos."}
        </p>
      </Cartao>

      <Cartao className="px-4 pb-1 pt-4" data-lista-alimentos-cartao>
        <CabecalhoCartao
          titulo={loading ? "Contando…" : textoTotal(total, comFiltro)}
          extra={filtros.fonte ? <Chip tom={filtros.fonte === "proprio" ? "n" : "g"}>{filtros.fonte === "proprio" ? "MEUS ALIMENTOS" : "TACO"}</Chip> : undefined}
        />
        {erro ? (
          <EstadoErro texto={`Não foi possível carregar os alimentos: ${erro}`} aoTentar={() => void recarregar()} className="my-4" />
        ) : loading ? (
          <EstadoCarregando linhas={4} rotulo="Carregando os alimentos" className="pb-3" />
        ) : itens.length === 0 ? (
          comFiltro ? (
            <EstadoVazio icone={Search} titulo="Nenhum alimento com essa busca" texto="Mude a busca ou os filtros." className="my-4" />
          ) : (
            <EstadoVazio icone={Apple} titulo="Nenhum alimento por aqui" texto="Cadastre o primeiro alimento próprio no botão Novo alimento." className="my-4" />
          )
        ) : (
          <ul className="divide-y divide-linha-3" data-lista-alimentos>
            {itens.map((a) => {
              const aberto = abertos.includes(a.id);
              const meu = alimentoEhMeu(a, uid);
              return (
                <li key={a.id} className="py-3" data-alimento={a.id} data-fonte={a.fonte} data-aberto={aberto ? "1" : "0"} data-editavel={meu ? "1" : "0"}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-[12px] border border-linha", meu ? "bg-[rgba(16,185,129,.1)] text-verde-3" : "bg-superficie text-texto-3")}>
                        <Apple aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-texto">
                          <span data-alimento-nome>{a.nome}</span>
                          <Etiqueta a={a} />
                        </p>
                        <p className="mt-0.5 text-[12px] text-texto-3">
                          {a.grupo ? <span data-alimento-grupo>{a.grupo}</span> : <span>sem grupo</span>}
                          {" · "}
                          <span className="tabular-nums" data-alimento-resumo>{resumoMacros(a)}</span>
                          <span> / 100 g</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AcaoLinha icone={aberto ? ChevronUp : ChevronDown} onClick={() => alternar(a.id)} data-btn-ver-alimento>{aberto ? "Ocultar" : "Ver"}</AcaoLinha>
                      {meu && ctx.souNutri && (
                        <>
                          <AcaoLinha icone={Pencil} onClick={() => setModal({ aberto: true, alimento: a })} data-btn-editar-alimento>Editar</AcaoLinha>
                          <AcaoLinha icone={Trash2} perigo onClick={() => setParaExcluir(a)} data-btn-excluir-alimento>Excluir</AcaoLinha>
                        </>
                      )}
                    </div>
                  </div>
                  {aberto && <Detalhe a={a} meu={meu} />}
                </li>
              );
            })}
          </ul>
        )}
        {!erro && !loading && <VerMais mostrando={itens.length} total={total} aoVerMais={verMais} carregando={carregandoMais} rotulo="alimentos" />}
      </Cartao>

      <AlimentoDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        alimento={modal.alimento}
        uid={uid}
        grupos={grupos.map((g) => g.grupo)}
        onSalvo={onSalvo}
      />
      <ConfirmarExclusao
        aberto={!!paraExcluir}
        aoMudar={(a) => !a && setParaExcluir(null)}
        titulo="Excluir este alimento?"
        texto={paraExcluir ? <><b className="font-semibold text-texto">{paraExcluir.nome}</b> sai da sua lista de alimentos e vai para a lixeira.</> : ""}
        ocupado={excluindo}
        aoConfirmar={() => void excluir()}
        data-confirmar-excluir-alimento
      />
    </div>
  );
}
