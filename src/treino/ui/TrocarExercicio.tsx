import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, MapPin, Search, Undo2, X } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import { agruparPorBloco, combinaBusca, getBloco, nomeDoBloco } from "@/lib/gruposMusculares";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { descricaoCurta, lerEquipamentos, montarGruposTroca, rotuloEquipamento, rotuloPadrao, type ExercicioEquivalencia, type OpcaoTroca } from "../equivalencia";
import type { InfoSubstituicao } from "../tipos";
import { JaEstaNoTreino, restaurarTroca, trocarExercicio, type EscopoTroca } from "../troca";
import { MiniaturaGif } from "./MiniaturaGif";

type Aba = "equivalentes" | "mesmo" | "todos";

interface ItemCatalogo extends ExercicioEquivalencia {
  imagem_url?: string | null;
  tipo?: string | null;
}

export interface AlvoTrocarExercicio {
  userId: string;
  /** o exercício que está na tela (sai) */
  exercicio: { id: string; nome: string; grupo_muscular: string; subgrupo?: string | null; imagem_url?: string | null };
  /** o da tela é exercício próprio do aluno (tb_exercicios_usuario) */
  pessoal: boolean;
  /** id na programação do grupo (difere do da tela quando ele já é uma troca) — a troca sempre parte do original */
  origemId: string;
  /** a troca em vigor (o da tela entrou no lugar de outro) → "Restaurar" */
  substituindo: InfoSubstituicao | null;
  /** exercícios que já estão no treino do dia (não podem entrar de novo) */
  idsNoTreino: string[];
  grupoId: string;
  grupoNome: string;
  grupoPessoal: boolean;
  slotIdx: number;
  dateKey: string;
  dateLabel: string;
  /** academia do dia (os equipamentos marcados nela ordenam a troca — NF11) */
  academia: { id: string; nome: string } | null;
}

const chave = (e: { id: string; isPessoal?: boolean }) => `${e.isPessoal ? "p" : "g"}:${e.id}`;

/**
 * "Trocar" da aba Treino (W9 — R9, C67): 3 grupos — **Equivalentes** (mesmo movimento e músculo, outro equipamento; com os
 * equipamentos da academia marcados, o que ela não tem vai para o fim, apagado), **Mesmo músculo** (outro movimento) e **Todos**
 * (a lista de hoje, por grupo muscular e com busca). Troca só hoje ou de vez; "Restaurar" desfaz a troca em vigor. Tudo no
 * SQLite do PowerSync (sem internet também). Substitui o ModalTrocarExercicio antigo.
 */
