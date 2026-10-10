import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { Paginacao } from "@/ui/premium/Paginacao";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";
import { aplicarModeloNoAluno, carregarQuemRecebe, carregarQuemRecebeLista, darModelo, tirarModelo } from "./api";
import { textoAlunos } from "./regras";
import type { AlunoQuemRecebe, ModeloTela, PaginaQuemRecebe, QuemMexe } from "./tipos";
import { CHAVE_RECEBE_LISTA, mensagemDoErro, useRecarregar, useTermoComEspera } from "./useTreinos";

/**
 * "Quem recebe" (C42): os alunos da lista do profissional, marcados quando recebem o modelo. Marcar dá o modelo ao aluno (ele
 * aparece no app — e leva a prescrição do modelo onde não tem a dele); desmarcar tira (sai da semana e das trocas de hoje em
 * diante, a regra da W15). "Aplicar a quem recebe" leva a prescrição do modelo aos que já recebem, só no que está vazio.
 * hml-14d (B19/B21 · D25, P5): a lista vem do servidor (a ação quemRecebeLista), 20 por página (`?pagina_recebe=`), quem recebe
 * primeiro e depois o nome; a busca (nome e e-mail, sem acento) fica SEMPRE à vista (antes só aparecia com mais de 6 alunos) e o
 * chip "N DE M" vem do servidor. "Aplicar a quem recebe" lê todos os que recebem (quemRecebe), não só a página.
 */
