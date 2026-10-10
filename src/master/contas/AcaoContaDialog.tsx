import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { textoSaiDoLegado } from "@/nucleo/cobranca/regras";
import { Botao } from "@/ui/premium/Botao";
import { useUltimoValor } from "@/ui/premium/useUltimoValor";
import { acaoConta, cancelarAssinatura, ErroMaster, planos, reenviarAviso, registrarPagamento } from "../api";
import { Campo, INPUT, Janela, SELECT, TEXTAREA } from "../pecas/ui";
import { FAIXAS, PLANOS, ROTULO_FAIXA, ROTULO_PLANO, dataCurta, faixaCabe, moeda, somarDias, textoErro, type AcaoMaster } from "../regras";
import type { ContaLinha, Faixa, PlanoConta } from "../tipos";

const TITULO: Partial<Record<AcaoMaster, string>> = {
  plano: "Mudar plano ou faixa",
  vencimento: "Ajustar vencimento",
  liberar: "Liberar acesso até uma data",
  isentar: "Isentar a conta",
  tirar_isencao: "Tirar a isenção",
  suspender: "Suspender a conta",
  reativar: "Reativar a conta",
  bloquear_alunos: "Bloquear os alunos da conta",
  desbloquear_alunos: "Desbloquear os alunos da conta",
  registrar_pagamento: "Registrar pagamento feito por fora",
  reenviar_aviso: "Reenviar aviso ao dono",
  cancelar_assinatura: "Cancelar a cobrança automática",
  excluir: "Excluir a conta",
};

const DESCRICAO: Partial<Record<AcaoMaster, string>> = {
  plano: "Subir vale na hora; descer só se os alunos ativos couberem. O preço novo vale a partir do próximo pagamento (a cobrança no cartão acompanha).",
  vencimento: "A conta tem acesso até esta data (inclusive). No dia seguinte o painel trava, e os alunos continuam usando o app.",
  liberar: "Estende o acesso sem pagamento (nunca encurta). Fica registrado com o motivo.",
  isentar: "Conta isenta não é cobrada e não vê o \"Pagar\". O motivo aparece no Financeiro.",
  tirar_isencao: "A conta volta para a situação das datas (vencimento ou teste).",
  suspender: "O painel da conta trava sem o \"Pagar\" (\"Conta suspensa. Fale com o suporte\"). Os alunos continuam usando o app.",
  reativar: "A conta volta para a situação das datas (ou isenta, se estava isenta).",
  bloquear_alunos: "O app dos alunos da conta fecha com \"Acesso pausado\" e a sua mensagem — nos 2 bancos.",
  desbloquear_alunos: "Os alunos da conta voltam a usar o app.",
  registrar_pagamento: "Soma os meses a partir do maior entre o vencimento, o fim do teste e hoje — a mesma regra do Pix e do cartão.",
  reenviar_aviso: "O aviso vai para o sino do painel do dono (e o celular dele, se tiver o app). Nenhum e-mail sai.",
  cancelar_assinatura: "Cancela a assinatura no Mercado Pago. O acesso já pago continua até o vencimento.",
  excluir: "Só sem alunos. Os membros perdem o acesso à conta. Não dá para desfazer.",
};

