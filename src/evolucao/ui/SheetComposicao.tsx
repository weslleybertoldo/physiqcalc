import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { inteiro, linhaDaAvaliacao, num } from "../formato";
import { classificacaoDe, medidasPorGrupo } from "../serie";
import type { Avaliacao } from "../tipos";

function Secao({ titulo, children, marca }: { titulo: string; children: ReactNode; marca?: string }) {
  return (
    <section data-composicao-secao={marca ?? titulo}>
      <h3 className="pq-eyebrow mb-2">{titulo}</h3>
      {children}
    </section>
  );
}

function Campo({ rotulo, valor, destaque, largo }: { rotulo: string; valor: string; destaque?: boolean; largo?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-linha bg-superficie-3 px-3.5 py-[11px]", largo && "col-span-2")} data-campo={rotulo}>
      <div className="truncate text-[11.5px] font-medium text-texto-2">{rotulo}</div>
      <b className={cn("mt-[3px] block truncate text-[17px] font-bold tabular-nums tracking-[-0.02em]", destaque ? "text-violeta-3" : "text-texto")}>{valor}</b>
    </div>
  );
}

/** 178 → "178"; 177.5 → "177,5". */
function numLivre(v: number): string {
  return Number.isInteger(v) ? String(v) : num(v, 1);
}

/**
 * Composição corporal de uma avaliação — tudo o que a tela antiga mostrava (dados, tipo de avaliação, % de gordura, massas,
 * dados da balança, classificação, medidas e a TMB escolhida) + o que a antropometria da nutricionista traz (IMC e dobras).
 */
export function Composicao({ av }: { av: Avaliacao }) {
  const cls = classificacaoDe(av);
  const grupos = medidasPorGrupo(av);
  const dados: [string, string][] = [];
  if (av.sexo) dados.push(["Sexo", av.sexo === "M" ? "Masculino" : "Feminino"]);
  if (av.idade !== null) dados.push(["Idade", `${av.idade} anos`]);
  if (av.peso !== null) dados.push(["Peso", `${num(av.peso)} kg`]);
  if (av.altura !== null) dados.push(["Altura", `${numLivre(av.altura)} cm`]);
  const comp: [string, string, boolean?][] = [];
  if (av.gordura !== null || av.dobras.length) comp.push(["Tipo de avaliação", av.tipo]);
  if (av.gordura !== null) comp.push(["% de gordura", `${num(av.gordura)}%`, true]);
  if (av.massaGorda !== null) comp.push(["Massa gorda", `${num(av.massaGorda)} kg`]);
  if (av.massaMagra !== null) comp.push(["Massa magra", `${num(av.massaMagra)} kg`]);
  if (av.massaMuscular !== null) comp.push(["Massa muscular", `${num(av.massaMuscular)} kg`]);
  if (av.agua !== null) comp.push(["Água corporal", `${num(av.agua)}%`]);
  if (av.visceral !== null) comp.push(["Gordura visceral", `nível ${Number.isInteger(av.visceral) ? av.visceral : num(av.visceral)}`]);
  if (av.imc !== null) comp.push(["IMC", `${num(av.imc)}${av.classificacaoImc ? ` · ${av.classificacaoImc}` : ""}`]);
  return (
    <div className="flex flex-col gap-4 pb-2" data-composicao={av.id} data-composicao-origem={av.origem}>
      {dados.length > 0 && (
        <Secao titulo="Dados">
          <div className="grid grid-cols-2 gap-2">
            {dados.map(([r, v]) => (
              <Campo key={r} rotulo={r} valor={v} />
            ))}
          </div>
        </Secao>
      )}
      {comp.length > 0 && (
        <Secao titulo="Composição corporal" marca="composicao">
          <div className="grid grid-cols-2 gap-2">
            {comp.map(([r, v, d]) => (
              // "Jackson & Pollock — 3 dobras" não cabe em meia linha: o tipo longo ocupa a linha toda
              <Campo key={r} rotulo={r} valor={v} destaque={d} largo={r === "Tipo de avaliação" && v.length > 14} />
            ))}
          </div>
        </Secao>
      )}
      {cls && (
        <Secao titulo="Classificação">
          <div className="rounded-2xl border border-linha bg-superficie-3 px-3.5 py-3" data-classificacao={cls.label}>
            <div className="flex items-center gap-2">
              <i aria-hidden className="h-2 w-2 rounded-full" style={{ background: cls.cor }} />
              <b className="text-[16px] font-bold" style={{ color: cls.cor }}>
                {cls.label}
              </b>
            </div>
            <p className="mt-1 text-[12.5px] text-texto-2">{cls.descricao}</p>
            <p className="mt-2 text-[10.5px] italic leading-relaxed text-texto-3">
              Gallagher et al. (2000) Am J Clin Nutr 72:694-701 · ACE · Lohman (1993) · ACSM{cls.ajuste > 0 ? ` · ajuste pela idade: +${cls.ajuste}%` : ""}
            </p>
          </div>
        </Secao>
      )}
      {av.dobras.length > 0 && (
        <Secao titulo="Dobras (mm)" marca="dobras">
          <div className="grid grid-cols-3 gap-2">
            {av.dobras.map((d) => (
              <Campo key={d.rotulo} rotulo={d.rotulo} valor={num(d.valor)} />
            ))}
          </div>
        </Secao>
      )}
      {grupos.length > 0 && (
        <Secao titulo="Medidas (cm)" marca="medidas">
          <div className="flex flex-col gap-3">
            {grupos.map((g) => (
              <div key={g.grupo}>
                <div className="mb-1.5 text-[11px] font-semibold text-texto-3">{g.rotulo}</div>
                <div className="grid grid-cols-3 gap-2">
                  {g.itens.map((m) => (
                    <Campo key={m.chave} rotulo={m.rotulo} valor={num(m.valor)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Secao>
      )}
      {av.tmb && (
        <Secao titulo="Taxa metabólica basal" marca="tmb">
          <div className="rounded-2xl border px-3.5 py-3" style={{ borderColor: "var(--p-chip-t-borda)", background: "var(--p-chip-t-fundo)" }} data-tmb-aluno={av.tmb.metodo}>
            <div className="text-[11.5px] font-semibold text-violeta-3">TMB {av.tmb.rotulo}</div>
            <b className="mt-1 block text-[26px] font-bold tabular-nums tracking-[-0.03em] text-texto">
              {inteiro(av.tmb.valor)} <small className="text-[13px] font-semibold text-texto-2">kcal/dia</small>
            </b>
          </div>
        </Secao>
      )}
      {av.observacao && (
        <Secao titulo="Observação">
          <p className="text-[13px] italic leading-relaxed text-texto-2">“{av.observacao}”</p>
        </Secao>
      )}
    </div>
  );
}

/** O "Ver" da avaliação (tela 4): a composição completa num painel de baixo (no painel do profissional, W17, pela direita). */
export function SheetComposicao({ av, aoFechar, lado = "baixo" }: { av: Avaliacao | null; aoFechar: () => void; lado?: "baixo" | "direita" }) {
  return (
    <PainelDeslizante
      lado={lado}
      aberto={!!av}
      aoMudar={(v) => !v && aoFechar()}
      titulo="Composição corporal"
      descricao={av ? `${av.titulo} · ${linhaDaAvaliacao(av)}` : undefined}
      className="max-h-[92vh]"
    >
      {av && <Composicao av={av} />}
    </PainelDeslizante>
  );
}
