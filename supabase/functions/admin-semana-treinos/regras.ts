// Physiq hml-14 (H-51 item 5 e H-32) — regras PURAS da admin-semana-treinos. Sem Deno, sem rede e sem banco: usadas pela função
// (o deploy leva a pasta dela) e testadas no Vitest (src/lib/adminSemanaTreinosRegras.test.ts).

/**
 * hml-14 (H-51 item 5): o que o resolverAluno responde. O id do Treino só vai quando há vínculo E quem chama vê o aluno; sem
 * vínculo e com um vínculo que quem chama não vê, a resposta é a MESMA ({ treino_user_id: null }) — antes o 2º caso era 403 e um
 * principal_user_id qualquer dizia se a pessoa tinha treino. `semAcesso` não vai na resposta: só no log (resolver_sem_acesso),
 * para um problema de permissão de verdade continuar aparecendo.
 */
export function respostaDoResolver(
  treinoUserId: string | null,
  quemChamaVe: boolean,
): { resposta: { treino_user_id: string | null }; semAcesso: boolean } {
  if (!treinoUserId) return { resposta: { treino_user_id: null }, semAcesso: false };
  if (!quemChamaVe) return { resposta: { treino_user_id: null }, semAcesso: true };
  return { resposta: { treino_user_id: treinoUserId }, semAcesso: false };
}

/** hml-14 (H-32, D9): o maior período do volumePraticado, em dias, contando o 1º e o último (a tela pede 7: a semana). */
export const VOLUME_PRATICADO_MAX_DIAS = 31;

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** AAAA-MM-DD de um dia que existe → o início dele em ms (UTC); qualquer outra coisa → null. */
function diaEmMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = RE_DATA.exec(v);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === v ? ms : null;
}

/**
 * hml-14 (H-32, D9): o período do volumePraticado vale? Datas AAAA-MM-DD que existem, início ≤ fim e no máximo 31 dias (o 1º e o
 * último contam). Fora disso a função responde 400 "periodo_invalido" — antes aceitava qualquer período e as séries passavam do
 * corte de 1000 do PostgREST sem aviso.
 */
export function periodoDoVolumeValido(inicio: unknown, fim: unknown): boolean {
  const de = diaEmMs(inicio);
  const ate = diaEmMs(fim);
  if (de === null || ate === null || de > ate) return false;
  return (ate - de) / 86_400_000 + 1 <= VOLUME_PRATICADO_MAX_DIAS;
}
