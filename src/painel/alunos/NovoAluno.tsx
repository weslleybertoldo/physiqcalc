import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, ClipboardList, Copy, Dumbbell, Mail, MessageCircle, RotateCw, Salad, Send, Share2, TriangleAlert, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { CampoSelect, OpcoesPilula, type OpcaoPilula } from "@/painel/configuracoes/pecas/Form";
import { linkWhatsApp, textoDoLink, TEXTO_CONVITE_ALUNO } from "@/painel/configuracoes/equipe/regras";
import { useMeuLink } from "./meuLink";
import { mensagemLimite } from "@/nucleo/cobranca/regras";
import { camposDoErro, DICA_REPETIDO, MENSAGEM_REPETIDO, precisaConferir } from "@/nucleo/dadoRepetido";
import { conferirDadoLivre } from "@/nucleo/dadoLivre";
import {
  cancelarConviteAluno,
  convidarAluno,
  criarAluno,
  ErroAlunos,
  listarConvites,
  reenviarConviteAluno,
  type ConviteAluno,
  type ResultadoConviteAluno,
} from "./api";
import { limiteAtingido, mensagemErroAlunos, textoVagas, type ListaAlunos, type ModuloAluno } from "./regras";

type Aba = "cadastrar" | "convidar" | "link";

async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie.");
  }
}

async function compartilhar(link: string) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Physiq", text: TEXTO_CONVITE_ALUNO, url: link });
      return;
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return;
    }
  }
  await copiar(link, "Link copiado! Cole no WhatsApp do aluno.");
}

function dataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function AvisoLimite({ lista }: { lista: ListaAlunos }) {
  const cheio = limiteAtingido(lista.vagas);
  return (
    <div
      data-novo-vagas={cheio ? "cheio" : "ok"}
      className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px] leading-relaxed ${cheio ? "border-ambar/35 text-texto" : "border-linha text-texto-2"}`}
      style={cheio ? { background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" } : undefined}
    >
      {cheio ? <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" /> : <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 flex-none text-verde-3" />}
      <span>
        {cheio && lista.vagas.limite
          ? `${mensagemLimite(lista.vagas.limite, lista.eu.dono, lista.conta.dono_nome)}${lista.eu.dono ? ` (${lista.vagas.em_uso} de ${lista.vagas.limite} em uso)` : ""}`
          : lista.eu.dono
            ? `Plano da conta: ${textoVagas(lista.vagas)}.`
            : lista.vagas.limite ? `O plano da conta permite ${lista.vagas.limite} alunos ativos.` : "O plano da conta não tem limite de alunos."}
      </span>
    </div>
  );
}

function opcoesModulos(lista: ListaAlunos): OpcaoPilula<ModuloAluno>[] {
  const r: OpcaoPilula<ModuloAluno>[] = [];
  const podeTreino = lista.eu.dono ? lista.responsaveis.some((x) => x.papeis.includes("personal")) : lista.eu.personal;
  const podeNutri = lista.eu.dono ? lista.responsaveis.some((x) => x.papeis.includes("nutricionista")) : lista.eu.nutricionista;
  if (lista.conta.modulos.includes("treino")) {
    r.push({ valor: "treino", rotulo: "Treino", dica: "Prescrição e acompanhamento do treino", icone: Dumbbell, desligada: !podeTreino,
      porque: "Ninguém da equipe atende treino nesta conta" });
  }
  if (lista.conta.modulos.includes("nutricao")) {
    r.push({ valor: "nutricao", rotulo: "Nutrição", dica: "Dieta, prontuário e diário", icone: Salad, desligada: !podeNutri,
      porque: "Ninguém da equipe atende nutrição nesta conta" });
  }
  return r;
}

function modulosIniciais(lista: ListaAlunos): ModuloAluno[] {
  return opcoesModulos(lista).filter((o) => !o.desligada && (lista.eu.dono ? true : o.valor === "treino" ? lista.eu.personal : lista.eu.nutricionista)).map((o) => o.valor).slice(0, 1);
}

function responsavelPadrao(lista: ListaAlunos, papel: "personal" | "nutricionista"): string {
  const eu = lista.responsaveis.find((r) => r.eu && r.papeis.includes(papel));
  return (eu ?? lista.responsaveis.find((r) => r.papeis.includes(papel)))?.id ?? "";
}

/**
 * Novo aluno (C28, N-10; spec 4.4): cadastrar (nome, e-mail, telefone, módulos e responsáveis — o acesso com e-mail e senha é
 * o card "Acesso do aluno" no perfil), convidar por e-mail (o aceite é no 1º login com aquele e-mail — C7) com os convites
 * pendentes, e o link/código do profissional (entra e já cai na lista) e o link de cadastro /c/ (fica pendente para aprovar).
 * O limite da faixa aparece aqui e o servidor recusa o que passar dele (C96).
 */
export function NovoAluno({ aberto, aoMudar, lista, abaInicial = "cadastrar", aoMudou }: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  lista: ListaAlunos;
  abaInicial?: Aba;
  aoMudou: () => void;
}) {
  const celular = useIsMobile();
  const [aba, setAba] = useState<Aba>(abaInicial);
  useEffect(() => {
    if (aberto) setAba(abaInicial);
  }, [aberto, abaInicial]);
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} lado={celular ? "baixo" : "direita"} titulo="Novo aluno" className="sm:w-[min(480px,94vw)]">
      <div className="flex flex-col gap-4 pt-1" data-novo-aluno={aba}>
        <Segmentado<Aba>
          rotulo="Como adicionar"
          valor={aba}
          aoMudar={setAba}
          opcoes={[{ valor: "cadastrar", rotulo: "Cadastrar" }, { valor: "convidar", rotulo: "Convidar" }, { valor: "link", rotulo: "Link e código" }]}
          className="self-start"
        />
        <AvisoLimite lista={lista} />
        {aba === "cadastrar" && <Cadastrar lista={lista} aoMudou={aoMudou} aoFechar={() => aoMudar(false)} />}
        {aba === "convidar" && <Convidar lista={lista} aoMudou={aoMudou} />}
        {aba === "link" && <LinkECodigo />}
      </div>
    </PainelDeslizante>
  );
}

function Responsaveis({ lista, modulos, personal, setPersonal, nutri, setNutri }: {
  lista: ListaAlunos;
  modulos: ModuloAluno[];
  personal: string;
  setPersonal: (v: string) => void;
  nutri: string;
  setNutri: (v: string) => void;
}) {
  if (!lista.eu.dono) return null;
  return (
    <>
      {modulos.includes("treino") && (
        <CampoSelect rotulo="Personal responsável" value={personal} onChange={(e) => setPersonal(e.target.value)} data-novo-personal>
          {lista.responsaveis.filter((r) => r.papeis.includes("personal")).map((r) => <option key={r.id} value={r.id}>{r.nome}{r.eu ? " (você)" : ""}</option>)}
        </CampoSelect>
      )}
      {modulos.includes("nutricao") && (
        <CampoSelect rotulo="Nutricionista responsável" value={nutri} onChange={(e) => setNutri(e.target.value)} data-novo-nutri>
          {lista.responsaveis.filter((r) => r.papeis.includes("nutricionista")).map((r) => <option key={r.id} value={r.id}>{r.nome}{r.eu ? " (você)" : ""}</option>)}
        </CampoSelect>
      )}
    </>
  );
}

function Cadastrar({ lista, aoMudou, aoFechar }: { lista: ListaAlunos; aoMudou: () => void; aoFechar: () => void }) {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [modulos, setModulos] = useState<ModuloAluno[]>(() => modulosIniciais(lista));
  const [personal, setPersonal] = useState(() => responsavelPadrao(lista, "personal"));
  const [nutri, setNutri] = useState(() => responsavelPadrao(lista, "nutricionista"));
  const [erro, setErro] = useState("");
  // W16b: e-mail de outro aluno (em qualquer conta) → mensagem vermelha embaixo do campo
  const [emailRepetido, setEmailRepetido] = useState(false);
  const emailAtual = useRef("");
  const [indo, setIndo] = useState(false);
  const [feito, setFeito] = useState<{ nome: string; rota: string } | null>(null);
  const opcoes = useMemo(() => opcoesModulos(lista), [lista]);

  const conferirEmail = async () => {
    const valor = email;
    if (!precisaConferir("email", valor)) return;
    const r = await conferirDadoLivre({ email: valor });
    // a resposta só vale se o e-mail ainda é o mesmo (a pessoa pode ter continuado digitando)
    if (r && emailAtual.current === valor) setEmailRepetido(!r.email_livre);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro(mensagemErroAlunos("nome_invalido"));
    if (!modulos.length && !lista.eu.dono) return setErro(mensagemErroAlunos("sem_modulo"));
    if (emailRepetido) return;
    setIndo(true);
    setErro("");
    try {
      const r = await criarAluno(lista.conta.id, {
        nome: nome.trim(), email: email.trim() || undefined, telefone: telefone.trim() || undefined, modulos,
        personal_id: modulos.includes("treino") ? personal || null : null,
        nutricionista_id: modulos.includes("nutricao") ? nutri || null : null,
      });
      setFeito({ nome: nome.trim(), rota: `/painel/alunos/${encodeURIComponent(r.rota_id)}` });
      toast.success(`${nome.trim()} entrou na lista.`);
      aoMudou();
    } catch (err) {
      const codigo = err instanceof ErroAlunos ? err.codigo : null;
      const extra = err instanceof ErroAlunos ? err.extra : {};
      if (camposDoErro(codigo, extra).includes("email")) setEmailRepetido(true);
      else setErro(mensagemErroAlunos(codigo, extra));
    } finally {
      setIndo(false);
    }
  };

  if (feito) {
    return (
      <div className="flex flex-col gap-3" data-novo-feito>
        <div className="flex items-start gap-2.5 rounded-2xl border border-verde/30 px-3.5 py-3 text-[13px] text-texto" style={{ background: "linear-gradient(90deg, var(--p-chip-n-fundo), transparent)" }}>
          <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 flex-none text-verde-3" />
          <span><b>{feito.nome}</b> foi cadastrado. Para ele entrar no app, crie o acesso com e-mail e senha no card "Acesso do aluno" do perfil — ou convide pelo e-mail.</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="w" onClick={() => { aoFechar(); navigate(feito.rota); }} data-novo-abrir>Abrir o aluno</Botao>
          <Botao icone={UserPlus} onClick={() => { setFeito(null); setNome(""); setEmail(""); emailAtual.current = ""; setTelefone(""); setEmailRepetido(false); }} data-novo-outro>Cadastrar outro</Botao>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-3.5" data-form-cadastrar>
      <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e sobrenome" autoComplete="off" data-novo-nome />
      <Campo rotulo="E-mail (opcional)" type="email" value={email} onChange={(e) => { setEmail(e.target.value); emailAtual.current = e.target.value; setEmailRepetido(false); }}
        onBlur={() => void conferirEmail()} placeholder="email@do.aluno" autoComplete="off" data-novo-email
        erro={emailRepetido ? <>{MENSAGEM_REPETIDO.email} {DICA_REPETIDO}</> : undefined} />
      <Campo rotulo="Telefone (opcional)" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(82) 99999-0000" autoComplete="off" data-novo-telefone />
      {opcoes.length > 0 && (
        <OpcoesPilula<ModuloAluno> rotulo="O que você vai acompanhar" nome="modulos-novo" varias colunas={1} opcoes={opcoes} valores={modulos} aoMudar={setModulos} />
      )}
      <Responsaveis lista={lista} modulos={modulos} personal={personal} setPersonal={setPersonal} nutri={nutri} setNutri={setNutri} />
      {/* hml-12 (H-30): a regra dos menores (o consentimento do responsável fica na ficha) — SÓ no build de staging até a virada */}
      {import.meta.env.VITE_DB_SCHEMA === "staging" && (
        <p className="text-[12px] leading-relaxed text-texto-3" data-novo-aviso-idade>
          Aluno de 16 ou 17 anos? Registre o consentimento do responsável na ficha dele.
        </p>
      )}
      {erro && <MensagemForm data-novo-erro>{erro}</MensagemForm>}
      <Botao type="submit" variante="w" icone={UserPlus} disabled={indo} data-novo-cadastrar>{indo ? "Cadastrando…" : "Cadastrar aluno"}</Botao>
    </form>
  );
}

function Convidar({ lista, aoMudou }: { lista: ListaAlunos; aoMudou: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [modulos, setModulos] = useState<ModuloAluno[]>(() => modulosIniciais(lista));
  const [resp, setResp] = useState(() => responsavelPadrao(lista, modulosIniciais(lista)[0] === "nutricao" ? "nutricionista" : "personal"));
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);
  const [feito, setFeito] = useState<ResultadoConviteAluno | null>(null);
  const opcoes = useMemo(() => opcoesModulos(lista), [lista]);
  const convites = useQuery({ queryKey: ["alunos-convites", lista.conta.id], queryFn: () => listarConvites(lista.conta.id), staleTime: 15_000 });
  const pendentes = (convites.data ?? []).filter((c) => c.status === "pendente");
  // o mesmo responsável vale para os módulos do convite (o aceite põe ele nos dois)
  const candidatos = lista.responsaveis.filter((r) => modulos.every((m) => r.papeis.includes(m === "treino" ? "personal" : "nutricionista")));
  useEffect(() => {
    if (lista.eu.dono && candidatos.length && !candidatos.some((c) => c.id === resp)) setResp(candidatos[0].id);
  }, [candidatos, resp, lista.eu.dono]);

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["alunos-convites", lista.conta.id] });
    aoMudou();
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro(mensagemErroAlunos("email_invalido"));
    if (!modulos.length) return setErro(mensagemErroAlunos("sem_modulo"));
    setIndo(true);
    setErro("");
    setFeito(null);
    try {
      const r = await convidarAluno(lista.conta.id, email, modulos, lista.eu.dono ? resp || null : null);
      setFeito(r);
      setEmail("");
      recarregar();
    } catch (err) {
      setErro(mensagemErroAlunos(err instanceof ErroAlunos ? err.codigo : null, err instanceof ErroAlunos ? err.extra : {}));
    } finally {
      setIndo(false);
    }
  };

  const agir = async (c: ConviteAluno, acao: "reenviar" | "cancelar") => {
    try {
      if (acao === "cancelar") {
        await cancelarConviteAluno(c.id);
        toast.success(`Convite de ${c.email} cancelado.`);
      } else {
        const r = await reenviarConviteAluno(c.id);
        toast.success(r.email_enviado ? `Convite reenviado para ${c.email}.` : "Convite renovado (o e-mail não saiu: mande o link pelo WhatsApp).");
      }
      recarregar();
    } catch (err) {
      toast.error(mensagemErroAlunos(err instanceof ErroAlunos ? err.codigo : null, err instanceof ErroAlunos ? err.extra : {}));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-3.5" data-form-convidar>
        <Campo rotulo="E-mail do aluno" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@do.aluno" autoComplete="off" data-convite-email
          dica="O aluno entra no Physiq com este e-mail (pelo Google) e já cai na sua lista." />
        {opcoes.length > 0 && (
          <OpcoesPilula<ModuloAluno> rotulo="O que você vai acompanhar" nome="modulos-convite" varias colunas={1} opcoes={opcoes} valores={modulos} aoMudar={setModulos} />
        )}
        {lista.eu.dono && candidatos.length > 0 && (
          <CampoSelect rotulo="Quem vai acompanhar" value={resp} onChange={(e) => setResp(e.target.value)} data-convite-responsavel>
            {candidatos.map((r) => <option key={r.id} value={r.id}>{r.nome}{r.eu ? " (você)" : ""}</option>)}
          </CampoSelect>
        )}
        {erro && <MensagemForm data-convite-erro>{erro}</MensagemForm>}
        {feito && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-verde/30 px-3.5 py-3 text-[13px] text-texto" style={{ background: "linear-gradient(90deg, var(--p-chip-n-fundo), transparent)" }} data-convite-feito={feito.email_enviado ? "enviado" : "sem-email"}>
            <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 flex-none text-verde-3" />
            <span>
              {feito.reenvio ? "Convite renovado" : "Convite registrado"} para <b>{feito.email}</b>.{" "}
              {feito.email_enviado
                ? feito.email_teste ? "Conta de teste: o e-mail foi para a caixa de teste." : "Enviamos o e-mail com o link."
                : "O e-mail não saiu agora — mande o seu link pelo WhatsApp (aba Link e código)."}
            </span>
          </div>
        )}
        <Botao type="submit" variante="w" icone={Send} disabled={indo} data-convite-enviar>{indo ? "Enviando…" : "Enviar convite"}</Botao>
      </form>
      <div className="flex flex-col" data-convites-pendentes={pendentes.length}>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="pq-eyebrow">Convites pendentes</span>
          <Chip tom="g">{pendentes.length}</Chip>
        </div>
        {convites.isLoading ? (
          <p className="text-[13px] text-texto-3">Carregando…</p>
        ) : pendentes.length === 0 ? (
          <p className="text-[13px] text-texto-3">Nenhum convite esperando.</p>
        ) : (
          pendentes.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-t border-linha-3 py-2.5 first:border-t-0" data-convite-pendente={c.id} data-convite-pendente-email={c.email}>
              <Mail aria-hidden className="h-4 w-4 flex-none text-texto-3" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-texto">{c.email}</div>
                <div className="truncate text-[12px] text-texto-3">
                  {c.modulos.map((m) => (m === "treino" ? "Treino" : "Nutrição")).join(" + ")} · enviado {dataHora(c.enviado_em)}
                  {c.responsavel?.nome ? ` · ${c.responsavel.nome}` : ""}
                </div>
              </div>
              <button type="button" className="pq-ibtn" style={{ width: 34, height: 34, borderRadius: 11 }} aria-label={`Reenviar para ${c.email}`} title="Reenviar" onClick={() => void agir(c, "reenviar")} data-convite-reenviar={c.id}>
                <RotateCw aria-hidden />
              </button>
              <button type="button" className="pq-ibtn" style={{ width: 34, height: 34, borderRadius: 11 }} aria-label={`Cancelar o convite de ${c.email}`} title="Cancelar" onClick={() => void agir(c, "cancelar")} data-convite-cancelar={c.id}>
                <X aria-hidden />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LinkECodigo() {
  const m = useMeuLink();
  if (m.carregando) return <p className="text-[13px] text-texto-3">Carregando o seu código…</p>;
  if (!m.codigo) return <MensagemForm>Não deu para carregar o seu código agora. Tente de novo.</MensagemForm>;
  return (
    <div className="flex flex-col gap-4" data-link-codigo={m.codigo}>
      <p className="text-[13px] leading-relaxed text-texto-2">{textoDoLink(m.papeis, m.contaNome)}</p>
      <div>
        <span className="text-[12.5px] font-semibold text-texto-2">Código</span>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex h-12 flex-1 items-center rounded-[14px] border border-linha-2 bg-superficie px-4 text-[16px] font-semibold tracking-[0.06em] text-texto" data-link-codigo-texto>{m.codigo}</span>
          <Botao icone={Copy} onClick={() => void copiar(m.codigo!, "Código copiado!")}>Copiar</Botao>
        </div>
      </div>
      <div>
        <span className="text-[12.5px] font-semibold text-texto-2">Link de convite (entra e já cai na sua lista)</span>
        <input readOnly value={m.link} onFocus={(e) => e.currentTarget.select()} data-link-convite
          className="mt-1.5 h-12 w-full rounded-[14px] border border-linha-2 bg-superficie px-4 text-[14px] text-texto outline-none" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Botao variante="w" icone={Copy} onClick={() => void copiar(m.link, "Link copiado!")} data-link-copiar>Copiar link</Botao>
          <Botao icone={Share2} onClick={() => void compartilhar(m.link)}>Compartilhar</Botao>
          <a href={linkWhatsApp(m.link)} target="_blank" rel="noopener noreferrer" className="pq-botao pq-botao-g"><MessageCircle aria-hidden /> WhatsApp</a>
        </div>
      </div>
      <div>
        <span className="text-[12.5px] font-semibold text-texto-2">Link de cadastro (a pessoa preenche e você aprova em Pendentes)</span>
        <input readOnly value={m.linkCadastro} onFocus={(e) => e.currentTarget.select()} data-link-cadastro
          className="mt-1.5 h-12 w-full rounded-[14px] border border-linha-2 bg-superficie px-4 text-[14px] text-texto outline-none" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Botao icone={ClipboardList} onClick={() => void copiar(m.linkCadastro, "Link de cadastro copiado!")} data-link-cadastro-copiar>Copiar link de cadastro</Botao>
        </div>
      </div>
    </div>
  );
}
