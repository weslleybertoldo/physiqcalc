/**
 * play-W6 · T2 (b) — 26/10/2026, o achado do GATE 2 (a compra de teste dele): a assinatura SUSPENSA mostrava a trava genérica ("Assinar pela
 * Google Play") até o app ser reaberto — o resumo guardado no aparelho (10 min) era o de antes, e o `estado` da play-compras só era
 * perguntado ao abrir. Agora a trava da conta do app NA LOJA relê a assinatura ao MONTAR e ao VOLTAR AO PRIMEIRO PLANO (o `resume` do
 * @capacitor/app e o `visibilitychange` visível):
 *   1. o `estado` de novo (forçado — ele ressincroniza no Google a viva vencida, a carência que virou suspensão);
 *   2. DEPOIS o resumo guardado deixa de valer SEM apagar o último (`invalidarResumo({ manterUltimo: true })`): a trava continua até o novo
 *      chegar (o useResumoFinanceiro busca) e troca para a certa — o app nunca aparece no meio.
 * Sem laço nem rajada: 1 releitura por vez (quem pede junto divide) e no mínimo INTERVALO_RELEITURA_MS entre 2 — o resume e o
 * visibilitychange chegam juntos, e a trava que remonta (a releitura trocou a variante) não relê de novo.
 * Só na loja nativa (o plugin da Play): o site e o APK do site não chamam nada daqui (o gate só liga na loja). Nunca lança.
 */
import { useEffect } from "react";
import { App as CapApp } from "@capacitor/app";
import { invalidarResumo } from "@/financeiro/api";
import { pluginDaPlayPresente } from "@/lib/playBilling";
import { useSessao } from "@/nucleo/sessao";
import { carregarPlayDaLoja } from "./usePlayDaLoja";

/** O intervalo mínimo entre 2 releituras (10 s): a volta de verdade dispara o resume E o visibilitychange; quem volta da Google Play depois
 *  de atualizar o pagamento leva mais que isso. Com o freio da play-compras (20 por minuto por pessoa), no máximo 6 por minuto daqui. */
export const INTERVALO_RELEITURA_MS = 10_000;

let emVoo: Promise<void> | null = null;
let ultima = 0;

/** Relê o `estado` (forçado) e depois o resumo (sem apagar o último). 1 por vez; dentro do intervalo, nada. Fora da loja nativa ou sem
 *  login, nada. Nunca lança. */
export function relerAssinaturaDaLoja(uid: string | null | undefined): Promise<void> {
  if (!uid || !pluginDaPlayPresente()) return Promise.resolve();
  if (emVoo) return emVoo;
  const agora = Date.now();
  if (ultima && agora - ultima < INTERVALO_RELEITURA_MS) return Promise.resolve();
  ultima = agora;
  emVoo = (async () => {
    try {
      await carregarPlayDaLoja(true, uid);
    } catch {
      /* sem o servidor agora: o resumo relê do mesmo jeito */
    }
    invalidarResumo({ manterUltimo: true });
  })().finally(() => {
    emVoo = null;
  });
  return emVoo;
}

/** Só para os testes: esquece a releitura no ar e o intervalo. */
export function _esquecerReleituraParaTestes(): void {
  emVoo = null;
  ultima = 0;
}

/** Chama `f` quando o app volta ao primeiro plano (o visibilitychange visível e o resume do Capacitor); devolve o "tirar os ouvintes". */
function aoVoltarAoApp(f: () => void): () => void {
  const aoMudar = () => {
    if (document.visibilityState === "visible") f();
  };
  document.addEventListener("visibilitychange", aoMudar);
  let vivo = true;
  let tirar: (() => void) | null = null;
  try {
    void Promise.resolve(CapApp.addListener("resume", f))
      .then((o) => {
        if (vivo) tirar = () => void o.remove().catch(() => undefined);
        else void o.remove().catch(() => undefined);
      })
      .catch(() => undefined);
  } catch {
    /* sem o @capacitor/app (o teste com o Capacitor de mentira): fica o visibilitychange */
  }
  return () => {
    vivo = false;
    document.removeEventListener("visibilitychange", aoMudar);
    tirar?.();
  };
}

/** A trava da conta do app na loja montada (`ativa`): relê ao montar e a cada volta ao primeiro plano; desmontou, os ouvintes saem. */
export function useReleituraDaTrava(ativa: boolean): void {
  const uid = useSessao().usuario?.id ?? null;
  useEffect(() => {
    if (!ativa || !uid || !pluginDaPlayPresente()) return;
    void relerAssinaturaDaLoja(uid);
    return aoVoltarAoApp(() => void relerAssinaturaDaLoja(uid));
  }, [ativa, uid]);
}
