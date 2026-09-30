import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePowerSync } from "@powersync/react";
import { CalendarDays, CheckCircle2, Dumbbell, ListChecks, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { resolverImagem } from "@/lib/imagemExercicio";
import { useSessao } from "@/nucleo/sessao";
import { matriculaDoApp } from "@/nucleo/situacao";
import { aplicarTreinoPronto, semanaDoAluno, treinoEscolhido } from "@/app-aluno/sozinho/aplicarTreino";
import { buscarTreinosProntos, catalogoGuardado, ErroApp } from "@/app-aluno/sozinho/api";
import {
  diasDoGrupo,
  ehObjetivo,
  filtrarTreinos,
  grupoPrincipal,
  linhaDoExercicio,
  mensagemApp,
  NIVEIS,
  OBJETIVOS,
  resumoDoTreino,
  rotuloNivel,
  rotuloObjetivo,
  totalDeExercicios,
  type Nivel,
  type Objetivo,
  type TreinoPronto,
} from "@/app-aluno/sozinho/regras";
import { CLASSE_PAGINA_APP, TopoItem } from "@/app-aluno/perfil/pecas/TopoItem";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { fotoDoTreino } from "@/ui/premium/fotos";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useOnline } from "@/ui/premium/useOnline";

const OBJETIVO_CURTO: Record<Objetivo, string> = { emagrecer: "Emagrecer", manter: "Manter", ganhar_massa: "Massa" };

/**
 * Perfil › Treinos prontos (W7b — regra dele: "ele pode escolher e montar seu próprio treino ou usar um treino pronto"): o
 * catálogo pelo objetivo e pelo nível (1ª versão nossa, com os 81 exercícios da biblioteca; ele revisa em produção). O aluno
 * escolhe um e ele VIRA O TREINO DELE (treinos próprios + a semana, pelo PowerSync — funciona sem internet) e aparece na aba
 * Treino; ele muda depois como os treinos próprios de hoje. Visual da tela 2 (card do treino, lista com a miniatura do GIF).
 */
