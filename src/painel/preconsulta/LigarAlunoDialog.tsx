// Physiq W21 — porta de src/components/respostas-preconsulta/VincularPacienteDialog.tsx do PhysiqNutri (main 294887a) para o painel:
// "Ligar a um aluno". SUGESTÃO automática (mesmo e-mail → mesmo telefone → mesmo nome) com "Usar sugestão", a busca na lista dos alunos
// que VOCÊ vê na conta (P1 — o banco confere de novo ao gravar) e "Cadastrar aluno com estes dados", que usa o MESMO caminho do Novo
// aluno (W13: função `alunos` — limite da faixa, módulos e responsáveis, espelho no Treino) e respeita a trava de e-mail único da
// W16b (mensagem vermelha embaixo do campo). Quem chama recebe a resposta atualizada e o aluno pelo `onLigada`.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dumbbell, Salad, Search, Sparkles, UserCheck, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { conferirDadoLivre } from "@/nucleo/dadoLivre";
import { DICA_REPETIDO, MENSAGEM_REPETIDO, camposDoErro, precisaConferir } from "@/nucleo/dadoRepetido";
import { criarAluno, ErroAlunos, listarAlunos } from "@/painel/alunos/api";
import { FILTROS_PADRAO, limiteAtingido, mensagemErroAlunos, type ListaAlunos, type ModuloAluno } from "@/painel/alunos/regras";
import { CampoSelect, OpcoesPilula, type OpcaoPilula } from "@/painel/configuracoes/pecas/Form";
import { BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { ligarAluno, type AlunoPreconsulta, type RespostaComFormulario } from "./dados";
import { CHAVES_PRECONSULTA } from "./novas";
import { contatoResposta, dadosAlunoDaResposta, filtrarAlunos, sugerirAluno, textoSugestao } from "./respostasUtil";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  resposta: RespostaComFormulario | null;
  alunos: AlunoPreconsulta[];
  contaId: string;
  onLigada: (r: RespostaComFormulario, aluno: AlunoPreconsulta) => void;
}

/** O mesmo do Novo aluno (W13): os módulos que dá para acompanhar nesta conta, conforme quem cadastra. */
function opcoesModulos(lista: ListaAlunos): OpcaoPilula<ModuloAluno>[] {
  const r: OpcaoPilula<ModuloAluno>[] = [];
  const podeTreino = lista.eu.dono ? lista.responsaveis.some((x) => x.papeis.includes("personal")) : lista.eu.personal;
  const podeNutri = lista.eu.dono ? lista.responsaveis.some((x) => x.papeis.includes("nutricionista")) : lista.eu.nutricionista;
  if (lista.conta.modulos.includes("treino")) {
    r.push({ valor: "treino", rotulo: "Treino", dica: "Prescrição e acompanhamento do treino", icone: Dumbbell, desligada: !podeTreino, porque: "Ninguém da equipe atende treino nesta conta" });
  }
  if (lista.conta.modulos.includes("nutricao")) {
    r.push({ valor: "nutricao", rotulo: "Nutrição", dica: "Dieta, prontuário e diário", icone: Salad, desligada: !podeNutri, porque: "Ninguém da equipe atende nutrição nesta conta" });
  }
  return r;
}
const modulosIniciais = (lista: ListaAlunos): ModuloAluno[] =>
  opcoesModulos(lista).filter((o) => !o.desligada && (lista.eu.dono ? true : o.valor === "treino" ? lista.eu.personal : lista.eu.nutricionista)).map((o) => o.valor).slice(0, 1);
const responsavelPadrao = (lista: ListaAlunos, papel: "personal" | "nutricionista"): string =>
  (lista.responsaveis.find((r) => r.eu && r.papeis.includes(papel)) ?? lista.responsaveis.find((r) => r.papeis.includes(papel)))?.id ?? "";

