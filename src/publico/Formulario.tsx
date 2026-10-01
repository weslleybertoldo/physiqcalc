import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, ClipboardList, SearchX, Send } from "lucide-react";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import {
  contarRespondidas, lerFaixas, lerNivel, lerPerguntas, normalizarRespostas, pontuacaoMaxima, responder, textoPontuacao, textoRespondidas, type Resposta, type Respostas,
} from "@/nutricao/prontuario/lib/questionariosUtil";
import { carregarFormularioPublico, responderFormularioPublico, type RespostaEnviada } from "@/painel/preconsulta/publico";
import { SeloNivel } from "@/painel/preconsulta/pecas";
import PerguntasResposta from "@/painel/preconsulta/PerguntasResposta";
import { EMAIL_MAX, NOME_MAX, TELEFONE_MAX, mensagemErroRpc, temResultado, textoResultadoPublico, validarRespostaPublica } from "@/painel/preconsulta/preconsultaUtil";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { EstadoCarregando, EstadoVazio } from "@/ui/premium/Estados";

/**
 * /f/:slug (W21 — N-7, N-55, spec 4.8): a pré-consulta PÚBLICA, sem login, igual à de hoje do Nutri — agora no visual do Physiq e
 * para os 2 módulos (o link do personal também). A pessoa vê o título, a descrição e quem mandou, preenche o nome (obrigatório), o
 * e-mail e o telefone, responde as perguntas por tipo e envia. Tudo pelas RPCs security definer do banco principal
 * (preconsulta_formulario / preconsulta_responder), no schema do ambiente (VITE_PRINCIPAL_SCHEMA) — o cliente anônimo não lê nem
 * escreve nas tabelas. Formulário inexistente, inativo ou excluído → a mensagem do Nutri ("Formulário não encontrado ou desativado").
 * Depois de enviar, a mesma aba não reenvia; o resultado só aparece quando o formulário tem faixas (questionário de saúde).
 */
