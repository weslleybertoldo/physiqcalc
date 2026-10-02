import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { rotuloDoMes, useNovosPorMes } from "./novosPorMes";

/**
 * Card "Novos alunos por mês" da página Alunos (W25 — N-9, padrão da tela 6: as barras dos últimos 6 meses, o mês atual em destaque e
 * o número dele). Vazio com texto quando não entrou ninguém no período. Compacto, em cima da lista (a lista da W13 não muda).
 */
export function NovosPorMes({ contaId, dono }: { contaId: string; dono: boolean }) {
  const q = useNovosPorMes(contaId);
  const d = q.data;
  if (q.isLoading) {
    return (
      <Cartao className="px-[22px] pb-4 pt-[18px]" data-cartao-novos-por-mes="carregando">
        <Esqueleto className="h-[104px] w-full" />
      </Cartao>
    );
  }
  if (!d) {
    return (
      <Cartao className="px-[22px] py-4" data-cartao-novos-por-mes="erro">
        <p className="text-[12.5px] text-texto-3">Não deu para carregar os novos alunos por mês agora.</p>
      </Cartao>
    );
  }
  const max = Math.max(1, ...d.meses.map((m) => m.novos));
  return (
    <Cartao className="px-[22px] pb-4 pt-[18px]" data-cartao-novos-por-mes data-novos-mes={d.doMes} data-novos-total={d.total}>
      <CabecalhoCartao
        titulo="Novos alunos por mês"
        extra={<Chip tom="g" className="h-[22px] text-[10.5px]">ÚLTIMOS 6 MESES</Chip>}
        acao={
          <span className="flex items-center gap-1.5 text-[12.5px] text-texto-2">
            <UserPlus aria-hidden className="h-4 w-4 text-violeta-3" strokeWidth={1.75} />
            <b className="font-semibold tabular-nums text-texto" data-novos-este-mes>{d.doMes}</b> este mês
          </span>
        }
      />
      {d.total === 0 ? (
        <p className="py-3 text-[12.5px] leading-relaxed text-texto-3" data-novos-vazio>
          {dono ? "Nenhum aluno novo nos últimos 6 meses." : "Nenhum aluno novo seu nos últimos 6 meses."} Quem você cadastra, convida ou aprova pelo link
          aparece aqui no mês em que entrou.
        </p>
      ) : (
        <div className="flex items-end gap-3" data-grafico-novos>
          {d.meses.map((m) => {
            const atual = m.mes === d.mesAtual;
            return (
              <div key={m.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" data-novos-barra={m.mes} data-novos={m.novos}>
                <span className={cn("text-[11px] font-semibold tabular-nums", atual ? "text-texto" : "text-texto-3")}>{m.novos || ""}</span>
                <div className="flex h-[64px] w-full items-end justify-center">
                  <div
                    className="w-[46%] max-w-[30px] rounded-t-[7px] rounded-b-[3px]"
                    style={{
                      height: `${(m.novos / max) * 100}%`,
                      minHeight: m.novos ? 4 : 2,
                      background: m.novos ? "linear-gradient(180deg,var(--p-violeta-2),rgba(139,92,246,.35))" : "var(--p-linha-3)",
                      boxShadow: atual && m.novos ? "0 0 18px rgba(167,139,250,.45)" : undefined,
                    }}
                  />
                </div>
                <span className={cn("text-[11px]", atual ? "font-semibold text-texto-2" : "text-texto-4")}>{rotuloDoMes(m.mes)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Cartao>
  );
}
