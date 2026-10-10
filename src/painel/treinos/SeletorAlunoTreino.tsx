// Physiq hml-14d (B19 · D26) — o seletor de aluno do Histórico e do Relatório do Painel › Treinos. Antes era um <select> com a lista
// inteira de alunos (baixada de 100 em 100 até 2000, sem busca). Agora a busca vai ao BANCO do Treino enquanto digita (300 ms; a
// lista de alunos do admin-list-users com `q`, 20 por vez, em ordem de nome): parte do nome ou do e-mail, sem acento; mostra os 20
// primeiros e "20 de N — refine a busca"; resposta velha é descartada (número do pedido); o aluno escolhido fica com quem usa
// (o objeto que veio da busca, lido pelo id). O campo de busca fica sempre à vista; a lista abre ao tocar ou digitar. O molde de
// UX é o SeletorDeAluno da 14b (src/painel/alunos/SeletorDeAluno.tsx), que busca no banco principal e não serve aqui: o histórico
// é do Treino (o id é o usuário do Treino). Atributo próprio (`data-seletor-aluno-treino`): o `data-seletor-aluno` é o da 14b.
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Check, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/premium/Avatar";
import { useSaidaAnimada } from "@/ui/premium/useSaidaAnimada";
import { CLASSE_CAMPO } from "./estilo";
import { textoMaisAlunosTreino } from "./regras";
import type { AlunoDaLista, QuemMexe } from "./tipos";
import { useBuscaDeAlunosTreino } from "./useTreinos";

// o toque na opção não tira o foco do campo (a lista não fecha antes do clique — Safari não foca botão)
const segurarFoco = (e: MouseEvent) => e.preventDefault();

