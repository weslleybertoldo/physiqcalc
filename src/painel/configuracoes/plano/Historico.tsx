import { Check, Receipt } from "lucide-react";
import { NOME_PLANO, ROTULO_STATUS_FATURA, dataBR, ehPlano, reais } from "@/nucleo/cobranca/regras";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import type { FaturaConta } from "./api";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function diaSP(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function forma(f: FaturaConta): string {
  if (f.tipo === "recorrente") return "Cartão (automático)";
  if (f.forma === "pix") return "Pix";
  if (f.forma === "cartao") return "Cartão";
  if (f.forma === "manual") return "Registrado";
  return "—";
}

/** Rótulo da fatura como no card Financeiro da tela 7 ("Julho · R$ 249,00"): o mês que ela cobre (ou o do pedido). */
function titulo(f: FaturaConta): string {
  const ref = (f.cobre_de ?? diaSP(f.criado_em)).slice(0, 10);
  const [, m] = ref.split("-");
  const mes = MESES[Number(m) - 1] ?? "";
  return `${f.meses === 12 || f.tipo === "anual" ? `Anual (${mes})` : mes} · ${reais(f.valor)}`;
}

function detalhe(f: FaturaConta): string {
  const plano = f.plano && ehPlano(f.plano) ? NOME_PLANO[f.plano] : null;
  const partes = [forma(f)];
  if (f.status === "approved" && f.pago_em) partes.push(`pago em ${dataBR(diaSP(f.pago_em))}`);
  else if ((f.status === "pending" || f.status === "in_process") && f.forma === "pix" && f.pix_expira_em) partes.push(`vale até ${dataBR(diaSP(f.pix_expira_em))}`);
  else partes.push(`em ${dataBR(diaSP(f.criado_em))}`);
  if (f.cobre_de && f.cobre_ate && f.status === "approved") partes.push(`cobre ${dataBR(f.cobre_de)} a ${dataBR(f.cobre_ate)}`);
  if (plano) partes.push(plano);
  return partes.join(" · ");
}

/** Histórico de faturas da conta (6.5): data, período, valor, forma e situação — no padrão do card Financeiro da tela 7. */
export function HistoricoFaturas({ faturas }: { faturas: FaturaConta[] }) {
  const lista = faturas.filter((f) => f.status !== "cancelled" || f.pago_em);
  return (
    <Cartao className="p-5" data-historico-faturas>
      <CabecalhoCartao titulo="Histórico de faturas" extra={lista.length ? <Chip tom="g">{lista.length}</Chip> : undefined} />
      {lista.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-linha px-3.5 py-4 text-[13px] text-texto-3">
          <Receipt aria-hidden className="h-4 w-4" /> Nenhuma fatura ainda. Os pagamentos aparecem aqui.
        </div>
      ) : (
        <ul className="divide-y divide-linha-3">
          {lista.map((f) => {
            const st = ROTULO_STATUS_FATURA[f.status] ?? { rotulo: f.status.toUpperCase(), tom: "g" as const };
            return (
              <li key={f.id} className="flex items-center gap-3 py-3" data-fatura={f.status}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-texto">{titulo(f)}</div>
                  <div className="truncate text-[12.5px] text-texto-3">{detalhe(f)}</div>
                </div>
                {f.status === "approved" ? (
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-verde/35 bg-[var(--p-chip-n-fundo)] text-verde-2" aria-label="Pago">
                    <Check aria-hidden className="h-4 w-4" strokeWidth={2.4} />
                  </span>
                ) : (
                  <Chip tom={st.tom}>{st.rotulo}</Chip>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
}
