// Physiq W-A P6 — o "Ver tudo" do card Rotinas (spec §4.5): as rotinas vivas (as de profissional desta matrícula abrem a folha da P3 para mudar
// ou apagar), as APAGADAS ("apagada pelo aluno em 12/10" — P8b: o aluno apaga até a do profissional, e o profissional vê) e o HISTÓRICO ("Ana
// mudou: horário 08:00 → 09:00"). Só lê o que o card já trouxe (a mesma consulta).
import { History, Trash2 } from "lucide-react";
import type { RotinaDoProfissional, RotinasDoAluno } from "@/aluno-dia/tipos";
import { linhaDaRotina } from "@/rotinas/regras";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { LinhaDaRotina } from "./LinhaDaRotina";
import { TEXTOS, apagadasDoAluno, eventoNaTela, nomeDaRotina, textoApagada, vivasDoAluno } from "./regras";

function Titulo({ children }: { children: string }) {
  return <h4 className="mb-1.5 mt-4 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-texto-3 first:mt-1">{children}</h4>;
}

export function FolhaTodasAsRotinas({
  aberta,
  aoMudar,
  dados,
  aoEditar,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  dados: RotinasDoAluno;
  aoEditar?: (r: RotinaDoProfissional) => void;
}) {
  const vivas = vivasDoAluno(dados.rotinas);
  const apagadas = apagadasDoAluno(dados.rotinas);
  return (
    <PainelDeslizante aberto={aberta} aoMudar={aoMudar} titulo={TEXTOS.todas} lado="direita">
      <div className="flex flex-col" data-rotinas-tudo>
        <Titulo>{TEXTOS.vivas}</Titulo>
        {vivas.length === 0 ? (
          <p className="text-[12.5px] text-texto-3">{TEXTOS.nenhumaViva}</p>
        ) : (
          <ul className="flex flex-col gap-1" data-rotinas-tudo-vivas={vivas.length}>
            {vivas.map((r) => (
              <LinhaDaRotina key={r.id} rotina={r} sub={linhaDaRotina(r)} aoAbrir={r.pode_editar && aoEditar ? () => aoEditar(r) : undefined} />
            ))}
          </ul>
        )}

        <Titulo>{TEXTOS.apagadas}</Titulo>
        {apagadas.length === 0 ? (
          <p className="text-[12.5px] text-texto-3">{TEXTOS.nenhumaApagada}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-rotinas-apagadas={apagadas.length}>
            {apagadas.map((r) => (
              <li key={r.id} className="flex min-w-0 items-start gap-2.5" data-rotina-apagada={r.id} data-rotina-apagada-pelo-aluno={r.arquivada_pelo_aluno ? "1" : "0"}>
                <Trash2 aria-hidden className="mt-0.5 h-4 w-4 flex-none text-texto-4" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-texto-2 line-through decoration-texto-4">{r.nome}</span>
                  <span className="block text-[11.5px] text-ambar-3" data-rotina-apagada-texto>{textoApagada(r, dados.historico)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <Titulo>{TEXTOS.historico}</Titulo>
        {dados.historico.length === 0 ? (
          <p className="text-[12.5px] text-texto-3">{TEXTOS.nenhumEvento}</p>
        ) : (
          <ul className="flex flex-col gap-2.5" data-rotinas-historico={dados.historico.length}>
            {dados.historico.map((e, i) => {
              const t = eventoNaTela(e);
              return (
                <li key={`${e.rotina_id}-${e.em}-${i}`} className="flex min-w-0 items-start gap-2.5" data-rotina-evento={e.o_que} data-rotina-evento-quem={e.quem}>
                  <History aria-hidden className="mt-0.5 h-4 w-4 flex-none text-texto-4" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-texto-2">
                    <span className="block">
                      <b className="font-semibold text-texto">{t.quem}</b> {t.acao} <span className="text-texto">{nomeDaRotina(dados.rotinas, e.rotina_id)}</span>
                    </span>
                    {t.mudancas.map((m) => (
                      <span key={m} className="block text-[12px] text-texto-2" data-rotina-evento-mudanca>{m}</span>
                    ))}
                    <span className="block text-[11px] text-texto-3">{t.quando}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PainelDeslizante>
  );
}
