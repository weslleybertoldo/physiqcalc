import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Ban, CreditCard, ExternalLink, Link2, Lock, QrCode, RefreshCw, Save, Unlink, Unlock, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useConta } from "@/nucleo/conta";
import RecebimentosLista from "@/components/admin/RecebimentosLista";
import ComprovantePixCard from "@/components/admin/ComprovantePixCard";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { abrirConexaoMp, abrirLinkExterno, abrirPagina, abrirSiteNoApp, aoFecharONavegador, reservarAba } from "@/financeiro/abrirPagamento";
import {
  buscarRecebimento, buscarResumoDaConta, conectarMercadoPago, conexaoMercadoPago, confirmarMercadoPago, desconectarMercadoPago, ErroFinanceiro,
  salvarRecebimento, testarInfinitePay,
} from "@/financeiro/api";
import { normalizarHandle } from "@/financeiro/infinitepay";
import { TEXTO_DO_RETORNO, situacaoDoMp } from "@/financeiro/mpConta";
import { ROTULO_MODO } from "@/financeiro/recebimento";
import { chipDaConexaoMp, lerVoltaDoMp, mensagemDoMpConta, mensagemDoRecebimento, perguntaDaConexaoMp } from "@/financeiro/regras";
import type { ModoRecebimento, RecebimentoDaConta } from "@/financeiro/tipos";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { OpcoesPilula, SecaoForm, type OpcaoPilula } from "./pecas/Form";

const TAG_RUIM = "Cole a sua InfiniteTag sem o $ (só letras, números, ponto, traço ou _).";
const ERROS_DO_CAMPO = new Set(["infinitetag_invalida", "infinitepay_recusou", "infinitepay_checkout_desligado", "sem_infinitetag"]);
/** O botão de rótulo longo (o "Testar" e o "Ativar"): o pq-botao é nowrap com 44 px fixos e, a 390, passava da borda do cartão (11/10).
 *  Aqui a linha quebra dentro da caixa e a altura mínima de 44 px do toque fica (o min-h-[44px] + py-2 das listas do app). */
const BOTAO_LONGO = "h-auto min-h-[44px] self-start whitespace-normal py-2 text-left";

/** W2: o recado da conexão com o Mercado Pago na tela (a volta, a confirmação) — `marca` vai para o data-mp-retorno do E2E. */
interface AvisoMp {
  marca: string;
  texto: string;
  tom: "erro" | "aviso" | "ok";
}

/**
 * Configurações › Recebimento (spec 4.6 — W6; C51, N-24, R15, R16, P13): como os alunos pagam — Pix na sua chave, InfinitePay (W1: a
 * InfiniteTag; "Testar" abre a sua página com R$ 1,00, sem cobrar), o Mercado Pago da sua conta (W2), "não cobrar pelo app" ou o Mercado
 * Pago do Physiq (só o master liga) — e o "bloquear o app do aluno com pagamento vencido". Embaixo, os comprovantes aguardando a sua
 * confirmação. Só o dono.
 * W1 (jeito 2, combinado com a hml-19): a tela NÃO fala mais com o banco — lê e grava pela pagamentos-aluno (prof_recebimento,
 * prof_recebimento_salvar, prof_ip_testar e, na lista, prof_chave_*), que grava como a pessoa (o RLS continua valendo).
 * hml-17 (H-39): a leitura dos comprovantes falhou → o aviso com "Tentar de novo" e o contador "—".
 * W2 (Mercado Pago do personal — plano 2026-10-11-w2-mp-personal.md, Task 15): "Mercado Pago (sua conta)" com a flag (ou já nele): a situação
 * da conexão (situacaoDoMp), Conectar / Conectar de novo e Desconectar (com o OK das automáticas). Conectar no SITE = a autorização do MP na
 * mesma aba (abrirConexaoMp); no APK = o SITE no navegador por cima do app (abrirSiteNoApp) e o fluxo inteiro acontece lá, com a sessão do
 * site (decisão 6 — I8); o fechar do navegador recarrega. A volta cai sempre aqui: ?mp=conectar (o APK abriu o site) só destaca o botão;
 * ?mp=confirmar&c=<id> pergunta "Conectar a conta X?" e só o sim grava (prof_mp_confirmar COMO A PESSOA); ?mp=<erro> mostra o texto. A busca
 * é limpa logo depois de lida (recarregar não repete). Nenhum token passa por aqui.
 */
