// Physiq restaurar-login (30/10/2026) — chave-restauracao (banco principal): a chave de volta do Android do lado de QUEM JÁ ENTROU — guardar
// a parte pública da chave (logo depois do login e na abertura de quem já está logado, sem a marca local) e apagar no Sair. Jeito 2:
// verify_jwt TRUE, pela _shared/porta-pessoa.ts (quem chama = o user do token, conferido no Auth; o freio por pessoa; o catch final com
// log.excecao); o banco é tocado SÓ COMO A PESSOA — as RPCs chave_restauracao_* conferem o auth.uid() e a trava, e as tabelas não têm acesso
// do app (RLS sem policy): a 2ª camada. Nenhuma chave secreta aqui. Desenho: physiqcalc-scratch/restaurar-login/desenho.md (§4.3, §4.5).
//
//   { acao: "opcoes" }    → 200 { ok: true, opcoes } (PublicKeyCredentialCreationOptionsJSON para o CreateRestoreCredentialRequest; o
//                           desafio 'registrar' da pessoa: 5 min, uso único, no máximo 5 vivos)
//   { acao: "registrar", resposta, nuvem?, substitui?, aparelho?: { modelo, android }, versao? }
//                         → a conferência WebAuthn (_shared/restaurar-login-regras.ts › conferirRegistro: tipo, o desafio, a origem do app
//                           no schema, o RP ID, atestação none, ES256/RS256, o id) → chave_restauracao_gravar (gasta o desafio DA PESSOA,
//                           grava, marca a `substitui` como substituída, no máximo 10 ativas) → 200 { ok: true, credencial }
//   { acao: "apagar", todas: true } | { acao: "apagar", credencial }
//                         → 200 { ok: true, apagadas } (o Sair — D3: todas as chaves da pessoa; o Sair local: a deste aparelho). NÃO olha a
//                           trava: apagar vale sempre.
// Recusas: 200 { ok: false, erro: "desligado" } (a trava app_config.restaurar_login desligada; o so_teste com conta que não é de teste; o
//          schema sem a migração — a RPC não existe: falha fechada) · 400 chave_invalida (a conferência ou o desafio; o motivo exato só no
//          log) · dados_invalidos · acao_invalida · 403 conta_real_no_staging · conta_master (o master não tem chave) · precisa_2fa (conta
//          com 2 etapas fora do aal2) · 409 chave_repetida · 429 muitas_tentativas (20 registros em 24 h) · 401 sem_login (a sessão do JWT
//          não existe no Auth) · e as da porta: 400 schema_invalido, 401 sem_login, 405 metodo, 413 corpo_grande, 429 muitas_acoes, 500
//          erro_interno. A chave fica AMARRADA à sessão de quem registra (o session_id do JWT): o Sair, a revogação e a troca de senha a
//          matam junto (revisão de segurança, achado 1).
// Freio: 20 pedidos por minuto por pessoa (a porta). Log: só códigos e o começo do id da chave — nunca a chave, a resposta do Android, o
// aparelho ou o e-mail.
// Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions chave-restauracao true
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "jsr:@simplewebauthn/server@13.3.3";
import { decodeCredentialPublicKey } from "jsr:@simplewebauthn/server@13.3.3/helpers";
import { json, servirComoPessoa, type ContextoPessoa } from "../_shared/porta-pessoa.ts";
import {
  bytesParaHex,
  conferirRegistro,
  desafioDaResposta,
  lerPedidoApagar,
  lerPedidoRegistrar,
  opcoesDeRegistro,
  refDaChave,
  type LibWebAuthn,
} from "../_shared/restaurar-login-regras.ts";

const LIB = { verifyRegistrationResponse, verifyAuthenticationResponse, decodeCredentialPublicKey } as unknown as LibWebAuthn;

/** O que as RPCs devolvem com ok false → o código e o HTTP para o app (o resto é erro: 500 pela porta, com o aviso). */
const RECUSAS: Record<string, [string, number]> = {
  desligado: ["desligado", 200],
  conta_real_no_staging: ["conta_real_no_staging", 403],
  // revisão de segurança: o master não tem chave (achado 2); conta com 2 etapas só registra em aal2 (achado 2); 20 registros em 24 h (3)
  conta_master: ["conta_master", 403],
  precisa_2fa: ["precisa_2fa", 403],
  muitas_tentativas: ["muitas_tentativas", 429],
  sem_login: ["sem_login", 401],
  desafio_invalido: ["chave_invalida", 400],
  dados_invalidos: ["dados_invalidos", 400],
  chave_repetida: ["chave_repetida", 409],
};

