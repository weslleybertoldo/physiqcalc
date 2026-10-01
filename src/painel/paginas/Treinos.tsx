import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Dumbbell, FileBarChart, History, Library, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Biblioteca } from "@/painel/treinos/Biblioteca";
import { Historico } from "@/painel/treinos/Historico";
import { MeusTreinos } from "@/painel/treinos/MeusTreinos";
import { Relatorio } from "@/painel/treinos/Relatorio";
import { abaDaUrl, podeCriar } from "@/painel/treinos/regras";
import type { AbaTreinos } from "@/painel/treinos/tipos";
import { useQuemMexe } from "@/painel/treinos/useTreinos";
import { SemConexaoTreino } from "@/ui/casca/SemConexaoTreino";
import { TopoPagina } from "@/ui/casca/topo";
import { useTreinoDaPagina } from "@/ui/casca/treinoDaPagina";
import { Botao } from "@/ui/premium/Botao";

const ABAS: { id: AbaTreinos; rotulo: string; icone: LucideIcon }[] = [
  { id: "treinos", rotulo: "Meus treinos", icone: Dumbbell },
  { id: "biblioteca", rotulo: "Biblioteca", icone: Library },
  { id: "historico", rotulo: "Histórico", icone: History },
  { id: "relatorio", rotulo: "Relatório", icone: FileBarChart },
];

/**
 * Painel › Treinos (W23 — spec 4.4 "Treinos", C42–C45; padrão das telas 8 e 6): Meus treinos (pastas, treinos-modelo com os
 * exercícios — GIF, séries, repetições, descanso e carga do modelo —, quem recebe; os globais do master só leitura), Biblioteca
 * (global só leitura + a própria: GIF/imagem, subgrupo, dica, grupo muscular, movimento e equipamento — W9), Histórico de treinos
 * por aluno e mês e Relatório mensal (PDF e Excel — o gerador da W15). Substitui a aba "Treinos" do admin antigo
 * (/admin/treinos → /painel/treinos; os ?t=, ?pasta= e ?b= dos links antigos continuam valendo). Banco do Treino, online.
 */
export default function Treinos() {
  const sessao = useTreinoDaPagina();
  const q = useQuemMexe();
  const [sp, setSp] = useSearchParams();
  const aba = abaDaUrl(sp);
  const [pedido, setPedido] = useState<null | AbaTreinos>(null);
  const atendido = useCallback(() => setPedido(null), []);

  if (sessao.tipo !== "ok") {
    return (
      <div data-pagina-treinos-painel data-estado={sessao.tipo}>
        <TopoPagina titulo="Treinos" />
        <SemConexaoTreino estado={sessao} />
      </div>
    );
  }

  const irPara = (id: AbaTreinos) => {
    const n = new URLSearchParams();
    n.set("aba", id);
    // a biblioteca lembra o escopo (Global/Minha)
    if (id === "biblioteca" && sp.get("b")) n.set("b", sp.get("b")!);
    setSp(n, { replace: false });
  };
  const subtitulo = q.master
    ? "Catálogo global do Physiq, os seus treinos e os seus alunos"
    : q.staff
      ? "Seus treinos e a biblioteca · os globais do Physiq ficam só para ler"
      : "Os treinos da conta (quem muda é o personal)";
  const criar = podeCriar(q);
  const acao =
    aba === "treinos" && criar ? (
      <Botao variante="w" icone={Plus} onClick={() => setPedido("treinos")} data-btn-novo-treino>Novo treino</Botao>
    ) : aba === "biblioteca" && criar ? (
      <Botao variante="w" icone={Plus} onClick={() => setPedido("biblioteca")} data-btn-novo-exercicio>Novo exercício</Botao>
    ) : undefined;

  return (
    <div className="flex flex-col" data-pagina-treinos-painel data-aba-treinos={aba} data-master={q.master ? "1" : "0"} data-staff={q.staff ? "1" : "0"}>
      <TopoPagina titulo="Treinos" subtitulo={<span data-subtitulo-treinos>{subtitulo}</span>} acoes={acao} />

      <nav aria-label="Abas dos treinos" data-abas-treinos className="pq-sem-barra flex gap-1 overflow-x-auto border-b border-linha">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          const Icone = a.icone;
          return (
            <button key={a.id} type="button" role="tab" aria-selected={ativa} onClick={() => irPara(a.id)} data-aba-treinos-botao={a.id}
              className={cn("relative flex h-[42px] flex-none items-center gap-2 px-3.5 text-[13.5px] font-semibold transition-colors", ativa ? "text-texto" : "text-texto-3 hover:text-texto-2")}>
              <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
              {a.rotulo}
              {ativa && (
                <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-sm"
                  style={{ background: "linear-gradient(90deg,var(--p-violeta-2),var(--p-verde-2))", boxShadow: "0 0 12px rgba(167,139,250,.9)" }} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 min-w-0">
        {aba === "treinos" && <MeusTreinos q={q} params={sp} setParams={setSp} pedidoNovo={pedido === "treinos"} aoAtenderPedido={atendido} />}
        {aba === "biblioteca" && <Biblioteca q={q} params={sp} setParams={setSp} pedidoNovo={pedido === "biblioteca"} aoAtenderPedido={atendido} />}
        {aba === "historico" && <Historico q={q} />}
        {aba === "relatorio" && <Relatorio q={q} />}
      </div>
    </div>
  );
}
