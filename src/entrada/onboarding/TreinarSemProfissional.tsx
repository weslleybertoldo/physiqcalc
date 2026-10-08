import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Dumbbell } from "lucide-react";
import { dataBR } from "@/financeiro/regras";
import { ehLoja } from "@/lib/distribuicao";
import { useSessao } from "@/nucleo/sessao";
import { buscarMeuPlano, entrarSemProfissional, ErroApp } from "@/app-aluno/sozinho/api";
import { SeletorObjetivo, SeletorPlano } from "@/app-aluno/sozinho/pecas/Seletores";
import { mensagemApp, PLANO_TREINO, precoMensal, TESTE_DIAS_APP, ultimoDiaGratis, type Objetivo } from "@/app-aluno/sozinho/regras";
import { lembrarArea } from "@/ui/casca/area";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { useOnline } from "@/ui/premium/useOnline";
import { MensagemForm } from "../pecas/Campo";

// hml-11 (H-28, D5): o resumo dos Termos de assinatura antes de começar o plano do app (Decreto 7.962/2013, art. 4º, I) — SÓ no build
// de staging até a virada. Na produção o Rollup corta o import() (a expressão do Vite fica aqui, direto na condição, sem função no meio).
const ResumoAntesDePagar = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/legal/ResumoAntesDePagar")) : null;

/**
 * Boas-vindas › "Treinar sem profissional" (W7b — regra dele, 29/09): quem entra sem código treina sozinho. Escolhe o objetivo
 * (emagrecer · manter a forma · ganhar massa — as listas de treinos e pratos prontos vêm dele) e o plano do app (Treino ou
 * Treino + Alimentação, com os preços da tabela do banco); os dias grátis começam na hora. Depois do teste, paga em Perfil ›
 * Pagamentos (Pix ou cartão, pelo Mercado Pago do Physiq); sem pagar, o app fecha e só Pagamentos abre.
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
  const consulta = useQuery({ queryKey: ["plano-app"], queryFn: buscarMeuPlano, staleTime: 60_000, retry: 1, networkMode: "online" });
  const planos = useMemo(() => consulta.data?.planos ?? [], [consulta.data]);
  const dias = consulta.data?.teste_dias ?? TESTE_DIAS_APP;
  const menor = planos.length ? Math.min(...planos.map((p) => p.valor)) : null;

  useEffect(() => {
    if (!plano && planos.some((p) => p.codigo === PLANO_TREINO)) setPlano(PLANO_TREINO);
  }, [plano, planos]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!online) return setErro(mensagemApp("sem_internet"));
    if (!objetivo) return setErro(mensagemApp("objetivo_invalido"));
    if (!plano) return setErro(mensagemApp("plano_invalido"));
    setEnviando(true);
    try {
      const r = await entrarSemProfissional(objetivo, plano);
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
            Monte o seu treino ou use um treino pronto pelo seu objetivo.{menor !== null ? ` Depois, a partir de ${precoMensal(menor)}.` : ""}
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
            <SeletorPlano planos={planos} valor={plano} aoMudar={(c) => { setPlano(c); setErro(""); }} carregando={consulta.isLoading} />
          )}
          <p className="text-[12.5px] leading-relaxed text-texto-2" data-sozinho-teste>
            {dias} dias grátis, até <b className="font-semibold text-texto">{dataBR(ultimoDiaGratis(dias))}</b>. Sem cartão agora: depois do teste, pague por
            Pix ou cartão em Perfil › Pagamentos. Sem o pagamento, o app fica fechado até pagar.
          </p>
          {ResumoAntesDePagar && !ehLoja && (
            <Suspense fallback={null}>
              <ResumoAntesDePagar tela="sem-profissional" />
            </Suspense>
          )}
          {erro && <MensagemForm data-sozinho-erro>{erro}</MensagemForm>}
          <button type="submit" disabled={enviando || !planos.length} className="pq-botao pq-botao-w h-12 w-full rounded-2xl" data-sozinho-enviar>
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
