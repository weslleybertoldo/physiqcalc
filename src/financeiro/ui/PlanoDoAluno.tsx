// src/financeiro/ui/PlanoDoAluno.tsx
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Save } from "lucide-react";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { CampoSelect } from "@/painel/configuracoes/pecas/Form";
import { Botao } from "@/ui/premium/Botao";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { aceitaAutomatica, ehModalidade, modalidadesOferecidas, planoCompleto, rotuloDaModalidade, valorDoPagamento, type Modalidade } from "../planos";
import { hojeSP, lerValor, reais } from "../regras";
import type { FinanceiroProfissional } from "../tipos";
import type { useFinanceiroDoAluno } from "./useFinanceiroDoAluno";

type Agir = ReturnType<typeof useFinanceiroDoAluno>["agir"];
const noCampo = (v: number | null | undefined) => (v ? Number(v).toFixed(2).replace(".", ",") : "");
/** Plano com período (valor e meses). Sem `meses` = a função ou o schema de antes da W-P (só nome e valor): fica no modo de hoje. */
const comMeses = (p: FinanceiroProfissional["planos"][number]) => p.meses != null && planoCompleto({ valor: p.valor, meses: p.meses });

/**
 * Ficha do aluno › plano (W-P, desenho §3.2 + §7 B1): num plano com período o personal escolhe a modalidade (só as que o plano e o
 * recebimento da conta aceitam), o valor negociado (vazio = o do plano) e o 1º vencimento (só de quem nunca pagou); sem plano com
 * período, o valor livre de hoje. Trocar vale a partir do próximo pagamento. Só o dono e o master chegam aqui (o CartaoMensalidade
 * troca o cartão pelo aviso para os outros — decisão do Weslley 10/10, ponto 1 — e o prof_aluno nem manda os planos para eles).
 */
