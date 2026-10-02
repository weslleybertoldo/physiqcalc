import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, KeyRound, Lock, LockOpen, Users } from "lucide-react";
import { toast } from "sonner";
import { SheetSenhaAluno } from "@/painel/aluno/resumo/acesso/SheetSenhaAluno";
import { cn } from "@/lib/utils";
import { TopoPagina } from "@/ui/casca/topo";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Tabela, TabelaCabeca, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/ui/premium/Tabela";
import { MoverAlunosDialog } from "../alunos/MoverAlunosDialog";
import { bloquearAluno, ErroMaster, listarAlunos, semConta } from "../api";
import { CampoBusca, ChipsModulos, Filtros, SELECT } from "../pecas/ui";
import { dataCurta, textoErro } from "../regras";
import type { Aluno } from "../tipos";

type Modo = "ativos" | "app" | "bloqueados" | "inativos" | "sem_responsavel" | "p7" | "sem_conta" | "todos";
const POR_PAGINA = 50;

/**
 * Painel master › Alunos (C57, C8, P7): todos os alunos de todas as contas, filtro por conta, "do app" (sem profissional), "sem conta"
 * (login sem matrícula), os casos legados em 2 contas (P7) e mover vários de uma vez. Por aluno: bloquear/desbloquear (a regra da W13,
 * nos 2 bancos) e criar a senha nova (a do card "Acesso do aluno" — W8b: senha provisória + "Crie a sua senha" no 1º login).
 */
