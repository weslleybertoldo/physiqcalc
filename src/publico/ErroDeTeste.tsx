import { useState } from "react";
import { Bomb, FlaskConical, Puzzle, Unplug, Wrench } from "lucide-react";
import { LimiteDeErro } from "@/ui/casca/LimiteDeErro";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";

/**
 * hml-10 (H-26 e H-48, D5) — /erro-teste: a página que quebra o Physiq de propósito, SÓ no build de staging. O Rotas.tsx põe a rota
 * com `import.meta.env.VITE_DB_SCHEMA === "staging"` direto na condição: na produção o Rollup corta o import e este arquivo nem
 * entra no bundle; o registro das páginas públicas (src/rotas/registro.ts) o deixa de fora (senão viraria /erro-de-teste em todo
 * build). Prova das 2 telas de erro e dos avisos ao erro-avisar (spec §3.3; e2e/hml10/telas.py):
 *   "quebrar esta parte"   o cartão de baixo quebra dentro de um LimiteDeErro → "Não deu para abrir esta parte" (S2)
 *   "quebrar a tela"       a página quebra fora de qualquer LimiteDeErro (a rota não usa Carregavel) → o ErrorBoundary (S1)
 *   "promessa sem catch"   uma promessa rejeitada que ninguém pega → o globalErrorHandler avisa (origem "promessa")
 * As mensagens dos erros levam dado pessoal FALSO de propósito: a tela não pode mostrar e o aviso tem que chegar limpo
 * ([e-mail], [cpf], [telefone], [token]).
 */

// o token de mentira é montado aqui: nenhum literal com cara de segredo no repo
const TOKEN_FALSO = [["ey", "JhbGciOiJub25lIn0"].join(""), ["ey", "JzdWIiOiJ0ZXN0ZSJ9"].join(""), "assinaturaFalsa"].join(".");
const MENSAGEM_TELA = `hml-10 S1: a tela quebrou de propósito — maria.teste@exemplo.com, CPF 123.456.789-09, token ${TOKEN_FALSO}`;
const MENSAGEM_PARTE = "hml-10 S2: esta parte quebrou de propósito — maria.teste@exemplo.com, telefone (82) 99999-1234";
const MENSAGEM_PROMESSA = "hml-10 promessa: rejeitada sem catch de propósito — maria.teste@exemplo.com";

/**
 * A parte que quebra. Armada, lança em TODA renderização: se lançasse só 1 vez, o React tentaria de novo, daria certo e a tela de
 * erro não apareceria.
 */
function ParteDeTeste({ armada }: { armada: boolean }) {
  if (armada) throw new TypeError(MENSAGEM_PARTE);
  return (
    <Cartao data-parte-de-teste className="flex items-center gap-3 p-5">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-linha bg-superficie text-verde-2">
        <Puzzle aria-hidden className="h-[20px] w-[20px]" strokeWidth={1.8} />
      </span>
      <p className="text-[13.5px] leading-relaxed text-texto-2">
        Esta parte está inteira. <strong className="font-semibold text-texto">quebrar esta parte</strong> troca só ela pela tela de erro de
        uma parte; o resto da página continua.
      </p>
    </Cartao>
  );
}

export default function ErroDeTeste() {
  const [telaQuebrada, setTelaQuebrada] = useState(false);
  const [parteQuebrada, setParteQuebrada] = useState(false);
  const [voltaDaParte, setVoltaDaParte] = useState(0);
  const [promessas, setPromessas] = useState(0);

  // fora de qualquer LimiteDeErro (a rota não usa Carregavel): sobe até o ErrorBoundary de dentro do App (S1)
  if (telaQuebrada) throw new Error(MENSAGEM_TELA);

  const rejeitar = () => {
    // sem catch de propósito: quem pega é o globalErrorHandler (unhandledrejection → aviso de origem "promessa")
    void Promise.reject(new Error(MENSAGEM_PROMESSA));
    setPromessas((n) => n + 1);
  };

  const consertar = () => {
    setParteQuebrada(false);
    setVoltaDaParte((n) => n + 1); // a key nova monta o LimiteDeErro de novo, já sem o erro guardado
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 sm:px-8" data-pagina-erro-teste>
      <header className="mb-4">
        <Chip tom="a" icone={FlaskConical}>
          só no staging
        </Chip>
        <h1 className="mt-2 font-body text-[24px] font-bold normal-case tracking-[-0.03em] text-texto sm:text-[30px]">Teste das telas de erro</h1>
        <p className="mt-1 text-[13.5px] text-texto-2">
          Cada botão quebra uma parte do Physiq de propósito, para conferir a tela de erro e o aviso que chega no Telegram. A mensagem de
          cada erro leva dados pessoais falsos: a tela não pode mostrar e o aviso tem que chegar limpo.
        </p>
      </header>
      <Cartao className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <Botao icone={Puzzle} onClick={() => setParteQuebrada(true)} data-quebrar="parte">
            quebrar esta parte
          </Botao>
          <Botao icone={Bomb} onClick={() => setTelaQuebrada(true)} data-quebrar="tela">
            quebrar a tela
          </Botao>
          <Botao icone={Unplug} onClick={rejeitar} data-quebrar="promessa">
            promessa sem catch
          </Botao>
        </div>
        {promessas > 0 && (
          <p className="text-[12.5px] text-texto-3" data-promessas={promessas}>
            Promessa rejeitada sem catch ({promessas}×): o globalErrorHandler pega e avisa (1 vez por carregamento da página).
          </p>
        )}
      </Cartao>
      <div className="mt-4 flex flex-col gap-3">
        <LimiteDeErro key={voltaDaParte} nome="erro de teste">
          <ParteDeTeste armada={parteQuebrada} />
        </LimiteDeErro>
        {parteQuebrada && (
          <div>
            <Botao tamanho="sm" icone={Wrench} onClick={consertar}>
              consertar esta parte
            </Botao>
          </div>
        )}
      </div>
    </div>
  );
}
