import { useEffect, useState } from "react";
import { lerStatusCache, mensalidadePendente, statusLeve, type MpStatusLeve } from "@/lib/mpClient";

/** Atraso padrão antes de ir à rede: deixa o 1º render e o PowerSync respirarem. */
export const ATRASO_STATUS_MS = 2000;

/**
 * Status da mensalidade pra abertura do app (badge "!" no header + aviso de pendência).
 * Cache local válido (6 h) → resolve na hora, sem rede. Sem cache → 1 chamada `status-lite`
 * depois de `atrasoMs`, fora do caminho crítico da abertura. Quem chama em paralelo
 * (header e aviso) divide a mesma requisição.
 */
export function useMensalidadeStatus(userId: string | null | undefined, atrasoMs = ATRASO_STATUS_MS) {
  const [status, setStatus] = useState<MpStatusLeve | null>(() => (userId ? lerStatusCache(userId) : null));

  useEffect(() => {
    if (!userId) {
      setStatus(null);
      return;
    }
    const emCache = lerStatusCache(userId);
    if (emCache) {
      setStatus(emCache);
      return;
    }
    let cancelado = false;
    const t = setTimeout(() => {
      statusLeve(userId)
        .then((s) => { if (!cancelado) setStatus(s); })
        .catch(() => { /* sem rede/erro: não sinaliza pendência */ });
    }, atrasoMs);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [userId, atrasoMs]);

  return { status, pendente: mensalidadePendente(status) };
}
