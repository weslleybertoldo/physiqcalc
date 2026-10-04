import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Layers, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GRUPOS_VOLUME } from "@/treino/editor/regras";
import { MiniaturaGif } from "@/treino/ui/MiniaturaGif";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { Segmentado } from "@/ui/premium/Segmentado";
import { excluirExercicio, excluirMusculo } from "./api";
import { FolhaExercicio } from "./FolhaExercicio";
import { classificado, donoAoCriar, ehGlobal, ehMeu, filtrarExercicios, linhaDaBiblioteca, podeCriar, podeEditar, type EscopoBiblioteca } from "./regras";
import type { ExercicioCatalogo, QuemMexe } from "./tipos";
import { mensagemDoErro, useCatalogo, useRecarregar } from "./useTreinos";

/**
 * Painel › Treinos › Biblioteca (C43, W9): a GLOBAL do Physiq (os 81 com GIF, só leitura para o profissional) + a PRÓPRIA (GIF/
 * imagem, subgrupo, dica, grupo muscular, movimento e equipamento). O exercício próprio com movimento e equipamento entra na troca
 * por equivalente do app dos alunos do profissional (o app sincroniza os globais + os do professor dele). O master muda a global.
 * Estado na URL: ?aba=biblioteca&b=global|minha (o ?b= dos links antigos).
 */
