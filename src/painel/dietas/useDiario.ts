// Physiq W24 — a consulta do diário da conta ativa (a aba Diário e, na W25, o card "Diário de hoje" do Dashboard): os registros dos
// últimos N dias dos alunos da conta que você vê (regra do banco) + as miniaturas por URL assinada, pedidas em lote só para os que
// ainda não têm. Uso no Dashboard: useDiarioDaConta(contaId, uid, 1) → { registros, urls } do dia de hoje.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarDiarioDaConta, urlsAssinadas, type RegistroDiarioNutri } from "./diario";
import { inicioDoPeriodo } from "./diarioPainel";

export const CHAVE_DIARIO = ["painel-diario"] as const;
export const chaveDiario = (contaId: string, uid: string, dias: number) => [...CHAVE_DIARIO, contaId, uid, dias] as const;

export function useDiarioDaConta(contaId: string, uid: string, dias: number, ligado = true) {
  // o início do período muda só quando muda o número de dias (à meia-noite a página é recarregada pelo foco)
  const deIso = useMemo(() => inicioDoPeriodo(dias).toISOString(), [dias]);
  const q = useQuery({
    queryKey: chaveDiario(contaId, uid, dias),
    queryFn: () => listarDiarioDaConta(contaId, uid, deIso),
    enabled: ligado && !!contaId && !!uid,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });
  const registros: RegistroDiarioNutri[] = useMemo(() => q.data ?? [], [q.data]);
  return { q, registros };
}

/** Miniaturas (URL assinada de 1 h) dos registros visíveis; renovar(id) tenta de novo (até 2×) quando a imagem falha. */
export function useMiniaturas(visiveis: { id: string; path: string }[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const tentativas = useRef<Record<string, number>>({});
  useEffect(() => {
    const faltam = visiveis.filter((r) => !urls[r.id]);
    if (!faltam.length) return;
    let ativo = true;
    urlsAssinadas(faltam, 3600)
      .then((novas) => {
        if (ativo && Object.keys(novas).length) setUrls((old) => ({ ...old, ...novas }));
      })
      .catch(() => {
        /* a miniatura fica no esqueleto; a foto grande gera a própria URL */
      });
    return () => {
      ativo = false;
    };
  }, [visiveis, urls]);
  const renovar = useCallback((id: string) => {
    const n = (tentativas.current[id] ?? 0) + 1;
    tentativas.current[id] = n;
    if (n > 2) return;
    setUrls((old) => Object.fromEntries(Object.entries(old).filter(([k]) => k !== id)));
  }, []);
  return { urls, renovar };
}
