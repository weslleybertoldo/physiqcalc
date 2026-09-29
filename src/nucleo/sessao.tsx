/**
 * Sessão do Physiq (W3 — login único, spec 4.2 e 7.4). O login é no BANCO PRINCIPAL (Google ou e-mail e senha); logo
 * depois:
 *   1. `pos-login` (uma vez por login): P25, convites do e-mail e a ponte do Calc — e devolve a `minha_situacao()`;
 *   2. a situação fica guardada no aparelho (abre sem internet — 7.5);
 *   3. quem precisa do Banco do Treino (aluno com Treino, personal, dono de conta com Treino, master, quem veio do Calc)
 *      recebe a sessão dele pela troca de token; a sessão guardada do Treino é reaproveitada enquanto for desta pessoa;
 *   4. o código do profissional pendente (?prof=) vai para o `vincular-aluno`.
 * Sair = sair dos 2 bancos + limpar os caches (como o signOut de hoje). As telas antigas seguem lendo `useAuth()` (o
 * usuário do Treino vindo da troca); as novas usam `useSessao()` e `useConta()`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { principal, PRINCIPAL_STORAGE_KEY } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/capacitorAuth";
import { lerProfPendente, limparProfPendente } from "@/lib/profPendente";
import {
  MENSAGEM_VINCULO,
  erroDoVinculo,
  guardarSituacao,
  lerSituacaoGuardada,
  limparSituacoes,
  normalizarCodigo,
  normalizarSituacao,
  type ResultadoVinculo,
  type Situacao,
} from "./situacao";
import {
  aplicarSessaoTreino,
  esperaDaTentativa,
  esquecerTrocas,
  pedirTroca,
  retentavel,
  sessaoTreinoServe,
  type ErroTroca,
} from "./trocaToken";

export type EstadoTreino = "desnecessario" | "aguardando" | "trocando" | "pronto" | "erro";

export interface ErroEntrada {
  status?: number;
  code?: string;
  message?: string;
}

export interface SessaoValor {
  /** o login do principal já foi lido do aparelho (com ou sem sessão) */
  pronto: boolean;
  usuario: User | null;
  sessao: Session | null;
  situacao: Situacao | null;
  carregandoSituacao: boolean;
  /** sem situação (nem guardada) e a busca falhou: a tela mostra "Parte do app está fora do ar" */
  erroSituacao: boolean;
  treino: { estado: EstadoTreino; erro: ErroTroca | null };
  /** P25: a senha antiga foi trocada nesta entrada com o Google */
  senhaTrocada: boolean;
  entrarComGoogle: () => Promise<{ erro?: string }>;
  entrarComEmail: (email: string, senha: string) => Promise<{ erro?: ErroEntrada }>;
  sair: () => Promise<void>;
  recarregarSituacao: () => Promise<Situacao | null>;
  tentarTreinoDeNovo: () => void;
  vincularCodigo: (codigo: string) => Promise<ResultadoVinculo>;
  marcarAvisoMudanca: (versao: string) => Promise<void>;
}

const SessaoCtx = createContext<SessaoValor | null>(null);

const VAZIO: SessaoValor = {
  pronto: false,
  usuario: null,
  sessao: null,
  situacao: null,
  carregandoSituacao: false,
  erroSituacao: false,
  treino: { estado: "desnecessario", erro: null },
  senhaTrocada: false,
  entrarComGoogle: async () => ({}),
  entrarComEmail: async () => ({}),
  sair: async () => {},
  recarregarSituacao: async () => null,
  tentarTreinoDeNovo: () => {},
  vincularCodigo: async () => ({ ok: false, erro: "erro_interno" }),
  marcarAvisoMudanca: async () => {},
};

export function useSessao(): SessaoValor {
  return useContext(SessaoCtx) ?? VAZIO;
}

// ───────────────────────── auxiliares ─────────────────────────

const POS_LOGIN = "physiq_pos_login:";
const AVISO_VISTO = "physiq_aviso_visto:";

/** O aviso "o Physiq mudou" já foi fechado neste aparelho (a gravação no servidor pode ter ficado para depois). */
function avisoVistoAqui(uid: string, versao: string): boolean {
  try {
    return localStorage.getItem(`${AVISO_VISTO}${uid}:${versao}`) === "1";
  } catch {
    return false;
  }
}
const MAX_TENTATIVAS_TROCA = 8;

/** Sessão guardada pelo supabase-js no aparelho (sem internet o getSession de um token vencido devolve null). */
function sessaoGuardada(chave: string | undefined): Session | null {
  if (!chave) return null;
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Session & { currentSession?: Session };
    const sessao = s?.user ? s : s?.currentSession;
    return sessao?.user?.id ? sessao : null;
  } catch {
    return null;
  }
}

