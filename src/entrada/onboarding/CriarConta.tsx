import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, CheckCircle2, Dumbbell, GraduationCap, Salad, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { principal } from "@/integrations/principal/client";
import { useSessao } from "@/nucleo/sessao";
import { TESTE_DIAS, TESTE_MAX_ALUNOS, dataBR } from "@/nucleo/cobranca/regras";
import { lembrarArea } from "@/ui/casca/area";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { useOnline } from "@/ui/premium/useOnline";
import { Campo, MensagemForm } from "../pecas/Campo";

type TipoPerfil = "personal" | "nutricionista" | "academico" | "outra_area";

/** Os tipos de perfil da spec 4.2 (os 3 do Nutri + Personal trainer). */
const TIPOS: { id: TipoPerfil; rotulo: string; dica: string; icone: LucideIcon }[] = [
  { id: "personal", rotulo: "Personal trainer", dica: "Educação Física (CREF)", icone: Dumbbell },
  { id: "nutricionista", rotulo: "Nutricionista", dica: "CRN", icone: Salad },
  { id: "academico", rotulo: "Acadêmico de Nutrição", dica: "Estudante", icone: GraduationCap },
  { id: "outra_area", rotulo: "Outra área", dica: "Saúde e bem-estar", icone: Sparkles },
];

const MENSAGENS: Record<string, string> = {
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste criam conta.",
  ja_tem_conta: "Você já faz parte de uma conta de profissional. Entre no painel pelo menu.",
  nome_invalido: "Dê um nome para a conta (ao menos 2 letras).",
  tipo_invalido: "Escolha como você atende.",
  sem_login: "Entre de novo para criar a conta.",
  sem_internet: "Conecte-se à internet para criar a conta.",
};

/**
 * Boas-vindas › "Sou profissional" (W4, spec 4.2, R5, R17, P10, P12): nome da conta, tipo de perfil e registro (CRN/CREF,
 * opcional) → a conta nasce com 14 dias grátis no Treino + Nutrição, até 10 alunos, sem cartão. Depois do teste, paga em
 * Configurações › Plano (6.2). O master continua podendo criar e convidar.
 */
export default function CriarConta() {
  const { situacao, usuario, recarregarSituacao } = useSessao();
  const navigate = useNavigate();
  const online = useOnline();
  const nomePessoa = situacao?.nome || (usuario?.user_metadata as { full_name?: string } | undefined)?.full_name || "";
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(nomePessoa);
  const [tipo, setTipo] = useState<TipoPerfil | null>(null);
  const [registro, setRegistro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState<{ teste_ate: string | null } | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!online) return setErro(MENSAGENS.sem_internet);
    if (nome.trim().length < 2) return setErro(MENSAGENS.nome_invalido);
    if (!tipo) return setErro(MENSAGENS.tipo_invalido);
    setEnviando(true);
    try {
      const { data, error } = await principal.rpc("criar_minha_conta" as never, { p_nome: nome.trim(), p_tipo: tipo, p_registro: registro.trim() || null } as never);
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; erro?: string; teste_ate?: string | null; ja_existia?: boolean };
      if (!r.ok) {
        setErro(MENSAGENS[r.erro ?? ""] ?? "Não foi possível criar a conta agora. Tente de novo.");
        return;
      }
      setPronto({ teste_ate: r.teste_ate ?? null });
      await recarregarSituacao();
      lembrarArea("painel");
      setTimeout(() => navigate("/painel", { replace: true }), 1200);
    } catch {
      setErro("Não foi possível criar a conta agora. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Cartao brilho={aberto} data-onboarding="CriarConta" className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-verde-3">
          <Briefcase aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-texto">Sou profissional</span>
            <Chip tom="n">{TESTE_DIAS} DIAS GRÁTIS</Chip>
          </span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-texto-2">
            Crie a sua conta com Treino + Nutrição por {TESTE_DIAS} dias, até {TESTE_MAX_ALUNOS} alunos. Sem cartão.
          </span>
        </span>
      </div>

      {pronto ? (
        <MensagemForm tom="ok" data-conta-criada>
          <CheckCircle2 aria-hidden className="mr-1.5 inline h-4 w-4 align-[-3px]" />
          Pronto! Sua conta está no teste{pronto.teste_ate ? ` até ${dataBR(pronto.teste_ate)}` : ""}. Abrindo o painel…
        </MensagemForm>
      ) : !aberto ? (
        <button type="button" onClick={() => setAberto(true)} className="pq-botao pq-botao-g h-12 w-full rounded-2xl" data-criar-conta-abrir>
          Criar minha conta
        </button>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-4" data-form-criar-conta>
          <Campo rotulo="Nome da conta" value={nome} onChange={(e) => { setNome(e.target.value); setErro(""); }} placeholder="Ex.: Consultoria Ferreira"
            maxLength={80} autoComplete="organization" required dica="É o nome que os seus alunos e a sua equipe veem." />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[12.5px] font-semibold text-texto-2">Você atende como</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de perfil">
              {TIPOS.map((t) => {
                const Icone = t.icone;
                const ativo = tipo === t.id;
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={ativo} onClick={() => { setTipo(t.id); setErro(""); }} data-tipo-perfil={t.id}
                    className={cn(
                      "flex min-h-[64px] flex-col items-start gap-1 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                      ativo ? "border-violeta/60 bg-superficie-2" : "border-linha bg-superficie hover:border-linha-2",
                    )}>
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-texto">
                      <Icone aria-hidden className={cn("h-4 w-4 flex-none", ativo ? "text-violeta-3" : "text-texto-3")} strokeWidth={1.8} />
                      {t.rotulo}
                    </span>
                    <span className="text-[11.5px] text-texto-3">{t.dica}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Campo rotulo="Registro profissional (opcional)" value={registro} onChange={(e) => setRegistro(e.target.value)}
            placeholder={tipo === "personal" ? "CREF 000000-G/UF" : "CRN-0 00000"} maxLength={30} autoComplete="off" />
          {erro && <MensagemForm data-criar-conta-erro>{erro}</MensagemForm>}
          <button type="submit" disabled={enviando} className="pq-botao pq-botao-w h-12 w-full rounded-2xl" data-criar-conta-enviar>
            {enviando ? "Criando…" : `Criar conta com ${TESTE_DIAS} dias grátis`}
          </button>
          {/* hml-12 (H-30): a declaração do profissional (18+ e o registro válido) — SÓ no build de staging até a virada */}
          {import.meta.env.VITE_DB_SCHEMA === "staging" && (
            <p className="text-center text-[11.5px] leading-relaxed text-texto-3" data-declaracao-profissional>
              Ao criar a conta, você declara ter 18 anos ou mais e que o registro profissional informado é seu e está válido (Termos de Uso, seção 2).
            </p>
          )}
          <p className="text-center text-[11.5px] leading-relaxed text-texto-3">
            Depois do teste, escolha o plano em Configurações › Plano: Só Treino, Só Nutrição ou Treino + Nutrição.
          </p>
        </form>
      )}
    </Cartao>
  );
}
