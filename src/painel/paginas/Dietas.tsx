import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Apple, Camera, ChefHat, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alimentos } from "@/painel/dietas/Alimentos";
import { useContextoDietas } from "@/painel/dietas/contexto";
import { Diario } from "@/painel/dietas/Diario";
import { contarNaoReagidas } from "@/painel/dietas/diarioPainel";
import { Receitas } from "@/painel/dietas/Receitas";
import { abaDietasDaUrl, type AbaDietas } from "@/painel/dietas/regras";
import { useDiarioDaConta } from "@/painel/dietas/useDiario";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { EstadoCarregando } from "@/ui/premium/Estados";

const ABAS: { id: AbaDietas; rotulo: string; icone: LucideIcon }[] = [
  { id: "alimentos", rotulo: "Alimentos", icone: Apple },
  { id: "receitas", rotulo: "Receitas", icone: ChefHat },
  { id: "diario", rotulo: "Diário alimentar", icone: Camera },
];

/**
 * Painel › Dietas (W24 — spec 4.4 "Dietas", N-16/N-17/N-18; padrão das telas 8 e 6): Alimentos (TACO com 597 itens, só leitura, + os
 * próprios com marca e medidas caseiras — o "Novo/Editar alimento" trabalha na porção e grava o equivalente em 100 g, regra da H1),
 * Receitas (calculadas pelos ingredientes, grupos, PDF) e Diário alimentar (fotos de 7 a 90 dias e reação: ótimo, bom, atenção, evitar
 * + comentário). Banco principal, online. Só aparece para conta com Nutrição (menu); escrever exige ser nutricionista da conta.
 */
export default function Dietas() {
  const ctx = useContextoDietas();
  const [sp, setSp] = useSearchParams();
  const aba = abaDietasDaUrl(sp);
  const [pedido, setPedido] = useState<null | AbaDietas>(null);
  const atendido = useCallback(() => setPedido(null), []);
  // o número da aba Diário: as fotos não reagidas dos últimos 7 dias (a mesma consulta da aba, em cache)
  const { registros } = useDiarioDaConta(ctx.contaId, ctx.uid, 7, ctx.souNutri && ctx.pronto);
  const naoReagidas = contarNaoReagidas(registros);

  const irPara = (id: AbaDietas) => {
    const n = new URLSearchParams();
    n.set("aba", id);
    setSp(n, { replace: false });
  };
  const subtitulo = ctx.souNutri
    ? "Alimentos, receitas e o diário alimentar dos seus alunos"
    : "A tabela TACO para consulta · alimentos, receitas e o diário são da nutricionista da conta";
  const acao =
    aba === "alimentos" && ctx.souNutri ? (
      <Botao variante="w" icone={Plus} onClick={() => setPedido("alimentos")} data-btn-novo-alimento>Novo alimento</Botao>
    ) : aba === "receitas" && ctx.souNutri ? (
      <Botao variante="w" icone={Plus} onClick={() => setPedido("receitas")} data-btn-nova-receita>Nova receita</Botao>
    ) : undefined;

  return (
    <div className="flex flex-col" data-pagina-dietas data-aba-dietas={aba} data-sou-nutri={ctx.souNutri ? "1" : "0"} data-master={ctx.master ? "1" : "0"}>
      <TopoPagina titulo="Dietas" subtitulo={<span data-subtitulo-dietas>{subtitulo}</span>} acoes={acao} />

      <nav aria-label="Abas das dietas" data-abas-dietas className="pq-sem-barra flex gap-1 overflow-x-auto border-b border-linha">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          const Icone = a.icone;
          return (
            <button key={a.id} type="button" role="tab" aria-selected={ativa} onClick={() => irPara(a.id)} data-aba-dietas-botao={a.id}
              className={cn("relative flex h-[42px] flex-none items-center gap-2 px-3.5 text-[13.5px] font-semibold transition-colors", ativa ? "text-texto" : "text-texto-3 hover:text-texto-2")}>
              <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
              {a.rotulo}
              {a.id === "diario" && naoReagidas > 0 && (
                <span className="rounded-full bg-verde px-1.5 text-[11px] font-bold text-black" data-contador-nao-reagidas={naoReagidas}>{naoReagidas}</span>
              )}
              {ativa && (
                <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-sm"
                  style={{ background: "linear-gradient(90deg,var(--p-verde-2),var(--p-violeta-2))", boxShadow: "0 0 12px rgba(52,211,153,.8)" }} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 min-w-0">
        {!ctx.pronto ? (
          <EstadoCarregando linhas={3} rotulo="Abrindo as dietas" />
        ) : aba === "alimentos" ? (
          <Alimentos ctx={ctx} pedidoNovo={pedido === "alimentos"} aoAtenderPedido={atendido} />
        ) : aba === "receitas" ? (
          <Receitas ctx={ctx} params={sp} setParams={setSp} pedidoNovo={pedido === "receitas"} aoAtenderPedido={atendido} />
        ) : (
          <Diario ctx={ctx} params={sp} setParams={setSp} />
        )}
      </div>
    </div>
  );
}