export default function Alunos() {
  const [sp, setSp] = useSearchParams();
  const modo = (sp.get("modo") as Modo) || "ativos";
  const conta = sp.get("conta") || "";
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [mover, setMover] = useState(false);
  const [senha, setSenha] = useState<Aluno | null>(null);
  const termo = busca.trim();
  const lista = useQuery({
    // no "Sem conta" a lista só traz as contas (destino do Mover) e os números dos filtros
    queryKey: ["master", "alunos", modo, conta, termo, pagina],
    queryFn: () => (modo === "sem_conta" ? listarAlunos({ modo: "ativos" }, 0, 1)
      : listarAlunos({ modo, conta_id: conta || null, busca: termo || null }, pagina * POR_PAGINA, POR_PAGINA)),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const pessoas = useQuery({ queryKey: ["master", "sem-conta", termo], queryFn: () => semConta(termo || undefined), enabled: modo === "sem_conta" });
  const contas = lista.data?.contas ?? [];
  const cont = lista.data?.contagens;
  const alunos = useMemo(() => lista.data?.alunos ?? [], [lista.data]);
  const mudar = (chave: string, valor: string | null) => {
    const n = new URLSearchParams(sp);
    if (valor) n.set(chave, valor); else n.delete(chave);
    setSp(n, { replace: true });
    setPagina(0);
    setSelecao(new Set());
  };
  const alternar = (id: string) => setSelecao((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const idsVisiveis = useMemo(() => (modo === "sem_conta" ? (pessoas.data?.pessoas ?? []).map((p) => p.user_id) : alunos.map((a) => a.paciente_id)), [modo, pessoas.data, alunos]);
  const todosMarcados = idsVisiveis.length > 0 && idsVisiveis.every((id) => selecao.has(id));

  async function bloquear(a: Aluno, b: boolean) {
    try {
      await bloquearAluno(a.paciente_id, b, b ? "Seu acesso foi pausado. Fale com o suporte do Physiq." : undefined);
      toast.success(b ? `${a.nome} bloqueado (o app fecha).` : `${a.nome} desbloqueado.`);
      void lista.refetch();
    } catch (e) {
      toast.error(textoErro(e instanceof ErroMaster ? e.codigo : "erro_interno"));
    }
  }

  const filtros: Array<{ valor: Modo; rotulo: string; numero?: number }> = [
    { valor: "ativos", rotulo: "Ativos", numero: cont?.ativos },
    { valor: "app", rotulo: "Do app", numero: cont?.app },
    { valor: "bloqueados", rotulo: "Bloqueados" },
    { valor: "inativos", rotulo: "Inativos" },
    { valor: "sem_responsavel", rotulo: "Sem responsável" },
    { valor: "p7", rotulo: "Em 2 contas", numero: cont?.p7 },
    { valor: "sem_conta", rotulo: "Sem conta", numero: cont?.sem_conta },
  ];
  const carregando = modo === "sem_conta" ? pessoas.isLoading : lista.isLoading;
  const erro = modo === "sem_conta" ? pessoas.error : lista.error;

  return (
    <div className="flex flex-col gap-3.5" data-pagina-master="alunos" data-modo={modo}>
      <TopoPagina titulo="Alunos" subtitulo="Todos os alunos de todas as contas"
        acoes={(
          <Botao variante="w" icone={ArrowLeftRight} disabled={selecao.size === 0} onClick={() => setMover(true)} data-master-mover>
            {selecao.size ? `Mover ${selecao.size}` : "Mover alunos"}
          </Botao>
        )} />
      <div className="flex flex-wrap items-center gap-2.5">
        <Filtros rotulo="Quais alunos" valor={modo} aoMudar={(v) => mudar("modo", v === "ativos" ? null : v)} opcoes={filtros} />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {modo !== "sem_conta" && (
          <select className={cn(SELECT, "h-[42px] w-auto min-w-[220px] max-w-[320px] rounded-[14px]")} value={conta} onChange={(e) => mudar("conta", e.target.value || null)} aria-label="Conta" data-filtro-conta>
            <option value="">Todas as contas</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
        <CampoBusca valor={busca} aoMudar={(v) => { setBusca(v); setPagina(0); }} placeholder="Buscar por nome ou e-mail" data-busca-alunos />
        {modo === "p7" && (
          <p className="text-[12.5px] text-texto-3" data-explica-p7>Caso da migração: o mesmo login ativo em 2 contas (ex.: treino numa, dieta noutra). Mova para juntar numa conta só, ou deixe como está.</p>
        )}
      </div>

      <Cartao className="px-4 pb-2 pt-3">
        {carregando ? <EstadoCarregando linhas={6} />
          : erro ? <EstadoErro texto={textoErro(erro instanceof ErroMaster ? erro.codigo : "erro_interno")} aoTentar={() => void (modo === "sem_conta" ? pessoas.refetch() : lista.refetch())} />
            : modo === "sem_conta" ? (
              (pessoas.data?.pessoas ?? []).length === 0 ? <EstadoVazio icone={Users} titulo="Ninguém sem conta" texto="Toda pessoa com login é aluno ou profissional de alguma conta." /> : (
                <Tabela data-tabela-sem-conta>
                  <TabelaCabeca>
                    <tr>
                      <TabelaTitulo className="w-8"><input type="checkbox" aria-label="Marcar todos" checked={todosMarcados} onChange={() => setSelecao(todosMarcados ? new Set() : new Set(idsVisiveis))} /></TabelaTitulo>
                      <TabelaTitulo>Pessoa</TabelaTitulo><TabelaTitulo>Entrou em</TabelaTitulo><TabelaTitulo>Último acesso</TabelaTitulo>
                    </tr>
                  </TabelaCabeca>
                  <TabelaCorpo>
                    {(pessoas.data?.pessoas ?? []).map((p) => (
                      <TabelaLinha key={p.user_id} data-linha-sem-conta={p.email ?? ""}>
                        <TabelaCelula><input type="checkbox" aria-label={`Marcar ${p.nome}`} checked={selecao.has(p.user_id)} onChange={() => alternar(p.user_id)} /></TabelaCelula>
                        <TabelaCelula>
                          <span className="flex items-center gap-2.5"><Avatar nome={p.nome ?? p.email} tamanho={30} />
                            <span className="min-w-0"><b className="block truncate text-[13.5px]">{p.nome ?? "—"}</b><span className="block truncate text-[12px] text-texto-3">{p.email}</span></span>
                          </span>
                        </TabelaCelula>
                        <TabelaCelula className="text-texto-2">{dataCurta(p.criado_em)}</TabelaCelula>
                        <TabelaCelula className="text-texto-2">{dataCurta(p.ultimo_acesso)}</TabelaCelula>
                      </TabelaLinha>
                    ))}
                  </TabelaCorpo>
                </Tabela>
              )
            ) : alunos.length === 0 ? <EstadoVazio icone={Users} titulo="Nenhum aluno neste filtro" texto="Troque o filtro, a conta ou a busca." />
              : (
                <Tabela data-tabela-alunos-master>
                  <TabelaCabeca>
                    <tr>
                      <TabelaTitulo className="w-8"><input type="checkbox" aria-label="Marcar todos" checked={todosMarcados} onChange={() => setSelecao(todosMarcados ? new Set() : new Set(idsVisiveis))} data-marcar-todos /></TabelaTitulo>
                      <TabelaTitulo>Aluno</TabelaTitulo>
                      <TabelaTitulo>Conta e módulos</TabelaTitulo>
                      <TabelaTitulo>Responsáveis</TabelaTitulo>
                      <TabelaTitulo>Situação</TabelaTitulo>
                      <TabelaTitulo className="text-right">Ações</TabelaTitulo>
                    </tr>
                  </TabelaCabeca>
                  <TabelaCorpo>
                    {alunos.map((a) => (
                      <TabelaLinha key={a.paciente_id} data-linha-aluno={a.nome ?? ""}>
                        <TabelaCelula><input type="checkbox" aria-label={`Marcar ${a.nome}`} checked={selecao.has(a.paciente_id)} onChange={() => alternar(a.paciente_id)} data-marcar-aluno={a.nome ?? ""} /></TabelaCelula>
                        <TabelaCelula>
                          <span className="flex min-w-[180px] max-w-[250px] items-center gap-2.5"><Avatar nome={a.nome} tamanho={30} />
                            <span className="min-w-0"><b className="block truncate text-[13.5px]">{a.nome}</b><span className="block truncate text-[12px] text-texto-3">{a.email ?? "sem e-mail"}{a.tem_login ? "" : " · sem login"}</span></span>
                          </span>
                        </TabelaCelula>
                        <TabelaCelula className="text-texto-2">
                          {a.conta ? <span className="block max-w-[190px] truncate">{a.conta.nome}</span> : "—"}
                          {a.app ? <span className="block max-w-[190px] truncate text-[11.5px] text-texto-3">{a.app.plano ?? "App"}{a.app.pago_ate ? ` · pago até ${dataCurta(a.app.pago_ate)}` : a.app.teste_ate ? ` · teste até ${dataCurta(a.app.teste_ate)}` : ""}</span>
                            : a.modulos.length ? <span className="mt-1 block"><ChipsModulos modulos={a.modulos} /></span> : null}
                        </TabelaCelula>
                        <TabelaCelula className="text-[12.5px] text-texto-2">
                          <span className="block max-w-[160px] truncate" title={[a.personal?.nome && `Personal: ${a.personal.nome}`, a.nutricionista?.nome && `Nutri: ${a.nutricionista.nome}`].filter(Boolean).join(" · ")}>
                            {[a.personal?.nome && `Personal: ${a.personal.nome}`, a.nutricionista?.nome && `Nutri: ${a.nutricionista.nome}`].filter(Boolean).join(" · ") || "Sem responsável"}
                          </span>
                        </TabelaCelula>
                        <TabelaCelula>
                          <span className="flex flex-wrap gap-1">
                            {!a.ativo ? <Chip tom="g">Inativo</Chip> : a.bloqueado ? <Chip tom="r">Bloqueado</Chip> : <Chip tom="n">Ativo</Chip>}
                            {a.conta_bloqueada && <Chip tom="r">Conta bloqueada</Chip>}
                            {a.p7 && <Chip tom="a">2 contas</Chip>}
                          </span>
                        </TabelaCelula>
                        <TabelaCelula className="text-right">
                          <span className="inline-flex gap-1.5">
                            {a.tem_login && <BotaoIcone icone={KeyRound} rotulo={`Senha nova para ${a.nome ?? "o aluno"}`} tamanho={34} onClick={() => setSenha(a)} data-senha-nova={a.nome ?? ""} />}
                            {a.conta && !a.conta.eh_app && a.ativo && (a.bloqueado
                              ? <BotaoIcone icone={LockOpen} rotulo={`Desbloquear ${a.nome ?? "o aluno"}`} tamanho={34} onClick={() => void bloquear(a, false)} data-desbloquear-aluno={a.nome ?? ""} />
                              : <BotaoIcone icone={Lock} rotulo={`Bloquear ${a.nome ?? "o aluno"}`} tamanho={34} onClick={() => void bloquear(a, true)} data-bloquear-aluno={a.nome ?? ""} />)}
                          </span>
                        </TabelaCelula>
                      </TabelaLinha>
                    ))}
                  </TabelaCorpo>
                </Tabela>
              )}
        {modo !== "sem_conta" && (lista.data?.total ?? 0) > POR_PAGINA && (
          <div className="flex items-center justify-center gap-3 border-t border-linha-3 py-3 text-[12.5px] text-texto-3" data-paginas-alunos>
            <Botao tamanho="sm" disabled={pagina === 0} onClick={() => setPagina((x) => x - 1)}>Anteriores</Botao>
            {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, lista.data?.total ?? 0)} de {lista.data?.total}
            <Botao tamanho="sm" disabled={(pagina + 1) * POR_PAGINA >= (lista.data?.total ?? 0)} onClick={() => setPagina((x) => x + 1)}>Próximos</Botao>
          </div>
        )}
      </Cartao>

      <MoverAlunosDialog aberta={mover} aoMudar={setMover} contas={contas} contaAtual={conta || null}
        pacientes={modo === "sem_conta" ? [] : [...selecao]} usuarios={modo === "sem_conta" ? [...selecao] : []}
        aoMovido={() => { setSelecao(new Set()); void lista.refetch(); void pessoas.refetch(); }} />
      {senha && (
        <SheetSenhaAluno aberto criar={false} pacienteId={senha.paciente_id} nome={senha.nome} emailCadastro={senha.email} emailLogin={senha.email}
          aoFechar={() => setSenha(null)} aoSalvar={() => void lista.refetch()} />
      )}
    </div>
  );
}