export function TrocarExercicio({
  alvo,
  aoFechar,
  aoEquipamentos,
}: {
  alvo: AlvoTrocarExercicio | null;
  aoFechar: (trocou: boolean) => void;
  /** abre a academia (para marcar os equipamentos) */
  aoEquipamentos?: () => void;
}) {
  const db = usePowerSync();
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [equipamentosAcademia, setEquipamentosAcademia] = useState<string[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [aba, setAba] = useState<Aba>("equivalentes");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [escopo, setEscopo] = useState<EscopoTroca>("dia");
  const [busca, setBusca] = useState("");
  const [bloco, setBloco] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const idAberto = alvo ? `${alvo.exercicio.id}|${alvo.origemId}|${alvo.slotIdx}|${alvo.dateKey}` : null;
  useEffect(() => {
    if (!alvo) return;
    let vivo = true;
    setCarregado(false);
    setSelecionado(null);
    setEscopo("dia");
    setBusca("");
    setBloco(null);
    setSalvando(false);
    (async () => {
      try {
        const [globais, proprios, academia] = await Promise.all([
          db.getAll<ItemCatalogo>(
            "SELECT id, nome, grupo_muscular, subgrupo, imagem_url, tipo, padrao_movimento, equipamento, variacao FROM tb_exercicios ORDER BY nome",
          ),
          db.getAll<ItemCatalogo>(
            "SELECT id, nome, grupo_muscular, tipo, padrao_movimento, equipamento, variacao FROM tb_exercicios_usuario WHERE user_id = ? ORDER BY nome",
            [alvo.userId],
          ),
          alvo.academia ? db.getAll<{ equipamentos: unknown }>("SELECT equipamentos FROM tb_academias WHERE id = ?", [alvo.academia.id]) : Promise.resolve([]),
        ]);
        if (!vivo) return;
        setCatalogo([...(globais || []), ...(proprios || []).map((e) => ({ ...e, subgrupo: null, imagem_url: null, isPessoal: true }))]);
        setEquipamentosAcademia(lerEquipamentos(academia?.[0]?.equipamentos));
      } catch (e) {
        console.error("[Treino] trocar: catálogo", e);
      } finally {
        if (vivo) setCarregado(true);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega a cada abertura
  }, [idAberto, db]);

  const atual = useMemo<ItemCatalogo | null>(() => {
    if (!alvo) return null;
    return catalogo.find((e) => e.id === alvo.exercicio.id && !!e.isPessoal === alvo.pessoal) ?? { ...alvo.exercicio, isPessoal: alvo.pessoal };
  }, [catalogo, alvo]);
  const origem = useMemo(() => (alvo ? catalogo.find((e) => e.id === alvo.origemId) ?? null : null), [catalogo, alvo]);
  const grupos = useMemo(
    () => (atual ? montarGruposTroca(atual, catalogo, { equipamentosAcademia, origem }) : { equivalentes: [], mesmoMusculo: [], todos: [], referencia: null }),
    [atual, catalogo, equipamentosAcademia, origem],
  );

  // abre no 1º grupo que tem opção
  useEffect(() => {
    if (!carregado) return;
    setAba(grupos.equivalentes.length ? "equivalentes" : grupos.mesmoMusculo.length ? "mesmo" : "todos");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao terminar de carregar
  }, [carregado]);

  const noTreino = useMemo(() => new Set(alvo?.idsNoTreino ?? []), [alvo?.idsNoTreino]);
  const escolhido = useMemo(() => catalogo.find((e) => chave(e) === selecionado) ?? null, [catalogo, selecionado]);
  const voltandoAoOriginal = !!escolhido && !!alvo?.substituindo && escolhido.id === alvo.origemId;
  const filtroAtivo = equipamentosAcademia.length > 0;

  if (!alvo) {
    return <PainelDeslizante aberto={false} aoMudar={() => aoFechar(false)} titulo="Trocar exercício">{null}</PainelDeslizante>;
  }

  const estadoDe = (e: ItemCatalogo) => {
    const saindo = e.id === alvo.exercicio.id && !!e.isPessoal === alvo.pessoal;
    const original = !!alvo.substituindo && e.id === alvo.origemId;
    // quem já está no treino não entra de novo (o original volta pelo Restaurar)
    return { saindo, original, bloqueado: saindo || (noTreino.has(e.id) && !original) };
  };

  const confirmar = async () => {
    if (!escolhido || salvando) return;
    setSalvando(true);
    try {
      if (voltandoAoOriginal && alvo.substituindo) {
        await restaurarTroca(db, alvo, alvo.substituindo.escopo);
        toast.success(`Restaurado: ${alvo.substituindo.nome}`);
      } else {
        await trocarExercicio(db, alvo, { id: escolhido.id, isPessoal: escolhido.isPessoal }, escopo);
        toast.success(escopo === "dia" ? `Trocado só hoje: ${escolhido.nome}` : `Trocado de vez: ${escolhido.nome}`);
      }
      aoFechar(true);
    } catch (e) {
      if (e instanceof JaEstaNoTreino) toast.error(`"${escolhido.nome}" já está no treino ${alvo.grupoNome}.`);
      else {
        console.error("[Treino] trocar exercício:", e);
        toast.error("Não deu para trocar o exercício. Tente de novo.");
      }
      setSalvando(false);
    }
  };

  const restaurar = async () => {
    if (!alvo.substituindo || salvando) return;
    setSalvando(true);
    try {
      await restaurarTroca(db, alvo, alvo.substituindo.escopo);
      toast.success(`Restaurado: ${alvo.substituindo.nome}`);
      aoFechar(true);
    } catch (e) {
      console.error("[Treino] restaurar troca:", e);
      toast.error("Não deu para restaurar. Tente de novo.");
      setSalvando(false);
    }
  };

  /** modo: equivalente → "Halteres · pegada neutra"; mesmo → "Crucifixo e cross-over · Máquina"; todos → "Peito · Máquina" */
  const linha = (e: ItemCatalogo, modo: "equivalente" | "mesmo" | "todos", opcao?: OpcaoTroca<ItemCatalogo>, mostrarGrupo = false) => {
    const { saindo, original, bloqueado } = estadoDe(e);
    const semNaAcademia = opcao?.semNaAcademia ?? false;
    const marcado = selecionado === chave(e);
    const detalhe =
      modo === "equivalente"
        ? descricaoCurta(e)
        : modo === "mesmo"
          ? [rotuloPadrao(e.padrao_movimento), rotuloEquipamento(e.equipamento)].filter(Boolean).join(" · ")
          : [mostrarGrupo ? nomeDoBloco(e.grupo_muscular) : null, rotuloEquipamento(e.equipamento)].filter(Boolean).join(" · ");
    const sub = [e.isPessoal ? "Meu exercício" : null, detalhe || (e.isPessoal ? null : e.grupo_muscular)].filter(Boolean).join(" · ");
    return (
      <button
        key={chave(e)}
        type="button"
        disabled={bloqueado || salvando}
        onClick={() => setSelecionado(marcado ? null : chave(e))}
        aria-pressed={marcado}
        data-trocar-opcao={e.id}
        data-sem-academia={semNaAcademia ? "1" : undefined}
        data-no-treino={bloqueado ? "1" : undefined}
        data-mesmo-equipamento={opcao?.mesmoEquipamento ? "1" : undefined}
        className={cn(
          "flex min-h-[58px] w-full items-center gap-3 rounded-2xl border px-2 py-1.5 text-left transition-colors",
          marcado ? "border-violeta/60 bg-violeta/10" : "border-linha bg-superficie hover:border-linha-2",
          bloqueado && "cursor-not-allowed",
          (semNaAcademia || bloqueado) && !marcado && "opacity-50",
        )}
      >
        <MiniaturaGif url={e.imagem_url} exercicioId={e.id} nome={e.nome} semPlay className="h-11 w-12 rounded-[12px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-texto" data-trocar-nome>{e.nome}</span>
          <span className="block truncate text-[11.5px] text-texto-3">{sub}</span>
          {semNaAcademia && (
            <span className="mt-0.5 block truncate text-[11px] font-medium text-ambar-3" data-nao-tem-na-academia>não tem na sua academia</span>
          )}
        </span>
        {saindo ? (
          <span className="pq-chip pq-chip-g h-5 flex-none px-2 text-[9.5px]">SAI</span>
        ) : original ? (
          <span className="pq-chip pq-chip-t h-5 flex-none px-2 text-[9.5px]">ORIGINAL</span>
        ) : bloqueado ? (
          <span className="pq-chip pq-chip-g h-5 flex-none px-2 text-[9.5px]">NO TREINO</span>
        ) : (
          <span className={cn("flex h-5 w-5 flex-none items-center justify-center rounded-full border", marcado ? "border-violeta bg-violeta text-white" : "border-linha-2")}>
            {marcado && <Check aria-hidden className="h-3 w-3" strokeWidth={3} />}
          </span>
        )}
      </button>
    );
  };

  const vazio = (texto: string, dica?: string) => (
    <div className="rounded-2xl border border-dashed border-linha-2 px-4 py-5 text-center" data-trocar-vazio>
      <p className="text-[13px] font-medium text-texto-2">{texto}</p>
      {dica && <p className="mt-1 text-[12px] text-texto-3">{dica}</p>}
    </div>
  );

  // ── Todos: a lista de hoje (grupos musculares → exercícios) com busca ──
  const blocos = agruparPorBloco(grupos.todos);
  const doBloco = bloco ? blocos.find((b) => b.bloco.key === bloco)?.exercicios ?? [] : [];
  const buscando = busca.trim().length > 0;
  const resultados = buscando ? (bloco ? doBloco : grupos.todos).filter((e) => combinaBusca(e, busca)) : [];
  const blocoAtual = bloco ? getBloco(bloco) : null;

  const abas: { valor: Aba; rotulo: string; n?: number }[] = [
    { valor: "equivalentes", rotulo: "Equivalentes", n: grupos.equivalentes.length },
    { valor: "mesmo", rotulo: "Mesmo músculo", n: grupos.mesmoMusculo.length },
    { valor: "todos", rotulo: "Todos" },
  ];

  const explicacao = voltandoAoOriginal
    ? `Desfaz a troca ${alvo.substituindo?.escopo === "dia" ? "de hoje" : "de vez"}: "${alvo.substituindo?.nome}" volta para o treino.`
    : escopo === "dia"
      ? `Vale só em ${alvo.dateLabel}. O treino continua como está nos outros dias.`
      : alvo.grupoPessoal
        ? `"${alvo.exercicio.nome}" sai do seu treino ${alvo.grupoNome} e o novo entra no lugar.`
        : `Vale nos próximos treinos de ${alvo.grupoNome}. O treino do seu profissional não muda e dá para restaurar depois.`;

  const rodape = escolhido ? (
    <div className="flex flex-col gap-2.5" data-trocar-rodape>
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="text-texto-3">Entra</span>
        <b className="min-w-0 flex-1 truncate font-semibold text-texto" data-trocar-entra>{escolhido.nome}</b>
      </div>
      {!voltandoAoOriginal && (
        <div role="radiogroup" aria-label="Alcance da troca" className="grid grid-cols-2 gap-1 rounded-xl border border-linha bg-superficie p-[3px]">
          {(["dia", "definitiva"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={escopo === v} onClick={() => setEscopo(v)} data-trocar-escopo={v}
              className={cn("rounded-[9px] px-2 py-2 text-[12.5px] font-semibold transition-colors", escopo === v ? "text-[var(--p-botao-w-texto)]" : "text-texto-2 hover:text-texto")}
              style={escopo === v ? { background: "var(--p-botao-w-fundo)" } : undefined}>
              {v === "dia" ? `Só hoje · ${alvo.dateLabel}` : "De vez"}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11.5px] leading-snug text-texto-3" data-trocar-explicacao>{explicacao}</p>
      <Botao variante="w" className="w-full" disabled={salvando} onClick={() => void confirmar()} data-trocar-confirmar>
        {salvando ? "Salvando…" : voltandoAoOriginal ? `Voltar para ${escolhido.nome}` : escopo === "dia" ? "Trocar só hoje" : "Trocar de vez"}
      </Botao>
    </div>
  ) : (
    <p className="py-1 text-center text-[12.5px] text-texto-3" data-trocar-rodape-vazio>Escolha o exercício que entra</p>
  );

  return (
    <PainelDeslizante
      aberto={!!alvo}
      aoMudar={(v) => !v && !salvando && aoFechar(false)}
      titulo="Trocar exercício"
      descricao={<span data-trocar-sai>Sai {alvo.exercicio.nome} · {alvo.grupoNome}</span>}
      rodape={rodape}
    >
      <div className="flex flex-col gap-3 pt-1" data-trocar-exercicio data-trocar-aba-atual={aba}>
        {alvo.substituindo && (
          <div className="flex flex-col gap-1.5 rounded-2xl border border-violeta/35 bg-violeta/10 px-3.5 py-3" data-trocado>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-violeta-3">Trocado</span>
              <span className="pq-chip pq-chip-t h-5 px-2 text-[9.5px]">{alvo.substituindo.escopo === "dia" ? "SÓ HOJE" : "DE VEZ"}</span>
            </div>
            <p className="text-[13.5px] leading-snug text-texto">
              No lugar de <b className="font-semibold">{alvo.substituindo.nome}</b>
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-[11.5px] text-texto-3">{alvo.substituindo.escopo === "dia" ? `Só em ${alvo.dateLabel}` : "De vez, nos próximos treinos"}</span>
              <Botao variante="g" tamanho="sm" icone={Undo2} disabled={salvando} onClick={() => void restaurar()} data-trocar-restaurar>Restaurar</Botao>
            </div>
          </div>
        )}

        <div role="tablist" aria-label="Opções de troca" className="grid grid-cols-[1.05fr_1.25fr_0.8fr] gap-1 rounded-xl border border-linha bg-superficie p-[3px]">
          {abas.map((a) => (
            <button key={a.valor} type="button" role="tab" aria-selected={aba === a.valor} onClick={() => setAba(a.valor)} data-trocar-aba={a.valor}
              className={cn("flex items-center justify-center gap-1 whitespace-nowrap rounded-[9px] px-1.5 py-2 text-[12px] font-semibold transition-colors",
                aba === a.valor ? "text-[var(--p-botao-w-texto)]" : "text-texto-2 hover:text-texto")}
              style={aba === a.valor ? { background: "var(--p-botao-w-fundo)" } : undefined}>
              {a.rotulo}
              {a.n !== undefined && <span className={cn("tabular-nums", aba === a.valor ? "opacity-60" : "text-texto-3")} data-trocar-contagem={a.valor}>{a.n}</span>}
            </button>
          ))}
        </div>

        {aba !== "todos" && (
          <div className="flex items-center gap-2 px-0.5 text-[12px] text-texto-3" data-trocar-academia={filtroAtivo ? "filtro" : alvo.academia ? "sem-equipamentos" : "sem-academia"}>
            <MapPin aria-hidden className="h-3.5 w-3.5 flex-none text-violeta-3" />
            <span className="min-w-0 flex-1 truncate">
              {filtroAtivo
                ? `${alvo.academia?.nome}: ${equipamentosAcademia.length} ${equipamentosAcademia.length === 1 ? "equipamento marcado" : "equipamentos marcados"}`
                : alvo.academia
                  ? `${alvo.academia.nome}: sem equipamentos marcados`
                  : "Sem academia: mostra tudo"}
            </span>
            {aoEquipamentos && (
              <button type="button" onClick={aoEquipamentos} className="flex-none font-semibold text-violeta-3 hover:text-violeta-2" data-trocar-equipamentos>
                {filtroAtivo ? "Editar" : alvo.academia ? "Marcar" : "Escolher"}
              </button>
            )}
          </div>
        )}

        {!carregado ? (
          <div className="flex flex-col gap-1.5" aria-busy="true">
            {[0, 1, 2].map((i) => <span key={i} className="h-[58px] animate-pulse rounded-2xl bg-superficie" />)}
          </div>
        ) : aba === "equivalentes" ? (
          <div className="flex flex-col gap-1.5" data-trocar-lista="equivalentes">
            {grupos.equivalentes.length === 0
              ? vazio(`Ainda não há equivalente cadastrado para ${alvo.exercicio.nome}.`, "Veja em Mesmo músculo ou em Todos.")
              : grupos.equivalentes.map((o) => linha(o.exercicio, "equivalente", o))}
          </div>
        ) : aba === "mesmo" ? (
          <div className="flex flex-col gap-1.5" data-trocar-lista="mesmo">
            {grupos.mesmoMusculo.length === 0
              ? vazio("Nenhum outro exercício do mesmo músculo.", "Veja em Todos.")
              : grupos.mesmoMusculo.map((o) => linha(o.exercicio, "mesmo", o))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" data-trocar-lista="todos">
            <div className="flex h-11 items-center gap-2 rounded-[14px] border border-linha-2 bg-superficie px-3 focus-within:border-violeta/60">
              <Search aria-hidden className="h-4 w-4 flex-none text-texto-3" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={blocoAtual ? `Buscar em ${blocoAtual.nome}…` : "Buscar exercício…"}
                aria-label="Buscar exercício" data-trocar-busca className="min-w-0 flex-1 bg-transparent text-[14px] text-texto outline-none placeholder:text-texto-4" />
              {buscando && (
                <button type="button" aria-label="Limpar a busca" onClick={() => setBusca("")} className="text-texto-3 hover:text-texto">
                  <X aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
            {buscando ? (
              resultados.length === 0 ? vazio("Nenhum exercício encontrado.") : resultados.map((e) => linha(e, "todos", undefined, !bloco))
            ) : blocoAtual ? (
              <>
                <button type="button" onClick={() => setBloco(null)} className="flex items-center gap-1 self-start text-[12.5px] font-semibold text-texto-2 hover:text-texto" data-trocar-voltar-grupos>
                  <ChevronLeft aria-hidden className="h-4 w-4" /> Grupos musculares
                </button>
                <div className="px-1 text-[14px] font-semibold text-texto">{blocoAtual.nome}</div>
                {doBloco.map((e) => linha(e, "todos"))}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {blocos.map(({ bloco: b, exercicios }) => (
                  <button key={b.key} type="button" onClick={() => setBloco(b.key)} data-trocar-bloco={b.key}
                    className="flex items-center gap-2 rounded-2xl border border-linha bg-superficie p-3 text-left hover:border-linha-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-texto">{b.nome}</span>
                      <span className="block text-[11.5px] text-texto-3">{exercicios.length} ex.</span>
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 flex-none text-texto-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PainelDeslizante>
  );
}
