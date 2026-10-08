import { Campo } from "@/entrada/pecas/Campo";
import { dataDeHoje, erroDoNascimento, type ErroNascimento } from "./regras";

/**
 * hml-12 (H-30, P4) — a data de nascimento do aluno sem profissional (o plano do app é para 18+): na tela do aceite (o aluno do app
 * que ainda não tem a data) e no "Treinar sem profissional". Obrigatória; a cada troca devolve a data e o erro dela pela regra 18+
 * (erroDoNascimento) — quem chama decide quando mostrar. O banco confere de novo. Entra só no build de staging até a virada (quem
 * está fora de src/publico/legal/ a carrega com o `lazy` atrás da condição do Vite).
 */
export default function CampoNascimento({
  valor,
  aoMudar,
  desabilitado,
}: {
  valor: string;
  aoMudar: (valor: string, erro: ErroNascimento | null) => void;
  desabilitado?: boolean;
}) {
  return (
    <div data-campo-nascimento>
      <Campo
        rotulo="Data de nascimento"
        type="date"
        required
        min="1900-01-01"
        max={dataDeHoje()}
        value={valor}
        disabled={desabilitado}
        autoComplete="bday"
        dica="O plano sem profissional é para maiores de 18 anos."
        onChange={(e) => aoMudar(e.target.value, erroDoNascimento(e.target.value))}
      />
    </div>
  );
}