/** Janela de uma ação do master numa conta (W27: C56, C58, N-74/R18). A regra é do banco; aqui só o formulário. */
export function AcaoContaDialog({ conta, acao: acaoAberta, aoFechar, aoFeito }: {
  conta: ContaLinha | null;
  acao: AcaoMaster | null;
  aoFechar: () => void;
  aoFeito: (msg: string) => void;
}) {
  // hml-18a (H-40, D): a janela fica montada e fecha pelo `aberta`; enquanto sai, mostra a ação que fechou (antes sumia seca com a
  // ação null). O formulário recomeça a cada abertura (o efeito olha a ação ABERTA)
  const acao = useUltimoValor(acaoAberta);
  const aberta = Boolean(conta && acaoAberta && acaoAberta !== "mover_alunos");
  const [plano, setPlano] = useState<PlanoConta>("treino_nutricao");
  const [faixa, setFaixa] = useState<Faixa>("f10");
  const [data, setData] = useState("");
  const [texto, setTexto] = useState("");
  const [valor, setValor] = useState("");
  const [meses, setMeses] = useState("1");
  const [pagoEm, setPagoEm] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  // W28: a conta com o preço e as regras de hoje sai do legado ao trocar de plano — o aviso mostra o preço da tabela nova
  const saiDoLegado = acao === "plano" && Boolean(conta?.regras_legadas);
  const tabela = useQuery({ queryKey: ["master", "planos"], queryFn: planos, enabled: saiDoLegado, staleTime: 15_000 });

  useEffect(() => {
    if (!conta || !acaoAberta) return;
    setPlano(conta.plano);
    setFaixa(conta.faixa);
    const base = conta.vence_em && conta.vence_em > hoje ? conta.vence_em : hoje;
    setData(acaoAberta === "liberar" ? somarDias(base, 7) : conta.vence_em ?? somarDias(hoje, 30));
    setTexto(acaoAberta === "bloquear_alunos" ? "O acesso dos alunos está pausado. Fale com o seu profissional." : "");
    setValor(conta.valor_mensal ? String(conta.valor_mensal).replace(".", ",") : "");
    setMeses("1");
    setPagoEm(hoje);
    setErro(null);
  }, [conta, acaoAberta, hoje]);

  if (!conta || !acao) return null;
  const cabe = faixaCabe(faixa, conta.alunos_ativos);
  const outroPlano = plano !== conta.plano || faixa !== conta.faixa;
  const precoTabela = outroPlano ? tabela.data?.precos.find((p) => p.plano === plano && p.faixa === faixa)?.valor_mensal ?? null : null;

  async function confirmar() {
    if (!conta || !acao) return;
    setErro(null);
    setOcupado(true);
    try {
      let msg = "Feito.";
      if (acao === "registrar_pagamento") {
        const v = Number(valor.replace(/\./g, "").replace(",", "."));
        const r = await registrarPagamento(conta.id, v, Number(meses), pagoEm || null, texto || null);
        msg = `Pagamento registrado. A conta vale até ${dataCurta(r.vence_em)}.`;
      } else if (acao === "reenviar_aviso") {
        const r = await reenviarAviso(conta.id, texto || undefined);
        msg = `Aviso enviado ao dono: "${r.titulo}"`;
      } else if (acao === "cancelar_assinatura") {
        await cancelarAssinatura(conta.id);
        msg = "Cobrança automática cancelada.";
      } else {
        const args: Record<string, unknown> =
          acao === "plano" ? { plano, faixa }
            : acao === "vencimento" || acao === "liberar" ? { data, motivo: texto || null }
              : acao === "isentar" || acao === "suspender" ? { motivo: texto }
                : acao === "bloquear_alunos" ? { mensagem: texto }
                  : {};
        const r = await acaoConta(conta.id, acao, args);
        msg = acao === "excluir" ? "Conta excluída." : `${TITULO[acao]}: feito.`;
        if (r.efeitos && Number(r.efeitos.pix_cancelados) > 0) msg += ` ${r.efeitos.pix_cancelados} Pix aberto(s) com o preço antigo foram cancelados.`;
      }
      toast.success(msg);
      aoFeito(msg);
    } catch (e) {
      const codigo = e instanceof ErroMaster ? e.codigo : "erro_interno";
      const extra = e instanceof ErroMaster ? e.extra : {};
      setErro(codigo === "alunos_acima_do_limite" ? `A conta tem ${extra.alunos} alunos ativos e essa faixa permite ${extra.limite}.` : textoErro(codigo));
    } finally {
      setOcupado(false);
    }
  }

  const perigo = ["suspender", "bloquear_alunos", "excluir", "cancelar_assinatura"].includes(acao);
  const desabilitado = ocupado
    || (acao === "plano" && (!cabe || (plano === conta.plano && faixa === conta.faixa)))
    || ((acao === "isentar" || acao === "liberar") && texto.trim().length < 3)
    || ((acao === "vencimento" || acao === "liberar") && !data)
    || (acao === "registrar_pagamento" && !(Number(valor.replace(/\./g, "").replace(",", ".")) > 0));

  return (
    <Janela aberta={aberta} aoMudar={(a) => !a && aoFechar()} titulo={TITULO[acao] ?? "Ação"} descricao={DESCRICAO[acao]} data-janela-acao={acao}
      rodape={(
        <>
          <Botao tamanho="sm" onClick={aoFechar} data-acao-cancelar>Cancelar</Botao>
          <Botao tamanho="sm" variante={perigo ? "g" : "w"} onClick={() => void confirmar()} disabled={desabilitado} data-acao-confirmar
            className={perigo ? "!border-[rgba(244,63,94,.4)] !text-rosa-3 hover:!bg-[rgba(244,63,94,.08)]" : undefined}>
            {ocupado ? "Um instante…" : TITULO[acao]?.split(" ")[0] ?? "Confirmar"}
          </Botao>
        </>
      )}>
      <p className="rounded-2xl border border-linha bg-superficie-3 px-3.5 py-2.5 text-[13px] text-texto-2" data-acao-conta>
        <b className="text-texto">{conta.nome}</b> · {ROTULO_PLANO[conta.plano]} · {ROTULO_FAIXA[conta.faixa]} · {conta.alunos_ativos} aluno(s) ativo(s)
      </p>
      {saiDoLegado && (
        <p className="rounded-2xl border border-ambar/30 px-3.5 py-3 text-[13px] leading-relaxed text-texto-2" style={{ background: "linear-gradient(90deg,var(--p-chip-a-fundo),transparent)" }}
          data-aviso-sai-do-legado>
          <b className="text-texto">Esta conta tem o preço e as regras de hoje.</b>{" "}
          {textoSaiDoLegado(conta.valor_travado ?? conta.valor_mensal, precoTabela, "mudar")}
          {/* hml-17 (H-39): a tabela de preços não veio — diz que falhou (antes o preço novo só sumia do aviso); o Confirmar continua */}
          {tabela.isError && !tabela.data && (
            <span className="mt-2 flex flex-wrap items-center gap-2 font-medium text-rosa-3" role="alert" data-acao-conta-tabela-erro>
              Não deu para carregar o preço da tabela nova.
              <Botao tamanho="sm" icone={RefreshCw} onClick={() => void tabela.refetch()} data-acao-conta-tabela-tentar>Tentar de novo</Botao>
            </span>
          )}
        </p>
      )}
      {acao === "plano" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Plano">
            <select className={SELECT} value={plano} onChange={(e) => setPlano(e.target.value as PlanoConta)} data-campo-plano>
              {PLANOS.map((p) => <option key={p} value={p}>{ROTULO_PLANO[p]}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Faixa de alunos" erro={!cabe ? `Tem ${conta.alunos_ativos} alunos ativos: não cabe nesta faixa.` : undefined}>
            <select className={SELECT} value={faixa} onChange={(e) => setFaixa(e.target.value as Faixa)} data-campo-faixa>
              {FAIXAS.map((f) => <option key={f} value={f}>{ROTULO_FAIXA[f]}</option>)}
            </select>
          </Campo>
        </div>
      )}
      {(acao === "vencimento" || acao === "liberar") && (
        <Campo rotulo={acao === "liberar" ? "Liberar até" : "Vence em"} dica={conta.vence_em ? `Hoje vale até ${dataCurta(conta.vence_em)}.` : "A conta ainda não tem vencimento."}>
          <input type="date" className={INPUT} value={data} onChange={(e) => setData(e.target.value)} data-campo-data />
        </Campo>
      )}
      {(acao === "liberar" || acao === "isentar" || acao === "suspender") && (
        <Campo rotulo={acao === "suspender" ? "Motivo (opcional)" : "Motivo"} dica={acao === "isentar" ? "Ex.: parceria, conta do master, cortesia." : undefined}>
          <input className={INPUT} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={200} data-campo-motivo />
        </Campo>
      )}
      {acao === "bloquear_alunos" && (
        <Campo rotulo="Mensagem para os alunos" dica="Aparece no app de cada aluno da conta.">
          <textarea className={TEXTAREA} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} data-campo-mensagem />
        </Campo>
      )}
      {acao === "reenviar_aviso" && (
        <Campo rotulo="Mensagem (opcional)" dica="Sem mensagem vai o texto padrão com o vencimento.">
          <input className={INPUT} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={160} data-campo-mensagem />
        </Campo>
      )}
      {acao === "registrar_pagamento" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo rotulo="Valor (R$)" dica={conta.valor_mensal ? `Mensal: ${moeda(conta.valor_mensal)}` : undefined}>
            <input className={INPUT} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} data-campo-valor />
          </Campo>
          <Campo rotulo="Meses">
            <select className={SELECT} value={meses} onChange={(e) => setMeses(e.target.value)} data-campo-meses>
              {["1", "2", "3", "6", "12"].map((m) => <option key={m} value={m}>{m === "12" ? "12 (anual)" : m}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Pago em">
            <input type="date" className={INPUT} value={pagoEm} max={hoje} onChange={(e) => setPagoEm(e.target.value)} data-campo-pago-em />
          </Campo>
          <div className="sm:col-span-3">
            <Campo rotulo="Observação (opcional)">
              <input className={INPUT} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={200} placeholder="Transferência, dinheiro…" data-campo-descricao />
            </Campo>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="text-[13px] font-medium text-rosa-3" data-erro-acao>{erro}</p>}
    </Janela>
  );
}
