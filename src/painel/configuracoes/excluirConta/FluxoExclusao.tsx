import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Building2, Check, CreditCard, FileArchive, GraduationCap, LifeBuoy, ShieldCheck, Trash2, TriangleAlert, UserMinus, Users, Wallet,
} from "lucide-react";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { ehLoja } from "@/lib/distribuicao";
import { cn } from "@/lib/utils";
import { useSessao } from "@/nucleo/sessao";
import { CONTATO_SUPORTE, linkDoSuporte } from "@/nucleo/suporte";
import { lembrarArea } from "@/ui/casca/area";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import {
  ErroExclusao, PALAVRA_CONFIRMACAO, conferirExclusaoProfissional, excluirContaProfissional, mensagemErroExclusao, type Conferencia, type ContaDoDono,
} from "./api";
import {
  listaApaga, listaFica, papeisLegiveis, precisaBaixar, prontuariosDaConferencia, resumoDaConfirmacao, textoDosAlunos, textoDosAlunosDaEquipe,
  textosDaCobranca,
} from "./regras";
import { montarZipDeProntuarios, salvarZip, type ZipPronto } from "./zip";

type Passo = "conferindo" | "recusa" | "conferencia" | "baixar" | "confirmar" | "excluindo";

/** O estado que a página /excluir-conta recebe depois de excluir (a tela "Conta excluída"). */
export const ESTADO_EXCLUIDA = "excluida";

function Linha({ icone: Icone, children, tom }: { icone: typeof Users; children: ReactNode; tom?: string }) {
  return (
    <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-texto-2">
      <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-[8px] border border-linha bg-superficie" style={{ color: tom }}>
        <Icone aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 1 Conferir · 2 Baixar (quando há prontuário) · 3 Confirmar */
function Passos({ atual, comBaixar }: { atual: Passo; comBaixar: boolean }) {
  const itens = [{ id: "conferencia", rotulo: "Conferir" }, ...(comBaixar ? [{ id: "baixar", rotulo: "Baixar prontuários" }] : []), { id: "confirmar", rotulo: "Confirmar" }];
  const idx = itens.findIndex((i) => i.id === atual);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] font-semibold" aria-label="Passos da exclusão" data-exclusao-passos>
      {itens.map((i, n) => (
        <li key={i.id} className={cn("flex items-center gap-1.5", n <= idx ? "text-texto" : "text-texto-3")}>
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-[10.5px]",
            n < idx ? "border-verde-2 bg-verde-2/15 text-verde-2" : n === idx ? "border-violeta-3 text-violeta-3" : "border-linha-2")}>
            {n < idx ? <Check aria-hidden className="h-3 w-3" /> : n + 1}
          </span>
          {i.rotulo}
          {n < itens.length - 1 && <span aria-hidden className="text-texto-3">›</span>}
        </li>
      ))}
    </ol>
  );
}

