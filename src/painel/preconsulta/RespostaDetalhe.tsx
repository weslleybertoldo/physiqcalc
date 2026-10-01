// Physiq W21 — porta de src/components/respostas-preconsulta/RespostaDetalhe.tsx do PhysiqNutri (main 294887a), no visual premium: a
// tabela Pergunta · Resposta · Pontos de uma resposta de pré-consulta. Os `data-*` das linhas são os do site antigo
// (`data-resposta-linha`, `data-resposta-valor`, `data-resposta-pontos-linha`). Pontos sempre; a faixa só quando existe.
import { formatarPontos, lerPerguntas, lerRespostas, pontuarPergunta, textoPontuacao, textoRespondidas, textoResposta } from "@/nutricao/prontuario/lib/questionariosUtil";
import type { RespostaComFormulario } from "./dados";
import { contatoResposta, formatarDataHoraResposta, pontosDaResposta } from "./respostasUtil";

const TH = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-3";
const TD = "px-3 py-2.5 align-top text-[13.5px] leading-snug";

export default function RespostaDetalhe({ resposta: r }: { resposta: RespostaComFormulario }) {
  const perguntas = lerPerguntas(r.perguntas);
  const respostas = lerRespostas(r.respostas);
  const pts = pontosDaResposta(r);
  const contato = contatoResposta(r);
  return (
    <div className="mt-3 rounded-2xl border border-linha bg-[rgba(255,255,255,.02)]" data-resposta-detalhe>
      <p className="border-b border-linha-3 px-3.5 py-2.5 text-[12.5px] text-texto-2" data-resposta-detalhe-resumo>
        Respondida por <b className="font-semibold text-texto">{r.nome}</b>
        {contato ? ` (${contato})` : ""} em {formatarDataHoraResposta(r.respondido_em)} · {textoRespondidas(pts.respondidas, pts.total)}
        {pts.max > 0 && (
          <>
            {" · "}
            <b className="font-semibold text-texto" data-resposta-detalhe-resultado>
              {textoPontuacao(pts.pontos, pts.max)}
              {pts.temFaixas && pts.faixa ? ` · ${pts.faixa}` : ""}
            </b>
          </>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha-3">
              <th className={TH}>Pergunta</th>
              <th className={TH}>Resposta</th>
              <th className={`${TH} text-right`}>Pontos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linha-3">
            {perguntas.map((q, i) => {
              const v = respostas[q.id];
              const pontos = pontuarPergunta(q, v);
              return (
                <tr key={q.id} data-resposta-linha={i} data-resposta-valor={textoResposta(q, v)} data-resposta-pontos-linha={formatarPontos(pontos)}>
                  <td className={`${TD} text-texto-2`}><span className="tabular-nums text-texto-3">{i + 1}.</span> {q.texto}</td>
                  <td className={`${TD} text-texto`}>{textoResposta(q, v)}</td>
                  <td className={`${TD} text-right tabular-nums text-texto`}>{formatarPontos(pontos)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
