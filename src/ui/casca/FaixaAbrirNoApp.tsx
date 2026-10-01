import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { lerProfPendente } from "@/lib/profPendente";
import { alvoDaFaixa, destinoGuardado, ehCaminhoDoApp, faixaNoAparelho, intentDoApp } from "@/lib/linksDoApp";
import { useSessao } from "@/nucleo/sessao";
import { ultimaArea } from "@/ui/casca/area";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { Marca } from "@/ui/premium/Marca";

/** "Fechar" fica lembrado neste navegador (a faixa não volta). */
export const CHAVE_FAIXA_FECHADA = "physiq_faixa_abrir_app_fechada";

function fechadaAqui(): boolean {
  try {
    return localStorage.getItem(CHAVE_FAIXA_FECHADA) === "1";
  } catch {
    return false;
  }
}

/**
 * Physiq H2 — "Abrir no app Physiq" (pedido dele, 01/10: "quando clicar o link apareça a sugestão de abrir o app"). Faixa discreta
 * no alto das páginas do aluno — e da entrada, quando a pessoa chegou por um link delas e está sem login no navegador —, só no
 * navegador do Android (fora do APK). O botão é um intent:// do Chrome: abre o app NA mesma tela se ele está instalado; sem o
 * app, a página de baixar o APK. Fechar some e fica lembrado. Não aparece no APK, no computador, no iPhone, no painel, no master
 * nem nas páginas públicas. O link do profissional (?prof=) vai junto quando a faixa abre a raiz.
 */
export function FaixaAbrirNoApp() {
  const { pathname, search, state } = useLocation();
  const { pronto, usuario } = useSessao();
  const [fechada, setFechada] = useState(fechadaAqui);
  const nativo = Capacitor.isNativePlatform();
  if (fechada || !pronto || !faixaNoAparelho(typeof navigator === "undefined" ? "" : navigator.userAgent, nativo)) return null;

  const de = (state as { de?: string } | null)?.de ?? null;
  const alvo = alvoDaFaixa({ pathname, search, de, logado: Boolean(usuario), destino: destinoGuardado() });
  if (!alvo) return null;

  const fechar = () => {
    try {
      localStorage.setItem(CHAVE_FAIXA_FECHADA, "1");
    } catch {
      /* sem armazenamento: só fecha agora */
    }
    setFechada(true);
  };
  const faixa = <Faixa alvo={alvo} naEntrada={pathname.startsWith("/entrar")} aoFechar={fechar} />;
  // com login, nas páginas do aluno: espera a casca (sem piscar no carregando nem no "/" do profissional, que vai ao painel)
  return usuario && ehCaminhoDoApp(pathname) ? <NaCasca raiz={pathname === "/"}>{faixa}</NaCasca> : faixa;
}

function NaCasca({ raiz, children }: { raiz: boolean; children: ReactNode }) {
  const dados = useDadosCasca();
  if (dados.carregando) return null;
  if (raiz && dados.ehProfissional && ultimaArea() !== "aluno") return null; // a casca manda para o painel
  return <>{children}</>;
}

function Faixa({ alvo, naEntrada, aoFechar }: { alvo: string; naEntrada: boolean; aoFechar: () => void }) {
  const href = intentDoApp(alvo, { prof: alvo === "/" ? lerProfPendente() : null });
  return (
    <div
      data-faixa-abrir-app={alvo}
      className={cn("relative z-10 mx-auto w-full pt-[max(12px,env(safe-area-inset-top,0px))]", naEntrada ? "max-w-[440px] px-5" : "max-w-3xl px-4 sm:px-8")}
    >
      <div
        role="region"
        aria-label="Abrir no app Physiq"
        className="flex items-center gap-[11px] rounded-2xl border py-2 pl-2.5 pr-1.5"
        style={{ background: "linear-gradient(90deg, rgba(139,92,246,.18), rgba(139,92,246,.04))", borderColor: "rgba(139,92,246,.32)" }}
      >
        <Marca tamanho={30} soIcone />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-texto" data-faixa-abrir-app-titulo>Abrir no app Physiq</div>
          <div className="mt-px truncate text-[12px] font-medium text-texto-2">Esta mesma tela, direto no app</div>
        </div>
        <a href={href} className="pq-botao pq-botao-v pq-botao-sm flex-none" data-faixa-abrir-app-link>
          Abrir
        </a>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          title="Fechar"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] text-texto-3 transition-colors hover:text-texto"
          data-faixa-abrir-app-fechar
        >
          <X aria-hidden className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
