import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link2, User, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { ConviteAlunoConteudo } from "@/components/admin/ConviteAlunoDialog";

type Secao = "perfil" | "convite" | "recebimento";
type PixTipo = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

const SECOES: { key: Secao; label: string; icon: typeof User }[] = [
  { key: "perfil", label: "Perfil", icon: User },
  { key: "convite", label: "Convite", icon: Link2 },
  { key: "recebimento", label: "Recebimento", icon: Wallet },
];

const PIX_TIPOS: { value: PixTipo; label: string; placeholder: string }[] = [
  { value: "cpf", label: "CPF", placeholder: "000.000.000-00" },
  { value: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00" },
  { value: "email", label: "E-mail", placeholder: "voce@exemplo.com" },
  { value: "telefone", label: "Telefone", placeholder: "(82) 99999-9999" },
  { value: "aleatoria", label: "Chave aleatória", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
];

/** Linha do professor em physiq_professores (só as colunas que a tela usa; o trigger ignora as outras). */
interface ProfessorLinha {
  id: string;
  nome: string;
  email: string | null;
  foto_url: string | null;
  codigo_convite: string;
  status: string;
  pix_tipo: PixTipo | null;
  pix_chave: string | null;
  pix_favorecido: string | null;
  pix_banco: string | null;
  pix_exibir: boolean;
}

const soDigitos = (v: string) => v.replace(/\D/g, "");
const telefoneNacional = (dig: string) => (dig.startsWith("55") && dig.length >= 12 ? dig.slice(2) : dig);

/** Mensagem de erro da chave Pix por tipo, ou null quando válida. */
function validarChavePix(tipo: PixTipo | "", chave: string): string | null {
  const v = chave.trim();
  if (!tipo) return "Escolha o tipo da chave.";
  if (!v) return "Informe a chave Pix.";
  switch (tipo) {
    case "cpf": return soDigitos(v).length === 11 ? null : "CPF precisa ter 11 dígitos.";
    case "cnpj": return soDigitos(v).length === 14 ? null : "CNPJ precisa ter 14 dígitos.";
    case "email": return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "E-mail inválido.";
    case "telefone": {
      const n = telefoneNacional(soDigitos(v));
      return n.length === 10 || n.length === 11 ? null : "Telefone precisa ter DDD + número (10 ou 11 dígitos).";
    }
    case "aleatoria": return v.length >= 32 ? null : "Chave aleatória tem pelo menos 32 caracteres.";
  }
  return null;
}

/** Como a chave é gravada: CPF/CNPJ só dígitos, telefone +55DDDNÚMERO, e-mail minúsculo. */
function normalizarChavePix(tipo: PixTipo, chave: string): string {
  const v = chave.trim();
  if (tipo === "cpf" || tipo === "cnpj") return soDigitos(v);
  if (tipo === "telefone") return `+55${telefoneNacional(soDigitos(v))}`;
  if (tipo === "email") return v.toLowerCase();
  return v;
}

const BTN_PRI = "inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50";
const BTN_SEC = "inline-flex items-center gap-1.5 border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider px-3 py-1.5 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50";
const LABEL = "text-sm text-muted-foreground font-body uppercase tracking-wider";
const SELECT = "bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-2 outline-none focus:border-primary";

// Configurações do PROFESSOR (SaaS 12/09/2026): Perfil · Convite · Recebimento (Pix) — lê/grava a própria linha de physiq_professores.
const ConfiguracoesPage = () => {
  const { user, papel } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const secao: Secao = (SECOES.some((s) => s.key === searchParams.get("s")) ? searchParams.get("s") : "perfil") as Secao;
  const setSecao = (s: Secao) =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set("s", s); return p; }, { replace: true });

  const [loading, setLoading] = useState(true);
  const [prof, setProf] = useState<ProfessorLinha | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  // Perfil
  const [nome, setNome] = useState("");
  const [foto, setFoto] = useState("");
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  // Recebimento
  const [pixTipo, setPixTipo] = useState<PixTipo | "">("");
  const [pixChave, setPixChave] = useState("");
  const [pixFavorecido, setPixFavorecido] = useState("");
  const [pixBanco, setPixBanco] = useState("");
  const [pixExibir, setPixExibir] = useState(true);
  const [salvandoPix, setSalvandoPix] = useState(false);

  const meta = (user?.user_metadata ?? {}) as { avatar_url?: string; picture?: string; full_name?: string; name?: string };
  const fotoGoogle = meta.avatar_url || meta.picture || "";

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    (supabase.from as any)("physiq_professores")
      .select("id, nome, email, foto_url, codigo_convite, status, pix_tipo, pix_chave, pix_favorecido, pix_banco, pix_exibir")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }: { data: ProfessorLinha | null; error: { message: string } | null }) => {
        if (!vivo) return;
        if (error) { console.error("[Configuracoes] physiq_professores:", error); setErroCarga("Erro ao carregar seus dados de professor."); }
        const p = data ?? null;
        setProf(p);
        if (p) {
          setNome(p.nome || "");
          setFoto(p.foto_url || "");
          setPixTipo(p.pix_tipo || "");
          setPixChave(p.pix_chave || "");
          setPixFavorecido(p.pix_favorecido || "");
          setPixBanco(p.pix_banco || "");
          setPixExibir(p.pix_exibir ?? true);
        }
        setLoading(false);
      });
    return () => { vivo = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvarPerfil = async () => {
    if (!user) return;
    const n = nome.trim();
    if (!n) { toast.error("Informe seu nome."); return; }
    const f = foto.trim();
    if (f && !/^https?:\/\//i.test(f)) { toast.error("A URL da foto precisa começar com http:// ou https://"); return; }
    setSalvandoPerfil(true);
    const { error } = await (supabase.from as any)("physiq_professores").update({ nome: n, foto_url: f || null }).eq("id", user.id);
    setSalvandoPerfil(false);
    if (error) { console.error("[Configuracoes] perfil:", error); toast.error("Erro ao salvar o perfil."); return; }
    setProf((p) => (p ? { ...p, nome: n, foto_url: f || null } : p));
    toast.success("Perfil salvo.");
  };

  const salvarPix = async () => {
    if (!user) return;
    const limpando = !pixTipo && !pixChave.trim();
    if (!limpando) {
      const erro = validarChavePix(pixTipo, pixChave);
      if (erro) { toast.error(erro); return; }
    }
    const chave = limpando ? null : normalizarChavePix(pixTipo as PixTipo, pixChave);
    setSalvandoPix(true);
    const patch = {
      pix_tipo: limpando ? null : pixTipo,
      pix_chave: chave,
      pix_favorecido: pixFavorecido.trim() || null,
      pix_banco: pixBanco.trim() || null,
      pix_exibir: pixExibir,
    };
    const { error } = await (supabase.from as any)("physiq_professores").update(patch).eq("id", user.id);
    setSalvandoPix(false);
    if (error) { console.error("[Configuracoes] pix:", error); toast.error("Erro ao salvar os dados de recebimento."); return; }
    if (chave) setPixChave(chave);
    setProf((p) => (p ? { ...p, ...patch } as ProfessorLinha : p));
    toast.success(limpando ? "Chave Pix removida." : "Dados de recebimento salvos.");
  };

  const tipoSel = PIX_TIPOS.find((t) => t.value === pixTipo);

  const AvisoNaoProfessor = () => (
    <div className="result-card border-destructive/40 text-sm font-body text-foreground" data-aviso-nao-professor>
      Sua conta ainda não é de professor. Peça ao master para liberar seu acesso — até lá estas configurações ficam indisponíveis.
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-pagina-configuracoes>
      <header>
        <h1 className="font-heading text-xl text-foreground uppercase tracking-wider">Configurações</h1>
        <p className="text-xs text-muted-foreground font-body mt-1">Seu perfil de professor, o link de convite e como seus alunos pagam.</p>
      </header>

      <div className="sm:grid sm:grid-cols-[180px_1fr] sm:gap-8">
        {/* chips no mobile / abas verticais no desktop */}
        <nav className="flex gap-2 overflow-x-auto pb-3 sm:flex-col sm:gap-1 sm:pb-0 sm:border-r sm:border-muted-foreground/20 sm:pr-4" aria-label="Seções">
          {SECOES.map((s) => {
            const ativo = secao === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSecao(s.key)}
                data-config-secao={s.key}
                data-ativo={ativo || undefined}
                className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 font-heading text-xs uppercase tracking-wider transition-colors rounded-full border sm:rounded-none sm:border-0 sm:border-l-2 sm:w-full ${
                  ativo
                    ? "border-primary text-primary bg-primary/10"
                    : "border-muted-foreground/30 text-muted-foreground hover:text-foreground sm:border-transparent"
                }`}
              >
                <s.icon size={14} /> {s.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 pt-2 sm:pt-0">
          {loading ? (
            <p className="text-muted-foreground font-body">Carregando...</p>
          ) : erroCarga ? (
            <p className="text-sm text-destructive font-body">{erroCarga}</p>
          ) : !prof ? (
            <AvisoNaoProfessor />
          ) : secao === "perfil" ? (
            <section className="space-y-6" data-secao="perfil">
              <h2 className="font-heading text-lg text-foreground">Perfil</h2>
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center border border-muted-foreground/30">
                  {foto.trim() ? (
                    <img src={foto.trim()} alt="Sua foto" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <User size={24} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-4">
                  <div className="flex flex-col gap-1">
                    <label className={LABEL}>Nome</label>
                    <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="input-underline text-base" placeholder="Como seus alunos te veem" data-perfil-nome />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={LABEL}>Foto (URL)</label>
                    <input type="url" value={foto} onChange={(e) => setFoto(e.target.value)} className="input-underline text-sm" placeholder="https://..." data-perfil-foto />
                    <div className="flex flex-wrap gap-2 mt-1">
                      {fotoGoogle && foto.trim() !== fotoGoogle && (
                        <button type="button" onClick={() => setFoto(fotoGoogle)} className={BTN_SEC}>Usar a foto do Google</button>
                      )}
                      {foto.trim() && (
                        <button type="button" onClick={() => setFoto("")} className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors px-2">Remover</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-body">
                E-mail: <span className="text-foreground">{prof.email || user?.email}</span> · Código de convite: <span className="text-primary font-heading tracking-wider">{prof.codigo_convite}</span>
              </p>
              <button type="button" onClick={salvarPerfil} disabled={salvandoPerfil} className={BTN_PRI} data-btn-salvar-perfil>
                {salvandoPerfil ? "Salvando..." : "Salvar perfil"}
              </button>
            </section>
          ) : secao === "convite" ? (
            <section className="space-y-6" data-secao="convite">
              <div>
                <h2 className="font-heading text-lg text-foreground">Convite</h2>
                <p className="text-xs text-muted-foreground font-body mt-1">
                  Seu link e código são fixos — não mudam nem precisam ser regenerados. Quem entra por eles vira seu aluno.
                </p>
              </div>
              <ConviteAlunoConteudo />
            </section>
          ) : (
            <section className="space-y-6" data-secao="recebimento">
              <div>
                <h2 className="font-heading text-lg text-foreground">Recebimento (Pix)</h2>
                <p className="text-xs text-muted-foreground font-body mt-1">
                  O aluno vê sua chave na tela Pagamentos, faz o Pix pelo banco dele e anexa o comprovante. Você confere e confirma em Cobrança — aí ele fica em dia.
                </p>
                {papel === "master" && (
                  <p className="text-xs text-primary font-body mt-2" data-nota-master>
                    Você é o master: seus alunos pagam pelo Mercado Pago (integração). A chave abaixo só entra em cena se algum aluno seu estiver em modo Pix manual.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex flex-col gap-1">
                  <label className={LABEL}>Tipo da chave</label>
                  <select value={pixTipo} onChange={(e) => setPixTipo(e.target.value as PixTipo | "")} className={SELECT} data-pix-tipo>
                    <option value="" className="bg-background text-foreground">Selecionar...</option>
                    {PIX_TIPOS.map((t) => (
                      <option key={t.value} value={t.value} className="bg-background text-foreground">{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={LABEL}>Chave Pix</label>
                  <input
                    type={pixTipo === "email" ? "email" : "text"}
                    inputMode={pixTipo === "cpf" || pixTipo === "cnpj" || pixTipo === "telefone" ? "numeric" : undefined}
                    value={pixChave}
                    onChange={(e) => setPixChave(e.target.value)}
                    placeholder={tipoSel?.placeholder || "Escolha o tipo primeiro"}
                    className="input-underline text-sm"
                    data-pix-chave
                  />
                  {pixTipo && pixChave.trim() && validarChavePix(pixTipo, pixChave) && (
                    <p className="text-[11px] text-destructive font-body" data-pix-erro>{validarChavePix(pixTipo, pixChave)}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className={LABEL}>Favorecido (nome que aparece)</label>
                  <input type="text" value={pixFavorecido} onChange={(e) => setPixFavorecido(e.target.value)} className="input-underline text-sm" placeholder="Nome completo ou razão social" data-pix-favorecido />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={LABEL}>Banco</label>
                  <input type="text" value={pixBanco} onChange={(e) => setPixBanco(e.target.value)} className="input-underline text-sm" placeholder="Ex.: Nubank, Inter, Itaú" data-pix-banco />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 result-card p-4 border-muted-foreground/30">
                <div>
                  <p className="text-sm text-foreground font-body">Mostrar minha chave na tela Pagamentos dos alunos</p>
                  <p className="text-xs text-muted-foreground font-body mt-1">
                    Desligado, o aluno não vê a chave nem consegue anexar comprovante (útil se você cobra por fora).
                  </p>
                </div>
                <Switch checked={pixExibir} onCheckedChange={setPixExibir} aria-label="Mostrar minha chave na tela Pagamentos dos alunos" data-pix-exibir />
              </div>

              <button type="button" onClick={salvarPix} disabled={salvandoPix} className={BTN_PRI} data-btn-salvar-pix>
                {salvandoPix ? "Salvando..." : "Salvar recebimento"}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfiguracoesPage;