export function SeletorAlunoTreino({
  contexto,
  q,
  valor,
  aoMudar,
  todos,
  className,
}: {
  contexto: "historico" | "relatorio";
  q: QuemMexe;
  /** o aluno escolhido (null = nenhum / "Todos os alunos") */
  valor: AlunoDaLista | null;
  aoMudar: (aluno: AlunoDaLista | null) => void;
  /** o texto da opção "todos" (o Histórico: "Todos os alunos"); sem ela, não há como voltar a nenhum */
  todos?: string;
  className?: string;
}) {
  const [termo, setTermo] = useState("");
  const [aberta, setAberta] = useState(false);
  const [ativa, setAtiva] = useState(-1);
  const idLista = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const busca = useBuscaDeAlunosTreino({ q, termo, ligada: aberta });
  // hml-18a (H-40, D): a lista entra e SAI esmaecendo (200 ms) — antes sumia seca ao escolher; enquanto sai, mostra o que mostrava
  const saidaLista = useSaidaAnimada<HTMLDivElement>(aberta);
  const r = busca.resultado;
  const itens = r?.itens ?? [];
  // as opções que as setas percorrem: "Todos os alunos" (se houver) + os alunos achados
  const opcoes: (AlunoDaLista | null)[] = busca.erro ? (todos ? [null] : []) : [...(todos ? [null] : []), ...itens];
  const idOpcao = (i: number) => `${idLista}-opcao-${i}`;

  const escolher = (a: AlunoDaLista | null) => {
    aoMudar(a);
    setTermo("");
    setAtiva(-1);
    setAberta(false);
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAberta(true);
      if (!opcoes.length) return;
      const desce = e.key === "ArrowDown";
      setAtiva((i) => (desce ? (i + 1) % opcoes.length : i <= 0 ? opcoes.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (ativa >= 0 && ativa < opcoes.length) escolher(opcoes[ativa]);
    } else if (e.key === "Escape") {
      setAberta(false);
    }
  };

  const saiu = (e: FocusEvent<HTMLDivElement>) => {
    if (!raiz.current?.contains(e.relatedTarget as Node | null)) setAberta(false);
  };

  const placeholder = valor ? valor.nome : todos ?? "Escolha o aluno: nome ou e-mail";

  return (
    <div ref={raiz} onBlur={saiu} className={cn("relative w-full min-w-0 sm:w-[300px]", className)}
      data-seletor-aluno-treino={contexto} data-seletor-aluno-treino-valor={valor?.id ?? ""}>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
        <input
          type="search"
          role="combobox"
          aria-label={valor ? `Aluno: ${valor.nome}. Buscar outro aluno` : "Buscar aluno"}
          aria-expanded={aberta}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={aberta && ativa >= 0 ? idOpcao(ativa) : undefined}
          autoComplete="off"
          value={termo}
          placeholder={placeholder}
          title={valor?.nome}
          onChange={(e) => {
            setTermo(e.target.value);
            setAtiva(-1);
            setAberta(true);
          }}
          onFocus={() => setAberta(true)}
          onClick={() => setAberta(true)}
          onKeyDown={teclas}
          // com um aluno escolhido, o nome dele fica no campo (cor de texto) até a pessoa digitar outra busca
          className={cn(CLASSE_CAMPO, "h-9 pl-9", valor && "placeholder:text-texto")}
          data-seletor-aluno-treino-busca
        />
      </div>

      {saidaLista.montado && (
        <div ref={saidaLista.ref} id={idLista} role="listbox" aria-label="Alunos" onMouseDown={segurarFoco} data-state={saidaLista.estado}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-[300px] overflow-y-auto rounded-2xl border border-linha bg-tela shadow-[0_18px_40px_rgba(0,0,0,.45)] duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:pointer-events-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:fill-mode-forwards"
          data-seletor-aluno-treino-lista data-buscando={busca.buscando ? "1" : "0"} data-termo={r?.termo ?? ""}>
          {todos && (
            <button id={idOpcao(0)} type="button" role="option" aria-selected={!valor} onMouseDown={segurarFoco} onClick={() => escolher(null)}
              className={cn("flex min-h-[44px] w-full items-center gap-3 px-3.5 py-2 text-left text-[13px] text-texto-2 transition-colors",
                ativa === 0 ? "bg-[rgba(255,255,255,.06)]" : "hover:bg-[rgba(255,255,255,.03)]")}
              data-opcao-aluno-treino-todos>
              <span aria-hidden className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-dashed border-linha-2 text-texto-3">
                <Users className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">{todos}</span>
              {!valor && <Check aria-hidden className="h-4 w-4 flex-none text-verde-3" />}
            </button>
          )}
          {busca.erro ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-t border-linha-3 px-3.5 py-3 text-[12.5px] text-rosa-3 first:border-t-0"
              data-seletor-aluno-treino-erro>
              <span>Não deu para buscar os alunos agora.</span>
              <button type="button" onMouseDown={segurarFoco} onClick={busca.tentarDeNovo} className="font-semibold text-texto underline-offset-2 hover:underline"
                data-seletor-aluno-treino-tentar>
                Tentar de novo
              </button>
            </div>
          ) : !r ? (
            <p className="border-t border-linha-3 px-3.5 py-3 text-[12.5px] text-texto-3 first:border-t-0" data-seletor-aluno-treino-buscando>Buscando…</p>
          ) : itens.length === 0 ? (
            <p className="border-t border-linha-3 px-3.5 py-3 text-[12.5px] text-texto-3 first:border-t-0" data-seletor-aluno-treino-vazio>
              {r.termo ? "Nenhum aluno com essa busca." : "Nenhum aluno na sua lista ainda."}
            </p>
          ) : (
            <div className={cn("divide-y divide-linha-3", todos && "border-t border-linha-3", busca.buscando && "opacity-70")}>
              {itens.map((x, i) => {
                const n = i + (todos ? 1 : 0);
                const sel = x.id === valor?.id;
                return (
                  <button key={x.id} id={idOpcao(n)} type="button" role="option" aria-selected={sel} onMouseDown={segurarFoco} onClick={() => escolher(x)}
                    className={cn("flex min-h-[48px] w-full items-center gap-3 px-3.5 py-2 text-left transition-colors",
                      ativa === n ? "bg-[rgba(255,255,255,.06)]" : sel ? "bg-superficie-2" : "hover:bg-[rgba(255,255,255,.03)]")}
                    data-opcao-aluno-treino={x.id}>
                    <Avatar src={x.foto_url ?? undefined} nome={x.nome} tamanho={28} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-semibold text-texto">{x.nome}</b>
                      {x.email && <span className="block truncate text-[12px] text-texto-3">{x.email}</span>}
                    </span>
                    {sel && <Check aria-hidden className="h-4 w-4 flex-none text-verde-3" />}
                  </button>
                );
              })}
            </div>
          )}
          {!busca.erro && r && r.total > itens.length && (
            <p className="border-t border-linha-3 px-3.5 py-2 text-[12px] text-texto-3" data-seletor-aluno-treino-mais data-total={r.total}>
              {textoMaisAlunosTreino(itens.length, r.total)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
