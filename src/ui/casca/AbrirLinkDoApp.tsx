import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useSessao } from "@/nucleo/sessao";
import { EVENTO_LINK, destinoGuardado, esquecerDestino } from "@/lib/linksDoApp";

/**
 * Physiq H2 — o link do site que abriu o APK leva à tela dele (src/lib/linksDoApp.ts). Com login, depois que a sessão e a situação
 * chegaram e a casca terminou os redirecionamentos da abertura (o Início, o painel do profissional), navega até o destino;
 * sem login não faz nada — a entrada leva até ele depois de entrar (RotaEntrada). Nas Boas-vindas (conta sem nada) o destino é
 * esquecido. No site a pessoa já está na página do link (ou a entrada a levou até ela): aqui só esquece o destino guardado.
 * A tela sem permissão (ex.: /dieta sem o módulo Nutrição) cai na regra de sempre da casca.
 */
export function AbrirLinkDoApp() {
  const { pronto, usuario, situacao, erroSituacao } = useSessao();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [chegou, setChegou] = useState(0);
  const pendente = useRef<string | null>(null);

  useEffect(() => {
    const aoLink = () => setChegou((n) => n + 1);
    window.addEventListener(EVENTO_LINK, aoLink);
    return () => window.removeEventListener(EVENTO_LINK, aoLink);
  }, []);

  useEffect(() => {
    if (!pronto || !usuario) return;
    if (!situacao && !erroSituacao) return;
    const naEntrada = pathname === "/entrar" || pathname.startsWith("/entrar/") || pathname === "/boas-vindas";
    if (situacao?.sem_nada) {
      pendente.current = null;
      esquecerDestino();
      return;
    }
    if (naEntrada) return; // a entrada está levando ao destino (ou à página que pediu o login)
    const destino = destinoGuardado() ?? pendente.current; // um link novo (guardado de novo) vence o que esperava
    if (!destino) return;
    esquecerDestino();
    if (!Capacitor.isNativePlatform() || destino === `${pathname}${search}`) {
      pendente.current = null;
      return;
    }
    // espera a casca assentar (cada troca de rota da abertura adia de novo) e só então troca de tela
    pendente.current = destino;
    const t = window.setTimeout(() => {
      pendente.current = null;
      navigate(destino);
    }, 80);
    return () => window.clearTimeout(t);
  }, [pronto, usuario, situacao, erroSituacao, pathname, search, chegou, navigate]);

  return null;
}
