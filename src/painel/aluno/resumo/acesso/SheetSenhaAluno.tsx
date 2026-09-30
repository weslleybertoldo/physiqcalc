import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, UserPlus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { useIsMobile } from "@/hooks/use-mobile";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { criarAcessoDoAluno, criarSenhaNovaDoAluno } from "./api";
import { gerarSenhaProvisoria, textoErroAcesso, textoParaOAluno, validarAcesso } from "./regras";

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * Folha "Criar acesso" / "Criar senha nova" do card Acesso do aluno (W8b): abre com o e-mail do cadastro (só ao criar) e uma
 * senha provisória já gerada (mostrar, gerar outra, copiar), como o "Acesso do paciente" do Nutri. Depois de salvar mostra o que
 * passar ao aluno (e-mail + senha, para copiar) — a senha não fica guardada em lugar nenhum.
 */
export function SheetSenhaAluno({
  aberto,
  criar,
  pacienteId,
  nome,
  emailCadastro,
  emailLogin,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  /** true = o aluno não tem login (cria com e-mail + senha); false = senha nova para o login que ele já tem */
  criar: boolean;
  pacienteId: string;
  nome: string | null;
  emailCadastro: string | null;
  emailLogin: string | null;
  aoFechar: () => void;
  aoSalvar: () => Promise<unknown> | void;
}) {
  const celular = useIsMobile();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [tocado, setTocado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroRpc, setErroRpc] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ email: string; senha: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setEmail(emailCadastro ?? "");
    setSenha(gerarSenhaProvisoria());
    setTocado(false);
    setErroRpc(null);
    setPronto(null);
    setCopiado(false);
  }, [aberto, emailCadastro]);

  const erro = validarAcesso({ email, senha }, criar);
  const erroVisivel = erroRpc ?? (tocado ? erro : null);
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] || "O aluno";

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (erro || salvando) return;
    setSalvando(true);
    setErroRpc(null);
    try {
      const emailFinal = criar ? email.trim().toLowerCase() : (emailLogin ?? "");
      if (criar) await criarAcessoDoAluno(pacienteId, emailFinal, senha);
      else await criarSenhaNovaDoAluno(pacienteId, senha);
      setPronto({ email: emailFinal, senha });
      await aoSalvar();
    } catch (err) {
      setErroRpc(textoErroAcesso(err instanceof Error ? err.message : "", criar ? "Não foi possível criar o acesso." : "Não foi possível criar a senha nova."));
    } finally {
      setSalvando(false);
    }
  };

  const copiarTudo = async () => {
    if (!pronto) return;
    const ok = await copiar(textoParaOAluno({ nome, email: pronto.email, senha: pronto.senha }));
    setCopiado(ok);
    if (ok) toast.success("Copiado. É só colar na conversa com o aluno.");
    else toast.error("Não deu para copiar aqui. Selecione e copie o texto.");
  };

  const copiarSenha = async () => {
    const ok = await copiar(senha);
    if (ok) toast.success("Senha copiada.");
    else toast.error("Não deu para copiar aqui. Selecione e copie a senha.");
  };

  const titulo = pronto ? (criar ? "Acesso criado" : "Senha nova criada") : criar ? "Criar acesso do aluno" : "Criar senha nova";
  const descricao = pronto
    ? `Passe ao ${primeiro === "O aluno" ? "aluno" : primeiro} o e-mail e a senha abaixo. No primeiro acesso ele cria a senha dele.`
    : criar
      ? `${primeiro} entra com este e-mail e a senha provisória. No primeiro acesso ele cria a senha dele.`
      : `A senha antiga deixa de valer e as sessões abertas são encerradas; se a conta estava bloqueada por tentativas, ela é destravada. ${primeiro} entra com a senha provisória e cria a dele no primeiro acesso.`;

  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={(v) => !v && !salvando && aoFechar()}
      lado={celular ? "baixo" : "direita"}
      titulo={titulo}
      descricao={descricao}
    >
      {pronto ? (
        <div className="flex flex-col gap-4 pt-2" data-senha-aluno-pronta>
          <div className="flex flex-col gap-2 rounded-2xl border border-linha bg-superficie px-4 py-3.5">
            <span className="text-[12px] font-semibold text-texto-3">E-mail (login)</span>
            <span className="break-all text-[14px] font-medium text-texto" data-senha-aluno-email>{pronto.email}</span>
            <span className="mt-1 text-[12px] font-semibold text-texto-3">Senha provisória</span>
            <span className="select-all font-mono text-[18px] font-semibold tracking-[0.06em] text-texto" data-senha-aluno-valor>{pronto.senha}</span>
          </div>
          <Botao variante="w" icone={copiado ? Check : Copy} onClick={() => void copiarTudo()} data-senha-aluno-copiar-tudo>
            {copiado ? "Copiado" : "Copiar e-mail e senha"}
          </Botao>
          <Botao onClick={aoFechar} data-senha-aluno-fechar>Fechar</Botao>
          <p className="text-[12px] leading-relaxed text-texto-3">
            A senha não fica guardada: se perder, crie outra. Quem tem e-mail do Gmail também pode entrar com o Google.
          </p>
        </div>
      ) : (
        <form onSubmit={salvar} className="flex flex-col gap-4 pt-2" data-form-senha-aluno data-modo={criar ? "criar" : "senha"}>
          {criar && (
            <Campo rotulo="E-mail (login)" type="email" value={email} autoComplete="off" placeholder="nome@exemplo.com"
              onChange={(e) => { setEmail(e.target.value); setTocado(true); setErroRpc(null); }} data-senha-aluno-campo-email />
          )}
          <div className="flex flex-col gap-1.5">
            <Campo rotulo="Senha provisória" type="text" value={senha} autoComplete="new-password" spellCheck={false}
              className="font-mono tracking-[0.06em]"
              onChange={(e) => { setSenha(e.target.value); setTocado(true); setErroRpc(null); }} data-senha-aluno-campo-senha
              dica="Pelo menos 8 caracteres, com letras e números." />
            <div className="flex gap-2">
              <Botao tamanho="sm" icone={Wand2} onClick={() => { setSenha(gerarSenhaProvisoria()); setErroRpc(null); }} data-senha-aluno-gerar>
                Gerar outra
              </Botao>
              <Botao tamanho="sm" icone={Copy} onClick={() => void copiarSenha()} data-senha-aluno-copiar>Copiar</Botao>
            </div>
          </div>
          {erroVisivel && <MensagemForm data-senha-aluno-erro>{erroVisivel}</MensagemForm>}
          <Botao type="submit" variante="w" icone={criar ? UserPlus : KeyRound} disabled={salvando || (tocado && !!erro)} data-senha-aluno-salvar>
            {salvando ? "Salvando…" : criar ? "Criar acesso" : "Salvar senha nova"}
          </Botao>
        </form>
      )}
    </PainelDeslizante>
  );
}
