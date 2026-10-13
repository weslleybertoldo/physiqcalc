// Physiq W-A P6 — as consultas do "Dia a dia" (React Query): o dia do aluno da rota pela aluno-dia { acao: "ler", q: "aluno_dia", aluno, de,
// ate } (dia_do_aluno, wa3: o nível da Dieta, se está liberada, as refeições extras e os itens postos/tirados dos 14 dias, com os retratos —
// só leitura, a nutri e o personal; Q1) — pela porta da P2 (src/aluno-dia/api.ts, nunca o banco direto). As rotinas vêm da MESMA consulta do
// card do Resumo (useRotinasDoAluno); o plano e os ✓ das refeições, das consultas da Dieta que a ficha já usa (src/nutricao/editor/lib/
// consultas.ts — a nutricao; nada de leitura direta).
import { useQuery } from "@tanstack/react-query";
import { lerDiaDoAluno } from "@/aluno-dia/api";
import type { DiaDoAluno } from "@/aluno-dia/tipos";
import { janelaDoPainel } from "../rotinas/regras";
import { repetirLeitura } from "../rotinas/useRotinasDoAluno";

export const chaveDiaDoAluno = (alunoId: string) => ["painel-dia-a-dia", alunoId] as const;

export function useDiaDoAluno(alunoId: string) {
  const { de, ate } = janelaDoPainel();
  return useQuery<DiaDoAluno>({
    queryKey: [...chaveDiaDoAluno(alunoId), de, ate],
    queryFn: () => lerDiaDoAluno(alunoId, de, ate),
    enabled: !!alunoId,
    staleTime: 30_000,
    retry: repetirLeitura,
    networkMode: "online",
  });
}
