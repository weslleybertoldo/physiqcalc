// Physiq W21 — porta de src/components/respostas-preconsulta/VincularPacienteDialog.tsx do PhysiqNutri (main 294887a) para o painel:
// "Ligar a um aluno". SUGESTÃO automática (mesmo e-mail → mesmo telefone → mesmo nome) com "Usar sugestão", a busca dos alunos
// que VOCÊ vê na conta (P1 — o banco confere de novo ao gravar) e "Cadastrar aluno com estes dados", que usa o MESMO caminho do Novo
// aluno (W13: função `alunos` — limite da faixa, módulos e responsáveis, espelho no Treino) e respeita a trava de e-mail único da
// W16b (mensagem vermelha embaixo do campo). Quem chama recebe a resposta atualizada e o aluno pelo `onLigada`.
// hml-14b (B19): a busca e a sugestão vão ao BANCO (SeletorDeAluno: nome, apelido, e-mail, telefone e CPF, sem acento, 20 por vez);
// sem a lista de até 1000 alunos que vinha pela prop `alunos` (saiu).
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dumbbell, Salad, Sparkles, UserCheck, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { conferirDadoLivre } from "@/nucleo/dadoLivre";
import { DICA_REPETIDO, MENSAGEM_REPETIDO, camposDoErro, precisaConferir } from "@/nucleo/dadoRepetido";
import { buscarAlunosDoSeletor, criarAluno, ErroAlunos } from "@/painel/alunos/api";
import { limiteAtingido, mensagemErroAlunos, type AlunoDoSeletor, type ListaAlunos, type ModuloAluno } from "@/painel/alunos/regras";
import { SeletorDeAluno } from "@/painel/alunos/SeletorDeAluno";
import { useResumoAlunos } from "@/painel/alunos/useResumoAlunos";
import { useAlunoDoSeletor, useGuardarAlunoDoSeletor } from "@/painel/alunos/useSeletorDeAluno";
import { CampoSelect, OpcoesPilula, type OpcaoPilula } from "@/painel/configuracoes/pecas/Form";
import { BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import { Botao } from "@/ui/premium/Botao";
import { ligarAluno, type AlunoPreconsulta, type RespostaComFormulario } from "./dados";
import { TELEFONE_DIGITOS_MIN, apenasDigitos, contatoResposta, dadosAlunoDaResposta, sugerirAluno, textoSugestao, type Sugestao } from "./respostasUtil";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  resposta: RespostaComFormulario | null;
  contaId: string;
  onLigada: (r: RespostaComFormulario, aluno: AlunoPreconsulta) => void;
}

/** O aluno do seletor no formato que a pré-consulta devolve a quem chama. */
const paraAlunoPreconsulta = (a: AlunoDoSeletor): AlunoPreconsulta => ({
  id: a.id, nome: a.nome, apelido: a.apelido, email: a.email, telefone: a.telefone, ativo: a.ativo, foto_url: a.foto_url,
  personal_id: a.personal_id, nutricionista_id: a.nutricionista_id,
});

/** Até quantos alunos cada busca da sugestão olha (o e-mail, o telefone e o nome são termos estreitos). */
const LIMITE_SUGESTAO = 50;

/**
 * hml-14b (B19): a sugestão sem a lista inteira — busca no banco pelo e-mail, pelos 8 últimos dígitos do telefone (tolera o DDI,
 * como a regra) e pelo nome, nessa ordem, e aplica a MESMA regra (sugerirAluno) ao que voltou; para no 1º que achar.
 */
async function sugerirNoBanco(contaId: string, r: RespostaComFormulario): Promise<Sugestao<AlunoDoSeletor> | null> {
  const tel = apenasDigitos(r.telefone);
  const termos = [(r.email ?? "").trim(), tel.length >= TELEFONE_DIGITOS_MIN ? tel.slice(-TELEFONE_DIGITOS_MIN) : "", (r.nome ?? "").trim()].filter(Boolean);
  const vistos = new Map<string, AlunoDoSeletor>();
  for (const termo of termos) {
    const { itens } = await buscarAlunosDoSeletor(contaId, termo, "todos", LIMITE_SUGESTAO);
    for (const a of itens) vistos.set(a.id, a);
    const s = sugerirAluno(r, [...vistos.values()]);
    if (s) return s;
  }
  return null;
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

export default function LigarAlunoDialog({ open, onOpenChange, resposta, contaId, onLigada }: Props) {
  const [selecionado, setSelecionado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"" | "ligar" | "cadastrar">("");
  const [modo, setModo] = useState<"escolher" | "cadastrar">("escolher");
  const abriuRef = useRef(false);
  const guardar = useGuardarAlunoDoSeletor();
  const escolhido = useAlunoDoSeletor(contaId, selecionado || null);

  // reinicia SÓ ao abrir (o aluno atual, se houver, já vem selecionado)
  useEffect(() => {
    if (open && !abriuRef.current) {
      setSelecionado(resposta?.paciente_id ?? "");
      setErro(null);
      setOcupado("");
      setModo("escolher");
    }
    abriuRef.current = open;
  }, [open, resposta]);

  const sugestaoQ = useQuery({
    queryKey: ["preconsulta", "sugestao-aluno", contaId, resposta?.id ?? "", resposta?.email ?? "", resposta?.telefone ?? "", resposta?.nome ?? ""],
    queryFn: () => sugerirNoBanco(contaId, resposta as RespostaComFormulario),
    enabled: open && !!resposta && !!contaId,
    staleTime: 30_000,
    retry: 0,
  });
  const sugestao = sugestaoQ.data ?? null;
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
    if (!selecionado) return setErro("Escolha um aluno (ou cadastre um com os dados da resposta)");
    // o escolhido na busca já está no cache; sem ele (raro), liga pelo id do mesmo jeito
    const a = escolhido.data;
    void ligar(a ? paraAlunoPreconsulta(a) : {
      id: selecionado, nome: "o aluno", apelido: null, email: null, telefone: null, ativo: true, foto_url: null, personal_id: null, nutricionista_id: null,
    }, "ligar");
  };

  const usarSugestao = (a: AlunoDoSeletor) => {
    guardar(contaId, a);
    setSelecionado(a.id);
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
                <button type="button" className={BTN_PRI} onClick={() => usarSugestao(sugestao.aluno)} data-btn-usar-sugestao>
                  <UserCheck aria-hidden /> Usar sugestão
                </button>
              </div>
            )}

            {/* hml-14b (B19): a busca no banco (a lista fica aberta, como era); não achou → "Cadastrar aluno" com os dados da resposta */}
            <SeletorDeAluno campo="ligar" contaId={contaId} valor={selecionado || null} situacao="todos" listaSempreAberta
              rotulo="Buscar aluno para ligar" aoMudar={(a) => { setErro(null); setSelecionado(a?.id ?? ""); }}
              aoCadastrar={resposta?.nome && !ocupado ? () => { setErro(null); setModo("cadastrar"); } : undefined} />

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
  // hml-17 (H-53): a mesma consulta do número do menu e do Dashboard (useResumoAlunos — 1 pedido, não 3)
  const lista = useResumoAlunos(contaId);
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