export default function LigarAlunoDialog({ open, onOpenChange, resposta, alunos, contaId, onLigada }: Props) {
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"" | "ligar" | "cadastrar">("");
  const [modo, setModo] = useState<"escolher" | "cadastrar">("escolher");
  const abriuRef = useRef(false);

  // reinicia SÓ ao abrir (o aluno atual, se houver, já vem selecionado)
  useEffect(() => {
    if (open && !abriuRef.current) {
      setBusca("");
      setSelecionado(resposta?.paciente_id ?? "");
      setErro(null);
      setOcupado("");
      setModo("escolher");
    }
    abriuRef.current = open;
  }, [open, resposta]);

  const sugestao = useMemo(() => (resposta ? sugerirAluno(resposta, alunos) : null), [resposta, alunos]);
  const filtrados = useMemo(() => filtrarAlunos(alunos, busca), [alunos, busca]);
  const contato = resposta ? contatoResposta(resposta) : "";
  const trocando = !!resposta?.paciente_id;

  const ligar = async (aluno: AlunoPreconsulta, como: "ligar" | "cadastrar") => {
    if (!resposta) return;
    setOcupado(como);
    setErro(null);
    try {
      const nova = await ligarAluno(resposta.id, aluno.id);
      onLigada(nova, aluno);
      toast.success(como === "cadastrar" ? `${aluno.nome} foi cadastrado e ligado à resposta` : `Resposta ligada a ${aluno.nome}`);
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível ligar o aluno";
      setErro(m);
      toast.error(m);
    } finally {
      setOcupado("");
    }
  };

  const salvar = () => {
    const a = alunos.find((x) => x.id === selecionado);
    if (!a) return setErro("Escolha um aluno (ou cadastre um com os dados da resposta)");
    void ligar(a, "ligar");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-linha-2 bg-tela text-texto sm:max-w-lg sm:rounded-[24px]" data-modal-ligar={resposta?.id ?? ""}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">
            <UserCheck aria-hidden className="h-[18px] w-[18px] text-texto-2" strokeWidth={1.75} /> {trocando ? "Trocar o aluno" : "Ligar a um aluno"}
          </DialogTitle>
          <DialogDescription className="font-body text-[13px] leading-relaxed text-texto-2" data-ligar-resposta>
            Resposta de <b className="font-semibold text-texto">{resposta?.nome}</b>
            {contato ? ` (${contato})` : ""} · {resposta?.titulo}. Ligada a um aluno, ela sai das novas e fica no histórico dele.
          </DialogDescription>
        </DialogHeader>

        {modo === "cadastrar" && resposta ? (
          <CadastrarDaResposta resposta={resposta} contaId={contaId} ocupado={ocupado === "cadastrar"} aoVoltar={() => setModo("escolher")}
            aoCriado={(aluno) => void ligar(aluno, "cadastrar")} />
        ) : (
          <div className="flex flex-col gap-4">
            {sugestao && sugestao.aluno.id !== selecionado && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violeta/35 px-3.5 py-3"
                style={{ background: "linear-gradient(90deg, var(--p-chip-t-fundo), transparent)" }} data-sugestao-aluno={sugestao.aluno.id} data-sugestao-por={sugestao.por}>
                <p className="flex min-w-0 items-center gap-2 text-[13px] text-texto">
                  <Sparkles aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
                  <span className="min-w-0">Parece ser <b className="font-semibold">{sugestao.aluno.nome}</b><span className="text-texto-3"> · {textoSugestao(sugestao.por)}</span></span>
                </p>
                <button type="button" className={BTN_PRI} onClick={() => setSelecionado(sugestao.aluno.id)} data-btn-usar-sugestao>
                  <UserCheck aria-hidden /> Usar sugestão
                </button>
              </div>
            )}

            <div>
              <div className="relative">
                <Search aria-hidden className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
                <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno por nome, e-mail ou telefone"
                  className="h-11 w-full rounded-[14px] border border-linha-2 bg-superficie pl-10 pr-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60"
                  data-busca-aluno-ligar />
              </div>
              <div className="mt-2 max-h-[260px] overflow-y-auto rounded-2xl border border-linha" role="listbox" aria-label="Alunos" data-lista-alunos-ligar>
                {filtrados.length === 0 ? (
                  <p className="px-3.5 py-4 text-[12.5px] text-texto-3" data-alunos-ligar-vazio>
                    {alunos.length ? "Nenhum aluno com essa busca." : "Você ainda não tem alunos nesta conta — cadastre um com os dados da resposta."}
                  </p>
                ) : (
                  <div className="divide-y divide-linha-3">
                    {filtrados.slice(0, 60).map((a) => {
                      const ativo = a.id === selecionado;
                      return (
                        <button key={a.id} type="button" role="option" aria-selected={ativo} onClick={() => setSelecionado(a.id)}
                          className={cn("flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2 text-left transition-colors", ativo ? "bg-superficie-2" : "hover:bg-[rgba(255,255,255,.03)]")}
                          data-opcao-aluno-ligar={a.id}>
                          <Avatar src={a.foto_url} nome={a.nome} tamanho={32} />
                          <span className="min-w-0 flex-1">
                            <b className="block truncate text-[13.5px] font-semibold text-texto">{a.nome}{a.ativo === false ? <span className="font-normal text-texto-3"> · desativado</span> : null}</b>
                            <span className="block truncate text-[12px] text-texto-3">{[a.email, a.telefone].filter(Boolean).join(" · ") || "sem contato"}</span>
                          </span>
                          {ativo && <UserCheck aria-hidden className="h-4 w-4 flex-none text-verde-3" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-linha-2 px-3.5 py-3">
              <p className="min-w-0 text-[12.5px] text-texto-3">
                Não está na lista? Cadastre com o que veio na resposta: <span className="text-texto-2">{dadosAlunoDaResposta(resposta ?? { nome: "", email: "", telefone: "" }).nome || "sem nome"}</span>
              </p>
              <button type="button" className={BTN_SEC} onClick={() => { setErro(null); setModo("cadastrar"); }} disabled={!!ocupado || !resposta?.nome} data-btn-cadastrar-da-resposta>
                <UserPlus aria-hidden /> Cadastrar aluno com estes dados
              </button>
            </div>

            {erro && <MensagemForm data-erro-ligar>{erro}</MensagemForm>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-cancelar-ligar>Cancelar</button>
              <button type="button" className={BTN_PRI} onClick={salvar} disabled={!selecionado || !!ocupado || selecionado === (resposta?.paciente_id ?? "")} data-btn-salvar-ligar>
                <UserCheck aria-hidden /> {ocupado === "ligar" ? "Salvando…" : trocando ? "Trocar o aluno" : "Ligar"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "Cadastrar aluno com estes dados": nome, e-mail e telefone de quem respondeu + módulos e responsáveis (o Novo aluno da W13). */
function CadastrarDaResposta({ resposta, contaId, ocupado, aoVoltar, aoCriado }: {
  resposta: RespostaComFormulario;
  contaId: string;
  ocupado: boolean;
  aoVoltar: () => void;
  aoCriado: (aluno: AlunoPreconsulta) => void;
}) {
  const inicial = useMemo(() => dadosAlunoDaResposta(resposta), [resposta]);
  const lista = useQuery({ queryKey: CHAVES_PRECONSULTA.listaAlunos(contaId), queryFn: () => listarAlunos(contaId, FILTROS_PADRAO, 0, 0), enabled: !!contaId, staleTime: 30_000, retry: 1 });
  const [nome, setNome] = useState(inicial.nome);
  const [email, setEmail] = useState(inicial.email);
  const [telefone, setTelefone] = useState(inicial.telefone);
  const [modulos, setModulos] = useState<ModuloAluno[] | null>(null);
  const [personal, setPersonal] = useState<string | null>(null);
  const [nutri, setNutri] = useState<string | null>(null);
  const [emailRepetido, setEmailRepetido] = useState(false);
  const emailAtual = useRef(inicial.email);
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);
  const l = lista.data;
  const opcoes = useMemo(() => (l ? opcoesModulos(l) : []), [l]);
  const mods = modulos ?? (l ? modulosIniciais(l) : []);
  const pers = personal ?? (l ? responsavelPadrao(l, "personal") : "");
  const nut = nutri ?? (l ? responsavelPadrao(l, "nutricionista") : "");

  // o e-mail que veio na resposta já pode ser de outro aluno (W16b): confere ao abrir e ao sair do campo
  const conferirEmail = async (valor: string) => {
    if (!precisaConferir("email", valor)) return;
    const r = await conferirDadoLivre({ email: valor });
    if (r && emailAtual.current === valor) setEmailRepetido(!r.email_livre);
  };
  useEffect(() => {
    void conferirEmail(inicial.email);
  }, [inicial.email]); // 1 vez, com o e-mail que veio na resposta

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!l) return;
    if (nome.trim().length < 2) return setErro(mensagemErroAlunos("nome_invalido"));
    if (!mods.length && !l.eu.dono) return setErro(mensagemErroAlunos("sem_modulo"));
    if (emailRepetido) return;
    setIndo(true);
    setErro("");
    try {
      const r = await criarAluno(contaId, {
        nome: nome.trim(), email: email.trim() || undefined, telefone: telefone.trim() || undefined, modulos: mods,
        personal_id: mods.includes("treino") ? pers || null : null,
        nutricionista_id: mods.includes("nutricao") ? nut || null : null,
      });
      aoCriado({
        id: r.paciente_id, nome: nome.trim(), apelido: null, email: email.trim() || null, telefone: telefone.trim() || null, ativo: true, foto_url: null,
        personal_id: mods.includes("treino") ? pers || null : null, nutricionista_id: mods.includes("nutricao") ? nut || null : null,
      });
    } catch (err) {
      const codigo = err instanceof ErroAlunos ? err.codigo : null;
      const extra = err instanceof ErroAlunos ? err.extra : {};
      if (camposDoErro(codigo, extra).includes("email")) setEmailRepetido(true);
      else setErro(mensagemErroAlunos(codigo, extra));
    } finally {
      setIndo(false);
    }
  };

  const cheio = l ? limiteAtingido(l.vagas) : false;
  return (
    <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-3.5" data-form-cadastrar-da-resposta>
      <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" data-cadastro-resposta-nome />
      <Campo rotulo="E-mail (opcional)" type="email" value={email} autoComplete="off" data-cadastro-resposta-email
        onChange={(e) => { setEmail(e.target.value); emailAtual.current = e.target.value; setEmailRepetido(false); }} onBlur={() => void conferirEmail(email)}
        erro={emailRepetido ? <>{MENSAGEM_REPETIDO.email} {DICA_REPETIDO}</> : undefined} />
      <Campo rotulo="Telefone (opcional)" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} autoComplete="off" data-cadastro-resposta-telefone />
      {lista.isLoading && <p className="text-[12.5px] text-texto-3">Carregando os módulos da conta…</p>}
      {lista.isError && <MensagemForm>Não deu para carregar a conta agora. Tente de novo.</MensagemForm>}
      {l && opcoes.length > 0 && (
        <OpcoesPilula<ModuloAluno> rotulo="O que você vai acompanhar" nome="modulos-da-resposta" varias colunas={1} opcoes={opcoes} valores={mods} aoMudar={setModulos} />
      )}
      {l?.eu.dono && mods.includes("treino") && (
        <CampoSelect rotulo="Personal responsável" value={pers} onChange={(e) => setPersonal(e.target.value)} data-cadastro-resposta-personal>
          {l.responsaveis.filter((r) => r.papeis.includes("personal")).map((r) => <option key={r.id} value={r.id}>{r.nome}{r.eu ? " (você)" : ""}</option>)}
        </CampoSelect>
      )}
      {l?.eu.dono && mods.includes("nutricao") && (
        <CampoSelect rotulo="Nutricionista responsável" value={nut} onChange={(e) => setNutri(e.target.value)} data-cadastro-resposta-nutri>
          {l.responsaveis.filter((r) => r.papeis.includes("nutricionista")).map((r) => <option key={r.id} value={r.id}>{r.nome}{r.eu ? " (você)" : ""}</option>)}
        </CampoSelect>
      )}
      {cheio && <MensagemForm tom="aviso" data-cadastro-resposta-limite>O plano da conta chegou ao limite de alunos ativos.</MensagemForm>}
      {erro && <MensagemForm data-cadastro-resposta-erro>{erro}</MensagemForm>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" className={BTN_SEC} onClick={aoVoltar} data-btn-voltar-lista>Voltar à lista</button>
        <Botao type="submit" variante="w" tamanho="sm" icone={UserPlus} disabled={indo || ocupado || !l || emailRepetido} data-btn-cadastrar-ligar>
          {indo || ocupado ? "Cadastrando…" : "Cadastrar e ligar"}
        </Botao>
      </div>
    </form>
  );
}
