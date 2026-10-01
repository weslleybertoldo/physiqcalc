import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { toast } from "sonner";
import { ROTA_AGENDA, consultasParaAvisar, gravarAvisadas, idDaNotificacao, lerAvisadas, textoDoAviso } from "@/agenda/avisoLocal";
import { minhaAgenda } from "@/app-aluno/perfil/pecas/api";
import { inicioDaAgenda } from "@/app-aluno/perfil/pecas/regras";
import { useSessao } from "@/nucleo/sessao";
import { pushAtivoNoAparelho } from "@/push/regras";

const nativo = () => Capacitor.isNativePlatform();
const CANAL = "consultas-v1";
let canalCriado = false;

async function notificarNoAparelho(id: number, titulo: string, corpo: string): Promise<boolean> {
  try {
    if (nativo()) {
      // W20c: com o push ligado neste aparelho a notificação já chegou pelo FCM — aqui fica só o aviso na tela
      if (pushAtivoNoAparelho()) return false;
      let { display } = await LocalNotifications.checkPermissions();
      if (display === "prompt" || display === "prompt-with-rationale") display = (await LocalNotifications.requestPermissions()).display;
      if (display !== "granted") return false;
      if (!canalCriado) {
        await LocalNotifications.createChannel({ id: CANAL, name: "Consultas", description: "Consultas marcadas pelo seu profissional", importance: 4, visibility: 1 }).catch(() => undefined);
        canalCriado = true;
      }
      await LocalNotifications.schedule({ notifications: [{ id, title: titulo, body: corpo, channelId: CANAL, smallIcon: "ic_launcher", extra: { rota: ROTA_AGENDA } }] });
      return true;
    }
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(`Physiq — ${titulo}`, { body: corpo, icon: "/icon-192.png", tag: `consulta-${id}` });
      return true;
    }
  } catch {
    /* sem suporte ou permissão: o sino e o toast avisam */
  }
  return false;
}

/**
 * Aviso no aparelho da consulta nova (W20 — default D: o app ainda não tem push/FCM). Quando o app abre ou volta para a frente,
 * as consultas que o profissional marcou e esperam a resposta do aluno viram uma notificação local (APK) e um aviso na tela, uma
 * vez por consulta neste aparelho; tocar abre a Agenda (confirmar, reagendar ou desistir). Só para quem é aluno; sem nada novo,
 * não aparece. A lista é a MESMA da Perfil › Agenda (["agenda-aluno", uid]).
 */
export default function AvisoConsultaNova() {
  const { usuario, situacao } = useSessao();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const uid = usuario?.id ?? null;
  const ehAluno = (situacao?.matriculas ?? []).some((m) => m.ativo && (m.personal || m.nutricionista));
  const rodando = useRef(false);

  const conferir = useCallback(async () => {
    if (!uid || !ehAluno || rodando.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    rodando.current = true;
    try {
      const lista = await qc.fetchQuery({ queryKey: ["agenda-aluno", uid], queryFn: () => minhaAgenda(inicioDaAgenda()), staleTime: 30_000 });
      const avisadas = lerAvisadas();
      const novas = consultasParaAvisar(lista, avisadas);
      const texto = textoDoAviso(novas);
      if (!texto) return;
      for (const c of novas) avisadas.add(c.id);
      gravarAvisadas(avisadas);
      await notificarNoAparelho(idDaNotificacao(novas[0].id), texto.titulo, texto.corpo);
      if (!window.location.pathname.startsWith(ROTA_AGENDA)) {
        toast(texto.titulo, { description: texto.corpo, duration: 9000, action: { label: "Ver", onClick: () => navigate(ROTA_AGENDA) } });
      }
    } catch {
      /* sem internet ou o banco fora: tenta na próxima vez que o app voltar */
    } finally {
      rodando.current = false;
    }
  }, [uid, ehAluno, qc, navigate]);

  useEffect(() => {
    void conferir();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferir();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    let estado: Promise<{ remove: () => void }> | null = null;
    let toque: Promise<{ remove: () => void }> | null = null;
    if (nativo()) {
      estado = CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void conferir();
      });
      toque = LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
        const rota = (e.notification?.extra as { rota?: string } | undefined)?.rota;
        if (rota === ROTA_AGENDA) navigate(ROTA_AGENDA);
      });
    }
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      void estado?.then((l) => l.remove());
      void toque?.then((l) => l.remove());
    };
  }, [conferir, navigate]);

  return null;
}