function recusar(c: ContextoPessoa, erro: unknown, acao: string, ref?: string): Response {
  const r = typeof erro === "string" ? RECUSAS[erro] : undefined;
  if (!r) throw new Error("recusa_desconhecida");
  // a trava desligada é estado, não aviso
  if (erro !== "desligado") c.log.aviso({ codigo: erro as string, schema: c.schema, acao, ref });
  return json({ ok: false, erro: r[0] }, r[1], c.origin);
}

/** A RPC como a pessoa. null = a RPC não existe neste schema (a migração não foi aplicada aqui: o public antes da liberação). */
async function rpcDaPessoa(c: ContextoPessoa, nome: string, args?: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const { data, error } = await c.comoPessoa.rpc(nome, args);
  if (error) {
    const codigo = (error as { code?: unknown }).code;
    if (codigo === "PGRST202" || codigo === "42883") {
      c.log.aviso({ codigo: "sem_migracao", schema: c.schema, acao: nome });
      return null;
    }
    throw error;
  }
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

const desligado = (c: ContextoPessoa) => json({ ok: false, erro: "desligado" }, 200, c.origin);

servirComoPessoa("chave-restauracao", { freio: 20 }, async (c) => {
  const acao = c.corpo.acao;

  if (acao === "opcoes") {
    const r = await rpcDaPessoa(c, "chave_restauracao_desafio");
    if (!r) return desligado(c);
    if (r.ok !== true || typeof r.desafio !== "string") return recusar(c, r.erro, "opcoes");
    return json({ ok: true, opcoes: opcoesDeRegistro(r.desafio, c.userId) }, 200, c.origin);
  }

  if (acao === "registrar") {
    const pedido = lerPedidoRegistrar(c.corpo);
    if (!pedido) return json({ ok: false, erro: "dados_invalidos" }, 400, c.origin);
    const ref = refDaChave(pedido.resposta.id);
    const desafio = desafioDaResposta(pedido.resposta);
    if (!desafio) return recusar(c, "desafio_invalido", "registrar", ref);
    const conf = await conferirRegistro(pedido.resposta, { desafio, schema: c.schema }, LIB);
    if (conf.ok === false) {
      c.log.aviso({ codigo: conf.motivo, schema: c.schema, acao: "registrar", ref });
      return json({ ok: false, erro: "chave_invalida" }, 400, c.origin);
    }
    const k = conf.chave;
    // gasta o desafio DESTA pessoa e grava (o banco confere a trava de novo; o bytea vai em hex)
    const r = await rpcDaPessoa(c, "chave_restauracao_gravar", {
      p_desafio: desafio,
      p_credencial: k.credencialId,
      p_chave: `\\x${bytesParaHex(k.chavePublica)}`,
      p_contador: k.contador,
      p_alg: k.algoritmo,
      p_origem: k.origem,
      p_aaguid: k.aaguid,
      p_nuvem: pedido.nuvem,
      p_be: k.backupElegivel,
      p_bs: k.backupEstado,
      p_aparelho: pedido.aparelho,
      p_versao: pedido.versao,
      p_substitui: pedido.substitui,
    });
    if (!r) return desligado(c);
    if (r.ok !== true) return recusar(c, r.erro, "registrar", ref);
    const onde = pedido.nuvem === false ? "so_no_aparelho" : "nuvem";
    c.log.info({ codigo: "chave_registrada", schema: c.schema, acao: "registrar", ref, resultado: onde });
    return json({ ok: true, credencial: k.credencialId }, 200, c.origin);
  }

  if (acao === "apagar") {
    const pedido = lerPedidoApagar(c.corpo);
    if (!pedido) return json({ ok: false, erro: "dados_invalidos" }, 400, c.origin);
    const todas = "todas" in pedido;
    const r = await rpcDaPessoa(c, "chave_restauracao_apagar", todas ? { p_todas: true } : { p_credencial: pedido.credencial });
    if (!r) return desligado(c);
    if (r.ok !== true) return recusar(c, r.erro, "apagar");
    const apagadas = Number.isInteger(r.apagadas) ? (r.apagadas as number) : 0;
    c.log.info({ codigo: "chaves_apagadas", schema: c.schema, acao: todas ? "apagar_todas" : "apagar_deste", n: apagadas });
    return json({ ok: true, apagadas }, 200, c.origin);
  }

  return json({ ok: false, erro: "acao_invalida" }, 400, c.origin);
});