export default function Formulario() {
  const { slug = "" } = useParams();
  const q = useQuery({ queryKey: ["formulario-publico", slug], queryFn: () => carregarFormularioPublico(slug), retry: 1, staleTime: 0, networkMode: "always" });
  const form = q.data ?? null;
  const perguntas = useMemo(() => lerPerguntas(form?.perguntas), [form]);
  const faixas = useMemo(() => lerFaixas(form?.faixas), [form]);
  const max = useMemo(() => pontuacaoMaxima(perguntas), [perguntas]);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [respostas, setRespostas] = useState<Respostas>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<RespostaEnviada | null>(null);
  const respondidas = contarRespondidas(perguntas, respostas);

  useEffect(() => {
    const antes = document.title;
    document.title = form ? `${form.titulo} · Physiq` : "Pré-consulta · Physiq";
    return () => {
      document.title = antes;
    };
  }, [form]);

  const marcar = (id: string, valor: Resposta) => {
    setRespostas((r) => responder(r, id, valor));
    if (erro) setErro(null);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const msg = validarRespostaPublica(nome, email, telefone, perguntas, respostas);
    if (msg) return setErro(msg);
    setErro(null);
    setEnviando(true);
    try {
      const r = await responderFormularioPublico(slug, nome, email, telefone, normalizarRespostas(perguntas, respostas));
      setEnviado(r);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setErro(mensagemErroRpc(err));
    } finally {
      setEnviando(false);
    }
  };

  const casca = (conteudo: React.ReactNode) => (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 sm:py-12" data-pagina-formulario-publico={slug}>
      {conteudo}
    </div>
  );

  if (q.isPending) return casca(<EstadoCarregando linhas={3} rotulo="Abrindo o formulário" />);

  if (!form || q.isError) {
    return casca(
      <div data-formulario-nao-encontrado>
        <EstadoVazio icone={SearchX} titulo="Formulário não encontrado ou desativado" texto="Confira o link ou peça um novo ao seu profissional." />
      </div>,
    );
  }

  if (enviado) {
    const nivel = lerNivel(enviado.nivel);
    const comResultado = temResultado(faixas);
    const texto = textoResultadoPublico({ pontuacao: Number(enviado.pontuacao) || 0, faixa: enviado.faixa ?? "", nivel }, max);
    return casca(
      <Cartao brilho className="flex flex-col items-center gap-3 px-6 py-8 text-center" data-formulario-enviado>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie text-verde-3">
          <CircleCheck aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.8} />
        </span>
        <h1 className="font-body text-[19px] font-semibold normal-case tracking-[-0.02em] text-texto">Respostas enviadas</h1>
        <p className="max-w-md text-[13.5px] leading-relaxed text-texto-2">
          Obrigado, <b className="font-semibold text-texto">{nome.trim()}</b>. Suas respostas de <b className="font-semibold text-texto">{form.titulo}</b> já chegaram
          {form.nutricionista ? <> para <b className="font-semibold text-texto">{form.nutricionista}</b></> : null} e serão vistas na sua consulta.
        </p>
        {comResultado && (
          <div className="mt-1 w-full max-w-sm rounded-2xl border border-linha bg-superficie-3 p-4" data-resultado-publico={texto}>
            <div className="pq-eyebrow">Seu resultado</div>
            <p className="mt-1 text-[22px] font-bold tabular-nums tracking-[-0.02em] text-texto" data-resultado-texto>{textoPontuacao(Number(enviado.pontuacao) || 0, max)}</p>
            <div className="mt-2 flex justify-center"><SeloNivel nivel={nivel} rotulo={enviado.faixa ?? ""} className="h-[24px] text-[11px]" data-resultado-nivel={nivel || "sem"} /></div>
            <p className="mt-2 text-[12px] leading-relaxed text-texto-3">O resultado é uma triagem, não um diagnóstico — converse sobre ele na consulta.</p>
          </div>
        )}
        <p className="text-[12px] text-texto-3">Você já pode fechar esta página.</p>
      </Cartao>,
    );
  }

  return casca(
    <>
      <Cartao brilho className="flex flex-col gap-2 px-5 py-5 sm:px-6" data-formulario-publico-titulo={form.titulo}>
        <div className="pq-eyebrow flex items-center gap-1.5"><ClipboardList aria-hidden className="h-3.5 w-3.5" /> Pré-consulta</div>
        <h1 className="font-body text-[22px] font-bold normal-case tracking-[-0.03em] text-texto sm:text-[26px]">{form.titulo}</h1>
        {form.descricao && <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-texto-2" data-formulario-publico-descricao>{form.descricao}</p>}
        {form.nutricionista && (
          <p className="text-[12.5px] text-texto-3" data-formulario-publico-nutricionista={form.nutricionista}>
            Enviado por <b className="font-semibold text-texto-2">{form.nutricionista}</b>
          </p>
        )}
      </Cartao>

      <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-4" noValidate data-form-publico>
        <Cartao className="flex flex-col gap-3.5 p-5 sm:p-6">
          <h2 className="font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">Seus dados</h2>
          <Campo rotulo="Nome" maxLength={NOME_MAX} placeholder="Como você se chama" value={nome} autoComplete="name" data-campo-nome-publico
            onChange={(e) => { setNome(e.target.value); if (erro) setErro(null); }} />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Campo rotulo="E-mail (opcional)" type="email" maxLength={EMAIL_MAX} placeholder="seu@email.com" value={email} autoComplete="email" data-campo-email-publico
              onChange={(e) => { setEmail(e.target.value); if (erro) setErro(null); }} />
            <Campo rotulo="Telefone (opcional)" type="tel" maxLength={TELEFONE_MAX} placeholder="(00) 00000-0000" value={telefone} autoComplete="tel" data-campo-telefone-publico
              onChange={(e) => { setTelefone(e.target.value); if (erro) setErro(null); }} />
          </div>
        </Cartao>

        <Cartao className="flex flex-col gap-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">Perguntas</h2>
            <span className="text-[12px] font-semibold tabular-nums text-texto-3" data-respondidas={respondidas}>{textoRespondidas(respondidas, perguntas.length)}</span>
          </div>
          <PerguntasResposta perguntas={perguntas} respostas={respostas} onResponder={marcar} desabilitado={enviando} />
        </Cartao>

        {erro && <MensagemForm data-erro-publico>{erro}</MensagemForm>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-texto-3">Suas respostas vão direto para o seu profissional.</p>
          <Botao type="submit" variante="w" icone={Send} disabled={enviando} data-btn-enviar-publico>{enviando ? "Enviando…" : "Enviar respostas"}</Botao>
        </div>
      </form>
    </>,
  );
}
