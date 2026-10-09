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

// ───────────────────────── hml-14d (B19/B21 · D25): página e busca das listas do painel ─────────────────────────

/** O tamanho da página das listas do painel (o POR_PAGINA de src/lib/paginacao.ts). */
export const POR_PAGINA = 20;

/**
 * A página pedida no corpo: sem `pagina` (ou nula) → null, o caminho de hoje (a lista inteira, a resposta de antes); com
 * `pagina` → um inteiro ≥ 1 (o que não for número inteiro positivo vira 1).
 */
export function paginaPedida(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Sem acento, minúsculo e com os espaços juntos (o normalizar das telas). */
export function semAcento(t: unknown): string {
  return String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** A página `pagina` (a 1ª é 1) da lista e o total dela. */
export function fatiar<T>(lista: readonly T[], pagina: number, porPagina = POR_PAGINA): { itens: T[]; total: number } {
  const de = (Math.max(1, Math.floor(pagina)) - 1) * porPagina;
  return { itens: lista.slice(de, de + porPagina), total: lista.length };
}

/** Os modelos cujo nome contém o termo, sem caixa e sem acento (termo vazio = todos), na ordem em que vieram. */
export function filtrarPorNome<T extends { nome?: string | null }>(lista: readonly T[], termo: unknown): T[] {
  const t = semAcento(termo);
  return t ? lista.filter((m) => semAcento(m.nome).includes(t)) : [...lista];
}

export interface AlunoQuemRecebe {
  id: string;
  nome: string;
  email: string;
  foto_url: string | null;
  recebe: boolean;
}

/**
 * hml-14d (D25, P5): a lista do "Quem recebe" de um modelo — os alunos de quem chama, marcados quando recebem; quem recebe
 * primeiro, depois o nome (pt-BR) e o id (ordem estável entre as páginas); a busca sem acento no nome e no e-mail; a página de 20.
 * `total_recebem`/`total_alunos` = o chip "N DE M" (sem a busca). O nome é o de antes na tela (nome, senão o e-mail, senão "Aluno").
 */
export function listaQuemRecebe(
  perfis: readonly { id: string; nome?: string | null; email?: string | null; foto_url?: string | null }[],
  recebem: ReadonlySet<string>,
  termo: unknown,
  pagina: number,
): { itens: AlunoQuemRecebe[]; total: number; total_recebem: number; total_alunos: number } {
  const vistos = new Set<string>();
  const alunos: AlunoQuemRecebe[] = [];
  for (const p of perfis) {
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);
    alunos.push({ id: p.id, nome: (p.nome || p.email || "").trim() || "Aluno", email: p.email || "", foto_url: p.foto_url ?? null, recebe: recebem.has(p.id) });
  }
  const t = semAcento(termo);
  const filtrados = t ? alunos.filter((a) => semAcento(`${a.nome} ${a.email}`).includes(t)) : alunos;
  filtrados.sort((a, b) => Number(b.recebe) - Number(a.recebe) || a.nome.localeCompare(b.nome, "pt-BR") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const { itens, total } = fatiar(filtrados, pagina);
  return { itens, total, total_recebem: alunos.filter((a) => a.recebe).length, total_alunos: alunos.length };
}