export function FormPlanoDoAluno({ d, agir, aoSalvo }: { d: FinanceiroProfissional; agir: Agir; aoSalvo: (planoNome: string | null, valor: number | null) => void }) {
  const m = d.mensalidade;
  const confirmar = useConfirmar();
  const [plano, setPlano] = useState(m?.plano_id ?? "");
  const [modalidade, setModalidade] = useState<Modalidade | "">(m?.modalidade ?? "");
  const [negociado, setNegociado] = useState(noCampo(m?.negociado));
  const [inicio, setInicio] = useState(hojeSP());
  const [valor, setValor] = useState(m && !m.modalidade ? noCampo(m.valor) : "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setPlano(d.mensalidade?.plano_id ?? "");
    setModalidade(d.mensalidade?.modalidade ?? "");
    setNegociado(noCampo(d.mensalidade?.negociado));
    setValor(d.mensalidade && !d.mensalidade.modalidade ? noCampo(d.mensalidade.valor) : "");
  }, [d.mensalidade]);

  const escolhido = d.planos.find((p) => p.id === plano) ?? null;
  const meses = escolhido?.meses ?? 1;
  const comPeriodo = !!escolhido && comMeses(escolhido);
  const doPlano = { valor: escolhido?.valor ?? null, meses, valor_parcela_mensal: escolhido?.valor_parcela_mensal ?? null };
  // quem já está no plano continua nele mesmo desativado (§3.1); plano novo: só o que a conta recebe
  const ofertas: Modalidade[] = !escolhido || !comPeriodo ? [] : escolhido.id === m?.plano_id
    ? [...(escolhido.modalidades ?? [])]
    : modalidadesOferecidas({ ...doPlano, modalidades: [...(escolhido.modalidades ?? ["avista"])], ativo: escolhido.ativo }, d.conta.modo);
  const previsto = comPeriodo && modalidade ? valorDoPagamento(doPlano, modalidade, lerValor(negociado)) : null;
  const nunca = !m?.pago_ate;

  const salvar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (comPeriodo) {
      if (!modalidade || !ofertas.includes(modalidade)) return setErro("Escolha como o aluno vai pagar.");
      if (negociado.trim() && !lerValor(negociado)) return setErro("Valor negociado inválido.");
      let cancelar = false;
      if (d.assinatura && ["authorized", "pending", "paused"].includes(d.assinatura.status) && !aceitaAutomatica(modalidade, meses)) {
        if (!(await confirmar({
          titulo: "Desligar a cobrança automática?",
          descricao: `${d.aluno.nome} paga no cartão todo mês. "${rotuloDaModalidade(modalidade, d.conta.modo)}" não usa a cobrança automática: ela é cancelada e o aluno recebe um aviso.`,
          rotuloConfirmar: "Trocar e desligar", perigo: true,
        }))) return;
        cancelar = true;
      }
      setSalvando(true);
      setErro("");
      const r = await agir<{ mensalidade: { valor: number } | null }>("prof_definir", {
        aluno: d.aluno.paciente_id, plano_aluno_id: plano, plano_modalidade: modalidade,
        plano_valor_negociado: negociado.trim() ? lerValor(negociado) : null,
        ...(nunca ? { inicio } : {}), ...(cancelar ? { cancelar_automatica: true } : {}),
      }, "Plano do aluno salvo.");
      setSalvando(false);
      if (r) aoSalvo(escolhido!.nome, r.mensalidade?.valor ?? null);
      return;
    }
    const v = valor.trim() ? lerValor(valor) : null;
    if (valor.trim() && !v) return setErro("Valor inválido.");
    setSalvando(true);
    setErro("");
    const r = await agir("prof_definir", { aluno: d.aluno.paciente_id, valor: v, plano_aluno_id: plano || null, plano_modalidade: null }, "Plano e mensalidade salvos.");
    setSalvando(false);
    if (r) aoSalvo(escolhido?.nome ?? null, v);
  };

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3" data-form-mensalidade data-modo-plano={comPeriodo ? "periodo" : "hoje"}>
      <CampoSelect rotulo="Plano do aluno" value={plano} onChange={(e) => { setPlano(e.target.value); setModalidade(""); setErro(""); }} data-mensalidade-plano>
        <option value="">Sem plano (valor livre)</option>
        {d.planos.filter((p) => p.ativo || p.id === m?.plano_id).map((p) => (
          <option key={p.id} value={p.id}>{p.nome}{comMeses(p) ? "" : " (sem período)"}</option>
        ))}
      </CampoSelect>
      {comPeriodo ? (
        <>
          <CampoSelect rotulo="Como o aluno paga" value={modalidade} onChange={(e) => { setModalidade(ehModalidade(e.target.value) ? e.target.value : ""); setErro(""); }} data-mensalidade-modalidade>
            <option value="">Escolha…</option>
            {ofertas.map((x) => <option key={x} value={x}>{rotuloDaModalidade(x, d.conta.modo)}</option>)}
          </CampoSelect>
          <Campo rotulo="Valor negociado (R$, opcional)" inputMode="decimal" value={negociado} onChange={(e) => { setNegociado(e.target.value); setErro(""); }}
            placeholder="Vazio = o valor do plano" data-mensalidade-negociado />
          {nunca && <Campo rotulo="1º vencimento" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} data-mensalidade-inicio />}
          {previsto && <p className="text-[12px] text-texto-3" data-mensalidade-previsto>Cada pagamento: {reais(previsto)}</p>}
        </>
      ) : (
        <Campo rotulo="Mensalidade (R$)" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setErro(""); }} placeholder="Vazio = sem cobrança" data-mensalidade-valor />
      )}
      {erro && <MensagemForm>{erro}</MensagemForm>}
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" variante="w" icone={Save} disabled={salvando} data-mensalidade-salvar>{salvando ? "Salvando…" : "Salvar"}</Botao>
        {d.permissoes.dono && <Link to="/painel/financeiro?aba=planos" className="text-[12.5px] font-semibold text-violeta-3" data-link-planos>Criar ou editar planos</Link>}
      </div>
    </form>
  );
}
