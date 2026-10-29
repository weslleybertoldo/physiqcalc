import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Dumbbell } from "lucide-react";
import { dataBR } from "@/financeiro/regras";
import { ehLoja } from "@/lib/distribuicao";
import { useSessao } from "@/nucleo/sessao";
import { buscarMeuPlano, entrarSemProfissional, ErroApp } from "@/app-aluno/sozinho/api";
import { porMes } from "@/app-aluno/sozinho/playRegras";
import { usePlayDaLoja } from "@/app-aluno/sozinho/usePlayDaLoja";
import { SeletorObjetivo, SeletorPlano } from "@/app-aluno/sozinho/pecas/Seletores";
import { mensagemApp, PLANO_TREINO, precoMensal, TESTE_DIAS_APP, ultimoDiaGratis, type Objetivo } from "@/app-aluno/sozinho/regras";
import { lembrarArea } from "@/ui/casca/area";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { useOnline } from "@/ui/premium/useOnline";
import { MensagemForm } from "../pecas/Campo";

// hml-11 (H-28, D5): o resumo dos Termos de assinatura antes de começar o plano do app (Decreto 7.962/2013, art. 4º, I) — em todo build
// desde a virada (29/10/2026), menos na versão da Google Play (lá a folha da Play tem o resumo "loja"). Carrega sob demanda.
const ResumoAntesDePagar = lazy(() => import("@/publico/legal/ResumoAntesDePagar"));
// hml-12 (H-30, P4): a data de nascimento (o plano do app é para 18+) e o consentimento dos dados de saúde, em destaque, antes de
// começar — em todo build desde a virada; com eles vai a RPC de 5 argumentos (com a versão dos textos desligada no banco, ela age como
// a de 2). Carregam sob demanda.
const ConsentimentoSaude = lazy(() => import("@/publico/legal/aceite/ConsentimentoSaude"));
const CampoNascimento = lazy(() => import("@/publico/legal/aceite/CampoNascimento"));

/**
 * Boas-vindas › "Treinar sem profissional" (W7b — regra dele, 29/09): quem entra sem código treina sozinho. Escolhe o objetivo
 * (emagrecer · manter a forma · ganhar massa — as listas de treinos e pratos prontos vêm dele) e o plano do app (Treino ou
 * Treino + Alimentação, com os preços da tabela do banco); os dias grátis começam na hora. Depois do teste, paga em Perfil ›
 * Pagamentos (Pix ou cartão, pelo Mercado Pago do Physiq); sem pagar, o app fecha e só Pagamentos abre.
 * play-W6: na versão da Google Play (com a Play valendo — só então as Boas-vindas mostram este cartão), os preços são os da PLAY e o
 * texto diz que, depois dos dias grátis, a assinatura é pela Google Play — nada é cobrado sem a pessoa assinar. Começar o teste é o
 * mesmo entrar_sem_profissional (nada vai ao Google agora).
 * hml-12 → a virada (29/10/2026): antes de começar, a data de nascimento (18+) e o consentimento dos dados de saúde, em todo build.
 */