export function Biblioteca({
  q,
  params,
  setParams,
  pedidoNovo,
  aoAtenderPedido,
}: {
  q: QuemMexe;
  params: URLSearchParams;
  setParams: (p: URLSearchParams, o?: { replace?: boolean }) => void;
  pedidoNovo: boolean;
  aoAtenderPedido: () => void;
}) {
  const catalogo = useCatalogo(q);
  const recarregar = useRecarregar();
  const escopo: EscopoBiblioteca = q.master ? "global" : params.get("b") === "minha" ? "minha" : "global";
  const [grupo, setGrupo] = useState("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<{ ex: ExercicioCatalogo | null; ler: boolean } | null>(null);
  const [musculosAberto, setMusculosAberto] = useState(false);
  const criar = podeCriar(q);
  const podeEditarAqui = q.staff && (q.master || escopo === "minha");

  useEffect(() => {
    if (pedidoNovo) {
      if (criar) {
        if (!q.master && escopo !== "minha") mudarEscopo("minha");
        setAberto({ ex: null, ler: false });
      }
      aoAtenderPedido();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoNovo]);

  function mudarEscopo(b: EscopoBiblioteca) {
    const n = new URLSearchParams(params);
    n.set("aba", "biblioteca");
    n.delete("t");
    n.set("b", b);
    setParams(n, { replace: true });
  }

  const todos = useMemo(() => catalogo.data?.exercicios ?? [], [catalogo.data]);
  const lista = useMemo(() => filtrarExercicios(todos, escopo, q.meuId, grupo, busca), [todos, escopo, q.meuId, grupo, busca]);
  const nGlobal = todos.filter(ehGlobal).length;
  const nMinha = todos.filter((e) => ehMeu(e, q.meuId)).length;
  const musculosDoEscopo = useMemo(
    () => (catalogo.data?.musculos ?? []).filter((m) => (escopo === "global" ? ehGlobal(m) : ehMeu(m, q.meuId))),
    [catalogo.data, escopo, q.meuId],
  );
  // o grupo muscular do exercício novo/editado: os globais + os meus (o master, os globais)
  const musculosParaForm = useMemo(() => (catalogo.data?.musculos ?? []).filter((m) => ehGlobal(m) || ehMeu(m, q.meuId)), [catalogo.data, q.meuId]);

  if (catalogo.isLoading) {
    return <Cartao className="flex flex-col gap-2 p-5" data-biblioteca="carregando">{[0, 1, 2, 3, 4, 5].map((i) => <Esqueleto key={i} className="h-[58px] w-full" />)}</Cartao>;
  }
  if (catalogo.error || !catalogo.data) {
    return <EstadoErro titulo="Não deu para abrir a biblioteca" texto={mensagemDoErro(catalogo.error)} aoTentar={() => void catalogo.refetch()} />;
  }

  const excluir = async (e: ExercicioCatalogo) => {
    if (!window.confirm(`Excluir "${e.nome}" da biblioteca?\n\nEle sai dos treinos em que está e o histórico de séries feitas com ele também é apagado. Isso não tem volta.`)) return;
    try {
      await excluirExercicio(e.id);
      await recarregar.catalogo();
      toast.success("Exercício excluído.");
    } catch (err) {
      toast.error(mensagemDoErro(err));
    }
  };

  return (
    <div className="flex flex-col gap-3.5" data-biblioteca={escopo} data-biblioteca-total={lista.length}>
      <div className="flex flex-wrap items-center gap-2.5">
        {!q.master && (
          <Segmentado
            rotulo="Biblioteca"
            opcoes={[{ valor: "global", rotulo: `Global (${nGlobal})` }, { valor: "minha", rotulo: `Minha (${nMinha})` }]}
            valor={escopo}
            aoMudar={(v) => mudarEscopo(v)}
          />
        )}
        <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-linha bg-superficie px-3 text-[13px] text-texto-2 sm:max-w-[320px]">
          <Search aria-hidden className="h-4 w-4 text-texto-3" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, músculo ou equipamento" className="min-w-0 flex-1 bg-transparent text-texto outline-none placeholder:text-texto-3" data-biblioteca-busca-painel />
        </label>
        <Botao tamanho="sm" variante="g" icone={Layers} onClick={() => setMusculosAberto(true)} className="ml-auto" data-btn-grupos-musculares>
          Grupos musculares ({musculosDoEscopo.length})
        </Botao>
      </div>
      <p className="-mt-1 text-[12px] text-texto-3" data-biblioteca-explica>
        {escopo === "global"
          ? q.master
            ? "Catálogo global do Physiq: o que você muda aqui vale para todos os profissionais e alunos."
            : "Catálogo global do Physiq — só leitura. Use nos seus treinos; para criar os seus, mude para \"Minha\"."
          : "Seus exercícios: só você e os seus alunos veem. Com movimento e equipamento, entram na troca por equivalente do app."}
      </p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Grupo muscular">
        {[{ chave: "todos", nome: "Todos" }, ...GRUPOS_VOLUME.filter((g) => g.chave !== "outros")].map((g) => (
          <button key={g.chave} type="button" role="radio" aria-checked={grupo === g.chave} onClick={() => setGrupo(g.chave)}
            className={cn("pq-chip h-7 cursor-pointer px-3 text-[11.5px] tracking-normal", grupo === g.chave ? "pq-chip-t" : "pq-chip-g")} data-filtro-grupo={g.chave}>
            {g.nome}
          </button>
        ))}
      </div>

      <Cartao className="px-[18px] py-4">
        <CabecalhoCartao
          titulo={escopo === "global" ? "Exercícios do Physiq" : "Meus exercícios"}
          extra={<Chip tom="t" data-chip-total-exercicios>{lista.length} {lista.length === 1 ? "EXERCÍCIO" : "EXERCÍCIOS"}</Chip>}
          acao={podeEditarAqui ? <Botao tamanho="sm" variante="v" icone={Plus} onClick={() => setAberto({ ex: null, ler: false })} data-btn-criar-exercicio>Novo exercício</Botao> : undefined}
        />
        {lista.length === 0 ? (
          <EstadoVazio
            icone={Layers}
            titulo={escopo === "minha" && !busca && grupo === "todos" ? "Nenhum exercício seu ainda" : "Nenhum exercício"}
            texto={escopo === "minha" && !busca && grupo === "todos" ? "Crie o primeiro com o GIF, o movimento e o equipamento." : "Mude a busca ou o grupo."}
            className="border-0 bg-transparent py-6 shadow-none"
          />
        ) : (
          <ul className="grid gap-x-6 lg:grid-cols-2" data-biblioteca-lista-painel={lista.length}>
            {lista.map((e) => {
              const editavel = podeEditar(e, q);
              return (
                <li key={e.id} className="flex items-center gap-3 border-t border-[rgba(255,255,255,.06)] py-[9px]" data-exercicio-biblioteca={e.id} data-exercicio-biblioteca-nome={e.nome}>
                  <button type="button" onClick={() => setAberto({ ex: e, ler: !editavel })} className="flex min-w-0 flex-1 items-center gap-3 text-left" data-exercicio-abrir>
                    <MiniaturaGif url={e.imagem_url} exercicioId={e.id} nome={e.nome} className="h-[42px] w-[46px] rounded-[11px]" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-semibold text-texto" title={e.nome}>{e.nome}</b>
                      <span className="mt-0.5 block truncate text-[11.5px] text-texto-3" data-exercicio-classificacao={classificado(e) ? "1" : "0"}>{linhaDaBiblioteca(e)}</span>
                    </span>
                  </button>
                  {classificado(e) && <ArrowLeftRight aria-label="Entra na troca por equivalente" className="h-3.5 w-3.5 flex-none text-violeta-3" />}
                  {editavel ? (
                    <span className="flex flex-none items-center gap-1 text-texto-3">
                      <BotaoIcone icone={Pencil} rotulo={`Editar ${e.nome}`} onClick={() => setAberto({ ex: e, ler: false })} tamanho={30} data-exercicio-editar-bib />
                      <BotaoIcone icone={Trash2} rotulo={`Excluir ${e.nome}`} onClick={() => void excluir(e)} tamanho={30} data-exercicio-excluir-bib />
                    </span>
                  ) : (
                    <Lock aria-label="Global — só leitura" className="h-3.5 w-3.5 flex-none text-texto-3" data-exercicio-global />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      <FolhaExercicio
        aberto={!!aberto}
        aoMudar={(a) => !a && setAberto(null)}
        exercicio={aberto?.ex ?? null}
        somenteLeitura={!!aberto?.ler}
        musculos={musculosParaForm}
        dono={aberto?.ex ? aberto.ex.professor_id : donoAoCriar(q)}
        aoSalvo={() => {
          setAberto(null);
          void recarregar.catalogo();
        }}
      />
      <FolhaMusculos
        aberto={musculosAberto}
        aoMudar={setMusculosAberto}
        musculos={musculosDoEscopo}
        editavel={(m) => podeEditar(m, q)}
        titulo={escopo === "global" ? "Grupos musculares do Physiq" : "Meus grupos musculares"}
        aoExcluir={async (id, nome) => {
          if (!window.confirm(`Excluir o grupo "${nome}"? Os exercícios dele não mudam.`)) return;
          try {
            await excluirMusculo(id);
            await recarregar.catalogo();
            toast.success("Grupo muscular excluído.");
          } catch (e) {
            toast.error(mensagemDoErro(e));
          }
        }}
      />
    </div>
  );
}

function FolhaMusculos({
  aberto,
  aoMudar,
  musculos,
  editavel,
  titulo,
  aoExcluir,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  musculos: { id: string; nome: string; professor_id: string | null }[];
  editavel: (m: { professor_id: string | null }) => boolean;
  titulo: string;
  aoExcluir: (id: string, nome: string) => Promise<void>;
}) {
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} lado="direita" titulo={titulo}
      descricao="Para criar um, use “Músculo que não está na lista” no exercício.">
      <ul className="flex flex-col" data-folha-musculos={musculos.length}>
        {musculos.length === 0 && <li className="py-2 text-[13px] text-texto-3">Nenhum grupo muscular aqui ainda.</li>}
        {musculos.map((m) => (
          <li key={m.id} className="flex items-center gap-2 border-t border-[rgba(255,255,255,.06)] py-2 text-[13.5px] text-texto" data-musculo={m.nome}>
            <span className="min-w-0 flex-1 truncate">{m.nome}</span>
            {editavel(m) ? (
              <BotaoIcone icone={Trash2} rotulo={`Excluir ${m.nome}`} onClick={() => void aoExcluir(m.id, m.nome)} tamanho={30} />
            ) : (
              <Lock aria-label="Global — só leitura" className="h-3.5 w-3.5 text-texto-3" />
            )}
          </li>
        ))}
      </ul>
    </PainelDeslizante>
  );
}