export default function TreinosProntos() {
  const navigate = useNavigate();
  const online = useOnline();
  const db = usePowerSync();
  const { user } = useAuth();
  const { situacao } = useSessao();
  const [params, setParams] = useSearchParams();
  const doApp = matriculaDoApp(situacao);
  const podeUsar = !!doApp || !!situacao?.master;
  const inicio = params.get("inicio") === "1";
  const codigoAberto = params.get("t");
  const [objetivo, setObjetivo] = useState<Objetivo>(() => (ehObjetivo(doApp?.objetivo_app) ? doApp!.objetivo_app : "manter"));
  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [confirmar, setConfirmar] = useState<{ t: TreinoPronto; dias: number } | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const userId = user?.id ?? null;
  const escolhido = treinoEscolhido(userId);

  // o catálogo é lido com a sessão do Banco do Treino (RLS: só quem está logado) — espera a troca de token terminar
  const consulta = useQuery({
    queryKey: ["treinos-prontos", userId ? "logado" : "sem-sessao"],
    queryFn: buscarTreinosProntos,
    enabled: !!userId,
    staleTime: 5 * 60_000,
    retry: 2,
    initialData: catalogoGuardado() ?? undefined,
    initialDataUpdatedAt: 0,
  });
  const lista = useMemo(() => filtrarTreinos(consulta.data ?? [], objetivo, nivel), [consulta.data, objetivo, nivel]);
  const aberto = codigoAberto ? (consulta.data ?? []).find((t) => t.codigo === codigoAberto) ?? null : null;

  const abrir = (t: TreinoPronto) => setParams((a) => { const q = new URLSearchParams(a); q.set("t", t.codigo); q.delete("inicio"); return q; });

  const pedirUso = async (t: TreinoPronto) => {
    if (!userId) {
      toast.error("O seu treino ainda está sendo preparado. Tente de novo em instantes (com internet na 1ª vez).");
      return;
    }
    const s = await semanaDoAluno(db, userId).catch(() => ({ dias: 0, proprios: 0 }));
    if (s.dias > 0) setConfirmar({ t, dias: s.dias });
    else void usar(t);
  };

  const usar = async (t: TreinoPronto) => {
    if (!userId) return;
    setAplicando(true);
    try {
      await aplicarTreinoPronto(db, t, userId);
      setConfirmar(null);
      toast.success(`Pronto! "${t.nome}" é o seu treino agora.`);
      navigate("/treino", { replace: true });
    } catch (e) {
      console.error("[TreinosProntos] aplicar", e);
      toast.error("Não deu para montar o treino agora. Tente de novo.");
    } finally {
      setAplicando(false);
    }
  };

  if (aberto) {
    return (
      <div data-pagina-treinos-prontos="detalhe" data-treino-pronto={aberto.codigo} className={CLASSE_PAGINA_APP}>
        <TopoItem titulo="Treino pronto" />
        <DetalheTreino t={aberto} />
        {podeUsar ? (
          <div className="sticky bottom-[calc(var(--casca-reserva-baixo,0px)+8px)] z-10 mt-1 flex flex-col gap-2">
            <Botao variante="w" icone={Sparkles} className="h-12 w-full rounded-2xl" disabled={aplicando} onClick={() => void pedirUso(aberto)} data-usar-treino>
              {aplicando ? "Montando o seu treino…" : "Usar este treino"}
            </Botao>
          </div>
        ) : (
          <Cartao className="px-4 py-3 text-[12.5px] text-texto-2" data-treino-pronto-com-profissional>
            Os treinos prontos são para quem treina sem profissional. O seu treino é o que o seu profissional monta para você.
          </Cartao>
        )}
        <PainelDeslizante aberto={!!confirmar} aoMudar={(v) => !v && !aplicando && setConfirmar(null)} titulo="Trocar a sua semana?"
          descricao={confirmar ? `"${confirmar.t.nome}" entra nos dias da semana.` : undefined} lado="baixo"
          rodape={
            <div className="flex gap-2">
              <Botao className="flex-1" disabled={aplicando} onClick={() => setConfirmar(null)} data-confirmar-cancelar>Cancelar</Botao>
              <Botao variante="w" className="flex-1" disabled={aplicando} onClick={() => confirmar && void usar(confirmar.t)} data-confirmar-usar>
                {aplicando ? "Montando…" : "Usar este treino"}
              </Botao>
            </div>
          }>
          <p className="text-[13.5px] leading-relaxed text-texto" data-confirmar-texto>
            A sua semana de treinos ({confirmar?.dias} {confirmar?.dias === 1 ? "dia" : "dias"}) vai ser trocada por esta. Os treinos que você montou
            continuam salvos e dá para usar qualquer um no dia, em "Trocar o treino do dia".
          </p>
        </PainelDeslizante>
      </div>
    );
  }

  return (
    <div data-pagina-treinos-prontos="lista" className={CLASSE_PAGINA_APP}>
      <TopoItem titulo="Treinos prontos" />
      {inicio && doApp && (
        <Cartao brilho className="flex items-start gap-3 px-4 py-3.5" data-treinos-inicio>
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-superficie text-verde-3">
            <CheckCircle2 aria-hidden className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-texto-2">
            <b className="block text-[14px] font-semibold text-texto">Seus dias grátis começaram</b>
            Escolha um treino pronto pelo seu objetivo — ou monte o seu na aba Treino.
            <button type="button" className="pq-botao pq-botao-g pq-botao-sm mt-2" onClick={() => navigate("/treino", { replace: true })} data-montar-o-meu>
              <Dumbbell aria-hidden /> Montar o meu
            </button>
          </span>
        </Cartao>
      )}
      {escolhido && !inicio && (
        <p className="px-1 text-[12px] text-texto-3" data-treino-escolhido>Você está usando: <b className="font-semibold text-texto-2">{escolhido.nome}</b></p>
      )}
      <Segmentado<Objetivo> rotulo="Objetivo" className="self-start" valor={objetivo} aoMudar={setObjetivo}
        opcoes={OBJETIVOS.map((o) => ({ valor: o.id, rotulo: OBJETIVO_CURTO[o.id] }))} />
      <div className="-mx-[18px] flex gap-1.5 overflow-x-auto px-[18px] pb-0.5 [scrollbar-width:none]" role="radiogroup" aria-label="Nível" data-filtro-nivel>
        {[{ id: null, rotulo: "Todos" }, ...NIVEIS].map((n) => (
          <button key={n.id ?? "todos"} type="button" role="radio" aria-checked={nivel === n.id} onClick={() => setNivel(n.id as Nivel | null)}
            className={cn("pq-chip flex-none", nivel === n.id ? "pq-chip-t" : "pq-chip-g")} data-nivel={n.id ?? "todos"}>
            {n.rotulo.toUpperCase()}
          </button>
        ))}
      </div>

      {!online && !consulta.data?.length ? (
        <EstadoSemInternet texto="Os treinos prontos aparecem quando a internet voltar." />
      ) : (consulta.isLoading || !userId) && !consulta.data?.length ? (
        <EstadoCarregando linhas={3} rotulo="Carregando os treinos prontos" />
      ) : consulta.isError && !consulta.data?.length ? (
        <EstadoErro texto={mensagemApp(consulta.error instanceof ErroApp ? consulta.error.codigo : null)} aoTentar={() => void consulta.refetch()} />
      ) : !lista.length ? (
        <EstadoVazio icone={ListChecks} titulo="Nenhum treino neste filtro" texto="Troque o nível ou o objetivo." />
      ) : (
        <div className="flex flex-col gap-2.5" data-lista-treinos-prontos={lista.length}>
          {lista.map((t) => <CartaoTreino key={t.codigo} t={t} aoAbrir={() => abrir(t)} usando={escolhido?.codigo === t.codigo} />)}
        </div>
      )}
      <p className="px-1 pt-1 text-[11.5px] leading-relaxed text-texto-3">
        Treinos para uso geral, sem avaliação individual. Sentiu dor ou tem alguma condição de saúde? Procure um profissional.
      </p>
    </div>
  );
}

