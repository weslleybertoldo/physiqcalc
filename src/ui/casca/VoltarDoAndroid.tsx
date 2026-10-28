import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { fecharDialogAberto } from "@/lib/dialogAberto";
import { acaoDoVoltar } from "@/lib/voltarDoAndroid";
import { useSessao } from "@/nucleo/sessao";
import { useConfirmar } from "@/ui/premium/useConfirmar";

/**
 * hml-29 (B22) — o voltar do Android (o botão ou o gesto; no site, nada): modal, folha ou menu aberto fecha só ele (inclusive a
 * própria pergunta de sair); na página inicial pergunta "Deseja sair do Physiq?" na confirmação do próprio app (Sim fecha o app;
 * Não fica na tela sem perder nada); nas outras telas volta pra anterior e, sem anterior, vai ao Início (src/lib/voltarDoAndroid.ts).
 * Fica logo dentro do BrowserRouter (precisa do navigate); enquanto o login carrega (antes do roteador), vale o voltar padrão do
 * Capacitor. Antes ficava no useAppLifecycle, que minimizava o app sem perguntar.
 */
export function VoltarDoAndroid() {
  const navigate = useNavigate();
  const confirmar = useConfirmar();
  const { situacao } = useSessao();
  // o listener é registrado uma vez: registrar de novo a cada troca de tela deixaria 2 listeners vivos por um instante (o remove
  // do Capacitor é assíncrono) — o navigate e a sessão mais novos ficam nos refs
  const navegar = useRef(navigate);
  const semNada = useRef(false);
  useEffect(() => {
    navegar.current = navigate;
    semNada.current = situacao?.sem_nada === true;
  }, [navigate, situacao]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let perguntando = false;
    const listener = CapApp.addListener("backButton", ({ canGoBack }) => {
      if (fecharDialogAberto()) return;
      const acao = acaoDoVoltar(window.location.pathname, canGoBack, semNada.current);
      if (acao === "voltar") {
        window.history.back();
        return;
      }
      if (acao === "ir_ao_inicio") {
        navegar.current("/", { replace: true });
        return;
      }
      // o voltar repetido antes de a janela abrir não empilha uma 2ª pergunta
      if (perguntando) return;
      perguntando = true;
      confirmar({ titulo: "Deseja sair do Physiq?", rotuloConfirmar: "Sim", rotuloCancelar: "Não" })
        .then((sim) => (sim ? CapApp.exitApp() : undefined))
        // sem a confirmação (o provedor fica no App) ou sem conseguir fechar, o voltar faz o que fazia antes: minimiza
        .catch(() => CapApp.minimizeApp())
        .finally(() => {
          perguntando = false;
        });
    });
    return () => {
      listener.then((l) => l.remove());
    };
  }, [confirmar]);

  return null;
}
