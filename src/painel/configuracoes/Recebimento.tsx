import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CreditCard, ExternalLink, Lock, QrCode, Save, Unlock, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useConta } from "@/nucleo/conta";
import RecebimentosLista from "@/components/admin/RecebimentosLista";
import ComprovantePixCard from "@/components/admin/ComprovantePixCard";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { abrirLinkExterno, abrirPagina, reservarAba } from "@/financeiro/abrirPagamento";
import { buscarRecebimento, buscarResumoDaConta, ErroFinanceiro, salvarRecebimento, testarInfinitePay } from "@/financeiro/api";
import { normalizarHandle } from "@/financeiro/infinitepay";
import { ROTULO_MODO } from "@/financeiro/recebimento";
import { mensagemDoRecebimento } from "@/financeiro/regras";
import type { ModoRecebimento, RecebimentoDaConta } from "@/financeiro/tipos";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { OpcoesPilula, SecaoForm, type OpcaoPilula } from "./pecas/Form";

const TAG_RUIM = "Cole a sua InfiniteTag sem o $ (só letras, números, ponto, traço ou _).";
const ERROS_DO_CAMPO = new Set(["infinitetag_invalida", "infinitepay_recusou", "infinitepay_checkout_desligado", "sem_infinitetag"]);

/**
 * Configurações › Recebimento (spec 4.6 — W6; C51, N-24, R15, R16, P13): como os alunos pagam — Pix na sua chave, InfinitePay (W1: a
 * InfiniteTag; "Testar" abre a sua página com R$ 1,00, sem cobrar), "não cobrar pelo app" ou Mercado Pago (só quando o master libera) — e
 * o "bloquear o app do aluno com pagamento vencido". Embaixo, os comprovantes aguardando a sua confirmação. Só o dono.
 * W1 (jeito 2, combinado com a hml-19): a tela NÃO fala mais com o banco — lê e grava pela pagamentos-aluno (prof_recebimento,
 * prof_recebimento_salvar, prof_ip_testar e, na lista, prof_chave_*), que grava como a pessoa (o RLS continua valendo).
 * hml-17 (H-39): a leitura dos comprovantes falhou → o aviso com "Tentar de novo" e o contador "—".
 */
