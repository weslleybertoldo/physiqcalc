import { createContext, useContext } from "react";

/**
 * hml-18b (H-54, F) — o "espelho" do perfil no banco local do aparelho (o `status` da physiq_profiles do Treino que o PowerSync
 * sincroniza), para quem está FORA do pedaço do PowerSync: a trava "Acesso pausado pelo seu profissional" (GateBloqueioAluno) carrega
 * junto com a entrada e não pode importar o @powersync/react (traria os ~270 KB do PowerSync para toda página, inclusive as públicas).
 *
 * Quem preenche é o provedor do banco local (src/lib/powersync/PowerSyncProvider.tsx, carregado por import() só no app do aluno). Sem
 * o provedor, ou antes da 1ª sincronização, o valor é null — o mesmo de antes, quando a consulta ainda não tinha voltado.
 */
export const EspelhoDoPerfilContexto = createContext<string | null>(null);

/** O status do perfil no espelho do Treino ("ativo", "bloqueado"…) ou null (sem o banco local ou sem a 1ª sincronização). */
export function useStatusDoEspelho(): string | null {
  return useContext(EspelhoDoPerfilContexto);
}