/** Card do treino pronto (tela 1/2: foto por grupo muscular, nome grande, chips e o resumo). */
function CartaoTreino({ t, aoAbrir, usando }: { t: TreinoPronto; aoAbrir: () => void; usando: boolean }) {
  const foto = fotoDoTreino(grupoPrincipal(t.grupos[0] ?? { exercicios: [], nome: t.nome }));
  return (
    <button type="button" onClick={aoAbrir} data-cartao-treino-pronto={t.codigo}
      className="pq-cartao relative flex min-h-[132px] flex-col justify-end overflow-hidden px-4 py-3.5 text-left">
      <img src={foto} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" />
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(9,9,11,.15) 0%, rgba(9,9,11,.82) 70%)" }} />
      <span className="relative flex flex-wrap items-center gap-1.5">
        <Chip tom="t">{rotuloNivel(t.nivel).toUpperCase()}</Chip>
        {usando && <Chip tom="n" icone={CheckCircle2}>SEU TREINO</Chip>}
      </span>
      <b className="relative mt-2 block text-[19px] font-bold leading-tight tracking-[-0.02em] text-white">{t.nome}</b>
      <span className="relative mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/80">
        <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden className="h-3.5 w-3.5" /> {resumoDoTreino(t)}</span>
        <span className="inline-flex items-center gap-1"><ListChecks aria-hidden className="h-3.5 w-3.5" /> {totalDeExercicios(t)} exercícios</span>
      </span>
    </button>
  );
}

/** Detalhe (tela 2): o card do treino e cada divisão com os dias e os exercícios (miniatura do GIF, séries × reps · descanso). */
function DetalheTreino({ t }: { t: TreinoPronto }) {
  return (
    <>
      <Cartao brilho className="flex flex-col gap-2 px-4 py-4" data-detalhe-cabecalho>
        <div className="flex items-start justify-between gap-3">
          <b className="text-[20px] font-bold leading-tight tracking-[-0.02em] text-texto" data-detalhe-nome>{t.nome}</b>
          <Chip tom="t" className="flex-none">{rotuloNivel(t.nivel).toUpperCase()}</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-texto-2">
          <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden className="h-3.5 w-3.5" /> {resumoDoTreino(t)}</span>
          <span className="inline-flex items-center gap-1"><Target aria-hidden className="h-3.5 w-3.5" /> {rotuloObjetivo(t.objetivo)}</span>
        </div>
        {t.descricao && <p className="text-[13px] leading-relaxed text-texto-2">{t.descricao}</p>}
      </Cartao>
      {t.grupos.map((g) => (
        <section key={g.letra} className="flex flex-col gap-2" data-grupo-pronto={g.letra}>
          <div className="mt-1.5 flex items-center justify-between px-1">
            <span className="text-[14px] font-semibold text-texto">{g.nome}</span>
            <Chip tom="g">{diasDoGrupo(g.dias).toUpperCase()}</Chip>
          </div>
          {g.exercicios.map((e) => {
            const img = resolverImagem(e.exercicio?.imagem_url ?? null);
            return (
              <Cartao key={`${g.letra}-${e.ordem}`} className="flex items-center gap-3 px-3 py-2.5" data-exercicio-pronto={e.exercicio?.nome ?? e.exercicio_id}>
                <span className="flex h-[54px] w-[54px] flex-none items-center justify-center overflow-hidden rounded-[14px] border border-linha bg-superficie">
                  {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Dumbbell aria-hidden className="h-5 w-5 text-texto-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-semibold text-texto">{e.exercicio?.nome ?? "Exercício"}</b>
                  <span className="block truncate text-[12.5px] text-texto-2">{linhaDoExercicio(e)}{e.observacao ? ` · ${e.observacao}` : ""}</span>
                </span>
              </Cartao>
            );
          })}
        </section>
      ))}
    </>
  );
}
