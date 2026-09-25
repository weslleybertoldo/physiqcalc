import Legenda from "@/components/Legenda";
import { TMB_LEGENDA, TMB_OPCOES, tmbValida, type Composicao, type MetodoAvaliacao, type TmbMetodo } from "@/lib/avaliacao";

interface Props {
  valor: TmbMetodo;
  onChange: (m: TmbMetodo) => void;
  composicao: Composicao;
  metodo: MetodoAvaliacao;
}

// Qual TMB vale pro aluno (25/09/2026): Mifflin, Katch ou — só na bioimpedância — a da balança. O ⓘ explica cada
// uma. Escolha sem valor (Katch sem % de gordura) fica apagada e o que vale/grava é a Mifflin.
const SeletorTmb = ({ valor, onChange, composicao, metodo }: Props) => {
  const opcoes = TMB_OPCOES.filter((o) => o.key !== "balanca" || metodo === "bioimpedancia");
  const efetiva = tmbValida(valor, composicao);
  const valores: Record<TmbMetodo, number | null> = {
    mifflin: composicao.tmbMifflin,
    katch: composicao.tmbKatch,
    balanca: composicao.tmbBalanca,
  };
  const falta: Record<TmbMetodo, string> = {
    mifflin: "Preencha peso, altura e idade",
    katch: metodo === "bioimpedancia" ? "Informe o % de gordura" : "Preencha as dobras",
    balanca: "Informe a TMB da balança",
  };

  return (
    <div data-seletor-tmb>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm text-muted-foreground font-body uppercase tracking-wider">TMB utilizada</span>
        <Legenda rotulo="TMB utilizada">
          <ul className="space-y-1.5">
            {opcoes.map((o) => (
              <li key={o.key}>
                <span className="font-semibold">{o.label}:</span> {TMB_LEGENDA[o.key]}
              </li>
            ))}
          </ul>
        </Legenda>
      </div>
      <div className="flex gap-0">
        {opcoes.map((o) => {
          const v = valores[o.key];
          const bloqueada = v === null && o.key !== "mifflin";
          return (
            <button
              key={o.key}
              type="button"
              data-tmb={o.key}
              aria-pressed={efetiva === o.key}
              disabled={bloqueada}
              onClick={() => onChange(o.key)}
              className={`flex-1 py-3 px-2 font-heading text-xs sm:text-sm uppercase tracking-widest transition-colors duration-200 ${
                efetiva === o.key ? "toggle-active" : "toggle-inactive"
              } ${bloqueada ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {o.label}
              <span className={`block text-xs font-body normal-case tracking-normal mt-1 ${v !== null ? "opacity-70" : "opacity-50"}`}>
                {v !== null ? `${Math.round(v)} kcal` : falta[o.key]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SeletorTmb;
