import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { masterFinanceiro, type FinanceiroLinha } from "@/lib/saasApi";
import { SemConexaoTreino } from "@/ui/casca/SemConexaoTreino";
import { useTreinoDaPagina } from "@/ui/casca/treinoDaPagina";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { Campo, INPUT, Info } from "../pecas/ui";
import { LEGADA, dataCurta, moeda } from "../regras";
import type { ContaLinha } from "../tipos";

const SITUACAO: Record<string, string> = {
  travado: "Travado", em_tolerancia: "Na tolerância", em_dia: "Em dia", anual: "Anual", liberado: "Liberado", cobranca_pausada: "Cobrança pausada",
  suspenso: "Suspenso", trial: "Teste grátis", sem_adesao: "Sem adesão",
};

interface DetalheLegado {
  professor: FinanceiroLinha;
  pagamentos: Array<{ id: string; valor: number | string; status: string; metodo: string | null; tipo: string; created_at: string; tipo_cobranca: string | null }>;
  tolerancia: number;
  hoje: string;
}

/**
 * "Cobrança legada até a virada" das contas que vieram do PhysiqCalc (W27 → W28): o ciclo pós-pago, a tolerância de 7 dias e a
 * cobrança do professor continuam no Banco do Treino, nas funções antigas (master-financeiro do Treino), que seguem funcionando —
 * esta folha é o caminho para elas. A W28 passa estas contas para o núcleo com o preço de hoje travado.
 */
export function CobrancaLegadaCalc({ aberta, aoMudar, conta }: { aberta: boolean; aoMudar: (a: boolean) => void; conta: ContaLinha }) {
  const treino = useTreinoDaPagina();
  const email = (conta.dono?.email ?? "").toLowerCase();
  const lista = useQuery({
    queryKey: ["master-legado-calc-lista"],
    queryFn: () => masterFinanceiro<{ professores: FinanceiroLinha[] }>("list", { filtro: "todos", limit: 100 }),
    enabled: aberta && treino.tipo === "ok",
    staleTime: 30_000,
  });
  const prof = lista.data?.professores.find((p) => (p.email ?? "").toLowerCase() === email) ?? null;
  const det = useQuery({
    queryKey: ["master-legado-calc", prof?.id],
    queryFn: () => masterFinanceiro<DetalheLegado>("detalhe", { userId: prof!.id }),
    enabled: aberta && Boolean(prof?.id),
  });
  const [ciclo, setCiclo] = useState("");
  const [liberar, setLiberar] = useState("");
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function fazer(action: string, payload: Record<string, unknown>, ok: string) {
    if (!prof) return;
    setOcupado(true);
    try {
      await masterFinanceiro(action, { userId: prof.id, ...payload });
      toast.success(ok);
      void det.refetch();
      void lista.refetch();
    } catch (e) {
      toast.error(`Não deu certo (${(e as Error).message}).`);
    } finally {
      setOcupado(false);
    }
  }

  const p = det.data?.professor ?? prof;
  return (
    <PainelDeslizante aberto={aberta} aoMudar={aoMudar} lado="direita" titulo="Financeiro antigo (PhysiqCalc)" className="w-[min(560px,96vw)]"
      descricao={`${LEGADA} · ${conta.nome}`}>
      <div data-legada-calc={conta.id}>
        {treino.tipo !== "ok" ? <SemConexaoTreino estado={treino} />
          : lista.isLoading || det.isLoading ? <EstadoCarregando linhas={4} rotulo="Abrindo o Financeiro antigo" />
            : lista.isError ? <EstadoErro aoTentar={() => void lista.refetch()} />
              : !p ? <EstadoVazio titulo="Professor não encontrado no Calc" texto={`Nenhum professor do Banco do Treino com o e-mail ${email}.`} />
                : (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-2">
                      <Info rotulo="Situação no Calc" data-legada-situacao={p.situacao}>{SITUACAO[p.situacao] ?? p.situacao}</Info>
                      <Info rotulo="Plano do Calc">{p.plano ? `${p.plano.nome} · ${moeda(p.plano.valorMensal)}` : "—"}</Info>
                      <Info rotulo="Ciclo vence">{dataCurta(p.cicloVenceEm)}</Info>
                      <Info rotulo="Tolerância">{det.data?.tolerancia ?? 7} dias</Info>
                      <Info rotulo="Alunos no Calc">{p.alunos}</Info>
                      <Info rotulo="Cobrança no cartão">{p.assinatura ?? "Não"}</Info>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo rotulo="Registrar pagamento mensal (R$)">
                        <span className="flex gap-2">
                          <input className={INPUT} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={p.plano ? String(p.plano.valorMensal) : ""} data-legada-valor />
                          <Botao tamanho="sm" disabled={ocupado || !(Number(valor.replace(",", ".")) > 0)} data-legada-registrar
                            onClick={() => void fazer("registrar-pagamento", { tipoCobranca: "mensal", valor: Number(valor.replace(",", ".")), metodo: "manual" }, "Pagamento registrado no Calc.")}>Registrar</Botao>
                        </span>
                      </Campo>
                      <Campo rotulo="Ajustar o vencimento do ciclo">
                        <span className="flex gap-2">
                          <input type="date" className={INPUT} value={ciclo} onChange={(e) => setCiclo(e.target.value)} data-legada-ciclo />
                          <Botao tamanho="sm" disabled={ocupado || !ciclo} onClick={() => void fazer("set-ciclo", { ciclo_vence_em: ciclo }, "Ciclo ajustado no Calc.")}>Salvar</Botao>
                        </span>
                      </Campo>
                      <Campo rotulo="Liberar acesso até">
                        <span className="flex gap-2">
                          <input type="date" className={INPUT} value={liberar} onChange={(e) => setLiberar(e.target.value)} data-legada-liberar />
                          <Botao tamanho="sm" disabled={ocupado || !liberar} onClick={() => void fazer("liberar-acesso-ate", { ate: liberar, motivo: "Painel master (W27)" }, "Acesso liberado no Calc.")}>Liberar</Botao>
                        </span>
                      </Campo>
                      <div className="flex flex-wrap items-end gap-2">
                        <Botao tamanho="sm" disabled={ocupado} onClick={() => void fazer("pausar-cobranca", { pausar: !p.cobrancaPausada }, p.cobrancaPausada ? "Cobrança retomada." : "Cobrança pausada.")}>
                          {p.cobrancaPausada ? "Retomar cobrança" : "Pausar cobrança"}
                        </Botao>
                      </div>
                    </div>
                    <section>
                      <h3 className="mb-2 font-body text-[13.5px] font-semibold normal-case tracking-[-0.01em] text-texto">Pagamentos no Calc</h3>
                      {(det.data?.pagamentos ?? []).length === 0 ? <p className="text-[13px] text-texto-3">Nenhum pagamento.</p> : (
                        <div className="flex flex-col divide-y divide-linha-3 rounded-2xl border border-linha">
                          {(det.data?.pagamentos ?? []).slice(0, 8).map((x) => (
                            <div key={x.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                              <span className="w-[86px] text-texto-3">{dataCurta(x.created_at)}</span>
                              <span className="flex-1 text-texto-2">{x.tipo_cobranca ?? x.tipo} · {x.metodo ?? "—"}</span>
                              <b className="tabular-nums">{moeda(x.valor)}</b>
                              <Chip tom={x.status === "approved" ? "n" : "g"}>{x.status}</Chip>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                )}
      </div>
    </PainelDeslizante>
  );
}
