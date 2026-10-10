// Physiq W16 — Perfil do aluno › Dieta › Plano (spec 4.5, N-38, N-61, N-62, NF3). Porta da seção "Planejamento alimentar" do
// PhysiqNutri (src/pages/paciente/secoes/Planejamento.tsx, main ca9f66f) no visual premium: o editor do plano (tela 8, lado
// direito) do plano que o app mostra e, ao lado, os planos do aluno (PDF, Abrir, ★ modelo, Duplicar, Excluir), "Nova prescrição
// alimentar" (meta pelo VET do último cálculo, 6 refeições padrão) e "Usar um modelo ★" (cópia de um plano ★ de outro aluno).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Apple, Bookmark, Copy, FileDown, FolderOpen, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { planoAtivo } from "@/nutricao/app/dia";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { listarCalculos, type CalculoEnergetico } from "@/nutricao/editor/lib/calculosEnergeticos";
import { fmtKcal, formatarDataPlano, ordenarRefeicoes, textoContagemPlanos, totaisDoPlano } from "@/nutricao/editor/lib/dietaUtil";
import { duplicarPlano, excluirPlano, favoritarPlano, listarPlanosFavoritos, usarPlanoModelo, type Plano, type PlanoFavorito } from "@/nutricao/editor/lib/planos";
import { EditorDieta } from "@/nutricao/editor/ui/EditorDieta";
import { chavePlanos, usePlanosDoAluno } from "@/nutricao/editor/lib/consultas";
import PlanoDialog from "@/nutricao/editor/ui/PlanoDialog";
import { useAuth, usePaciente } from "@/nutricao/editor/ui/contexto";
import { BTN_PERIGO, BTN_SEC, DESCRICAO_JANELA, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";

const MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:opacity-40";

function ModelosPlano({ aberto, aoMudar, pacienteId, aoUsar }: { aberto: boolean; aoMudar: (a: boolean) => void; pacienteId: string; aoUsar: (p: PlanoFavorito) => Promise<void> }) {
  const q = useQuery({ queryKey: ["dieta-planos-modelo"], queryFn: listarPlanosFavoritos, enabled: aberto, staleTime: 60_000 });
  const [usando, setUsando] = useState<string | null>(null);
  const lista = q.data ?? [];
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className={`${JANELA} max-h-[88vh] overflow-y-auto sm:max-w-xl`} data-modal-modelos-plano>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>Usar um modelo ★</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>Os planos marcados com ★ (de qualquer aluno seu) viram um plano novo deste aluno, com as mesmas refeições, alimentos, substitutos e dias.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <Esqueleto className="h-24 w-full" />
        ) : q.isError && !q.data ? (
          // hml-17 (H-39): a leitura dos ★ falhou — o aviso com "Tentar de novo", nunca "Nenhum plano ★ ainda"
          <div data-modelos-plano-erro>
            <EstadoErro titulo="Não deu para carregar os planos ★" aoTentar={() => void q.refetch()} />
          </div>
        ) : lista.length === 0 ? (
          <p className="py-4 text-[13px] text-texto-3" data-modelos-plano-vazio>Nenhum plano ★ ainda. No menu ⋮ de um plano, use "Salvar como modelo ★".</p>
        ) : (
          <ul className="divide-y divide-linha" data-modelos-plano={lista.length}>
            {lista.map((p) => {
              const t = totaisDoPlano(p.refeicoes);
              return (
                <li key={p.id} className="flex items-center gap-3 py-2.5" data-modelo-plano={p.id}>
                  <Star aria-hidden className="h-4 w-4 flex-none fill-current text-ambar-3" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-semibold text-texto">{p.titulo}</b>
                    <span className="block truncate text-[11.5px] text-texto-3">
                      {fmtKcal(t.energia_kcal)} kcal · {p.refeicoes.length} refeições{p.paciente?.nome ? ` · de ${p.paciente.nome}` : ""}
                    </span>
                  </span>
                  <Botao
                    tamanho="sm"
                    variante="w"
                    disabled={!!usando}
                    onClick={async () => {
                      setUsando(p.id);
                      try {
                        await aoUsar(p);
                        aoMudar(false);
                      } finally {
                        setUsando(null);
                      }
                    }}
                    data-usar-modelo-plano
                  >
                    {usando === p.id ? "Copiando…" : "Usar"}
                  </Botao>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Planejamento({ objetivo, onMudou }: { objetivo?: string | null; onMudou?: () => void }) {
  const { paciente: p, recarregar, podeEditar } = usePaciente();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const planosQ = usePlanosDoAluno(p.id);
  const calculosQ = useQuery({ queryKey: ["dieta-calculos", p.id], queryFn: () => listarCalculos(p.id), staleTime: 60_000 });
  const nomeQ = useQuery({ queryKey: ["dieta-nome-nutri", user?.id], queryFn: () => nomeDaNutricionista(user?.id ?? ""), enabled: !!user?.id, staleTime: 10 * 60_000 });
  const [modalNovo, setModalNovo] = useState(false);
  const [modalModelos, setModalModelos] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<Plano | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const planos = useMemo(() => planosQ.data ?? [], [planosQ.data]);
  const ativo = useMemo(() => planoAtivo(planos), [planos]);
  const escolhido = params.get("plano");
  const aberto = planos.find((x) => x.id === escolhido) ?? ativo;
  const ultimoCalculo: CalculoEnergetico | null = calculosQ.data?.[0] ?? null;

  // atalho "Planejamento" do Fluxo de consulta (W14): ?novo=plano abre a nova prescrição
  useEffect(() => {
    if (params.get("novo") === "plano" && podeEditar) {
      setModalNovo(true);
      const n = new URLSearchParams(params);
      n.delete("novo");
      setParams(n, { replace: true });
    }
  }, [params, setParams, podeEditar]);

  const abrir = (id: string | null) => {
    const n = new URLSearchParams(params);
    if (id) n.set("plano", id);
    else n.delete("plano");
    setParams(n, { replace: true });
  };
  const atualizarLista = async () => {
    await qc.invalidateQueries({ queryKey: chavePlanos(p.id) });
    onMudou?.();
    void recarregar();
  };

  const rodar = async (id: string, fn: () => Promise<void>, erro: string) => {
    setOcupado(id);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : erro);
    } finally {
      setOcupado(null);
    }
  };

  const pdf = async (plano: Plano) => {
    try {
      const { baixarPDFDieta } = await import("@/nutricao/app/pdf/dietaPdf");
      const nome = await baixarPDFDieta({ aluno: p.nome, nutricionista: nomeQ.data ?? null, plano: { ...plano, refeicoes: ordenarRefeicoes(plano.refeicoes) } as unknown as PlanoAlimentar });
      toast.success(`PDF gerado: ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  if (planosQ.isLoading) return <Esqueleto className="h-[420px] w-full rounded-[22px]" />;
  if (planosQ.error) return <EstadoErro titulo="Não deu para abrir os planos" aoTentar={() => void planosQ.refetch()} />;

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" data-secao-planejamento data-planos={planos.length}>
      <div className="min-w-0">
        {aberto ? (
          <EditorDieta
            key={aberto.id}
            planoId={aberto.id}
            paciente={{ id: p.id, nome: p.nome, objetivo }}
            nomeNutricionista={nomeQ.data ?? null}
            somenteLeitura={!podeEditar}
            noApp={ativo?.id === aberto.id}
            onMudou={() => {
              onMudou?.();
              void qc.invalidateQueries({ queryKey: chavePlanos(p.id) });
            }}
            onTrocarPlano={(id) => {
              abrir(id);
              void atualizarLista();
            }}
          />
        ) : (
          <EstadoVazio
            icone={Apple}
            titulo="Nenhum plano alimentar"
            texto={podeEditar ? "Monte a prescrição por refeições com os alimentos da TACO e os seus — kcal, macros e fibras calculados, por dia da semana se quiser." : "Quando a nutricionista montar o plano, ele aparece aqui."}
            acao={
              podeEditar ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Botao variante="w" tamanho="sm" icone={Plus} onClick={() => setModalNovo(true)} data-btn-primeiro-plano>Nova prescrição alimentar</Botao>
                  <Botao variante="g" tamanho="sm" icone={Bookmark} onClick={() => setModalModelos(true)} data-btn-modelo-plano>Usar um modelo ★</Botao>
                </div>
              ) : undefined
            }
          />
        )}
      </div>

      <Cartao className="min-w-0 px-[18px] py-4" data-card-planos>
        <CabecalhoCartao titulo="Planos" extra={<Chip tom="n">{textoContagemPlanos(planos.length).replace(" alimentares", "").replace(" alimentar", "").toUpperCase()}</Chip>} />
        {podeEditar && (
          <div className="-mt-1 mb-2 flex flex-wrap gap-1.5">
            <Botao variante="w" tamanho="sm" icone={Plus} onClick={() => setModalNovo(true)} data-btn-novo-plano>Nova prescrição</Botao>
            <Botao variante="g" tamanho="sm" icone={Bookmark} onClick={() => setModalModelos(true)} data-btn-modelo-plano>Usar um modelo ★</Botao>
          </div>
        )}
        {ultimoCalculo?.vet ? (
          <p className="-mt-1 mb-2 text-[12px] text-texto-3" data-vet-referencia={ultimoCalculo.vet}>VET do último cálculo energético: {fmtKcal(ultimoCalculo.vet)} kcal</p>
        ) : null}
        {planos.length === 0 ? (
          <p className="py-2 text-[12.5px] text-texto-3">Nenhum plano ainda.</p>
        ) : (
          <ul className="divide-y divide-[rgba(255,255,255,.06)]" data-lista-planos>
            {planos.map((plano) => {
              const t = totaisDoPlano(plano.refeicoes);
              const ehAberto = aberto?.id === plano.id;
              const trabalhando = ocupado === plano.id;
              return (
                <li key={plano.id} className="py-2.5" data-plano={plano.id} data-favorito={plano.favorito ? "1" : "0"} data-plano-kcal={Math.round(t.energia_kcal)}>
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => abrir(plano.id)} className={cn("min-w-0 flex-1 text-left", ehAberto && "cursor-default")} data-btn-abrir-plano>
                      <b className={cn("flex items-center gap-1.5 truncate text-[13.5px] font-semibold", ehAberto ? "text-texto" : "text-texto-2 hover:text-texto")}>
                        <span className="truncate" data-plano-titulo>{plano.titulo}</span>
                        {plano.favorito && <Star aria-label="Modelo ★" className="h-3 w-3 flex-none fill-current text-ambar-3" />}
                        {ativo?.id === plano.id && <span className="flex-none rounded-[6px] border border-verde/40 px-1.5 py-px text-[9.5px] font-semibold tracking-[0.04em] text-verde-3">NO APP</span>}
                      </b>
                      <span className="mt-0.5 block truncate text-[11.5px] text-texto-3">
                        {fmtKcal(t.energia_kcal)} kcal · {plano.refeicoes.length} refeições · {formatarDataPlano(plano.created_at)}
                      </span>
                    </button>
                    <div className="flex flex-none items-center gap-1">
                      <button type="button" className={MINI} onClick={() => void pdf(plano)} title="PDF do plano" data-btn-pdf-plano>
                        <FileDown aria-hidden className="h-3.5 w-3.5" />
                      </button>
                      {!ehAberto && (
                        <button type="button" className={MINI} onClick={() => abrir(plano.id)} title="Abrir no editor" data-btn-editar-plano>
                          <FolderOpen aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {podeEditar && (
                        <>
                          <button
                            type="button"
                            className={cn(MINI, plano.favorito && "!text-ambar-3")}
                            disabled={trabalhando}
                            title={plano.favorito ? "Tirar dos modelos ★" : "Salvar como modelo ★"}
                            onClick={() =>
                              void rodar(plano.id, async () => {
                                await favoritarPlano(plano.id, !plano.favorito);
                                toast.success(plano.favorito ? "Plano tirado dos modelos ★" : "Plano salvo nos modelos ★");
                                await atualizarLista();
                                await qc.invalidateQueries({ queryKey: ["dieta-plano", plano.id] });
                              }, "Não foi possível mudar o ★")
                            }
                            data-btn-favoritar-plano
                          >
                            <Star aria-hidden className={cn("h-3.5 w-3.5", plano.favorito && "fill-current")} />
                          </button>
                          <button
                            type="button"
                            className={MINI}
                            disabled={trabalhando}
                            title="Duplicar"
                            onClick={() =>
                              void rodar(plano.id, async () => {
                                if (!user) throw new Error("Sessão expirada — entre de novo");
                                const copia = await duplicarPlano(user.id, plano);
                                toast.success(`Plano duplicado: ${copia.titulo}`);
                                await atualizarLista();
                                abrir(copia.id);
                              }, "Não foi possível duplicar o plano")
                            }
                            data-btn-duplicar-plano
                          >
                            <Copy aria-hidden className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className={cn(MINI, "hover:!text-rosa-3")} disabled={trabalhando} title="Excluir" onClick={() => setParaExcluir(plano)} data-btn-excluir-plano>
                            <Trash2 aria-hidden className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[11.5px] leading-relaxed text-texto-4">O app do aluno mostra o plano ★ mais recente; sem ★, o mais recente (a regra do site antigo do Nutri).</p>
      </Cartao>

      {podeEditar && (
        <>
          <PlanoDialog
            open={modalNovo}
            onOpenChange={setModalNovo}
            pacienteId={p.id}
            ultimoCalculo={ultimoCalculo}
            // hml-17 (H-39): sem a leitura dos cálculos, a nova prescrição diz que não deu para ler (nunca "Sem cálculo registrado")
            calculoFalhou={calculosQ.isError && !calculosQ.data ? { aoTentar: () => void calculosQ.refetch() } : null}
            onCriado={(plano) => {
              void atualizarLista();
              abrir(plano.id);
            }}
          />
          <ModelosPlano
            aberto={modalModelos}
            aoMudar={setModalModelos}
            pacienteId={p.id}
            aoUsar={async (modelo) => {
              if (!user) throw new Error("Sessão expirada — entre de novo");
              try {
                const novo = await usarPlanoModelo(user.id, p.id, modelo);
                toast.success(`Plano criado a partir do modelo: ${novo.titulo}`);
                await atualizarLista();
                abrir(novo.id);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Não foi possível usar o modelo");
                throw e;
              }
            }}
          />
        </>
      )}

      <AlertDialog open={!!paraExcluir} onOpenChange={(a) => !a && setParaExcluir(null)}>
        <AlertDialogContent className={JANELA}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>Excluir este plano?</AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA}>{paraExcluir?.titulo} sai do perfil do aluno e vai para a lixeira.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={BTN_PERIGO}
              onClick={(e) => {
                e.preventDefault();
                const alvo = paraExcluir;
                if (!alvo) return;
                void rodar(alvo.id, async () => {
                  await excluirPlano(alvo.id);
                  toast.success("Plano excluído");
                  setParaExcluir(null);
                  if (aberto?.id === alvo.id) abrir(null);
                  await atualizarLista();
                }, "Não foi possível excluir o plano");
              }}
              data-btn-confirmar-excluir-plano
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
