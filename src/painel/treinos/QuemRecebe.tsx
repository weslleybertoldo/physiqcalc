import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { aplicarModeloNoAluno, darModelo, tirarModelo } from "./api";
import { normalizar, textoAlunos } from "./regras";
import type { AlunoDaLista, ModeloTela, PerfilRecebe, QuemMexe } from "./tipos";
import { CHAVE_RECEBE, mensagemDoErro, useRecarregar } from "./useTreinos";

/**
 * "Quem recebe" (C42): os alunos da lista do profissional, marcados quando recebem o modelo. Marcar dá o modelo ao aluno (ele
 * aparece no app — e leva a prescrição do modelo onde não tem a dele); desmarcar tira (sai da semana e das trocas de hoje em
 * diante, a regra da W15). "Aplicar a quem recebe" leva a prescrição do modelo aos que já recebem, só no que está vazio.
 */
export function QuemRecebe({
  modelo,
  alunos,
  perfis,
  carregando,
  erro,
  aoTentar,
  q,
}: {
  modelo: ModeloTela;
  alunos: AlunoDaLista[];
  perfis: PerfilRecebe[];
  carregando: boolean;
  erro: unknown;
  aoTentar: () => void;
  q: QuemMexe;
}) {
  const qc = useQueryClient();
  const recarregar = useRecarregar();
  const [busca, setBusca] = useState("");
  const [indo, setIndo] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const recebem = useMemo(() => new Set(perfis.filter((p) => p.grupo_id === modelo.id).map((p) => p.user_id)), [perfis, modelo.id]);
  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());
    return alunos
      .filter((a) => !termo || normalizar(`${a.nome} ${a.email}`).includes(termo))
      .sort((a, b) => Number(recebem.has(b.id)) - Number(recebem.has(a.id)) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [alunos, busca, recebem]);
  const quantos = alunos.filter((a) => recebem.has(a.id)).length;
  const podeMexer = q.staff;

  /** otimista: a marca muda na hora; volta se o servidor recusar */
  const marcarLocal = (aluno: string, recebe: boolean) =>
    qc.setQueriesData<PerfilRecebe[]>({ queryKey: [CHAVE_RECEBE] }, (atual) => {
      if (!atual) return atual;
      const sem = atual.filter((p) => !(p.grupo_id === modelo.id && p.user_id === aluno));
      return recebe ? [...sem, { grupo_id: modelo.id, user_id: aluno }] : sem;
    });

  const alternar = async (a: AlunoDaLista) => {
    if (!podeMexer || indo) return;
    const tirar = recebem.has(a.id);
    if (tirar && !window.confirm(`Tirar "${modelo.nome}" de ${a.nome}? Ele sai da semana do aluno e das trocas de hoje em diante (o treino continua aqui).`)) return;
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
    const alvo = alunos.filter((a) => recebem.has(a.id));
    if (!alvo.length) return;
    if (!window.confirm(`Levar a prescrição do modelo para ${textoAlunos(alvo.length).toLowerCase()} que ${alvo.length === 1 ? "recebe" : "recebem"} "${modelo.nome}"? Só entra onde o aluno ainda não tem séries, repetições, descanso ou carga dele.`)) return;
    setAplicando(true);
    let total = 0;
    let falhas = 0;
    for (const a of alvo) {
      try {
        const r = await aplicarModeloNoAluno(a.id, modelo.id);
        total += Number(r?.preenchidos ?? 0);
      } catch {
        falhas++;
      }
    }
    setAplicando(false);
    if (falhas) toast.error(`Não deu para ${falhas === 1 ? "1 aluno" : `${falhas} alunos`}. Tente de novo.`);
    else toast.success(total ? `Prescrição do modelo levada a ${total} ${total === 1 ? "exercício" : "exercícios"} dos alunos.` : "Os alunos já tinham tudo preenchido: nada mudou.");
  };

  return (
    <Cartao className="px-[18px] py-4" data-quem-recebe={modelo.id} data-quem-recebe-total={quantos}>
      <CabecalhoCartao
        titulo="Quem recebe"
        extra={<Chip tom="t" data-quem-recebe-chip>{quantos} DE {alunos.length}</Chip>}
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
      {carregando ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-11 w-full" />)}</div>
      ) : erro ? (
        <EstadoErro titulo="Não deu para abrir os alunos" texto={mensagemDoErro(erro)} aoTentar={aoTentar} />
      ) : alunos.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[13px] text-texto-2" data-quem-recebe-vazio>
          <Users aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
          <span>
            Nenhum aluno na sua lista ainda. <Link to="/painel/alunos" className="font-semibold text-violeta-3">Convide em Alunos</Link>.
          </span>
        </div>
      ) : (
        <>
          {alunos.length > 6 && (
            <label className="mb-2 flex h-9 items-center gap-2 rounded-xl border border-linha bg-superficie px-3 text-[13px] text-texto-2">
              <Search aria-hidden className="h-4 w-4 text-texto-3" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno" className="min-w-0 flex-1 bg-transparent text-texto outline-none placeholder:text-texto-3" data-quem-recebe-busca />
            </label>
          )}
          <ul className="flex max-h-[360px] flex-col overflow-y-auto" data-quem-recebe-lista={lista.length}>
            {lista.map((a) => {
              const marcado = recebem.has(a.id);
              return (
                <li key={a.id}>
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
        </>
      )}
    </Cartao>
  );
}
