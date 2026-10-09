// Physiq hml-14b (B19 · D16) — o seletor de aluno dos 4 campos do painel: Ligar aluno (pré-consulta), Agendamento, Movimentação
// e Recibo avulso. Antes cada campo baixava até 1000 alunos e filtrava no navegador (3 não achavam pelo CPF e o Recibo nem tinha
// busca — H-72). Agora a busca vai ao BANCO enquanto digita (300 ms; a alunos_da_conta com `q`, só a conta e a regra P1 da página
// Alunos), por nome, apelido, e-mail, telefone e CPF (só os dígitos), sem acento (D17); mostra os 20 primeiros e "20 de N — refine
// a busca"; resposta velha é descartada (número do pedido); o aluno já escolhido é lido pelo id. O campo de busca fica sempre à
// vista; a lista abre ao tocar ou digitar (no Ligar aluno, sempre aberta, como era). Só o campo do Recibo (que imprime o CPF) pede
// o CPF e o apelido ao banco; nos outros 3, a busca pelo CPF continua no banco, mas o CPF não vem para o navegador.
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INPUT } from "@/nutricao/editor/ui/estilos";
import { Avatar } from "@/ui/premium/Avatar";
import {
  contatoDoAluno, digitosDaBusca, formatarCPF, situacaoDoAluno, textoMaisAlunos, type AlunoDoSeletor, type CampoSeletor, type SituacaoSeletor,
} from "./regras";
import { useAlunoDoSeletor, useBuscaDeAlunos, useGuardarAlunoDoSeletor } from "./useSeletorDeAluno";

// o toque na opção não tira o foco do campo (a lista não fecha antes do clique — Safari não foca botão)
const segurarFoco = (e: MouseEvent) => e.preventDefault();