function chaveDoTreino(): string | undefined {
  return (supabase.auth as unknown as { storageKey?: string }).storageKey;
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

async function buscarSituacao(): Promise<Situacao | null> {
  const { data, error } = await principal.rpc("minha_situacao" as never);
  if (error) throw error;
  return normalizarSituacao(data);
}

// ───────────────────────── provedor ─────────────────────────

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [pronto, setPronto] = useState(false);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [carregandoSituacao, setCarregandoSituacao] = useState(false);
  const [erroSituacao, setErroSituacao] = useState(false);
  const [treino, setTreino] = useState<{ estado: EstadoTreino; erro: ErroTroca | null }>({ estado: "desnecessario", erro: null });
  const [senhaTrocada, setSenhaTrocada] = useState(false);
  const [versaoSituacao, setVersaoSituacao] = useState(0);
  const [pedidoTroca, setPedidoTroca] = useState<{ n: number; forcar: boolean }>({ n: 0, forcar: false });

  const usuario = sessao?.user ?? null;
  const uid = usuario?.id ?? null;
  const saindo = useRef(false);
  const tentativasTroca = useRef(0);
  const timerTroca = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trocando = useRef(false);
  const vinculando = useRef(false);
  const situacaoRef = useRef<Situacao | null>(null);
  situacaoRef.current = situacao;
  const uidRef = useRef<string | null>(null);
  uidRef.current = uid;
  const sairRef = useRef<(() => Promise<void>) | null>(null);

  // 1. login do principal: lê do aparelho e acompanha as mudanças (Google volta com ?code=, e-mail e senha, sair)
  useEffect(() => {
    let vivo = true;
    const seguranca = setTimeout(() => vivo && setPronto(true), 6000);
    (async () => {
      try {
        const { data } = await principal.auth.getSession();
        let s = data.session;
        if (!s && !online()) s = sessaoGuardada(PRINCIPAL_STORAGE_KEY);
        if (vivo) setSessao(s);
      } catch {
        if (vivo) setSessao(online() ? null : sessaoGuardada(PRINCIPAL_STORAGE_KEY));
      } finally {
        if (vivo) setPronto(true);
        clearTimeout(seguranca);
      }
    })();
    const { data: sub } = principal.auth.onAuthStateChange((evento, nova) => {
      if (evento === "SIGNED_OUT") {
        // sai de verdade no logout pedido ou com internet (sessão revogada); sem internet mantém (renovação falhou)
        if (saindo.current || online()) setSessao(null);
        return;
      }
      if (nova) setSessao(nova);
    });
    return () => {
      vivo = false;
      clearTimeout(seguranca);
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2. situação: a guardada na hora; com internet, pos-login (1x por login) ou minha_situacao
  useEffect(() => {
    if (!uid) {
      setSituacao(null);
      setErroSituacao(false);
      setTreino({ estado: "desnecessario", erro: null });
      return;
    }
    const guardada = lerSituacaoGuardada(uid);
    if (guardada) setSituacao(guardada);
    if (!online()) {
      setErroSituacao(!guardada);
      return;
    }
    let cancelado = false;
    setCarregandoSituacao(true);
    (async () => {
      let nova: Situacao | null = null;
      try {
        const marca = `${sessao?.user?.last_sign_in_at ?? ""}`;
        let jaFez = false;
        try {
          jaFez = localStorage.getItem(POS_LOGIN + uid) === marca && marca !== "";
        } catch {
          /* noop */
        }
        if (!jaFez) {
          const { data, error } = await principal.functions.invoke("pos-login", { body: {} });
          if (!error && data) {
            const d = data as { situacao?: unknown; senha_trocada?: boolean };
            nova = normalizarSituacao(d.situacao);
            if (d.senha_trocada) setSenhaTrocada(true);
            try {
              localStorage.setItem(POS_LOGIN + uid, marca);
            } catch {
              /* noop */
            }
          } else if (error) {
            const corpo = await corpoDoErro(error);
            console.warn("[Sessão] pos-login:", corpo?.erro ?? error.message);
          }
        }
        if (!nova) nova = await buscarSituacao();
      } catch (e) {
        console.warn("[Sessão] minha_situacao:", (e as Error)?.message);
      }
      if (cancelado) return;
      // aviso fechado aqui e ainda não gravado no servidor (fechou sem internet ou saiu logo): vale o daqui e grava de novo
      if (nova?.aviso_mudanca && !nova.aviso_mudanca.visto && avisoVistoAqui(uid, nova.aviso_mudanca.versao || "1")) {
        nova = { ...nova, aviso_mudanca: { ...nova.aviso_mudanca, visto: true } };
        void principal.rpc("marcar_aviso_mudanca" as never, { p_versao: nova.aviso_mudanca!.versao || "1" } as never);
      }
      if (nova) {
        setSituacao(nova);
        guardarSituacao(nova);
        setErroSituacao(false);
      } else if (!guardada) {
        setErroSituacao(true);
      }
      setCarregandoSituacao(false);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a sessão renova o token sem mudar a pessoa; só uid e o pedido de recarga contam
  }, [uid, versaoSituacao]);

  // 3. sessão do Banco do Treino (troca de token)
  const trocar = useCallback(async (forcar: boolean) => {
    const pid = uidRef.current;
    const sit = situacaoRef.current;
    if (!pid || !sit?.precisa_treino || trocando.current) return;
    if (!forcar) {
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const atual = data.session ?? (online() ? null : sessaoGuardada(chaveDoTreino()));
      if (sessaoTreinoServe(pid, atual)) {
        setTreino({ estado: "pronto", erro: null });
        return;
      }
    }
    if (!online()) {
      setTreino({ estado: "erro", erro: "rede" });
      return;
    }
    trocando.current = true;
    setTreino((t) => ({ estado: "trocando", erro: t.erro }));
    try {
      const { data } = await principal.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setTreino({ estado: "erro", erro: "invalido" });
        return;
      }
      const r = await pedirTroca(token);
      if (uidRef.current !== pid) return; // a pessoa saiu no meio
      if (r.ok) {
        const ok = await aplicarSessaoTreino(pid, r.sessao);
        tentativasTroca.current = 0;
        setTreino(ok ? { estado: "pronto", erro: null } : { estado: "erro", erro: "interno" });
        return;
      }
      const falha = r as Extract<typeof r, { ok: false }>;
      if (falha.erro === "invalido") {
        // token do principal inválido ou revogado: sai dos 2 bancos (spec 9)
        setTreino({ estado: "erro", erro: "invalido" });
        void sairRef.current?.();
        return;
      }
      setTreino({ estado: "erro", erro: falha.erro });
      if (retentavel(falha.erro) && tentativasTroca.current < MAX_TENTATIVAS_TROCA) {
        const espera = esperaDaTentativa(tentativasTroca.current++);
        if (timerTroca.current) clearTimeout(timerTroca.current);
        timerTroca.current = setTimeout(() => setPedidoTroca((p) => ({ n: p.n + 1, forcar: false })), espera);
      }
    } finally {
      trocando.current = false;
    }
  }, []);

  useEffect(() => {
    if (!uid || !situacao) return;
    if (!situacao.precisa_treino) {
      setTreino({ estado: "desnecessario", erro: null });
      return;
    }
    setTreino((t) => (t.estado === "pronto" && !pedidoTroca.forcar ? t : { estado: t.estado === "erro" ? "erro" : "aguardando", erro: t.erro }));
    void trocar(pedidoTroca.forcar);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a troca depende de quem é e se precisa, não do objeto inteiro
  }, [uid, situacao?.precisa_treino, pedidoTroca, trocar]);

  // renovação da sessão do Treino falhou com o principal válido → refaz a troca em silêncio (spec 7.4 passo 5)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento !== "SIGNED_OUT" || saindo.current) return;
      if (uidRef.current && situacaoRef.current?.precisa_treino && online()) {
        setTimeout(() => setPedidoTroca((p) => ({ n: p.n + 1, forcar: true })), 300);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // quando a internet volta: refaz o que ficou pendente
  useEffect(() => {
    const aoVoltar = () => {
      if (!uidRef.current) return;
      tentativasTroca.current = 0;
      setVersaoSituacao((v) => v + 1);
      setPedidoTroca((p) => ({ n: p.n + 1, forcar: false }));
    };
    window.addEventListener("online", aoVoltar);
    return () => window.removeEventListener("online", aoVoltar);
  }, []);

  // 4. código do profissional
  const vincularCodigo = useCallback(async (texto: string): Promise<ResultadoVinculo> => {
    const codigo = normalizarCodigo(texto);
    if (!codigo) return { ok: false, erro: "codigo_invalido" };
    if (!online()) return { ok: false, erro: "sem_internet" };
    const { data, error } = await principal.functions.invoke("vincular-aluno", { body: { codigo } });
    if (error) {
      const corpo = await corpoDoErro(error);
      return { ok: false, erro: erroDoVinculo(corpo?.erro) };
    }
    const d = (data ?? {}) as Record<string, unknown>;
    if (d.ok !== true) return { ok: false, erro: erroDoVinculo(d.erro) };
    limparProfPendente();
    // o professor chega ao Treino pela troca (espelho): refaz a situação e a troca
    setVersaoSituacao((v) => v + 1);
    setPedidoTroca((p) => ({ n: p.n + 1, forcar: true }));
    return { ok: true, jaEra: d.ja_era === true, profissional: (d.profissional as string) ?? null, conta: (d.conta_nome as string) ?? null };
  }, []);

  useEffect(() => {
    const codigo = lerProfPendente();
    if (!uid || !situacao || !codigo || vinculando.current || !online()) return;
    vinculando.current = true;
    void vincularCodigo(codigo)
      .then((r) => {
        if (r.ok) {
          toast.success(r.profissional ? `Você entrou na lista de ${r.profissional}.` : "Você foi ligado ao seu profissional.");
        } else if (r.erro && ["codigo_invalido", "profissional_inativo", "proprio_codigo", "outro_profissional"].includes(r.erro)) {
          limparProfPendente();
          if (r.erro !== "proprio_codigo") toast.error(MENSAGEM_VINCULO[r.erro]);
        } else if (r.erro === "limite_plano") {
          toast.error(MENSAGEM_VINCULO.limite_plano);
        }
      })
      .finally(() => {
        vinculando.current = false;
      });
  }, [uid, situacao, vincularCodigo]);

  // 5. entrar e sair
  const entrarComGoogle = useCallback(async () => {
    const { error } = await signInWithGoogle();
    return error ? { erro: error } : {};
  }, []);

  const entrarComEmail = useCallback(async (email: string, senha: string) => {
    const { error } = await principal.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
    if (!error) return {};
    return { erro: { status: error.status, code: (error as { code?: string }).code, message: error.message } };
  }, []);

  const sair = useCallback(async () => {
    saindo.current = true;
    if (timerTroca.current) clearTimeout(timerTroca.current);
    try {
      localStorage.removeItem("physiq_offline_pending");
      localStorage.removeItem("physiq_offline_cache");
      localStorage.removeItem("physiq_mp_status_cache"); // status leve da mensalidade (é por usuário)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(POS_LOGIN)) localStorage.removeItem(k);
      }
    } catch {
      /* storage indisponível */
    }
    limparSituacoes();
    esquecerTrocas();
    // cache do Service Worker: não serve dados da pessoa anterior sem internet
    if (typeof caches !== "undefined") {
      try {
        const nomes = await caches.keys();
        await Promise.all(nomes.filter((n) => n.includes("supabase-api-cache")).map((n) => caches.delete(n)));
      } catch {
        /* fora de https */
      }
    }
    const r1 = await principal.auth.signOut().catch((e) => ({ error: e }));
    const r2 = await supabase.auth.signOut().catch((e) => ({ error: e }));
    // sem internet o supabase-js não apaga a sessão guardada: apaga aqui (sair vale nos 2 bancos)
    if (r1?.error || r2?.error) {
      try {
        localStorage.removeItem(PRINCIPAL_STORAGE_KEY);
        const chave = chaveDoTreino();
        if (chave) localStorage.removeItem(chave);
      } catch {
        /* noop */
      }
    }
    setSessao(null);
    setSituacao(null);
    setSenhaTrocada(false);
    setTreino({ estado: "desnecessario", erro: null });
    saindo.current = false;
  }, []);
  sairRef.current = sair;

  const recarregarSituacao = useCallback(async () => {
    try {
      const s = await buscarSituacao();
      if (s) {
        setSituacao(s);
        guardarSituacao(s);
      }
      return s;
    } catch {
      return null;
    }
  }, []);

  const tentarTreinoDeNovo = useCallback(() => {
    tentativasTroca.current = 0;
    setPedidoTroca((p) => ({ n: p.n + 1, forcar: true }));
  }, []);

  const marcarAvisoMudanca = useCallback(async (versao: string) => {
    try {
      if (uidRef.current) localStorage.setItem(`${AVISO_VISTO}${uidRef.current}:${versao}`, "1");
    } catch {
      /* sem armazenamento */
    }
    setSituacao((s) => {
      if (!s?.aviso_mudanca) return s;
      const nova = { ...s, aviso_mudanca: { ...s.aviso_mudanca, visto: true } };
      guardarSituacao(nova);
      return nova;
    });
    try {
      await principal.rpc("marcar_aviso_mudanca" as never, { p_versao: versao } as never);
    } catch {
      /* fica visto neste aparelho; a próxima abertura com internet grava */
    }
  }, []);

  const valor = useMemo<SessaoValor>(
    () => ({
      pronto,
      usuario,
      sessao,
      situacao,
      carregandoSituacao,
      erroSituacao,
      treino,
      senhaTrocada,
      entrarComGoogle,
      entrarComEmail,
      sair,
      recarregarSituacao,
      tentarTreinoDeNovo,
      vincularCodigo,
      marcarAvisoMudanca,
    }),
    [pronto, usuario, sessao, situacao, carregandoSituacao, erroSituacao, treino, senhaTrocada, entrarComGoogle, entrarComEmail, sair,
      recarregarSituacao, tentarTreinoDeNovo, vincularCodigo, marcarAvisoMudanca],
  );

  return <SessaoCtx.Provider value={valor}>{children}</SessaoCtx.Provider>;
}
