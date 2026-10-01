import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, ClipboardList, LinkIcon, Send } from "lucide-react";
import { principal } from "@/integrations/principal/client";
import { useCaptcha } from "@/nucleo/captcha";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { EstadoCarregando, EstadoVazio } from "@/ui/premium/Estados";
import { MENSAGEM_CADASTRO_EXISTE } from "@/nucleo/dadoRepetido";

interface InfoLink {
  ok: boolean;
  profissional?: string;
  conta?: string;
  foto_url?: string | null;
  erro?: string;
}

const MENSAGEM: Record<string, string> = {
  nome_invalido: "Escreva o seu nome.",
  contato_obrigatorio: "Deixe um e-mail ou um telefone para o profissional falar com você.",
  email_invalido: "Confira o e-mail.",
  telefone_invalido: "O telefone precisa ter DDD e 8 ou 9 números.",
  nascimento_invalido: "Confira a data de nascimento.",
  genero_invalido: "Escolha uma opção de gênero.",
  cadastro_repetido: "Você já mandou um cadastro para este profissional. Espere a aprovação.",
  muitos_cadastros: "Muitos cadastros agora. Tente de novo em alguns minutos.",
  captcha_invalido: "Não deu para confirmar que é você. Tente de novo.",
  link_nao_encontrado: "Este link de cadastro não vale mais. Peça outro ao seu profissional.",
  conta_real_no_staging: "Este é o ambiente de teste: só e-mails de teste.",
};

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await principal.functions.invoke("alunos", { body: corpo });
  if (error) {
    const ctx = (error as { context?: Response })?.context;
    let c: Record<string, unknown> | null = null;
    try {
      c = ctx && typeof ctx.json === "function" ? ((await ctx.clone().json()) as Record<string, unknown>) : null;
    } catch {
      c = null;
    }
    throw new Error(String(c?.erro ?? "erro_interno"));
  }
  return data as T;
}

/**
 * /c/:codigo (N-57, spec 4.8): o auto-cadastro pelo link do profissional. A pessoa preenche nome e contato; o cadastro fica
 * PENDENTE em Alunos › Pendentes até o profissional aprovar (dentro do limite do plano). Sem login; o captcha invisível
 * (Turnstile, o mesmo da W8b) é conferido no servidor.
 */
export default function Cadastro() {
  const { codigo = "" } = useParams();
  const info = useQuery({
    queryKey: ["cadastro-link", codigo],
    queryFn: () => chamar<InfoLink>({ acao: "cadastro_info", codigo }),
    retry: false,
    staleTime: Infinity,
  });
  const captcha = useCaptcha("cadastro");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [genero, setGenero] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  // W16b: o e-mail já é de um aluno (em qualquer conta) → mensagem vermelha embaixo do campo (sem dizer de quem)
  const [emailExiste, setEmailExiste] = useState(false);
  const [indo, setIndo] = useState(false);
  const [feito, setFeito] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro(MENSAGEM.nome_invalido);
    if (!email.trim() && !telefone.trim()) return setErro(MENSAGEM.contato_obrigatorio);
    setIndo(true);
    setErro("");
    try {
      const token = await captcha.obterToken();
      await chamar({
        acao: "cadastro_enviar", codigo, captcha: token,
        dados: { nome: nome.trim(), email: email.trim(), telefone: telefone.trim(), nascimento, genero, observacoes: obs.trim() },
      });
      captcha.usado();
      setFeito(true);
    } catch (err) {
      captcha.usado();
      const codigo = (err as Error).message;
      if (codigo === "cadastro_email_existe") setEmailExiste(true);
      else setErro(MENSAGEM[codigo] ?? "Não deu certo agora. Tente de novo.");
    } finally {
      setIndo(false);
    }
  };

  const casca = (conteudo: React.ReactNode) => (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8 sm:py-12" data-pagina-cadastro={codigo}>
      {conteudo}
    </div>
  );

  if (info.isLoading) return casca(<EstadoCarregando linhas={2} rotulo="Abrindo o cadastro" />);
  if (!info.data?.ok) {
    return casca(
      <EstadoVazio icone={LinkIcon} titulo="Link de cadastro não encontrado" texto="Este link não vale mais. Peça outro ao seu profissional." />,
    );
  }
  const d = info.data;
  if (feito) {
    return casca(
      <Cartao brilho className="flex flex-col items-center gap-3 px-6 py-8 text-center" data-cadastro-enviado>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie text-verde-3">
          <CircleCheck aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.8} />
        </span>
        <h1 className="font-body text-[19px] font-semibold normal-case tracking-[-0.02em] text-texto">Cadastro enviado</h1>
        <p className="text-[13.5px] leading-relaxed text-texto-2">
          {d.profissional} vai conferir os seus dados e aprovar. Depois é só entrar no Physiq com o seu e-mail — ou esperar o contato
          {telefone.trim() ? " pelo telefone que você deixou" : ""}.
        </p>
      </Cartao>,
    );
  }
  return casca(
    <>
      <Cartao brilho className="flex items-center gap-3.5 px-5 py-4" data-cadastro-profissional>
        <Avatar src={d.foto_url} nome={d.profissional} tamanho={48} />
        <div className="min-w-0">
          <div className="pq-eyebrow">Cadastro de aluno</div>
          <b className="block truncate text-[16px] font-semibold text-texto">{d.profissional}</b>
          <span className="block truncate text-[12.5px] text-texto-3">{d.conta}</span>
        </div>
      </Cartao>
      <Cartao className="p-5">
        <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-3.5" data-form-cadastro-publico>
          <div className="flex items-center gap-2">
            <ClipboardList aria-hidden className="h-4 w-4 text-texto-3" />
            <p className="text-[13px] text-texto-2">Preencha os seus dados. O cadastro fica pendente até o profissional aprovar.</p>
          </div>
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e sobrenome" autoComplete="name" data-cad-nome />
          <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailExiste(false); }} placeholder="seu@email.com"
            autoComplete="email" data-cad-email erro={emailExiste ? MENSAGEM_CADASTRO_EXISTE : undefined} />
          <Campo rotulo="Telefone" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(82) 99999-0000" autoComplete="tel" data-cad-telefone />
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Nascimento" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} data-cad-nascimento />
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-texto-2">Gênero</span>
              <select value={genero} onChange={(e) => setGenero(e.target.value)} data-cad-genero
                className="h-12 w-full rounded-[14px] border border-linha-2 bg-superficie px-3.5 text-[15px] text-texto outline-none focus:border-violeta/60 [&>option]:bg-tela [&>option]:text-texto">
                <option value="">Não informar</option>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="outro">Outro</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-texto-2">Algo que o profissional precisa saber (opcional)</span>
            <textarea value={obs} maxLength={2000} onChange={(e) => setObs(e.target.value)} placeholder="Objetivo, lesões, horários…" data-cad-obs
              className="min-h-[88px] w-full rounded-[14px] border border-linha-2 bg-superficie px-4 py-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60" />
          </label>
          {/* captcha invisível (Turnstile): a caixinha só aparece se o Cloudflare pedir a confirmação */}
          <div ref={captcha.refCaixa} data-captcha={captcha.estado} className="flex justify-center empty:hidden" />
          {erro && <MensagemForm data-cad-erro>{erro}</MensagemForm>}
          <Botao type="submit" variante="w" icone={Send} disabled={indo} data-cad-enviar>{indo ? "Enviando…" : "Enviar cadastro"}</Botao>
        </form>
      </Cartao>
    </>,
  );
}