export function SeletorDeAluno({
  campo,
  contaId,
  valor,
  aoMudar,
  situacao = "ativos_e_bloqueados",
  opcional = false,
  rotuloNenhum = "Sem aluno",
  aoCadastrar,
  nomeGravado,
  listaSempreAberta = false,
  placeholder,
  rotulo = "Buscar aluno",
  className,
}: {
  campo: CampoSeletor;
  /** a conta ativa (sem conta, o campo fica desligado) */
  contaId: string | null | undefined;
  /** id do aluno escolhido (null/"" = nenhum) */
  valor: string | null | undefined;
  aoMudar: (aluno: AlunoDoSeletor | null) => void;
  situacao?: SituacaoSeletor;
  /** campo opcional: a lista começa com "Sem aluno" e o escolhido tem o × */
  opcional?: boolean;
  rotuloNenhum?: string;
  /** "+ Cadastrar aluno" quando a busca não acha (só no campo que já tinha esse caminho) */
  aoCadastrar?: () => void;
  /** o nome gravado no registro, para o aluno que não é mais achado (removido ou de fora) */
  nomeGravado?: string | null;
  listaSempreAberta?: boolean;
  placeholder?: string;
  rotulo?: string;
  className?: string;
}) {
  const [termo, setTermo] = useState("");
  const [aberta, setAberta] = useState(false);
  const [ativa, setAtiva] = useState(-1);
  const idLista = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const guardar = useGuardarAlunoDoSeletor();
  // hml-14b (B19): dado pessoal mínimo — só o Recibo traz o CPF do banco
  const comCpf = campo === "recibo";
  const escolhido = useAlunoDoSeletor(contaId, valor || null, comCpf);
  const semConta = !contaId;
  const listaVisivel = !semConta && (listaSempreAberta || aberta);
  const busca = useBuscaDeAlunos({ contaId, termo, situacao, ligada: listaVisivel, comCpf });
  const r = busca.resultado;
  const itens = r?.itens ?? [];
  const porNumero = digitosDaBusca(termo).length >= 3;
  // as opções que as setas percorrem: "Sem aluno" (campo opcional) + os alunos achados
  const opcoes: (AlunoDoSeletor | null)[] = busca.erro ? (opcional ? [null] : []) : [...(opcional ? [null] : []), ...itens];
  const idOpcao = (i: number) => `${idLista}-opcao-${i}`;

  const escolher = (a: AlunoDoSeletor | null) => {
    if (a) guardar(contaId, a, comCpf);
    aoMudar(a);
    setTermo("");
    setAtiva(-1);
    if (!listaSempreAberta) setAberta(false);
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAberta(true);
      if (!opcoes.length) return;
      const desce = e.key === "ArrowDown";
      setAtiva((i) => (desce ? (i + 1) % opcoes.length : i <= 0 ? opcoes.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      // o campo fica dentro de <form> (Movimentação, Recibo): Enter escolhe a opção marcada e nunca envia o formulário
      e.preventDefault();
      if (ativa >= 0 && ativa < opcoes.length) escolher(opcoes[ativa]);
    }
  };

  const saiu = (e: FocusEvent<HTMLDivElement>) => {
    if (listaSempreAberta) return;
    if (!raiz.current?.contains(e.relatedTarget as Node | null)) setAberta(false);
  };

  const a = escolhido.data ?? null;
  const situ = a ? situacaoDoAluno(a) : "";
  const textoPlaceholder = semConta
    ? "Sem conta ativa: os alunos aparecem quando você faz parte de uma conta"
    : placeholder ?? (valor ? "Trocar: nome, apelido, e-mail, telefone ou CPF" : "Busque por nome, apelido, e-mail, telefone ou CPF");

  return (
    <div ref={raiz} onBlur={saiu} className={cn("flex min-w-0 flex-col gap-2", className)} data-seletor-aluno={campo} data-seletor-aluno-valor={valor || ""}>
      {valor && (
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 py-2" data-seletor-aluno-escolhido={valor}>
          {a ? (
            <>
              <Avatar src={a.foto_url} nome={a.nome} tamanho={28} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-semibold text-texto">
                  {a.nome}
                  {situ && <span className="font-normal text-texto-3"> · {situ}</span>}
                </b>
                <span className="block truncate text-[12px] text-texto-3">{contatoDoAluno(a)}</span>
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[13px] text-texto-2" data-seletor-aluno-escolhido-estado={escolhido.isError ? "erro" : escolhido.isLoading ? "carregando" : "fora"}>
              {escolhido.isLoading ? "Carregando o aluno…" : nomeGravado || (escolhido.isError ? "Não deu para carregar o aluno agora" : "Aluno selecionado")}
            </span>
          )}
          {opcional && (
            <button type="button" onClick={() => escolher(null)} aria-label="Tirar o aluno" title="Tirar o aluno"
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-texto-3 transition-colors hover:bg-[rgba(255,255,255,.06)] hover:text-texto"
              data-seletor-aluno-limpar>
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
        <input
          type="search"
          role="combobox"
          aria-label={rotulo}
          aria-expanded={listaVisivel}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={listaVisivel && ativa >= 0 ? idOpcao(ativa) : undefined}
          autoComplete="off"
          value={termo}
          disabled={semConta}
          placeholder={textoPlaceholder}
          onChange={(e) => {
            setTermo(e.target.value);
            setAtiva(-1);
            setAberta(true);
          }}
          onFocus={() => setAberta(true)}
          onClick={() => setAberta(true)}
          onKeyDown={teclas}
          className={cn(INPUT, "pl-9")}
          data-seletor-aluno-busca
        />
      </div>

      {listaVisivel && (
        <div id={idLista} role="listbox" aria-label="Alunos" onMouseDown={segurarFoco} className="max-h-[260px] overflow-y-auto rounded-2xl border border-linha"
          data-seletor-aluno-lista data-buscando={busca.buscando ? "1" : "0"} data-termo={r?.termo ?? ""}>
          {opcional && (
            <button id={idOpcao(0)} type="button" role="option" aria-selected={!valor} onMouseDown={segurarFoco} onClick={() => escolher(null)}
              className={cn("flex min-h-[44px] w-full items-center gap-3 px-3.5 py-2 text-left text-[13px] text-texto-2 transition-colors",
                ativa === 0 ? "bg-[rgba(255,255,255,.06)]" : "hover:bg-[rgba(255,255,255,.03)]")}
              data-opcao-aluno-nenhum>
              <span aria-hidden className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-dashed border-linha-2 text-texto-3">
                <X className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">{rotuloNenhum}</span>
              {!valor && <Check aria-hidden className="h-4 w-4 flex-none text-verde-3" />}
            </button>
          )}
          {busca.erro ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-t border-linha-3 px-3.5 py-3 text-[12.5px] text-rosa-3 first:border-t-0"
              data-seletor-aluno-erro>
              <span>Não deu para buscar os alunos agora.</span>
              <button type="button" onMouseDown={segurarFoco} onClick={busca.tentarDeNovo} className="font-semibold text-texto underline-offset-2 hover:underline"
                data-seletor-aluno-tentar>
                Tentar de novo
              </button>
            </div>
          ) : !r ? (
            <p className="border-t border-linha-3 px-3.5 py-3 text-[12.5px] text-texto-3 first:border-t-0" data-seletor-aluno-buscando>Buscando…</p>
          ) : itens.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linha-3 px-3.5 py-3 first:border-t-0" data-seletor-aluno-vazio>
              <p className="min-w-0 text-[12.5px] text-texto-3">{r.termo ? "Nenhum aluno com essa busca." : "Nenhum aluno nesta conta ainda."}</p>
              {aoCadastrar && (
                <button type="button" onMouseDown={segurarFoco} onClick={aoCadastrar}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-verde-3 hover:text-verde-2" data-seletor-aluno-cadastrar>
                  <UserPlus aria-hidden className="h-3.5 w-3.5" /> Cadastrar aluno
                </button>
              )}
            </div>
          ) : (
            <div className={cn("divide-y divide-linha-3", opcional && "border-t border-linha-3", busca.buscando && "opacity-70")}>
              {itens.map((x, i) => {
                const n = i + (opcional ? 1 : 0);
                const sel = x.id === valor;
                const s = situacaoDoAluno(x);
                const linha2 = [
                  contatoDoAluno(x),
                  comCpf && porNumero && x.cpf ? `CPF ${formatarCPF(x.cpf)}` : "",
                  // o aviso da consulta só sai para quem tem login no app (o Agendamento mostrava "sem login")
                  campo === "agendamento" && !x.tem_login ? "sem login" : "",
                ].filter(Boolean).join(" · ");
                return (
                  <button key={x.id} id={idOpcao(n)} type="button" role="option" aria-selected={sel} onMouseDown={segurarFoco} onClick={() => escolher(x)}
                    className={cn("flex min-h-[48px] w-full items-center gap-3 px-3.5 py-2 text-left transition-colors",
                      ativa === n ? "bg-[rgba(255,255,255,.06)]" : sel ? "bg-superficie-2" : "hover:bg-[rgba(255,255,255,.03)]")}
                    data-opcao-aluno={x.id}>
                    <Avatar src={x.foto_url} nome={x.nome} tamanho={28} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-semibold text-texto">
                        {x.nome}
                        {x.apelido && <span className="font-normal text-texto-3"> · {x.apelido}</span>}
                        {s && <span className="font-normal text-texto-3"> · {s}</span>}
                      </b>
                      <span className="block truncate text-[12px] text-texto-3">{linha2}</span>
                    </span>
                    {sel && <Check aria-hidden className="h-4 w-4 flex-none text-verde-3" />}
                  </button>
                );
              })}
            </div>
          )}
          {!busca.erro && r && r.total > itens.length && (
            <p className="border-t border-linha-3 px-3.5 py-2 text-[12px] text-texto-3" data-seletor-aluno-mais data-total={r.total}>
              {textoMaisAlunos(itens.length, r.total)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