function CartaoConta({ c }: { c: ContaDoDono }) {
  const nomes = c.alunos.lista.slice(0, 8);
  const resto = c.alunos.total - nomes.length;
  const membros = c.membros.filter((m) => !m.convite);
  const convidados = c.membros.length - membros.length + c.convites_pendentes;
  const cobranca = textosDaCobranca(c);
  const restritos = c.prontuarios.reduce((t, p) => t + p.restritos, 0);
  return (
    <Cartao className="flex flex-col gap-3 p-4 sm:p-5" data-exclusao-conta={c.nome}>
      <div className="flex flex-wrap items-center gap-2">
        <Building2 aria-hidden className="h-4 w-4 text-violeta-3" />
        <h3 className="font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">{c.nome}</h3>
        <Chip tom="c">VOCÊ É DONO</Chip>
      </div>
      <p className="text-[12.5px] text-texto-3">A conta é encerrada e fica como cancelada no histórico.</p>
      <Linha icone={GraduationCap} tom="var(--p-verde-2)">
        <span data-exclusao-alunos={`${c.alunos.para_o_app}/${c.alunos.guardados}`}>{textoDosAlunos(c, ehLoja)}</span>
        {nomes.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {nomes.map((a, i) => (
              <li key={`${a.nome}-${i}`}>
                <Chip tom={a.destino === "app" ? "t" : "g"} data-exclusao-aluno={a.destino}>{a.nome} · {a.destino === "app" ? "app" : "guardado"}</Chip>
              </li>
            ))}
            {resto > 0 && <li><Chip tom="g">+ {resto}</Chip></li>}
          </ul>
        )}
      </Linha>
      <Linha icone={Users} tom="var(--p-ambar-3)">
        {membros.length === 0 ? (
          <span data-exclusao-equipe="0">Sem outros profissionais na equipe.</span>
        ) : (
          <>
            <span data-exclusao-equipe={membros.length}>{membros.length === 1 ? "Perde o acesso a esta conta:" : `${membros.length} profissionais perdem o acesso a esta conta:`}</span>
            <ul className="mt-1.5 flex flex-col gap-1">
              {membros.map((m) => (
                <li key={`${m.nome}-${m.email}`} className="flex flex-wrap items-center gap-x-2 text-[12.5px]" data-exclusao-membro={m.email ?? m.nome}>
                  <b className="font-semibold text-texto">{m.nome}</b>
                  <span className="text-texto-3">{papeisLegiveis(m.papeis)}{m.email ? ` · ${m.email}` : ""}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {convidados > 0 && <p className="mt-1 text-[12px] text-texto-3">{convidados === 1 ? "1 convite pendente é cancelado." : `${convidados} convites pendentes são cancelados.`}</p>}
      </Linha>
      {cobranca.length > 0 && (
        <Linha icone={CreditCard} tom="var(--p-rosa-3)">
          <span className="flex flex-col gap-0.5" data-exclusao-cobranca={c.cobrancas.plano + c.cobrancas.alunos}>
            {/* hml-11 (D5): a frase nova da desistência (só no staging) ganha a marca dos testes e do E2E */}
            {cobranca.map((l) =>
              import.meta.env.VITE_DB_SCHEMA === "staging" && l.includes("salvo a desistência") ? (
                <span key={l} data-frase-desistencia>
                  {l}
                </span>
              ) : (
                <span key={l}>{l}</span>
              ),
            )}
          </span>
        </Linha>
      )}
      <Linha icone={FileArchive} tom="var(--p-violeta-3)">
        {c.prontuarios.length === 0 ? (
          <span data-exclusao-prontuarios="0">Nenhum prontuário nesta conta.</span>
        ) : (
          <span data-exclusao-prontuarios={c.prontuarios.length}>
            {c.prontuarios.length === 1 ? "1 paciente com prontuário" : `${c.prontuarios.length} pacientes com prontuário`} — você baixa antes de excluir (próximo passo).
            {restritos > 0 && <span className="block text-[12px] text-texto-3">{restritos} anotação(ões) "Só nutricionistas" você não vê: ficam guardadas com a matrícula do aluno.</span>}
          </span>
        )}
      </Linha>
    </Cartao>
  );
}

function Lista({ titulo, itens, perigo, marca }: { titulo: string; itens: string[]; perigo?: boolean; marca: string }) {
  if (!itens.length) return null;
  return (
    <div className={cn("rounded-2xl border px-3.5 py-3", perigo ? "border-[var(--p-chip-r-borda)] bg-[var(--p-chip-r-fundo)]" : "border-linha bg-superficie")} data-exclusao-lista={marca}>
      <b className={cn("block text-[13px] font-semibold", perigo ? "text-rosa-3" : "text-texto")}>{titulo}</b>
      <ul className={cn("mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed", perigo ? "text-texto" : "text-texto-2")}>
        {itens.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}

/**
 * "Excluir minha conta" do profissional (W2 da loja — a Google Play exige excluir dentro do app e pela página web): confere antes
 * (nada muda) mostrando o que acontece com os alunos, a equipe, a cobrança automática e os prontuários → o dono baixa os prontuários
 * (ZIP, 1 PDF por paciente) ou marca que não precisa → digita EXCLUIR → exclui e sai (a página /excluir-conta mostra o resumo).
 * O membro de equipe (e quem já foi membro) não baixa nada: o que ele registrou fica com a conta. O master é recusado.
 * `conferenciaInicial`: a do Perfil do aluno (quem já foi membro de equipe e exclui por lá).
 */
export function FluxoExclusao({ conferenciaInicial = null }: { conferenciaInicial?: Conferencia | null }) {
  const navigate = useNavigate();
  const { sair } = useSessao();
  const [passo, setPasso] = useState<Passo>(conferenciaInicial ? "conferencia" : "conferindo");
  const [conferencia, setConferencia] = useState<Conferencia | null>(conferenciaInicial);
  const [recusa, setRecusa] = useState<{ codigo: string; texto: string; motivo: string } | null>(null);
  const [zip, setZip] = useState<ZipPronto | null>(null);
  const [gerando, setGerando] = useState<{ feitos: number; total: number } | null>(null);
  const [semBaixar, setSemBaixar] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");

  const conferir = useCallback(async () => {
    setPasso("conferindo");
    setRecusa(null);
    try {
      const c = await conferirExclusaoProfissional();
      setConferencia(c);
      setPasso("conferencia");
    } catch (e) {
      setRecusa({ codigo: e instanceof ErroExclusao ? e.codigo : "erro_interno", texto: mensagemErroExclusao(e), motivo: e instanceof ErroExclusao ? String(e.extra?.motivo ?? "") : "" });
      setPasso("recusa");
    }
  }, []);

  useEffect(() => {
    if (!conferenciaInicial) void conferir();
  }, [conferir, conferenciaInicial]);

  const comBaixar = conferencia ? precisaBaixar(conferencia) : false;
  const confere = texto.trim().toUpperCase() === PALAVRA_CONFIRMACAO;

  const baixar = async () => {
    if (!conferencia) return;
    setErro("");
    setGerando({ feitos: 0, total: prontuariosDaConferencia(conferencia).length });
    try {
      const z = await montarZipDeProntuarios(conferencia, (feitos, total) => setGerando({ feitos, total }));
      await salvarZip(z);
      setZip(z);
    } catch (e) {
      console.error("[ExcluirConta] prontuários:", e);
      setErro(e instanceof ErroExclusao ? mensagemErroExclusao(e) : "Não foi possível gerar os prontuários agora. Confira a internet e tente de novo.");
    } finally {
      setGerando(null);
    }
  };

  const excluir = async () => {
    if (!confere) return setErro(`Digite ${PALAVRA_CONFIRMACAO} para confirmar.`);
    setErro("");
    setPasso("excluindo");
    try {
      const r = await excluirContaProfissional(texto);
      // a página pública mostra o resumo (o painel e o app pedem login — e o login acabou de sair)
      navigate("/excluir-conta", { replace: true, state: { [ESTADO_EXCLUIDA]: { ...r.resultado, nome: conferencia?.nome ?? null } } });
      // hml-09 (D6): a cópia do treino neste aparelho sai junto — nunca trava a saída. Sob demanda: o módulo cria o banco local ao
      // carregar (no app, a casca já o carregou)
      await import("@/lib/powersync/PowerSyncProvider").then((m) => m.apagarBancoLocal()).catch((err) => console.warn("[ExcluirConta] banco local:", err));
      void sair();
    } catch (e) {
      setErro(mensagemErroExclusao(e));
      setPasso("confirmar");
    }
  };

  if (passo === "conferindo") {
    return (
      <Cartao className="flex flex-col gap-2 p-5" aria-busy="true" aria-label="Conferindo" data-exclusao-passo="conferindo">
        <Esqueleto className="h-4 w-3/4" />
        <Esqueleto className="h-4 w-2/3" />
        <Esqueleto className="h-4 w-1/2" />
        <Esqueleto className="h-4 w-3/5" />
      </Cartao>
    );
  }

  if (passo === "recusa" && recusa) {
    const suporte = ["profissional", "conta_legada"].includes(recusa.codigo);
    return (
      <Cartao className="flex flex-col gap-3 p-5" data-exclusao-passo="recusa" data-exclusao-recusa={recusa.codigo}>
        <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-texto">
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
          <span>{recusa.texto}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {suporte && (
            <a href={linkDoSuporte("Excluir minha conta")} className="pq-botao pq-botao-g" data-exclusao-suporte={CONTATO_SUPORTE}>
              <LifeBuoy aria-hidden /> Falar com o suporte
            </a>
          )}
          {/* W1 da loja: na versão da Google Play, nenhum botão que leve a pagamentos — o texto diz onde cancelar */}
          {recusa.codigo === "assinatura_ativa" && !ehLoja && (
            <Botao icone={Wallet} onClick={() => { lembrarArea("aluno"); navigate("/perfil/pagamentos"); }} data-exclusao-pagamentos>Abrir Pagamentos</Botao>
          )}
          {recusa.codigo === "nao_profissional" && (
            <Botao icone={Trash2} onClick={() => { lembrarArea("aluno"); navigate("/perfil?excluir=1"); }} data-exclusao-perfil>Ir para Perfil › Excluir</Botao>
          )}
          {!suporte && !["assinatura_ativa", "nao_profissional"].includes(recusa.codigo) && (
            <Botao onClick={() => void conferir()} data-exclusao-tentar>Tentar de novo</Botao>
          )}
        </div>
      </Cartao>
    );
  }

  if (!conferencia) return null;

  if (passo === "conferencia") {
    return (
      <div className="flex flex-col gap-3.5" data-exclusao-passo="conferencia" data-exclusao-perfil={conferencia.perfil}>
        <Cartao brilho className="flex flex-col gap-2.5 p-5">
          <Passos atual="conferencia" comBaixar={comBaixar} />
          <h2 className="font-body text-[18px] font-bold normal-case tracking-[-0.02em] text-texto">Antes de excluir, confira o que acontece</h2>
          <p className="text-[13px] leading-relaxed text-texto-2">Nada muda até você digitar {PALAVRA_CONFIRMACAO} no último passo.</p>
        </Cartao>
        {conferencia.contas.map((c) => <CartaoConta key={c.id ?? c.nome} c={c} />)}
        {conferencia.sem_conta && conferencia.sem_conta.alunos > 0 && (
          <Cartao className="p-4 sm:p-5" data-exclusao-sem-conta>
            <Linha icone={GraduationCap} tom="var(--p-verde-2)">
              {conferencia.sem_conta.alunos} paciente(s) do site antigo, sem conta, ficam guardados sem acesso.
            </Linha>
          </Cartao>
        )}
        {conferencia.equipes.map((e) => (
          <Cartao key={e.conta_nome} className="flex flex-col gap-2.5 p-4 sm:p-5" data-exclusao-equipe-sai={e.conta_nome}>
            <div className="flex flex-wrap items-center gap-2">
              <UserMinus aria-hidden className="h-4 w-4 text-ambar-3" />
              <h3 className="font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">Equipe de {e.conta_nome}</h3>
              <Chip tom="g">{papeisLegiveis(e.papeis).toUpperCase()}</Chip>
            </div>
            <Linha icone={Users} tom="var(--p-ambar-3)">
              Você sai da equipe{e.dono_nome ? ` (dono: ${e.dono_nome})` : ""}.{" "}
              {textoDosAlunosDaEquipe(e.alunos_treino + e.alunos_nutricao)}
            </Linha>
            <Linha icone={ShieldCheck} tom="var(--p-verde-2)">O que você registrou para os alunos (anotações, avaliações, treinos, dietas) fica com a conta.</Linha>
          </Cartao>
        ))}
        {conferencia.aluno && conferencia.aluno.matriculas > 0 && (
          <Cartao className="p-4 sm:p-5" data-exclusao-tambem-aluno>
            <Linha icone={GraduationCap} tom="var(--p-violeta-3)">
              Você também é aluno{conferencia.aluno.contas.length ? ` de ${conferencia.aluno.contas.join(", ")}` : ""}: essa parte sai junto, como no “Excluir minha conta” do aluno.
            </Linha>
          </Cartao>
        )}
        <Lista titulo="Vai ser apagado (não dá para desfazer)" itens={listaApaga(conferencia)} perigo marca="apaga" />
        <Lista titulo="Fica guardado, e por quê" itens={listaFica(conferencia)} marca="fica" />
        <div className="flex flex-wrap gap-2">
          <Botao variante="w" onClick={() => setPasso(comBaixar ? "baixar" : "confirmar")} data-exclusao-continuar>Continuar</Botao>
        </div>
      </div>
    );
  }

  if (passo === "baixar") {
    const total = prontuariosDaConferencia(conferencia).length;
    return (
      <div className="flex flex-col gap-3.5" data-exclusao-passo="baixar">
        <Cartao brilho className="flex flex-col gap-3 p-5">
          <Passos atual="baixar" comBaixar />
          <h2 className="font-body text-[18px] font-bold normal-case tracking-[-0.02em] text-texto">Baixe os prontuários antes</h2>
          <p className="text-[13px] leading-relaxed text-texto-2">
            {total === 1 ? "1 paciente tem prontuário" : `${total} pacientes têm prontuário`}: um arquivo .zip com 1 PDF por paciente, com as anotações que você vê.
            Depois de excluir, eles ficam guardados com a matrícula de cada aluno, mas você não consegue mais abrir.
          </p>
          <div className="flex flex-col gap-2 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
            {zip ? (
              <span className="flex items-center gap-2 text-[13px] font-semibold text-verde-2" data-exclusao-zip-pronto={zip.pdfs.length}>
                <Check aria-hidden className="h-4 w-4" /> Pronto: {zip.nome} ({zip.pdfs.length === 1 ? "1 PDF" : `${zip.pdfs.length} PDFs`})
              </span>
            ) : gerando ? (
              <span className="text-[13px] text-texto-2" data-exclusao-gerando>Gerando os PDFs… {gerando.feitos} de {gerando.total}</span>
            ) : (
              <span className="text-[13px] text-texto-2">O arquivo é montado aqui no aparelho.</span>
            )}
            <div className="flex flex-wrap gap-2">
              <Botao variante={zip ? "g" : "w"} icone={FileArchive} onClick={() => void baixar()} disabled={!!gerando} data-exclusao-baixar>
                {zip ? "Baixar de novo" : gerando ? "Gerando…" : "Baixar prontuários (.zip)"}
              </Botao>
            </div>
          </div>
          {!zip && (
            <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-texto-2" data-exclusao-sem-baixar>
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--p-rosa-3)]" checked={semBaixar} onChange={(e) => setSemBaixar(e.target.checked)} />
              <span>Não preciso baixar. Entendo que, depois de excluir, não terei mais acesso a esses prontuários.</span>
            </label>
          )}
          {erro && <MensagemForm data-exclusao-erro>{erro}</MensagemForm>}
        </Cartao>
        <div className="flex flex-wrap gap-2">
          <Botao icone={ArrowLeft} onClick={() => { setErro(""); setPasso("conferencia"); }} data-exclusao-voltar>Voltar</Botao>
          <Botao variante="w" onClick={() => { setErro(""); setPasso("confirmar"); }} disabled={!zip && !semBaixar} data-exclusao-continuar>Continuar</Botao>
        </div>
      </div>
    );
  }

  // confirmar / excluindo
  return (
    <div className="flex flex-col gap-3.5" data-exclusao-passo={passo}>
      <Cartao className="flex flex-col gap-3.5 border-[var(--p-chip-r-borda)] p-5">
        <Passos atual="confirmar" comBaixar={comBaixar} />
        <h2 className="flex items-center gap-2 font-body text-[18px] font-bold normal-case tracking-[-0.02em] text-texto">
          <Trash2 aria-hidden className="h-[18px] w-[18px] text-rosa-3" /> Excluir a sua conta
        </h2>
        <p className="text-[13.5px] leading-relaxed text-texto" data-exclusao-resumo>{resumoDaConfirmacao(conferencia)}</p>
        <Campo rotulo={`Para confirmar, digite ${PALAVRA_CONFIRMACAO}`} value={texto} onChange={(e) => { setTexto(e.target.value); setErro(""); }}
          placeholder={PALAVRA_CONFIRMACAO} autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={passo === "excluindo"} data-exclusao-confirmacao />
        {erro && <MensagemForm data-exclusao-erro>{erro}</MensagemForm>}
        <button type="button" onClick={() => void excluir()} disabled={!confere || passo === "excluindo"} data-exclusao-confirmar
          className="pq-botao w-full border border-[var(--p-chip-r-borda)] bg-rosa text-white disabled:opacity-45">
          {passo === "excluindo" ? "Excluindo… não feche o app" : "Excluir minha conta"}
        </button>
      </Cartao>
      {passo === "confirmar" && (
        <div className="flex flex-wrap gap-2">
          <Botao icone={ArrowLeft} onClick={() => { setErro(""); setPasso(comBaixar ? "baixar" : "conferencia"); }} data-exclusao-voltar>Voltar</Botao>
        </div>
      )}
    </div>
  );
}
