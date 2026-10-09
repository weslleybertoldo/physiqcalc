// Physiq W2 da loja (Google Play) — a exclusão de conta do PROFISSIONAL na borda excluir-minha-conta: monta o que a ordem pura
// (_shared/exclusao-profissional-regras.ts, testada no vitest) precisa — o banco principal (excluir_conta_profissional, migração
// supabase-principal/migrations/20261006190000_w2l_exclusao_profissional.sql), o Banco do Treino (delete-my-account em modo
// servidor, ações conferir_profissional / excluir_profissional), o Mercado Pago e o Auth.
//
// Cobrança: o plano do profissional (conta_assinaturas) e os alunos → profissional (aluno_assinaturas) estão no MESMO Mercado Pago
// (a credencial do schema — cobranca-mp.ts). Cancelar é o PUT /preapproval/{id} { status: "cancelled" } que a cobranca-conta
// (cancelar_assinatura), a pagamentos-aluno (aluno_mp_cancelar/prof_cancelar_assinatura) e cancelarAssinaturasDasMatriculas
// (_shared/app-sem-profissional.ts) já usam; a simulada do staging (sim-… ou payload.simulada) cancela só no banco. Sem reembolso.
//
// Login: SOFT DELETE (auth.admin.deleteUser(id, true)) — o hard delete do aluno apagaria em cascata (nutricionista_id → auth.users
// ON DELETE CASCADE em ~50 tabelas, inclusive pacientes e registros_prontuario) as matrículas e os prontuários que ficam guardados.
// A linha do Auth fica só como âncora dos registros: sem senha, sem sessão, e-mail e identidades embaralhados; antes, o cadastro do
// login perde e-mail, foto e telefone (fica o nome — identifica o autor das anotações no prontuário).
//
// hml-10 (H-24): o log é o da excluir-minha-conta (vem no pedido: o aviso de erro diz a função de verdade); do Mercado Pago vão
// para o log só os códigos da resposta, nunca o corpo.
// hml-14 (H-32): 2 relógios — o prazo do pedido (40 s ao conferir, 90 s ao excluir: o painel espera 45 s / 120 s) limita as 2
// chamadas ao Treino, e o MP tem o prazo de usuário (20 s) para todas as idas dele; a foto do Perfil (bucket PÚBLICO) sai inteira
// ANTES do login — o Storage falhou → 500 e o login fica (a pessoa pede de novo); o cancelamento das assinaturas dos alunos que
// lança para a ordem no passo 2, antes de apagar qualquer coisa: erro do banco → 500; MP sem resposta → o 502
// cobranca_nao_cancelada de sempre.
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { cancelarAssinaturasDasMatriculas } from "./app-sem-profissional.ts";
import { assinaturaSoNoBanco } from "./app-sem-profissional-regras.ts";
import { MpIndisponivel, credencialDoSchema, espelhoAssinatura, mpFetch, type Credencial, type OpcoesMp, type Schema } from "./cobranca-mp.ts";
import { codigosDoMp, type AssinaturaMp } from "./cobranca-regras.ts";
import { excluirContaProfissional, type AssinaturaDoPlano, type DepsExclusao, type Resposta } from "./exclusao-profissional-regras.ts";
import { schemaDaCredencial } from "./financeiro-mp.ts";
import type { Log } from "./log.ts";
import { todasAsPaginas } from "./paginas.ts";
import { ORCAMENTO_MS, prazo as novoPrazo, type Prazo } from "./tempo.ts";
import { chamarTreino } from "./treino-servidor.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET_FOTOS: Record<Schema, string> = { public: "fotos-perfil", staging: "fotos-perfil-staging" };
/** o list() do Storage devolve 100 por vez (o padrão dele); o remove() vai no mesmo tamanho */
const FOTOS_POR_PAGINA = 100;
/** o cadastro do login que fica (identifica o autor das anotações do prontuário) */
const META_QUE_FICA = new Set(["full_name", "name"]);

/**
 * A pasta da pessoa no bucket da foto do Perfil (PÚBLICO), INTEIRA — usada pelos 2 caminhos da excluir-minha-conta. Trocar a foto
 * sobe um arquivo novo e não apaga o antigo, então a pasta acumula; hml-14 (H-32): antes um list de 100 (os de nome menor = os
 * mais antigos) deixava as fotos novas, inclusive a atual. Lê todas as páginas pelo offset ANTES de apagar (apagar no meio
 * deslocaria as páginas) e apaga em lotes. Erro do Storage → LANÇA: quem chama para antes de apagar o login. Devolve quantos saíram.
 */
