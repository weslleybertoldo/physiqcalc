// Physiq W-P — criar/editar um plano da aba Planos (desenho §3.1 + §7): nome, duração, valor do período todo, as formas de pagar que o
// recebimento da conta aceita, até quantas vezes no cartão e a parcela do mês a mês (vazia = valor ÷ meses). A tela valida com a MESMA
// regra do servidor (validarPlano, _shared/planos-regras.ts) antes de gravar pelo prof_plano_salvar; depois de salvar, avisa quando as
// cobranças automáticas dos alunos do plano vão mudar (a fila — decisão do Weslley 10/10, ponto 2).
import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { ErroFinanceiro, salvarPlano } from "@/financeiro/api";
import { MODALIDADES, parcelaMensal, ROTULO_MODALIDADE, rotuloDaModalidade, validarPlano, type Modalidade } from "@/financeiro/planos";
import { avisoDasAutomaticas, lerValor, mensagemErroFinanceiro, reais } from "@/financeiro/regras";
import type { ModoRecebimento, PlanoNaLista } from "@/financeiro/tipos";
import { CampoSelect } from "@/painel/configuracoes/pecas/Form";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";

const DURACOES = [1, 2, 3, 6, 12, 24];
const noCampo = (v: number | null | undefined) => (v ? Number(v).toFixed(2).replace(".", ",") : "");

/** Criar/editar um plano (W-P §3.1): as formas que o recebimento da conta não aceita aparecem desligadas. W1 (P-B): na conta InfinitePay,
 *  o à vista se chama "Período todo (Pix ou cartão até 12×)"; o cartão parcelado, que ela não aceita, fica com o nome de sempre. */
export function PlanoDialog({ aberto, plano, contaId, modalidadesDaConta, modo, aoFechar, aoSalvo }: {
  aberto: boolean;
  plano: PlanoNaLista | null;
  contaId: string;
  modalidadesDaConta: Modalidade[];
  modo: ModoRecebimento | null;
  aoFechar: () => void;
  aoSalvo: () => void;
}) {
  const [nome, setNome] = useState("");
  const [meses, setMeses] = useState("1");
  const [valor, setValor] = useState("");
  const [modalidades, setModalidades] = useState<Modalidade[]>(["avista"]);
  const [max, setMax] = useState("12");
  const [parcela, setParcela] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setNome(plano?.nome ?? "");
    setMeses(String(plano?.meses ?? 1));
    setValor(noCampo(plano?.valor));
    setModalidades(plano?.modalidades?.length ? plano.modalidades : ["avista"]);
    setMax(String(plano?.max_parcelas_cartao ?? 12));
    setParcela(noCampo(plano?.valor_parcela_mensal));
    setErro("");
  }, [aberto, plano]);
  const n = Number(meses);
  // uma duração fora da lista (gravada antes) continua escolhida
  const duracoes = DURACOES.includes(n) || !Number.isInteger(n) || n < 1 ? DURACOES : [...DURACOES, n].sort((a, b) => a - b);
  // a parcela só vale no mês a mês de 2 meses ou mais (o campo só aparece aí): escondido, não vai junto
  const usaParcela = modalidades.includes("mensal") && n > 1;
  const sugerida = parcelaMensal({ valor: lerValor(valor), meses: n, valor_parcela_mensal: usaParcela ? lerValor(parcela) : null });
  const padrao = parcelaMensal({ valor: lerValor(valor), meses: n });
  const alternar = (x: Modalidade) => setModalidades((a) => (a.includes(x) ? a.filter((y) => y !== x) : [...a, x]));
  const salvar = async (ev: FormEvent) => {
    ev.preventDefault();
    const r = validarPlano({
      nome, meses: n, valor: lerValor(valor), modalidades,
      max_parcelas_cartao: modalidades.includes("cartao_parcelado") ? Number(max) : null,
      // texto que não é valor vai como está: a regra devolve "parcela_invalida" (não some calado)
      valor_parcela_mensal: usaParcela && parcela.trim() ? lerValor(parcela) ?? parcela : null,
    }, modalidadesDaConta);
    // `=== false` (não `!r.ok`): sem o strict do tsconfig do app, só a igualdade separa os 2 lados do resultado
    if (r.ok === false) {
      setErro(mensagemErroFinanceiro(r.erro));
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const resposta = await salvarPlano(contaId, { ...(plano ? { id: plano.id } : {}), ...r.plano });
      const aviso = avisoDasAutomaticas(resposta);
      if (aviso) toast.success("Plano salvo.", { description: aviso, duration: 6000 });
      else toast.success("Plano salvo.");
      aoSalvo();
    } catch (e) {
      setErro(mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <PainelDeslizante aberto={aberto} aoMudar={(a) => !a && aoFechar()} lado="direita" titulo={plano ? "Editar plano" : "Novo plano"}
      descricao="Mudar um plano vale a partir do próximo pagamento de quem está nele.">
      <form onSubmit={salvar} className="flex flex-col gap-3" data-form-plano>
        <Campo rotulo="Nome" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Consultoria anual" data-plano-nome />
        <CampoSelect rotulo="Duração" value={meses} onChange={(e) => setMeses(e.target.value)} data-plano-meses>
          {duracoes.map((m) => <option key={m} value={m}>{m === 1 ? "1 mês (mensal)" : `${m} meses`}</option>)}
        </CampoSelect>
        <Campo rotulo="Valor do período todo (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 1.000,00" data-plano-valor />
        <fieldset className="flex flex-col gap-2" data-plano-modalidades>
          <legend className="mb-1 text-[12.5px] font-semibold text-texto-2">Como o aluno pode pagar</legend>
          {MODALIDADES.map((x) => {
            const pode = modalidadesDaConta.includes(x);
            return (
              <label key={x} className="flex items-center gap-2 text-[13.5px] text-texto">
                <input type="checkbox" className="h-4 w-4 accent-[#8B5CF6]" checked={modalidades.includes(x)} disabled={!pode && !modalidades.includes(x)}
                  onChange={() => alternar(x)} data-plano-modalidade={x} />
                {/* a forma que a conta não aceita fica com o nome de sempre: "Período todo" não aparece 2 vezes, uma delas "não aceita" */}
                {pode ? rotuloDaModalidade(x, modo) : ROTULO_MODALIDADE[x]}{!pode ? <span className="text-texto-3"> (o seu recebimento não aceita)</span> : null}
              </label>
            );
          })}
        </fieldset>
        {modalidades.includes("cartao_parcelado") && (
          <CampoSelect rotulo="Parcelas no cartão (até)" value={max} onChange={(e) => setMax(e.target.value)} data-plano-max>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((k) => <option key={k} value={k}>{k}×</option>)}
          </CampoSelect>
        )}
        {usaParcela && (
          <>
            <Campo rotulo="Parcela do mês a mês (R$, opcional)" inputMode="decimal" value={parcela} onChange={(e) => setParcela(e.target.value)}
              placeholder={padrao ? reais(padrao) : ""} dica="Vazia, a parcela é o valor dividido pelos meses." data-plano-parcela />
            {sugerida && <p className="text-[12px] text-texto-3" data-plano-total-mensal>{n}× de {reais(sugerida)} = {reais(Math.round(sugerida * n * 100) / 100)}</p>}
          </>
        )}
        {erro && <MensagemForm>{erro}</MensagemForm>}
        <Botao type="submit" variante="w" icone={Save} disabled={salvando} data-plano-salvar>{salvando ? "Salvando…" : "Salvar"}</Botao>
      </form>
    </PainelDeslizante>
  );
}
