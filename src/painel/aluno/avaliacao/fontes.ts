/**
 * Perfil do aluno › Avaliação (W17): de onde vem a série do aluno no PAINEL. É a MESMA série que o aluno vê na aba Evolução (W10 —
 * `src/evolucao/serie.ts`, montarSerie), só que buscada pelo profissional:
 *   · Banco do Treino, pela função treino-leitura (ação "avaliacoes"): recebe o token do BANCO PRINCIPAL, pergunta lá se quem chama
 *     vê o aluno (a regra do perfil do aluno: dono, personal ou nutricionista responsável, master) e devolve o perfil (a composição
 *     atual e a próxima avaliação), as avaliações físicas e as fotos mensais com a URL assinada — vale para TODO profissional que
 *     vê o aluno (a nutricionista não tem sessão do Treino, decisão da W5);
 *   · banco principal, pela função aluno_evolucao (W17): as antropometrias e as fotos de evolução da matrícula, com quem fez; o
 *     arquivo da foto sai por URL assinada do bucket privado `evolucao` (a política de Storage da W17 deixa quem vê o aluno assinar).
 * Escrever é pelo caminho de cada banco (avaliacaoApi.ts).
 * hml-20b (H-42 · jeito 2, etapa 2): a parte do PRINCIPAL sai do servidor, com a sessão de quem chama — a função nutricao, consulta
 * aluno_evolucao_painel (a MESMA aluno_evolucao(p_aluno) + a assinatura das fotos no evolucao do ambiente, 1 h, na mesma ida: 1 ida a
 * menos), no lote da tela (src/nutricao/leitura.ts); a URL volta RELATIVA e é montada aqui com o domínio do cliente (a de hoje). O erro
 * chega como o código na mensagem do ErroFonte (o sem_acesso/aluno_inexistente da w14_matricula_da_rota, como antes). A parte do
 * TREINO (a treino-leitura) fica como está (decisão 15 da spec hml-20).
 */
import { principal, principalConfigurado } from "@/integrations/principal/client";
import { criarFetchResiliente, TEMPO_FUNCAO_MS } from "@/integrations/repeticao";
import { DB_SCHEMA } from "@/integrations/supabase/client";
import { ErroFonte } from "@/evolucao/fontes";
import type { AntropometriaPrincipal, FotoPrincipal, LinhaFotoTreino, LinhaTreino, ParteTreino, PartePrincipal } from "@/evolucao/tipos";
import { ErroLeitura, lerNutricao, urlAssinadaDoServidor } from "@/nutricao/leitura";

const URL_LEITURA = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/treino-leitura`;

export interface TreinoDoPainel {
  parte: ParteTreino;
  treinoUserId: string;
  /** NF7: a data da próxima avaliação (physiq_profiles.proxima_avaliacao), yyyy-mm-dd */
  proxima: string | null;
}

/**
 * A parte do Banco do Treino (null = o aluno ainda não tem treino: nunca entrou no app). hml-14 (H-32, D5): a treino-leitura vai 1 vez
 * só, até 25 s (TEMPO_FUNCAO_MS); estourou → "sem_internet", o caminho de hoje.
 */
export async function carregarTreinoDoPainel(alunoIdDaRota: string, f: typeof fetch = fetch): Promise<TreinoDoPainel | null> {
  const { data } = await principal.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErroFonte("treino", "invalid_token");
  const buscar = criarFetchResiliente(0, TEMPO_FUNCAO_MS, f, { banco: "treino" });
  let r: Response;
  try {
    r = await buscar(URL_LEITURA, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-schema": DB_SCHEMA },
      body: JSON.stringify({ action: "avaliacoes", aluno: alunoIdDaRota }),
    });
  } catch {
    throw new ErroFonte("treino", "sem_internet");
  }
  const corpo = (await r.json().catch(() => null)) as
    | { perfil?: LinhaTreino | null; avaliacoes?: LinhaTreino[]; fotos?: LinhaFotoTreino[]; treino_user_id?: string; error?: string }
    | null;
  if (r.status === 404 && corpo?.error === "sem_treino") return null;
  if (r.status !== 200 || !corpo) throw new ErroFonte("treino", String(corpo?.error ?? "erro_interno"));
  const perfil = corpo.perfil ?? null;
  const proxima = perfil && typeof perfil.proxima_avaliacao === "string" ? String(perfil.proxima_avaliacao).slice(0, 10) : null;
  return {
    parte: { perfil, avaliacoes: Array.isArray(corpo.avaliacoes) ? corpo.avaliacoes : [], fotos: Array.isArray(corpo.fotos) ? corpo.fotos : [] },
    treinoUserId: String(corpo.treino_user_id ?? ""),
    proxima,
  };
}

export interface AntropometriaDoPainel extends AntropometriaPrincipal {
  observacao?: string | null;
}

/** O principal no painel: a parte da série (W10) com a observação de cada antropometria e a matrícula. */
export type PrincipalDoPainel = Omit<PartePrincipal, "antropometrias"> & { antropometrias: AntropometriaDoPainel[]; pacienteId: string | null };

/**
 * A parte do banco principal: aluno_evolucao(aluno) (W17) + as URLs assinadas das fotos — hml-20b: as 2 numa ida só pela nutricao
 * (consulta aluno_evolucao_painel); a foto que o servidor não conseguiu assinar fica sem URL ("Foto indisponível"), como antes.
 */
export async function carregarPrincipalDoPainel(alunoIdDaRota: string): Promise<PrincipalDoPainel> {
  if (!principalConfigurado) throw new ErroFonte("principal", "principal_nao_configurado");
  let valor: unknown;
  try {
    valor = (await lerNutricao("aluno_evolucao_painel", { aluno: alunoIdDaRota })).valor;
  } catch (e) {
    throw new ErroFonte("principal", e instanceof ErroLeitura ? e.codigo : "erro_interno");
  }
  const d = (valor ?? {}) as { paciente_id?: string; objetivo?: string | null; antropometrias?: AntropometriaDoPainel[]; fotos?: FotoPrincipal[] };
  const fotos = Array.isArray(d.fotos) ? d.fotos : [];
  return {
    pacienteId: d.paciente_id ?? null,
    objetivo: d.objetivo ?? null,
    antropometrias: Array.isArray(d.antropometrias) ? d.antropometrias : [],
    fotos: fotos.map((x) => ({ ...x, url: urlAssinadaDoServidor(x.url) })),
  };
}
