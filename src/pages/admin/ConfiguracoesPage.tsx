import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Camera, Link2, User, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ConviteAlunoConteudo } from "@/components/admin/ConviteAlunoDialog";
import { uploadFotoProfessor, validarFoto } from "@/lib/fotoProfessor";
import type { PixTipo } from "@/lib/pixChave";
import RecebimentosLista from "@/components/admin/RecebimentosLista";

type Secao = "perfil" | "convite" | "recebimento";

const SECOES: { key: Secao; label: string; icon: typeof User }[] = [
  { key: "perfil", label: "Perfil", icon: User },
  { key: "convite", label: "Convite", icon: Link2 },
  { key: "recebimento", label: "Recebimento", icon: Wallet },
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

const BTN_PRI = "inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50";
const BTN_SEC = "inline-flex items-center gap-1.5 border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider px-3 py-1.5 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50";
const LABEL = "text-sm text-muted-foreground font-body uppercase tracking-wider";

// Configurações do PROFESSOR (SaaS 12/09/2026): Perfil · Convite · Recebimento — lê/grava a própria linha de physiq_professores.
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
  const inputFoto = useRef<HTMLInputElement>(null);
  const [subindoFoto, setSubindoFoto] = useState(false);

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

  /** "Alterar foto": escolhe o arquivo, sobe pro Storage e já grava a URL no perfil (pedido 13/09/2026). */
  const escolherFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    const erro = validarFoto(file);
    if (erro) { toast.error(erro); return; }
    setSubindoFoto(true);
    try {
      const url = await uploadFotoProfessor(user.id, file);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- padrão do arquivo (physiq_professores fora dos tipos gerados)
      const { error } = await (supabase.from as any)("physiq_professores").update({ foto_url: url }).eq("id", user.id);
      if (error) throw error;
      setFoto(url);
      setProf((p) => (p ? { ...p, foto_url: url } : p));
      toast.success("Foto alterada.");
    } catch (err) {
      console.error("[Configuracoes] foto:", err);
      toast.error("Não foi possível enviar a foto.");
    } finally {
      setSubindoFoto(false);
    }
  };


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
                    <label className={LABEL}>Foto</label>
                    <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={escolherFoto} data-perfil-foto-arquivo />
                    <div className="flex flex-wrap gap-2 mt-1">
                      <button type="button" onClick={() => inputFoto.current?.click()} disabled={subindoFoto} className={BTN_SEC} data-btn-alterar-foto>
                        <Camera size={12} className="inline mr-1 -mt-0.5" />{subindoFoto ? "Enviando..." : "Alterar foto"}
                      </button>
                      {fotoGoogle && foto.trim() !== fotoGoogle && (
                        <button type="button" onClick={() => setFoto(fotoGoogle)} className={BTN_SEC}>Usar a foto do Google</button>
                      )}
                      {foto.trim() && (
                        <button type="button" onClick={() => setFoto("")} className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors px-2">Remover</button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-body">JPG, PNG ou WebP até 5 MB. “Usar a foto do Google” e “Remover” valem depois de Salvar perfil.</p>
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
                <h2 className="font-heading text-lg text-foreground">Recebimento</h2>
                <p className="text-xs text-muted-foreground font-body mt-1">
                  Como seus alunos pagam. Só um recebimento fica ligado por vez — é ele que aparece na tela Pagamentos do aluno.
                </p>
              </div>
              {user && <RecebimentosLista professorId={user.id} ehMaster={papel === "master"} />}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfiguracoesPage;