export async function apagarFotosDoPerfil(authAdmin: SupabaseClient, schema: Schema, uid: string): Promise<number> {
  const bucket = authAdmin.storage.from(BUCKET_FOTOS[schema]);
  const fotos = await todasAsPaginas(
    (de, ate) => bucket.list(uid, { limit: ate - de + 1, offset: de, sortBy: { column: "name", order: "asc" } }),
    { porPagina: FOTOS_POR_PAGINA },
  );
  const caminhos = fotos.filter((f) => f?.name).map((f) => `${uid}/${f.name}`);
  let apagados = 0;
  for (let i = 0; i < caminhos.length; i += FOTOS_POR_PAGINA) {
    const { data, error } = await bucket.remove(caminhos.slice(i, i + FOTOS_POR_PAGINA));
    if (error) throw error;
    apagados += data?.length ?? 0;
  }
  return apagados;
}

async function rpcExclusao(db: SupabaseClient, uid: string, simular: boolean): Promise<unknown> {
  const { data, error } = await db.rpc("excluir_conta_profissional", { p_uid: uid, p_simular: simular });
  if (error) throw error;
  return data;
}

/** Cancela no Mercado Pago um preapproval (a chamada de sempre); já cancelado lá também vale. */
async function cancelarNoMp(credencial: Credencial, preapprovalId: string, log: Log, opcoes: OpcoesMp): Promise<AssinaturaMp | null> {
  const caminho = `/preapproval/${encodeURIComponent(preapprovalId)}`;
  const { status, body } = await mpFetch<AssinaturaMp>(credencial, caminho, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }, opcoes);
  if (status < 300 && body?.id) return body;
  // já cancelada no MP devolve 400 em alguns casos: confere o estado real antes de contar como falha
  const { status: s2, body: atual } = await mpFetch<AssinaturaMp>(credencial, caminho, {}, opcoes);
  if (s2 === 200 && atual?.status === "cancelled") return atual;
  log.erro({
    codigo: "mp_cancelar_falhou", schema: schemaDaCredencial(credencial), acao: "exclusao_profissional", ref: preapprovalId, status,
    externo: codigosDoMp(body),
  });
  return null;
}

/** O plano da conta (conta_assinaturas): Mercado Pago + banco, como o cancelar_assinatura da cobranca-conta. */
async function cancelarPlano(
  db: SupabaseClient,
  credencial: Credencial,
  a: AssinaturaDoPlano,
  por: string,
  log: Log,
  opcoes: OpcoesMp,
): Promise<boolean> {
  const { data, error } = await db.from("conta_assinaturas").select("id, mp_preapproval_id, status, payload").eq("id", a.id).maybeSingle();
  if (error) throw error;
  const linha = data as { id: string; mp_preapproval_id: string | null; status: string; payload: Record<string, unknown> | null } | null;
  if (!linha || !["authorized", "pending", "paused"].includes(linha.status)) return true; // já não cobra
  const payload = { ...(linha.payload ?? {}), cancelada_por: por, motivo_cancelamento: "conta_excluida", cancelada_em: new Date().toISOString() };
  if (assinaturaSoNoBanco(linha)) {
    const { error: eu } = await db.from("conta_assinaturas").update({ status: "cancelled", payload }).eq("id", linha.id);
    if (eu) throw eu;
    return true;
  }
  const pre = await cancelarNoMp(credencial, linha.mp_preapproval_id!, log, opcoes);
  if (!pre) return false;
  const { error: eu } = await db.from("conta_assinaturas").update({ ...espelhoAssinatura(pre, payload), status: "cancelled" }).eq("id", linha.id);
  if (eu) throw eu;
  return true;
}

export interface PedidoExclusao {
  schema: Schema;
  user: User;
  authAdmin: SupabaseClient;
  simular: boolean;
  confirmacao: unknown;
  /** o log da excluir-minha-conta (criarLog("excluir-minha-conta", …)) */
  log: Log;
  /** hml-14 (H-32, D3): o prazo do pedido (40 s ao conferir, 90 s ao excluir) — limita as chamadas ao Treino */
  prazo: Prazo;
}

