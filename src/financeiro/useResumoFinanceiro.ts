import { useEffect, useState } from "react";
import { useSessao } from "@/nucleo/sessao";
import { assinarResumo, buscarResumo, lerResumoGuardado } from "./api";
import type { ResumoMatricula } from "./tipos";

/**
 * Resumo leve da cobrança do aluno (financeiro_do_aluno() do banco principal) para a faixa do topo, a trava do inadimplente
 * e o chip do Perfil. Guardado no aparelho por 10 min (sem internet vale o último); sem guardado, 1 chamada depois de
 * `atrasoMs` — fora do caminho crítico da abertura (a regra do status-lite do Calc). Quem chama junto divide a requisição.
 */
export function useResumoFinanceiro({ atrasoMs = 1500, ativo = true }: { atrasoMs?: number; ativo?: boolean } = {}) {
  const { usuario } = useSessao();
  const uid = ativo ? usuario?.id ?? null : null;
  const [, setVersao] = useState(0);
  const [erro, setErro] = useState(false);

  useEffect(() => assinarResumo(() => setVersao((v) => v + 1)), []);

  const valido = lerResumoGuardado(uid);
  const ultimo = valido ?? lerResumoGuardado(uid, Date.now(), true);
  const precisaBuscar = !!uid && !valido;

  useEffect(() => {
    if (!uid || !precisaBuscar) return;
    let vivo = true;
    const t = setTimeout(() => {
      buscarResumo(uid)
        .then(() => vivo && setErro(false))
        .catch(() => vivo && setErro(true));
    }, atrasoMs);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [uid, precisaBuscar, atrasoMs]);

  return { resumo: ultimo as ResumoMatricula[] | null, carregando: precisaBuscar && !ultimo && !erro, erro };
}