export default function Recebimento() {
  const { conta } = useConta();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const chave = ["recebimento-conta", conta?.id] as const;
  const consulta = useQuery({ queryKey: chave, enabled: !!conta?.id, queryFn: () => buscarRecebimento(conta!.id) });
  const pendentes = useQuery({ queryKey: ["financeiro-resumo-conta", conta?.id], enabled: !!conta?.id, queryFn: () => buscarResumoDaConta(conta!.id) });
  const [modo, setModo] = useState<ModoRecebimento>("pix_manual");
  const [tag, setTag] = useState("");
  const [erroTag, setErroTag] = useState("");
  /** o link de ativar o checkout externo que a InfinitePay mandou (só com o erro infinitepay_checkout_desligado) */
  const [ativar, setAtivar] = useState<string | null>(null);
  /** o bloqueio na hora do toque (como antes da W1); o servidor confirma e, se recusar, volta ao que está salvo */
  const [bloquear, setBloquear] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    if (!consulta.data) return;
    setModo(consulta.data.conta.modo);
    setTag(consulta.data.infinitepay.handle ? `$${consulta.data.infinitepay.handle}` : "");
    setBloquear(consulta.data.conta.bloquear);
  }, [consulta.data]);

  if (!conta) {
    return <div data-config-aba="recebimento" data-estado-aba="vazio"><EstadoVazio titulo="Nenhuma conta ativa" texto="O recebimento aparece aqui quando você faz parte de uma conta de profissional." /></div>;
  }
  const r = consulta.data;
  const pendentesFalhou = pendentes.isError && !pendentes.data;
  const opcoes: OpcaoPilula<ModoRecebimento>[] = [
    { valor: "pix_manual", rotulo: "Pix na sua chave", dica: "O aluno paga pelo banco dele e anexa o comprovante; você confirma", icone: QrCode },
    ...(r && (r.infinitepay.disponivel || r.conta.modo === "infinitepay")
      ? [{ valor: "infinitepay" as const, rotulo: "InfinitePay", icone: Wallet,
           dica: "O aluno paga na página da InfinitePay (Pix ou cartão em até 12×) e a confirmação chega sozinha" }]
      : []),
    { valor: "nenhum", rotulo: "Não cobrar pelo app", dica: "Você cobra por fora e registra o pagamento no financeiro do aluno", icone: Ban },
    { valor: "mercadopago", rotulo: "Mercado Pago", dica: "Pix e cartão com confirmação automática", icone: CreditCard, desligada: !r?.mp_liberado,
      porque: "Só quando o master libera para a conta — fale com o suporte" },
  ];

  /** O erro embaixo do campo. O "checkout externo desligado" (ou a InfiniteTag que não existe — a InfinitePay responde igual) traz o
   *  link de ativar. */
  const erroDoCampo = (e: ErroFinanceiro) => {
    setErroTag(mensagemDoRecebimento(e.codigo));
    setAtivar(e.codigo === "infinitepay_checkout_desligado" && typeof e.extra.ativar === "string" ? e.extra.ativar : null);
  };

  const salvar = async (pedido: Parameters<typeof salvarRecebimento>[1], ok: string): Promise<void> => {
    setSalvando(true);
    try {
      const res = await salvarRecebimento(conta.id, pedido);
      qc.setQueryData(chave, res);
      if (res.automaticas_falhas) toast.error(`${res.automaticas_falhas} cobrança(s) automática(s) não desligaram no Mercado Pago. Fale com o suporte.`);
      else toast.success(ok);
    } catch (e) {
      // o bloqueio mostrado na hora volta ao que está salvo
      if (pedido.bloquear !== undefined) setBloquear(qc.getQueryData<RecebimentoDaConta>(chave)?.conta.bloquear ?? !pedido.bloquear);
      const codigo = e instanceof ErroFinanceiro ? e.codigo : null;
      if (codigo === "automaticas_ativas" && !pedido.cancelar_automaticas) {
        const n = Number((e as ErroFinanceiro).extra.alunos) || 0;
        const sim = await confirmar({
          titulo: "Desligar as cobranças automáticas?", rotuloConfirmar: "Trocar e desligar", rotuloCancelar: "Voltar", perigo: true,
          descricao: `${n === 1 ? "1 aluno paga" : `${n} alunos pagam`} no cartão todo mês pelo Mercado Pago. Trocar a forma de receber desliga essas cobranças e avisa cada aluno.`,
        });
        if (sim) {
          setSalvando(false);
          return salvar({ ...pedido, cancelar_automaticas: true }, ok);
        }
      } else if (codigo && ERROS_DO_CAMPO.has(codigo)) {
        erroDoCampo(e as ErroFinanceiro);
      } else {
        toast.error(mensagemDoRecebimento(codigo, "Não deu para salvar agora. Confira a internet e tente de novo."));
      }
    } finally {
      setSalvando(false);
    }
  };

  const salvarForma = () => {
    if (modo === "infinitepay") {
      const h = normalizarHandle(tag);
      if (!h) return setErroTag(TAG_RUIM);
      return void salvar(h === r?.infinitepay.handle ? { modo } : { modo, handle: h }, "Pronto: seus alunos pagam pela InfinitePay.");
    }
    void salvar({ modo }, "Forma de recebimento salva.");
  };

  const testar = async () => {
    const h = normalizarHandle(tag);
    if (!h) return setErroTag(TAG_RUIM);
    const aba = reservarAba(); // no toque: o navegador não bloqueia
    setTestando(true);
    try {
      const { url } = await testarInfinitePay(conta.id, h);
      await abrirPagina(url, aba);
    } catch (e) {
      aba?.fechar();
      const codigo = e instanceof ErroFinanceiro ? e.codigo : null;
      if (codigo && ERROS_DO_CAMPO.has(codigo)) erroDoCampo(e as ErroFinanceiro);
      else toast.error(mensagemDoRecebimento(codigo, "Não deu para testar agora. Tente de novo."));
    } finally {
      setTestando(false);
    }
  };

  const tagMudou = modo === "infinitepay" && normalizarHandle(tag) !== r?.infinitepay.handle;
  return (
    <div data-config-aba="recebimento" className="flex flex-col gap-3.5">
      <TopoPagina titulo="Recebimento" subtitulo={`${conta.nome} · como os alunos pagam`} />
      {consulta.isLoading ? (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2"><Esqueleto className="h-[260px] rounded-[22px]" /><Esqueleto className="h-[260px] rounded-[22px]" /></div>
      ) : !r ? (
        <EstadoErro titulo="Não deu para carregar o recebimento" aoTentar={() => void consulta.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
          <SecaoForm brilho titulo="Como seus alunos pagam" marca="recebimento-modo"
            extra={<Chip tom={r.conta.modo === "nenhum" ? "g" : r.conta.modo === "pix_manual" ? "n" : "c"}>{ROTULO_MODO[r.conta.modo]}</Chip>}
            descricao="Vale para todos os alunos da conta, na tela Pagamentos do app.">
            <div className="flex flex-col gap-4">
              <OpcoesPilula nome="recebimento-modo" rotulo="Forma" colunas={1} opcoes={opcoes} valores={[modo]}
                aoMudar={(v) => { setModo(v[0] ?? modo); setErroTag(""); setAtivar(null); }} />
              {modo === "infinitepay" && (
                <div className="flex flex-col gap-2 rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-recebimento-infinitepay>
                  <Campo rotulo="Sua InfiniteTag" value={tag} placeholder="$seunome" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    onChange={(e) => { setTag(e.target.value); setErroTag(""); setAtivar(null); }} data-infinitetag />
                  <p className="text-[12px] text-texto-2">É o nome da sua conta no app da InfinitePay (começa com $). O dinheiro cai direto lá, sem taxa do Physiq.</p>
                  {erroTag && <MensagemForm data-infinitetag-erro>{erroTag}</MensagemForm>}
                  {ativar && (
                    <Botao variante="g" icone={ExternalLink} className="self-start" onClick={() => void abrirLinkExterno(ativar)} data-infinitepay-ativar>
                      Ativar o checkout externo na InfinitePay
                    </Botao>
                  )}
                  <Botao variante="g" icone={ExternalLink} className="self-start" disabled={testando} onClick={() => void testar()} data-infinitepay-testar>
                    {testando ? "Abrindo…" : "Testar (abre a sua página, sem cobrar)"}
                  </Botao>
                </div>
              )}
              {r.conta.modo === "mercadopago" && modo !== "mercadopago" && !r.master && (
                <p className="text-[12px] text-ambar-3">Saindo do Mercado Pago, voltar a ele depende do master.</p>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-4">
                <Botao variante="w" icone={Save} disabled={salvando || !r.pode_editar || (modo === r.conta.modo && !tagMudou)} onClick={salvarForma}
                  data-recebimento-salvar-modo>
                  {salvando ? "Salvando…" : "Salvar a forma"}
                </Botao>
              </div>
            </div>
          </SecaoForm>

          <div className="flex flex-col gap-3.5">
            <SecaoForm titulo="Chaves Pix" marca="recebimento-chaves" descricao="Só uma fica ligada por vez — é ela que o aluno vê.">
              <RecebimentosLista contaId={conta.id} chaves={r.chaves} podeEditar={r.pode_editar} aoMudar={() => void qc.invalidateQueries({ queryKey: chave })} />
            </SecaoForm>
            <SecaoForm titulo="Aluno com pagamento vencido" marca="recebimento-bloqueio"
              extra={<Chip tom={r.conta.bloquear ? "a" : "g"} icone={r.conta.bloquear ? Lock : Unlock}>{r.conta.bloquear ? "BLOQUEIA" : "SÓ AVISA"}</Chip>}
              descricao="Bloqueado, o app do aluno fecha e só Pagamentos abre, até ele pagar. Desligado, ele só recebe o aviso no topo do app.">
              <OpcoesPilula nome="recebimento-bloqueio" rotulo="Mensalidade ou cobrança vencida" colunas={1}
                opcoes={[
                  { valor: "nao", rotulo: "Só avisar o aluno", dica: "A faixa do topo fica vermelha; o app continua", icone: Unlock },
                  { valor: "sim", rotulo: "Bloquear o app do aluno", dica: "Só a tela Pagamentos abre até ele pagar", icone: Lock },
                ]}
                valores={[bloquear ? "sim" : "nao"]}
                aoMudar={(v) => {
                  const novo = v[0] === "sim";
                  if (novo === bloquear) return;
                  setBloquear(novo);
                  void salvar({ bloquear: novo }, novo ? "Bloqueio do inadimplente ligado." : "Bloqueio do inadimplente desligado.");
                }} />
            </SecaoForm>
          </div>
        </div>
      )}

      <SecaoForm titulo="Comprovantes aguardando a sua confirmação" marca="recebimento-pendentes"
        extra={
          <Chip tom={(pendentes.data?.pendentes.length ?? 0) > 0 ? "c" : "g"} data-recebimento-pendentes-contador>
            {pendentesFalhou ? "—" : pendentes.data?.pendentes.length ?? 0}
          </Chip>
        }
        descricao="O aluno pagou o Pix na sua chave e anexou o comprovante. Confira o valor antes de confirmar.">
        {pendentes.isLoading ? (
          <Esqueleto className="h-[92px] w-full rounded-2xl" />
        ) : pendentesFalhou ? (
          <div data-recebimento-pendentes-erro>
            <EstadoErro titulo="Não deu para carregar os comprovantes" aoTentar={() => void pendentes.refetch()} />
          </div>
        ) : !(pendentes.data?.pendentes.length) ? (
          <p className="text-[13px] text-texto-2" data-recebimento-sem-pendentes>Nenhum comprovante aguardando.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {pendentes.data.pendentes.map((p) => (
              <div key={p.id} className="flex flex-col gap-1.5">
                <ComprovantePixCard item={p} onResolvido={() => void qc.invalidateQueries({ queryKey: ["financeiro-resumo-conta", conta.id] })} />
                <Link to={`/painel/alunos/${p.aluno.treino_user_id ?? p.aluno.paciente_id}/financeiro`} className="px-1 text-[12px] font-semibold text-violeta-3" data-link-financeiro-aluno>
                  Abrir o financeiro de {p.aluno.nome ?? "aluno"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </SecaoForm>
    </div>
  );
}