/** O caminho novo da excluir-minha-conta (só com { fluxo: "profissional" } no corpo). */
export async function excluirContaProfissionalNaBorda(p: PedidoExclusao): Promise<Resposta> {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: p.schema as "public" }, auth: { persistSession: false } });
  const credencial = credencialDoSchema(p.schema);
  const uid = p.user.id;
  // hml-14 (H-32): todas as idas ao MP deste pedido no prazo de usuário (MP fora ou lento → 502 em até 20 s, nada apagado)
  const mp: OpcoesMp = { prazo: novoPrazo(ORCAMENTO_MS.usuario) };
  // a foto do Perfil: uma vez só — o apagarArquivos conta o que saiu; o apagarLogin espera ela e, se o Storage falhou, para ali
  let fotos: Promise<number> | null = null;
  const apagarFotos = () => (fotos ??= apagarFotosDoPerfil(p.authAdmin, p.schema, uid));
  const deps: DepsExclusao = {
    conferir: () => rpcExclusao(db, uid, true),
    excluir: () => rpcExclusao(db, uid, false),
    treino: (acao) => chamarTreino(p.schema, acao, uid, p.log, { prazo: p.prazo }),
    cancelarPlano: (a) => cancelarPlano(db, credencial, a, uid, p.log, mp),
    // hml-14: o cancelamento agora LANÇA — erro do banco → a ordem para aqui com 500, antes de apagar qualquer coisa; o MP que não
    // decide (MpIndisponivel) é a falha de sempre → o mesmo 502 cobranca_nao_cancelada (nada mais muda)
    cancelarDosAlunos: async (ids) => {
      try {
        return await cancelarAssinaturasDasMatriculas(db, credencial, ids, "profissional_excluiu_a_conta", p.log, mp);
      } catch (e) {
        if (!(e instanceof MpIndisponivel)) throw e;
        p.log.excecao(e, { codigo: "mp_cancelar_falhou", schema: p.schema, acao: "exclusao_profissional", status: e.status });
        return { canceladas: 0, falhas: 1 };
      }
    },
    cancelarSolta: async (id) => id.startsWith("sim-") || (await cancelarNoMp(credencial, id, p.log, mp)) !== null,
    dispararEspelho: async () => {
      const { error } = await db.rpc("espelho_disparar");
      if (error) throw error;
    },
    apagarArquivos: async (arquivos) => {
      let apagados = 0;
      const porBucket = new Map<string, string[]>();
      for (const a of arquivos) porBucket.set(a.bucket, [...(porBucket.get(a.bucket) ?? []), a.path]);
      for (const [bucket, caminhos] of porBucket) {
        for (let i = 0; i < caminhos.length; i += 100) {
          const { data: rem, error: er } = await p.authAdmin.storage.from(bucket).remove(caminhos.slice(i, i + 100));
          if (er) p.log.excecao(er, { codigo: "storage_falhou", schema: p.schema, acao: "exclusao_profissional", ref: bucket });
          apagados += rem?.length ?? 0;
        }
      }
      // a foto do Perfil: o erro dela não para aqui (a ordem seguiria para o login) — para no apagarLogin, logo abaixo
      return apagados + (await apagarFotos().catch(() => 0));
    },
    apagarLogin: async () => {
      // hml-14 (H-32): sem a foto fora do bucket público, o login NÃO sai — o Storage falhou → lança (500) e a pessoa pede de novo
      await apagarFotos();
      const meta = (p.user.user_metadata ?? {}) as Record<string, unknown>;
      const limpar: Record<string, null> = {};
      for (const k of Object.keys(meta)) if (!META_QUE_FICA.has(k)) limpar[k] = null;
      if (Object.keys(limpar).length) {
        // não trava a exclusão: o soft delete embaralha o e-mail e as identidades de qualquer jeito
        const { error } = await p.authAdmin.auth.admin.updateUserById(uid, { user_metadata: limpar });
        if (error) p.log.excecao(error, { codigo: "limpar_cadastro_falhou", schema: p.schema, acao: "exclusao_profissional" });
      }
      const { error: ed } = await p.authAdmin.auth.admin.deleteUser(uid, true);
      if (ed) throw ed;
    },
    // o que a ordem pura avisa (espelho, arquivos ou o erro que parou a exclusão): o texto entra limpo e com até 200 caracteres
    registrar: (msg) => p.log.erro({ codigo: "exclusao_profissional_falhou", schema: p.schema, msg }),
  };
  const papelAuth = String((p.user.app_metadata as Record<string, unknown> | undefined)?.role ?? "");
  return await excluirContaProfissional({ simular: p.simular, confirmacao: p.confirmacao, papelAuth }, deps);
}