export function QuemRecebe({ modelo, q }: { modelo: ModeloTela; q: QuemMexe }) {
  const qc = useQueryClient();
  const recarregar = useRecarregar();
  const confirmar = useConfirmar();
  const [busca, setBusca] = useState("");
  const termo = useTermoComEspera(busca);
  const [indo, setIndo] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const podeMexer = q.staff;

  const filtro = useMemo(() => ({ modelo: modelo.id, q: termo }), [modelo.id, termo]);
  const [totalLido, setTotalLido] = useState<number | null>(null);
  const { pagina, irPara } = usePaginaNaUrl({ chave: "pagina_recebe", filtro, total: totalLido });
  const lista = useQuery({
    queryKey: [CHAVE_RECEBE_LISTA, q.meuId, modelo.id, termo, pagina],
    queryFn: () => carregarQuemRecebeLista(modelo.id, termo, pagina),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
    networkMode: "online",
  });
  // a página anterior que fica à vista enquanto a nova chega (keepPreviousData) só vale se for deste modelo
  const dados = lista.data?.grupo === modelo.id ? lista.data : undefined;
  const totalDaResposta = dados && !lista.isPlaceholderData ? dados.total : null;
  useEffect(() => {
    if (totalDaResposta !== null) setTotalLido(totalDaResposta);
  }, [totalDaResposta]);
  const itens = dados?.itens ?? [];
  const quantos = dados?.totalRecebem ?? 0;
  const alunos = dados?.totalAlunos ?? 0;

  /** otimista: a marca muda na hora (e o "N DE M"); volta se o servidor recusar (o recarregar relê) */
  const marcarLocal = (aluno: string, recebe: boolean) =>
    qc.setQueriesData<PaginaQuemRecebe>({ queryKey: [CHAVE_RECEBE_LISTA, q.meuId, modelo.id] }, (atual) => {
      if (!atual) return atual;
      const tinha = atual.itens.find((a) => a.id === aluno)?.recebe;
      if (tinha === undefined || tinha === recebe) return atual;
      return {
        ...atual,
        itens: atual.itens.map((a) => (a.id === aluno ? { ...a, recebe } : a)),
        totalRecebem: Math.max(0, atual.totalRecebem + (recebe ? 1 : -1)),
      };
    });

  const alternar = async (a: AlunoQuemRecebe) => {
    if (!podeMexer || indo) return;
    const tirar = a.recebe;
    if (tirar && !(await confirmar({ titulo: `Tirar "${modelo.nome}" de ${a.nome}?`,
      descricao: "Ele sai da semana do aluno e das trocas de hoje em diante (o treino continua aqui).", rotuloConfirmar: "Tirar", perigo: true }))) return;
    setIndo(a.id);
    marcarLocal(a.id, !tirar);
    try {
      if (tirar) {
        await tirarModelo(a.id, modelo.id);
        toast.success(`${a.nome.split(" ")[0]} não recebe mais "${modelo.nome}".`);
      } else {
        const r = await darModelo(a.id, modelo.id);
        const n = Number(r?.prescricao_do_modelo ?? 0);
        toast.success(`${a.nome.split(" ")[0]} recebe "${modelo.nome}"${n ? ` com a prescrição do modelo em ${n} ${n === 1 ? "exercício" : "exercícios"}` : ""}.`);
      }
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setIndo(null);
      void recarregar.recebe();
    }
  };

  const aplicar = async () => {
    if (!quantos) return;
    // confirma 1 vez e depois leva aluno por aluno (o laço abaixo não muda)
    if (!(await confirmar({ titulo: `Levar a prescrição do modelo para ${textoAlunos(quantos).toLowerCase()} que ${quantos === 1 ? "recebe" : "recebem"} "${modelo.nome}"?`,
      descricao: "Só entra onde o aluno ainda não tem séries, repetições, descanso ou carga dele.",
      rotuloConfirmar: `Levar para ${textoAlunos(quantos).toLowerCase()}` }))) return;
    setAplicando(true);
    let total = 0;
    let falhas = 0;
    try {
      // todos os que recebem (não só a página à vista)
      const alvo = [...new Set((await carregarQuemRecebe([modelo.id])).filter((p) => p.grupo_id === modelo.id).map((p) => p.user_id))];
      for (const aluno of alvo) {
        try {
          const r = await aplicarModeloNoAluno(aluno, modelo.id);
          total += Number(r?.preenchidos ?? 0);
        } catch {
          falhas++;
        }
      }
    } catch (e) {
      setAplicando(false);
      toast.error(mensagemDoErro(e));
      return;
    }
    setAplicando(false);
    if (falhas) toast.error(`Não deu para ${falhas === 1 ? "1 aluno" : `${falhas} alunos`}. Tente de novo.`);
    else toast.success(total ? `Prescrição do modelo levada a ${total} ${total === 1 ? "exercício" : "exercícios"} dos alunos.` : "Os alunos já tinham tudo preenchido: nada mudou.");
  };

  return (
    <Cartao className="px-[18px] py-4" data-quem-recebe={modelo.id} data-quem-recebe-total={quantos}>
      <CabecalhoCartao
        titulo="Quem recebe"
        extra={dados ? <Chip tom="t" data-quem-recebe-chip>{quantos} DE {alunos}</Chip> : undefined}
        acao={
          podeMexer && modelo.temPrescricao && quantos > 0 ? (
            <Botao tamanho="sm" variante="g" icone={ListChecks} onClick={() => void aplicar()} disabled={aplicando} data-quem-recebe-aplicar>
              {aplicando ? "Aplicando…" : "Aplicar a quem recebe"}
            </Botao>
          ) : undefined
        }
      />
      <p className="-mt-1 mb-3 text-[12px] text-texto-3">
        {podeMexer
          ? "Marque os alunos que recebem este treino no app. Quem recebe pode treinar com ele e você monta a semana no perfil do aluno."
          : "Os alunos que recebem este treino. Quem muda é o personal responsável."}
      </p>
      <label className="mb-2 flex h-9 items-center gap-2 rounded-xl border border-linha bg-superficie px-3 text-[13px] text-texto-2">
        <Search aria-hidden className="h-4 w-4 text-texto-3" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno" aria-label="Buscar aluno"
          className="min-w-0 flex-1 bg-transparent text-texto outline-none placeholder:text-texto-3" data-quem-recebe-busca />
      </label>
      {lista.isLoading || (!dados && lista.isFetching) ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-11 w-full" />)}</div>
      ) : lista.error || !dados ? (
        <EstadoErro titulo="Não deu para abrir os alunos" texto={mensagemDoErro(lista.error)} aoTentar={() => void lista.refetch()} />
      ) : alunos === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] text-texto-2" data-quem-recebe-vazio>
          <Users aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
          <span>
            Nenhum aluno na sua lista ainda. <Link to="/painel/alunos" className="font-semibold text-violeta-3">Convide em Alunos</Link>.
          </span>
        </div>
      ) : itens.length === 0 ? (
        <p className="px-1 py-2 text-[12.5px] text-texto-3" data-quem-recebe-sem-busca>Nenhum aluno com essa busca.</p>
      ) : (
        <>
          <ul className="flex max-h-[360px] flex-col overflow-y-auto" data-quem-recebe-lista={itens.length} data-lista="quem-recebe" data-atualizando={lista.isFetching ? "1" : "0"}>
            {itens.map((a) => {
              const marcado = a.recebe;
              return (
                <li key={a.id} data-item>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    disabled={!podeMexer || indo === a.id}
                    onClick={() => void alternar(a)}
                    className="flex w-full items-center gap-3 border-t border-[rgba(255,255,255,.06)] py-2 text-left disabled:cursor-default"
                    data-quem-recebe-aluno={a.id}
                    data-recebe={marcado ? "1" : "0"}
                  >
                    <Avatar nome={a.nome} src={a.foto_url ?? undefined} tamanho={32} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px] font-semibold text-texto">{a.nome}</b>
                      <span className="block truncate text-[11.5px] text-texto-3">{a.email}</span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-6 w-6 flex-none items-center justify-center rounded-lg border transition-colors",
                        marcado ? "border-violeta-3 bg-violeta text-white" : "border-linha-2 bg-[rgba(255,255,255,.03)]",
                      )}
                    >
                      {marcado && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Paginacao nome="quem-recebe" pagina={pagina} total={dados.total} aoMudar={irPara} carregando={lista.isFetching} className="border-t border-[rgba(255,255,255,.06)]" />
        </>
      )}
    </Cartao>
  );
}