export default function Recebimento() {
  const { conta } = useConta();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const chave = ["recebimento-conta", conta?.id] as const;
  const consulta = useQuery({ queryKey: chave, enabled: !!conta?.id, queryFn: () => buscarRecebimento(conta!.id) });
  const pendentes = useQuery({ queryKey: ["financeiro-resumo-conta", conta?.id], enabled: !!conta?.id, queryFn: () => buscarResumoDaConta(conta!.id) });
  /** a forma escolhida nas pílulas e ainda não salva (null = a que está salva) */
  const [escolha, setEscolha] = useState<ModoRecebimento | null>(null);
  const [tag, setTag] = useState("");
  const [erroTag, setErroTag] = useState("");
  /** o link de ativar o checkout externo que a InfinitePay mandou (só com o erro infinitepay_checkout_desligado) */
  const [ativar, setAtivar] = useState<string | null>(null);
  /** o bloqueio na hora do toque (como antes da W1); o servidor confirma e, se recusar, volta ao que está salvo */
  const [bloquear, setBloquear] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  // W2 — o Mercado Pago da conta
  const noApp = Capacitor.isNativePlatform();
  const [params, setParams] = useSearchParams();
  /** a volta do MP (ou o ?mp=conectar do APK) põe a opção do MP da conta na tela, se ela aparece para esta conta */
  const [preferirMp, setPreferirMp] = useState(false);
  /** ?mp=conectar: o botão em destaque — nunca começa sozinho (um link não pode disparar nada) */
  const [destaque, setDestaque] = useState(false);
  /** APK: o site abriu no navegador por cima do app */
  const [noNavegador, setNoNavegador] = useState(false);
  const [avisoMp, setAvisoMp] = useState<AvisoMp | null>(null);
  /** a confirmação deu certo no SITE: quem começou pelo app pode fechar o navegador */
  const [podeFechar, setPodeFechar] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  /** a busca da volta já lida (cada volta é tratada uma vez) */
  const voltaLida = useRef<string | null>(null);

  useEffect(() => {
    if (!consulta.data) return;
    setTag(consulta.data.infinitepay.handle ? `$${consulta.data.infinitepay.handle}` : "");
    setBloquear(consulta.data.conta.bloquear);
  }, [consulta.data]);

  /** O recado da conexão na tela (data-mp-retorno) e no aviso que some sozinho. */
  const mostrarAvisoMp = (marca: string, texto: string, tom: AvisoMp["tom"]) => {
    setAvisoMp({ marca, texto, tom });
    if (tom === "ok") toast.success(texto);
    else if (tom === "aviso") toast.info(texto);
    else toast.error(texto);
  };

  /** A volta boa (I8): a pergunta com a conta do MP que voltou, e só o sim grava — pela sessão de quem está aqui (a de quem começou). */
  const confirmarConexao = async (conexao: string) => {
    try {
      const pergunta = perguntaDaConexaoMp((await conexaoMercadoPago(conexao)).apelido);
      const sim = await confirmar({
        titulo: pergunta.titulo, descricao: <span data-mp-confirmar>{pergunta.descricao}</span>, rotuloConfirmar: "Conectar", rotuloCancelar: "Agora não",
      });
      if (!sim) {
        toast.info("Nada foi conectado.");
        return;
      }
      const res = await confirmarMercadoPago(conexao);
      // a resposta já traz a tela nova; outra conta (trocou no meio) → lê de novo
      if (res.recebimento?.conta?.id === conta?.id) qc.setQueryData(chave, res.recebimento);
      else void qc.invalidateQueries({ queryKey: ["recebimento-conta"] });
      const resultado = res.resultado === "conectado_sem_trocar" ? "conectado_sem_trocar" : "ok";
      mostrarAvisoMp(resultado, TEXTO_DO_RETORNO[resultado], resultado === "ok" ? "ok" : "aviso");
      if (!noApp) setPodeFechar(true);
    } catch (e) {
      const erro = e instanceof ErroFinanceiro ? e : null;
      mostrarAvisoMp(erro?.codigo ?? "erro", mensagemDoMpConta(erro?.codigo, erro?.extra, "Não deu para conectar agora. Toque em Conectar de novo."), "erro");
    }
  };

  // W2: a volta do Mercado Pago (e o ?mp=conectar do APK) — lida uma vez e tirada da busca na hora (recarregar não repete)
  const mpDaBusca = params.get("mp");
  const conexaoDaBusca = params.get("c");
  useEffect(() => {
    if (mpDaBusca === null) {
      voltaLida.current = null;
      return;
    }
    const lida = `${mpDaBusca}|${conexaoDaBusca ?? ""}`;
    if (voltaLida.current === lida) return;
    voltaLida.current = lida;
    setParams((a) => {
      const q = new URLSearchParams(a);
      q.delete("mp");
      q.delete("c");
      return q;
    }, { replace: true });
    const volta = lerVoltaDoMp(mpDaBusca, conexaoDaBusca);
    if (!volta) return;
    setEscolha(null);
    setPreferirMp(true);
    if (volta.tipo === "conectar") setDestaque(true);
    else if (volta.tipo === "erro") mostrarAvisoMp(volta.resultado, TEXTO_DO_RETORNO[volta.resultado], "erro");
    else void confirmarConexao(volta.conexao);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a volta é tratada uma vez por busca (voltaLida); os ajudantes são do render
  }, [mpDaBusca, conexaoDaBusca]);

  // W2 (APK): o site abriu por cima do app — quando o navegador fecha, lê de novo (o ouvinte sai junto com a tela)
  useEffect(() => {
    if (!noNavegador) return;
    return aoFecharONavegador(() => {
      setNoNavegador(false);
      void qc.invalidateQueries({ queryKey: ["recebimento-conta"] });
    });
  }, [noNavegador, qc]);

  if (!conta) {
    return <div data-config-aba="recebimento" data-estado-aba="vazio"><EstadoVazio titulo="Nenhuma conta ativa" texto="O recebimento aparece aqui quando você faz parte de uma conta de profissional." /></div>;
  }
  const r = consulta.data;
  const pendentesFalhou = pendentes.isError && !pendentes.data;
  const mp = r?.mercadopago_conta;
  /** W2: a opção do MP da conta — com a flag (o master sempre; nunca na conta do app) ou a conta já nele */
  const mpVisivel = !!r && (!!mp?.disponivel || r.conta.modo === "mercadopago_conta");
  const modo: ModoRecebimento = escolha ?? (preferirMp && mpVisivel ? "mercadopago_conta" : r?.conta.modo ?? "pix_manual");
  const opcoes: OpcaoPilula<ModoRecebimento>[] = [
    { valor: "pix_manual", rotulo: "Pix na sua chave", dica: "O aluno paga pelo banco dele e anexa o comprovante; você confirma", icone: QrCode },
    ...(r && (r.infinitepay.disponivel || r.conta.modo === "infinitepay")
      ? [{ valor: "infinitepay" as const, rotulo: "InfinitePay", icone: Wallet,
           dica: "O aluno paga na página da InfinitePay (Pix ou cartão em até 12×) e a confirmação chega sozinha" }]
      : []),
    ...(mpVisivel
      ? [{ valor: "mercadopago_conta" as const, rotulo: "Mercado Pago (sua conta)", icone: CreditCard,
           dica: "O aluno paga por Pix ou cartão no app e o dinheiro cai direto no seu Mercado Pago" }]
      : []),
    { valor: "nenhum", rotulo: "Não cobrar pelo app", dica: "Você cobra por fora e registra o pagamento no financeiro do aluno", icone: Ban },
    // o Mercado Pago do Physiq: só o master liga (mp_so_master) — a opção só para ele ou para a conta que já está nele
    ...(r && (r.master || r.conta.modo === "mercadopago")
      ? [{ valor: "mercadopago" as const, rotulo: "Mercado Pago do Physiq", icone: CreditCard,
           dica: "Pix e cartão com confirmação automática, pela conta do Physiq (só o master liga)" }]
      : []),
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
      if (pedido.modo !== undefined) {
        // a forma salva passa a ser a da tela (a escolha e o pedido da volta do MP acabam aqui)
        setEscolha(null);
        setPreferirMp(false);
        setDestaque(false);
      }
      // W2 (MENOR 11): o automaticas_falhas da W1 vem sempre 0 — a recusa do cancelamento agora é o 409/502 do catch, e nada muda
      toast.success(ok);
    } catch (e) {
      // o bloqueio mostrado na hora volta ao que está salvo
      if (pedido.bloquear !== undefined) setBloquear(qc.getQueryData<RecebimentoDaConta>(chave)?.conta.bloquear ?? !pedido.bloquear);
      const erro = e instanceof ErroFinanceiro ? e : null;
      const codigo = erro?.codigo ?? null;
      if (codigo === "automaticas_ativas" && !pedido.cancelar_automaticas) {
        const n = Number(erro?.extra.alunos) || 0;
        const sim = await confirmar({
          titulo: "Desligar as cobranças automáticas?", rotuloConfirmar: "Trocar e desligar", rotuloCancelar: "Voltar", perigo: true,
          descricao: `${n === 1 ? "1 aluno paga" : `${n} alunos pagam`} no cartão todo mês pelo Mercado Pago. Trocar a forma de receber desliga essas cobranças e avisa cada aluno.`,
        });
        if (sim) {
          setSalvando(false);
          return salvar({ ...pedido, cancelar_automaticas: true }, ok);
        }
      } else if (codigo && ERROS_DO_CAMPO.has(codigo)) {
        erroDoCampo(erro!);
      } else {
        toast.error(mensagemDoRecebimento(codigo, "Não deu para salvar agora. Confira a internet e tente de novo.", erro?.extra));
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
    void salvar({ modo }, modo === "mercadopago_conta" ? "Pronto: seus alunos pagam pelo seu Mercado Pago." : "Forma de recebimento salva.");
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

  /** W2: Conectar (ou de novo). No site, a página vai à autorização do Mercado Pago e a volta traz de novo para cá; no APK, o SITE abre no
   *  navegador por cima do app e o fluxo inteiro acontece lá (I8). Só abre o que passa no filtro do abrirPagamento (MENOR 9). */
  const conectarMp = async () => {
    setConectando(true);
    setAvisoMp(null);
    setPodeFechar(false);
    try {
      const { url } = await conectarMercadoPago(conta.id, noApp ? "apk" : "site");
      const aberto = noApp ? await abrirSiteNoApp(url) : abrirConexaoMp(url);
      if (aberto === "recusado") toast.error("Não deu para abrir o Mercado Pago agora. Tente de novo.");
      else if (aberto === "app") setNoNavegador(true);
    } catch (e) {
      const erro = e instanceof ErroFinanceiro ? e : null;
      toast.error(mensagemDoMpConta(erro?.codigo, erro?.extra, "Não deu para conectar agora. Tente de novo."));
    } finally {
      setConectando(false);
    }
  };

  /** W2: Desconectar — o OK; com automática viva (409 automaticas_ativas { alunos }), o 2º OK desliga as automáticas antes. A recusa do
   *  cancelamento (409 mp_sem_acesso / 502 automaticas_nao_canceladas) não muda nada. */
  const desconectarMp = async (cancelar = false): Promise<void> => {
    if (!r) return;
    if (!cancelar) {
      const sim = await confirmar({
        titulo: "Desconectar o Mercado Pago?", rotuloConfirmar: "Desconectar", rotuloCancelar: "Voltar", perigo: true,
        descricao: r.conta.modo === "mercadopago_conta"
          ? "Os alunos deixam de pagar pelo seu Mercado Pago no app: a forma de receber passa a ser o Pix na sua chave (se houver uma ligada) ou \"Não cobrar pelo app\". O que já estava em andamento continua sendo conferido por 7 dias."
          : "A conexão com a sua conta do Mercado Pago sai. A forma de receber não muda.",
      });
      if (!sim) return;
    }
    setDesconectando(true);
    try {
      const res = await desconectarMercadoPago(conta.id, cancelar);
      qc.setQueryData(chave, res);
      setEscolha(null);
      setPreferirMp(false);
      setDestaque(false);
      setAvisoMp(null);
      setPodeFechar(false);
      const n = Number(res.automaticas_canceladas) || 0;
      toast.success(n > 0
        ? `Mercado Pago desconectado. ${n === 1 ? "1 cobrança automática desligada" : `${n} cobranças automáticas desligadas`} — cada aluno recebeu um aviso.`
        : "Mercado Pago desconectado.");
    } catch (e) {
      const erro = e instanceof ErroFinanceiro ? e : null;
      if (erro?.codigo === "automaticas_ativas" && !cancelar) {
        const n = Number(erro.extra.alunos) || 0;
        const sim = await confirmar({
          titulo: `Desligar as cobranças automáticas de ${n === 1 ? "1 aluno" : `${n} alunos`}?`, rotuloConfirmar: "Desligar e desconectar",
          rotuloCancelar: "Voltar", perigo: true,
          descricao: "Elas são canceladas no Mercado Pago e cada aluno recebe um aviso. Sem isso, não dá para desconectar.",
        });
        if (sim) {
          setDesconectando(false);
          return desconectarMp(true);
        }
      } else {
        toast.error(mensagemDoMpConta(erro?.codigo, erro?.extra, "Não deu para desconectar agora. Tente de novo."));
      }
    } finally {
      setDesconectando(false);
    }
  };

  const tagMudou = modo === "infinitepay" && normalizarHandle(tag) !== r?.infinitepay.handle;
  const situacaoMp = situacaoDoMp(mp ? { status: mp.status, mp_erro: mp.erro, mp_expira_em: mp.expira_em, mp_apelido: mp.apelido } : null);
  const chipMp = chipDaConexaoMp(situacaoMp);
  /** W2: o MP da conta escolhido sem a conexão ativa — "Salvar a forma" espera o Conectar */
  const mpSemConexao = !!r && modo === "mercadopago_conta" && r.conta.modo !== "mercadopago_conta" && mp?.status !== "ativa";
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
                aoMudar={(v) => {
                  setEscolha(v[0] ?? modo);
                  setErroTag("");
                  setAtivar(null);
                  setDestaque(false);
                  setAvisoMp(null);
                  setPodeFechar(false);
                }} />
              {modo === "infinitepay" && (
                <div className="flex flex-col gap-2 rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-recebimento-infinitepay>
                  <Campo rotulo="Sua InfiniteTag" value={tag} placeholder="$seunome" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    onChange={(e) => { setTag(e.target.value); setErroTag(""); setAtivar(null); }} data-infinitetag />
                  <p className="text-[12px] text-texto-2">É o nome da sua conta no app da InfinitePay (começa com $). O dinheiro cai direto lá, sem taxa do Physiq.</p>
                  {erroTag && <MensagemForm data-infinitetag-erro>{erroTag}</MensagemForm>}
                  {ativar && (
                    <Botao variante="g" icone={ExternalLink} className={BOTAO_LONGO} onClick={() => void abrirLinkExterno(ativar)} data-infinitepay-ativar>
                      Ativar o checkout externo na InfinitePay
                    </Botao>
                  )}
                  <Botao variante="g" icone={ExternalLink} className={BOTAO_LONGO} disabled={testando} onClick={() => void testar()} data-infinitepay-testar>
                    {testando ? "Abrindo…" : "Testar (abre a sua página, sem cobrar)"}
                  </Botao>
                </div>
              )}
              {modo === "mercadopago_conta" && (
                <div className="flex flex-col gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-recebimento-mp-conta>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tom={chipMp.tom} data-mp-situacao={chipMp.marca}>{situacaoMp.titulo}</Chip>
                  </div>
                  <p className="text-[12px] text-texto-2" data-mp-texto>{situacaoMp.texto}</p>
                  {mp?.status === "ativa" && !mp.chave_publica && (
                    <p className="text-[12px] text-ambar-3" data-mp-so-pix>
                      Por enquanto, os alunos pagam só por Pix: o Mercado Pago não liberou o pagamento com cartão nesta conexão.
                    </p>
                  )}
                  {avisoMp && <MensagemForm tom={avisoMp.tom} data-mp-retorno={avisoMp.marca}>{avisoMp.texto}</MensagemForm>}
                  {podeFechar && <MensagemForm tom="ok" data-mp-pode-fechar>Pronto. Se você começou pelo app, pode fechar esta janela e voltar a ele.</MensagemForm>}
                  {noNavegador && <MensagemForm tom="aviso" data-mp-no-navegador>Conecte no navegador que abriu e volte ao app.</MensagemForm>}
                  {(situacaoMp.acao || mp?.status === "ativa" || mp?.status === "erro") && (
                    <div className="flex flex-wrap gap-2">
                      {situacaoMp.acao && (
                        <Botao variante={destaque ? "v" : "w"} icone={situacaoMp.acao === "conectar" ? Link2 : RefreshCw} className={BOTAO_LONGO}
                          disabled={conectando || !r.pode_editar} onClick={() => void conectarMp()}
                          data-mp-conectar={situacaoMp.acao === "conectar" || undefined} data-mp-reconectar={situacaoMp.acao === "reconectar" || undefined}
                          data-mp-conectar-destaque={destaque || undefined}>
                          {conectando ? "Abrindo…" : situacaoMp.acao === "conectar" ? "Conectar com o Mercado Pago" : "Conectar de novo"}
                        </Botao>
                      )}
                      {(mp?.status === "ativa" || mp?.status === "erro") && (
                        <Botao variante="g" icone={Unlink} className={BOTAO_LONGO} disabled={desconectando || !r.pode_editar}
                          onClick={() => void desconectarMp()} data-mp-desconectar>
                          {desconectando ? "Desconectando…" : "Desconectar"}
                        </Botao>
                      )}
                    </div>
                  )}
                </div>
              )}
              {r.conta.modo === "mercadopago" && modo !== "mercadopago" && !r.master && (
                <p className="text-[12px] text-ambar-3" data-recebimento-sair-mp-physiq>Saindo do Mercado Pago do Physiq, voltar a ele depende do master.</p>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-4">
                <Botao variante="w" icone={Save} disabled={salvando || !r.pode_editar || (modo === r.conta.modo && !tagMudou) || mpSemConexao}
                  onClick={salvarForma} data-recebimento-salvar-modo>
                  {salvando ? "Salvando…" : "Salvar a forma"}
                </Botao>
                {mpSemConexao && <p className="text-[12px] text-texto-2" data-mp-salvar-dica>Conecte o Mercado Pago primeiro.</p>}
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
