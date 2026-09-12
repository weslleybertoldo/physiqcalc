import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listarAlunos, masterProfessores, type AlunoRow } from "@/lib/saasApi";
import {
  BTN_MINI_PRIMARIO, BTN_NEUTRO, BTN_PRIMARIO, Carregando, Chip, DIALOG_CONTENT, INPUT, Vazio, copiar, mensagemErro, useDebounce,
} from "@/components/master/masterUi";

// invite → { promovido: true, userId, codigo } ou { promovido: false, convite, jaExistia? }
interface ResultadoInvite {
  promovido: boolean;
  userId?: string;
  codigo?: string;
  convite?: { id: string; email: string; status: string };
  jaExistia?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** chamado quando alguém virou professor (recarregar a lista) */
  onCriado: () => void;
}

// "+ Novo professor": por e-mail (invite — promove na hora se já tem conta, senão fica pendente até entrar
// com Google) ou promovendo um aluno já cadastrado (promote).
export default function NovoProfessorDialog({ open, onOpenChange, onCriado }: Props) {
  const [modo, setModo] = useState<"email" | "promover">("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<ResultadoInvite | null>(null);
  const [q, setQ] = useState("");
  const qDeb = useDebounce(q.trim(), 300);
  const [alunos, setAlunos] = useState<AlunoRow[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [promovendo, setPromovendo] = useState<string | null>(null);

  // limpa tudo ao fechar
  useEffect(() => {
    if (open) return;
    setModo("email"); setEmail(""); setResultado(null); setQ(""); setAlunos([]);
  }, [open]);

  useEffect(() => {
    if (!open || modo !== "promover") return;
    if (qDeb.length < 2) { setAlunos([]); return; }
    let cancelado = false;
    setBuscando(true);
    listarAlunos({ q: qDeb, limit: 20 })
      .then((r) => { if (!cancelado) setAlunos(r.users); })
      .catch((e) => { if (!cancelado) toast.error(mensagemErro(e)); })
      .finally(() => { if (!cancelado) setBuscando(false); });
    return () => { cancelado = true; };
  }, [qDeb, modo, open]);

  const convidar = async () => {
    const em = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast.error("E-mail inválido."); return; }
    setBusy(true);
    try {
      const r = await masterProfessores<ResultadoInvite>("invite", { email: em });
      setResultado(r);
      if (r.promovido) { toast.success("Já tinha conta: virou professor agora."); onCriado(); }
      else toast.success(r.jaExistia ? "Esse convite já estava pendente." : "Convite registrado.");
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  };

  const promover = async (a: AlunoRow) => {
    setPromovendo(a.id);
    try {
      const r = await masterProfessores<{ ok: boolean; codigo: string }>("promote", { userId: a.id });
      toast.success(`${a.nome || a.email} agora é professor. Código ${r.codigo}.`);
      onCriado();
      onOpenChange(false);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setPromovendo(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${DIALOG_CONTENT} max-w-md`} data-dialog-novo-professor>
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-foreground uppercase tracking-wider text-base">Novo professor</DialogTitle>
          <DialogDescription className="font-body text-xs">
            Quem vira professor ganha código de convite fixo, {" "}teste grátis e o plano inicial. O login continua só com Google.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Chip ativo={modo === "email"} onClick={() => setModo("email")} data-modo="email">Por e-mail</Chip>
          <Chip ativo={modo === "promover"} onClick={() => setModo("promover")} data-modo="promover">Promover aluno existente</Chip>
        </div>

        {modo === "email" ? (
          resultado ? (
            <div className="border border-primary/40 bg-primary/5 p-4 space-y-3 text-sm font-body" data-resultado-convite>
              {resultado.promovido ? (
                <>
                  <p className="text-foreground flex items-start gap-2">
                    <Check size={16} className="text-primary shrink-0 mt-0.5" />
                    <span><span className="text-primary">{email.trim().toLowerCase()}</span> já tinha conta e virou professor na hora.</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Código de convite:</span>
                    <span className="font-heading tracking-wider text-foreground">{resultado.codigo}</span>
                    <button type="button" onClick={() => void copiar(resultado.codigo ?? "", "Código copiado!")} className={BTN_MINI_PRIMARIO}>
                      <Copy size={10} className="inline mr-1" />Copiar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-foreground">
                    Convite <span className="text-primary">pendente</span> para <span className="text-primary">{email.trim().toLowerCase()}</span>.
                    Quando essa pessoa entrar no app com o Google (mesmo e-mail), vira professor automaticamente.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    O app não envia e-mail — avise a pessoa (WhatsApp) que ela já pode entrar.
                    {resultado.jaExistia ? " Esse convite já existia." : ""}
                  </p>
                </>
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                <button type="button" onClick={() => { setResultado(null); setEmail(""); }} className={BTN_NEUTRO}>Convidar outro</button>
                <button type="button" onClick={() => onOpenChange(false)} className={BTN_PRIMARIO}>Fechar</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void convidar(); }}
                placeholder="email@exemplo.com"
                className={INPUT}
                autoFocus
                data-input-email-professor
              />
              <p className="text-[11px] text-muted-foreground font-body">
                Se o e-mail já tem conta no app, vira professor agora. Se não, fica pendente até a pessoa entrar com o Google.
              </p>
              <div className="flex justify-end">
                <button type="button" onClick={() => void convidar()} disabled={busy || !email.trim()} className={BTN_PRIMARIO} data-btn-convidar>
                  {busy ? "Enviando..." : "Convidar"}
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar aluno por nome, e-mail ou ID..."
                className={`${INPUT} pl-6`}
                autoFocus
                data-input-busca-aluno
              />
            </div>
            {buscando ? <Carregando texto="Buscando..." /> : qDeb.length < 2 ? (
              <p className="text-[11px] text-muted-foreground font-body">Digite pelo menos 2 letras.</p>
            ) : alunos.length === 0 ? (
              <Vazio texto="Nenhum aluno encontrado." />
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-muted-foreground/30 border border-muted-foreground/30">
                {alunos.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 p-2.5" data-aluno-promover={a.id}>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading text-sm text-foreground truncate">{a.nome || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground font-body truncate">{a.email}{a.user_code ? ` · ID ${a.user_code}` : ""}</p>
                    </div>
                    <button type="button" onClick={() => void promover(a)} disabled={promovendo !== null} className={BTN_MINI_PRIMARIO} data-btn-promover>
                      {promovendo === a.id ? "..." : "Promover"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
