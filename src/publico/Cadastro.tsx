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
import {
  APELIDO_MAX, EMAIL_MAX, FORM_VAZIO, MENSAGEM, NOME_MAX, OBSERVACOES_MAX, dadosDoCadastro, formatarCPF, problemaDoCadastro,
  type FormCadastro,
} from "./cadastro/regras";

interface InfoLink {
  ok: boolean;
  profissional?: string;
  conta?: string;
  foto_url?: string | null;
  erro?: string;
}

/** O que acontece depois do envio, pelo contato que a pessoa deixou (só o nome é obrigatório). */
function textoDepois(f: FormCadastro): string {
  const email = !!f.email.trim();
  const tel = !!f.telefone.trim();
  if (email && tel) return "Depois é só entrar no Physiq com o seu e-mail — ou esperar o contato pelo telefone que você deixou.";
  if (email) return "Depois é só entrar no Physiq com o seu e-mail.";
  if (tel) return "Depois é só esperar o contato pelo telefone que você deixou.";
  return "Depois é só esperar o contato do profissional.";
}

/** O erro da função alunos: o código. */
class ErroCadastro extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

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
    throw new ErroCadastro(String(c?.erro ?? "erro_interno"));
  }
  return data as T;
}

/**
 * /c/:codigo (N-57, spec 4.8): o auto-cadastro pelo link do profissional. O cadastro fica PENDENTE em Alunos › Pendentes até o
 * profissional aprovar (dentro do limite do plano). Sem login; o captcha invisível (Turnstile, o mesmo da W8b) é conferido no
 * servidor. H5 (DN-6): os campos do Nutri voltaram (apelido e CPF); só o nome é obrigatório, como lá; e-mail ou CPF que já é de um
 * aluno vira pendente como os outros: a tela não diz se a pessoa já é aluna (homologação, H-18) — o profissional vê o aviso ao aprovar.
 * hml-12 (H-30): o banco recusa menor de 16 (`menor_de_16`, com a versão dos textos ligada) e, no staging, a linha da idade mínima e
 * da Política fica antes do envio (P9: sem caixa de consentimento — é o procedimento preliminar com o profissional).
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
  const [f, setF] = useState<FormCadastro>(FORM_VAZIO);
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);
  const [feito, setFeito] = useState(false);
  const muda = <K extends keyof FormCadastro>(k: K, v: FormCadastro[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (erro) setErro("");
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = problemaDoCadastro(f);
    if (problema) return setErro(MENSAGEM[problema] ?? "Confira os dados.");
    setIndo(true);
    setErro("");
    try {
      const token = await captcha.obterToken();
      await chamar({ acao: "cadastro_enviar", codigo, captcha: token, dados: dadosDoCadastro(f) });
      captcha.usado();
      setFeito(true);
    } catch (err) {
      captcha.usado();
      const cod = err instanceof ErroCadastro ? err.codigo : "erro_interno";
      setErro(MENSAGEM[cod] ?? "Não deu certo agora. Tente de novo.");
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
          {d.profissional} vai conferir os seus dados e aprovar. {textoDepois(f)}
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
            <p className="text-[13px] text-texto-2" data-cad-so-nome>Preencha os seus dados — só o nome é obrigatório. O cadastro fica pendente até o profissional aprovar.</p>
          </div>
          <Campo rotulo="Nome" value={f.nome} maxLength={NOME_MAX} onChange={(e) => muda("nome", e.target.value)} placeholder="Nome e sobrenome" autoComplete="name" data-cad-nome />
          <Campo rotulo="Como prefere ser chamado(a)" value={f.apelido} maxLength={APELIDO_MAX} onChange={(e) => muda("apelido", e.target.value)} autoComplete="nickname" data-cad-apelido />
          <Campo rotulo="E-mail" type="email" value={f.email} maxLength={EMAIL_MAX} onChange={(e) => muda("email", e.target.value)} placeholder="seu@email.com"
            autoComplete="email" data-cad-email />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Campo rotulo="Telefone" inputMode="tel" value={f.telefone} onChange={(e) => muda("telefone", e.target.value)} placeholder="(82) 99999-0000" autoComplete="tel" data-cad-telefone />
            <Campo rotulo="CPF" inputMode="numeric" value={f.cpf} onChange={(e) => muda("cpf", formatarCPF(e.target.value))} placeholder="000.000.000-00" autoComplete="off"
              data-cad-cpf />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Nascimento" type="date" value={f.nascimento} onChange={(e) => muda("nascimento", e.target.value)} data-cad-nascimento />
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-texto-2">Gênero</span>
              <select value={f.genero} onChange={(e) => muda("genero", e.target.value)} data-cad-genero
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
            <textarea value={f.observacoes} maxLength={OBSERVACOES_MAX} onChange={(e) => muda("observacoes", e.target.value)} placeholder="Objetivo, lesões, horários…" data-cad-obs
              className="min-h-[88px] w-full rounded-[14px] border border-linha-2 bg-superficie px-4 py-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60" />
          </label>
          {/* hml-12 (H-30, P9): a idade mínima e para onde vão os dados — SÓ no build de staging até a virada */}
          {import.meta.env.VITE_DB_SCHEMA === "staging" && (
            <p className="text-[12px] leading-relaxed text-texto-3" data-aviso-idade-cadastro>
              O Physiq é para quem tem 16 anos ou mais. Os seus dados vão para {d.profissional ?? "o profissional"}, que cuida deles no seu
              atendimento — veja a{" "}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-semibold text-violeta-3 underline-offset-2 hover:underline">
                Política de Privacidade
              </a>
              .
            </p>
          )}
          {/* captcha invisível (Turnstile): a caixinha só aparece se o Cloudflare pedir a confirmação */}
          <div ref={captcha.refCaixa} data-captcha={captcha.estado} className="flex justify-center empty:hidden" />
          {erro && <MensagemForm data-cad-erro>{erro}</MensagemForm>}
          <Botao type="submit" variante="w" icone={Send} disabled={indo} data-cad-enviar>{indo ? "Enviando…" : "Enviar cadastro"}</Botao>
        </form>
      </Cartao>
    </>,
  );
}
