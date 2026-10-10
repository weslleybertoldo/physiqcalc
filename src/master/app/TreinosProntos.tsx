import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SemConexaoTreino } from "@/ui/casca/SemConexaoTreino";
import { useTreinoDaPagina } from "@/ui/casca/treinoDaPagina";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Campo, INPUT, Janela, SELECT, TEXTAREA } from "../pecas/ui";
import {
  DIAS, NIVEIS, OBJETIVOS, ROTULO_NIVEL, ROTULO_OBJETIVO, ativarTreinoPronto, bibliotecaGlobal, listarTreinosProntos, salvarTreinoPronto, treinoNovo,
  validarTreino, type TreinoPronto,
} from "./treinosProntos";

const LETRAS = "ABCDEFGHIJ".split("");

/** Editor de um treino pronto: nome, objetivo, nível, divisões (letra, nome, dias) e os exercícios da biblioteca global. */
function EditorTreino({ treino, aoFechar, aoSalvo }: { treino: TreinoPronto | null; aoFechar: () => void; aoSalvo: () => void }) {
  const [t, setT] = useState<TreinoPronto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const bib = useQuery({ queryKey: ["master-biblioteca-global"], queryFn: bibliotecaGlobal, enabled: Boolean(treino), staleTime: 300_000 });
  // hml-17 (H-39): a biblioteca não veio — o aviso com "Tentar de novo" e os exercícios já escolhidos continuam escolhidos (antes
  // apareciam como "Escolha o exercício", como se o treino estivesse sem eles)
  const bibFalhou = bib.isError && !bib.data;
  useEffect(() => { setT(treino ? structuredClone(treino) : null); setErro(null); }, [treino]);
  if (!t) return null;
  const mudarGrupo = (i: number, g: Partial<TreinoPronto["grupos"][number]>) => setT({ ...t, grupos: t.grupos.map((x, k) => (k === i ? { ...x, ...g } : x)) });

  async function salvar() {
    if (!t) return;
    const v = validarTreino(t);
    if (v) { setErro(v); return; }
    setOcupado(true);
    try {
      await salvarTreinoPronto(t);
      toast.success(`Treino "${t.nome}" salvo. Quem escolher a partir de agora recebe esta versão.`);
      aoSalvo();
    } catch (e) {
      setErro(`Não deu para salvar (${(e as Error).message}).`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Janela aberta aoMudar={(a) => !a && aoFechar()} titulo={t.id ? "Editar treino pronto" : "Novo treino pronto"} largura="sm:max-w-3xl" data-janela-treino-pronto
      descricao="O aluno sem profissional escolhe e o treino vira dele (cópia). Mudar aqui vale para quem escolher depois."
      rodape={(
        <>
          <Botao tamanho="sm" onClick={aoFechar}>Cancelar</Botao>
          <Botao tamanho="sm" variante="w" onClick={() => void salvar()} disabled={ocupado} data-salvar-treino-pronto>{ocupado ? "Salvando…" : "Salvar treino"}</Botao>
        </>
      )}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3"><Campo rotulo="Nome"><input className={INPUT} value={t.nome} onChange={(e) => setT({ ...t, nome: e.target.value })} maxLength={80} data-campo-nome-treino /></Campo></div>
        <Campo rotulo="Objetivo">
          <select className={SELECT} value={t.objetivo} onChange={(e) => setT({ ...t, objetivo: e.target.value as TreinoPronto["objetivo"] })}>{OBJETIVOS.map((o) => <option key={o} value={o}>{ROTULO_OBJETIVO[o]}</option>)}</select>
        </Campo>
        <Campo rotulo="Nível">
          <select className={SELECT} value={t.nivel} onChange={(e) => setT({ ...t, nivel: e.target.value as TreinoPronto["nivel"] })}>{NIVEIS.map((n) => <option key={n} value={n}>{ROTULO_NIVEL[n]}</option>)}</select>
        </Campo>
        <Campo rotulo="Divisão (texto)" dica="Ex.: A · B · C"><input className={INPUT} value={t.divisao} onChange={(e) => setT({ ...t, divisao: e.target.value })} maxLength={60} /></Campo>
        <div className="sm:col-span-3"><Campo rotulo="Descrição"><textarea className={TEXTAREA} value={t.descricao ?? ""} onChange={(e) => setT({ ...t, descricao: e.target.value })} maxLength={300} /></Campo></div>
      </div>
      {bibFalhou && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(244,63,94,.3)] px-3.5 py-2.5 text-[13px] font-medium text-rosa-3" role="alert"
          data-treino-pronto-bib-erro>
          Não deu para carregar a biblioteca de exercícios. Os exercícios já escolhidos continuam no treino.
          <Botao tamanho="sm" icone={RefreshCw} onClick={() => void bib.refetch()} data-treino-pronto-bib-tentar>Tentar de novo</Botao>
        </p>
      )}
      {t.grupos.map((g, i) => (
        <div key={i} className="rounded-2xl border border-linha bg-superficie-3 p-3" data-grupo-pronto={g.letra}>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <Campo rotulo="Letra">
              <select className={`${SELECT} w-20`} value={g.letra} onChange={(e) => mudarGrupo(i, { letra: e.target.value })}>{LETRAS.map((l) => <option key={l} value={l}>{l}</option>)}</select>
            </Campo>
            <div className="min-w-[160px] flex-1"><Campo rotulo="Nome da divisão"><input className={INPUT} value={g.nome} onChange={(e) => mudarGrupo(i, { nome: e.target.value })} maxLength={60} /></Campo></div>
            <Botao tamanho="sm" icone={Trash2} onClick={() => setT({ ...t, grupos: t.grupos.filter((_, k) => k !== i) })} aria-label={`Remover a divisão ${g.letra}`}>Remover</Botao>
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={`Dias da divisão ${g.letra}`}>
            {DIAS.map((d) => {
              const sel = g.dias.includes(d);
              return (
                <button key={d} type="button" aria-pressed={sel} onClick={() => mudarGrupo(i, { dias: sel ? g.dias.filter((x) => x !== d) : [...g.dias, d] })}
                  className={cn("h-8 rounded-lg border px-2.5 text-[12px] font-semibold", sel ? "border-violeta/60 bg-violeta/20 text-violeta-3" : "border-linha text-texto-3")}>{d}</button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            {g.exercicios.map((e, j) => (
              <div key={j} className="grid grid-cols-[minmax(0,1fr)_64px_84px_84px_36px] items-center gap-1.5" data-exercicio-pronto={j}>
                <select className={`${SELECT} h-9`} value={e.exercicio_id} aria-label="Exercício"
                  onChange={(ev) => mudarGrupo(i, { exercicios: g.exercicios.map((x, k) => (k === j ? { ...x, exercicio_id: ev.target.value } : x)) })}>
                  <option value="">Escolha o exercício</option>
                  {bibFalhou && e.exercicio_id && <option value={e.exercicio_id}>{e.nome ?? "Exercício escolhido"} (a lista não carregou)</option>}
                  {(bib.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.nome}{b.grupo_muscular ? ` · ${b.grupo_muscular}` : ""}</option>)}
                </select>
                <input className={`${INPUT} h-9`} inputMode="numeric" aria-label="Séries" value={e.series}
                  onChange={(ev) => mudarGrupo(i, { exercicios: g.exercicios.map((x, k) => (k === j ? { ...x, series: Number(ev.target.value) || 0 } : x)) })} />
                <input className={`${INPUT} h-9`} aria-label="Repetições" value={e.reps}
                  onChange={(ev) => mudarGrupo(i, { exercicios: g.exercicios.map((x, k) => (k === j ? { ...x, reps: ev.target.value } : x)) })} />
                <input className={`${INPUT} h-9`} inputMode="numeric" aria-label="Descanso (s)" value={e.descanso_segundos ?? ""} placeholder="s"
                  onChange={(ev) => mudarGrupo(i, { exercicios: g.exercicios.map((x, k) => (k === j ? { ...x, descanso_segundos: ev.target.value === "" ? null : Number(ev.target.value) } : x)) })} />
                <button type="button" className="pq-ibtn" style={{ width: 36, height: 36, borderRadius: 12 }} aria-label="Remover exercício"
                  onClick={() => mudarGrupo(i, { exercicios: g.exercicios.filter((_, k) => k !== j) })}><Trash2 aria-hidden className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="text-[11px] text-texto-3">Séries · repetições · descanso em segundos</div>
            <Botao tamanho="sm" icone={Plus} className="self-start" onClick={() => mudarGrupo(i, { exercicios: [...g.exercicios, { exercicio_id: "", series: 3, reps: "12", descanso_segundos: 60, observacao: null }] })}
              data-adicionar-exercicio={g.letra}>Exercício</Botao>
          </div>
        </div>
      ))}
      <Botao tamanho="sm" icone={Plus} className="self-start" data-adicionar-divisao
        onClick={() => setT({ ...t, grupos: [...t.grupos, { letra: LETRAS.find((l) => !t.grupos.some((g) => g.letra === l)) ?? "J", nome: `Treino ${LETRAS[t.grupos.length] ?? ""}`, dias: [], exercicios: [] }] })}>
        Divisão
      </Botao>
      {erro && <p role="alert" className="text-[13px] font-medium text-rosa-3" data-erro-treino-pronto>{erro}</p>}
    </Janela>
  );
}

/** Aba "Treinos prontos" do App do aluno (master): o catálogo por objetivo e nível, editar, novo e tirar de circulação. */
export function TreinosProntos() {
  const treino = useTreinoDaPagina();
  const q = useQuery({ queryKey: ["master-treinos-prontos"], queryFn: listarTreinosProntos, enabled: treino.tipo === "ok" });
  const [editar, setEditar] = useState<TreinoPronto | null>(null);
  if (treino.tipo !== "ok") return <SemConexaoTreino estado={treino} />;
  if (q.isLoading) return <EstadoCarregando linhas={5} />;
  if (q.isError) return <EstadoErro aoTentar={() => void q.refetch()} />;
  const lista = q.data ?? [];

  async function alternar(t: TreinoPronto) {
    try {
      await ativarTreinoPronto(t.id!, !t.ativo);
      toast.success(t.ativo ? "Treino tirado do catálogo." : "Treino de volta no catálogo.");
      void q.refetch();
    } catch (e) {
      toast.error(`Não deu certo (${(e as Error).message}).`);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-treinos-prontos={lista.length}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 break-words text-[12.5px] text-texto-3">{lista.filter((t) => t.ativo).length} no catálogo · o arquivo scripts/conteudo/treinos_prontos.json continua valendo para recarregar.</p>
        <Botao tamanho="sm" variante="w" icone={Plus} onClick={() => setEditar(treinoNovo())} data-novo-treino-pronto>Novo treino</Botao>
      </div>
      {lista.length === 0 ? <EstadoVazio icone={Dumbbell} titulo="Nenhum treino pronto" /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((t) => (
            <Cartao key={t.id} className={cn("flex flex-col gap-2 p-4", !t.ativo && "opacity-60")} data-treino-pronto={t.codigo}>
              <div className="flex flex-wrap gap-1.5">
                <Chip tom="t">{ROTULO_OBJETIVO[t.objetivo]}</Chip><Chip tom="g">{ROTULO_NIVEL[t.nivel]}</Chip>{!t.ativo && <Chip tom="a">Fora do catálogo</Chip>}
              </div>
              <b className="text-[15px] text-texto">{t.nome}</b>
              <span className="text-[12.5px] text-texto-2">{t.dias_por_semana}×/semana · {t.divisao} · {t.grupos.reduce((s, g) => s + g.exercicios.length, 0)} exercícios</span>
              <div className="mt-auto flex gap-2 pt-1">
                <Botao tamanho="sm" onClick={() => setEditar(t)} data-editar-treino-pronto={t.codigo}>Editar</Botao>
                <Botao tamanho="sm" onClick={() => void alternar(t)} data-ativar-treino-pronto={t.codigo}>{t.ativo ? "Tirar do catálogo" : "Pôr no catálogo"}</Botao>
              </div>
            </Cartao>
          ))}
        </div>
      )}
      <EditorTreino treino={editar} aoFechar={() => setEditar(null)} aoSalvo={() => { setEditar(null); void q.refetch(); }} />
    </div>
  );
}