export default function TreinarSemProfissional() {
  const navigate = useNavigate();
  const online = useOnline();
  const { recarregarSituacao } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null);
  const [plano, setPlano] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<string | null>(null);
  // hml-12: a data, o erro dela pela regra 18+ e o consentimento dado (a versão do texto lido e de onde veio)
  const [nascimento, setNascimento] = useState("");
  const [erroNascimento, setErroNascimento] = useState<string | null>(null);
  const [consentimento, setConsentimento] = useState<{ versao: string; origem: string } | null>(null);
  const consulta = useQuery({ queryKey: ["plano-app"], queryFn: buscarMeuPlano, staleTime: 60_000, retry: 1, networkMode: "online" });
  // play-W6: na loja com a Play, só os planos que a Play vende, com o preço DELA
  const play = usePlayDaLoja();
  const comPlay = ehLoja && play.ativa;
  const ofertasPlay = play.ofertas;
  const planos = useMemo(
    () => (consulta.data?.planos ?? []).filter((p) => !comPlay || !!ofertasPlay[p.codigo as keyof typeof ofertasPlay]),
    [consulta.data, comPlay, ofertasPlay],
  );
  const precosPlay = useMemo(
    () => (comPlay ? Object.fromEntries(Object.values(ofertasPlay).flatMap((o) => (o ? [[o.produto, porMes(o.preco)]] : []))) : undefined),
    [comPlay, ofertasPlay],
  );
  const dias = consulta.data?.teste_dias ?? TESTE_DIAS_APP;
  const menor = planos.length ? Math.min(...planos.map((p) => p.valor)) : null;
  const aPartirDe = comPlay ? (play.menorPreco ? porMes(play.menorPreco) : null) : menor !== null ? precoMensal(menor) : null;

  useEffect(() => {
    if (!plano && planos.some((p) => p.codigo === PLANO_TREINO)) setPlano(PLANO_TREINO);
  }, [plano, planos]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!online) return setErro(mensagemApp("sem_internet"));
    if (!objetivo) return setErro(mensagemApp("objetivo_invalido"));
    if (!plano) return setErro(mensagemApp("plano_invalido"));
    if (!nascimento || erroNascimento) return setErro(mensagemApp(erroNascimento ?? "nascimento_invalido"));
    if (!consentimento) return setErro(mensagemApp("sem_consentimento_saude"));
    setEnviando(true);
    try {
      const r = await entrarSemProfissional(objetivo, plano, { nascimento, consentimento: consentimento.versao, origem: consentimento.origem });
      setPronto(r.teste_ate);
      await recarregarSituacao();
      lembrarArea("aluno");
      setTimeout(() => navigate("/perfil/treinos-prontos?inicio=1", { replace: true }), 1200);
    } catch (e2) {
      setErro(mensagemApp(e2 instanceof ErroApp ? e2.codigo : null));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Cartao brilho={aberto} data-onboarding="TreinarSemProfissional" className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-violeta-3">
          <Dumbbell aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-texto">Treinar sem profissional</span>
            <Chip tom="n" data-chip-dias-gratis>{dias} DIAS GRÁTIS</Chip>
          </span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-texto-2">
            Monte o seu treino ou use um treino pronto pelo seu objetivo.{aPartirDe ? ` Depois, a partir de ${aPartirDe}.` : ""}
          </span>
        </span>
      </div>

      {pronto !== null ? (
        <MensagemForm tom="ok" data-app-pronto>
          <CheckCircle2 aria-hidden className="mr-1.5 inline h-4 w-4 align-[-3px]" />
          Pronto! Grátis até {dataBR(pronto) || dataBR(ultimoDiaGratis(dias))}. Abrindo os treinos prontos…
        </MensagemForm>
      ) : !aberto ? (
        <button type="button" onClick={() => setAberto(true)} className="pq-botao pq-botao-g h-12 w-full rounded-2xl" data-sozinho-abrir>
          Quero treinar sozinho
        </button>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-4" data-form-sozinho>
          <SeletorObjetivo valor={objetivo} aoMudar={(o) => { setObjetivo(o); setErro(""); }} />
          {consulta.isError && !planos.length ? (
            <div className="flex flex-col gap-2">
              <MensagemForm>Não deu para carregar os planos agora.</MensagemForm>
              <button type="button" className="pq-botao pq-botao-g w-full" onClick={() => void consulta.refetch()}>Tentar de novo</button>
            </div>
          ) : (
            <SeletorPlano planos={planos} valor={plano} aoMudar={(c) => { setPlano(c); setErro(""); }} carregando={consulta.isLoading} precos={precosPlay} />
          )}
          {comPlay ? (
            <p className="text-[12.5px] leading-relaxed text-texto-2" data-sozinho-teste="play">
              {dias} dias grátis no app, até <b className="font-semibold text-texto">{dataBR(ultimoDiaGratis(dias))}</b>. Para continuar depois, a assinatura
              pela Google Play{aPartirDe ? ` a partir de ${aPartirDe}` : ""} — nada é cobrado sem você assinar.
            </p>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-texto-2" data-sozinho-teste>
              {dias} dias grátis, até <b className="font-semibold text-texto">{dataBR(ultimoDiaGratis(dias))}</b>. Sem cartão agora: depois do teste, pague por
              Pix ou cartão em Perfil › Pagamentos. Sem o pagamento, o app fica fechado até pagar.
            </p>
          )}
          <Suspense fallback={null}>
            <CampoNascimento
              valor={nascimento}
              aoMudar={(valor, erroDaData) => { setNascimento(valor); setErroNascimento(erroDaData); setErro(""); }}
              desabilitado={enviando}
            />
            <ConsentimentoSaude
              variante="app"
              marcado={!!consentimento}
              aoMudar={(c) => { setConsentimento(c); setErro(""); }}
              desabilitado={enviando}
            />
          </Suspense>
          {!ehLoja && (
            <Suspense fallback={null}>
              <ResumoAntesDePagar tela="sem-profissional" />
            </Suspense>
          )}
          {erro && <MensagemForm data-sozinho-erro>{erro}</MensagemForm>}
          <button
            type="submit"
            disabled={enviando || !planos.length || !nascimento || !consentimento}
            className="pq-botao pq-botao-w h-12 w-full rounded-2xl"
            data-sozinho-enviar
          >
            {enviando ? "Começando…" : `Começar os ${dias} dias grátis`}
          </button>
          <p className="text-center text-[11.5px] leading-relaxed text-texto-3">
            Tem um profissional depois? Coloque o código dele no Perfil: a mensalidade do app para e você passa a pagar como combinar com ele.
          </p>
        </form>
      )}
    </Cartao>
  );
}
