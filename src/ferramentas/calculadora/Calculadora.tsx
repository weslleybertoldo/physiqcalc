import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, ArrowRightLeft, Eraser, FileDown, Flame, Ruler, Scale, Table2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { medidasVazias, type MedidasCorporais } from "@/types/medidas";
import { carregarComparativo, limparComparativo, salvarComparativo } from "@/utils/storageComparativo";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Segmentado } from "@/ui/premium/Segmentado";
import { ConfirmarPerigo } from "../Confirmar";
import {
  DOBRAS_3, DOBRAS_7, FAIXAS_REFERENCIA, NIVEIS_ATIVIDADE, classificacao, dobrasDoPdf, numero, resultadoDobras, textoVariacao, tmbMifflin, tomVariacao,
  type Protocolo, type Sexo,
} from "./calculos";
import { DADOS_VAZIOS, GRUPOS_MEDIDAS, NOVO_VAZIO, REF_VAZIO, montarRelatorio, previa, type DadosComuns, type NovoData, type RefData } from "./comparativo";

// as MESMAS chaves do aparelho da calculadora de hoje: quem já usava não perde o que digitou
const LS_BASICO = "physiqcalc-basic";
const LS_MEDIDAS = "physiqcalc-medidas";
const LS_ACIMA = "physiqcalc-folds-above";
const LS_ABAIXO = "physiqcalc-folds-below";

type Aba = "comp" | "comparativo";
interface Basico {
  activeTab: Aba;
  name: string;
  gender: Sexo;
  age: string;
  height: string;
  weight: string;
}

function lerJson<T>(chave: string): T | null {
  try {
    const r = localStorage.getItem(chave);
    return r ? (JSON.parse(r) as T) : null;
  } catch {
    return null;
  }
}
function gravarJson(chave: string, v: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(v));
  } catch {
    /* sem armazenamento: vale só nesta abertura */
  }
}

const CLASSE_CAMPO =
  "h-11 w-full rounded-[14px] border border-linha-2 bg-superficie px-3.5 text-[15px] tabular-nums text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [color-scheme:dark]";

function Campo({ rotulo, unidade, valor, aoMudar, tipo = "number", placeholder, ...dados }: {
  rotulo: string;
  unidade?: string;
  valor: string | number;
  aoMudar: (v: string) => void;
  tipo?: "number" | "text" | "date";
  placeholder?: string;
} & Record<`data-${string}`, unknown>) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">{rotulo}</span>
      <span className="relative flex items-center">
        <input type={tipo} inputMode={tipo === "number" ? "decimal" : undefined} step={tipo === "number" ? "0.1" : undefined} value={valor}
          onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder ?? (tipo === "number" ? "0" : "")} className={cn(CLASSE_CAMPO, unidade && "pr-12")} {...dados} />
        {unidade && <span className="pointer-events-none absolute right-3.5 text-[12px] text-texto-3">{unidade}</span>}
      </span>
    </label>
  );
}

function Numero({ rotulo, valor, unidade, tom, ...dados }: { rotulo: string; valor: ReactNode; unidade?: string; tom?: string } & Record<`data-${string}`, unknown>) {
  return (
    <div className="rounded-[18px] border border-linha bg-superficie px-4 py-3.5" {...dados}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">{rotulo}</p>
      <p className="mt-1 text-[24px] font-bold tabular-nums tracking-[-0.03em]" style={{ color: tom ?? "var(--p-texto)" }}>
        {valor}
        {unidade && <span className="ml-1.5 text-[13px] font-medium text-texto-3">{unidade}</span>}
      </p>
    </div>
  );
}

function TabelaAtividade({ tmb, ...dados }: { tmb: number } & Record<`data-${string}`, unknown>) {
  return (
    <div className="mt-3 divide-y divide-linha-3 rounded-[16px] border border-linha" {...dados}>
      {NIVEIS_ATIVIDADE.map((n) => (
        <div key={n.rotulo} className="flex items-center justify-between gap-3 px-3.5 py-2.5" title={n.dica}>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-texto">{n.rotulo} <span className="font-normal text-texto-4">× {String(n.fator).replace(".", ",")}</span></p>
            <p className="truncate text-[11.5px] text-texto-4">{n.dica}</p>
          </div>
          <p className="flex-none text-[15px] font-bold tabular-nums text-texto">{Math.round(tmb * n.fator)} <span className="text-[11.5px] font-medium text-texto-3">kcal</span></p>
        </div>
      ))}
    </div>
  );
}

function FormMedidas({ medidas, aoMudar, prefixo }: { medidas: MedidasCorporais; aoMudar: (m: MedidasCorporais) => void; prefixo: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      {GRUPOS_MEDIDAS.map((g) => (
        <div key={g.titulo}>
          <p className="mb-2 border-b border-linha-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-texto-4">{g.titulo}</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
            {g.campos.map((c) => (
              <Campo key={c.key} rotulo={c.label} unidade="cm" valor={medidas[c.key]} data-campo-medida={`${prefixo}-${c.key}`}
                aoMudar={(v) => aoMudar({ ...medidas, [c.key]: v === "" ? "" : +v.replace(",", ".") })} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const corVariacao = (t: "bom" | "ruim" | "igual") => (t === "bom" ? "var(--p-verde-3)" : t === "ruim" ? "var(--p-rosa-3)" : "var(--p-texto-3)");

/**
 * A Calculadora (W26 — C52/C63; padrão da tela 8): o "Cálculo manual" do Calc no visual premium — composição corporal (TMB de
 * Mifflin-St Jeor, % de gordura por 3 ou 7 dobras, massas, classificação de Gallagher, TMB específico de Katch-McArdle, gasto por nível
 * de atividade, medidas e a tabela de referência, com o PDF) e o comparativo antes × depois (com o PDF). Os PDFs são os de hoje, com a
 * marca PHYSIQ. Nada vai para o servidor: os dados ficam no aparelho (as mesmas chaves de hoje). Usada em Ferramentas › Calculadora e
 * em /calculator (sem login).
 */
export function CalculadoraFerramenta({ cabecalho }: { cabecalho?: (acoes: ReactNode) => ReactNode }) {
  const salvo = useMemo(() => lerJson<Partial<Basico>>(LS_BASICO), []);
  const [aba, setAba] = useState<Aba>(salvo?.activeTab === "comparativo" ? "comparativo" : "comp");
  const [nome, setNome] = useState(salvo?.name ?? "");
  const [sexo, setSexo] = useState<Sexo>(salvo?.gender === "female" ? "female" : "male");
  const [idade, setIdade] = useState(salvo?.age ?? "");
  const [altura, setAltura] = useState(salvo?.height ?? "");
  const [peso, setPeso] = useState(salvo?.weight ?? "");
  const [medidas, setMedidas] = useState<MedidasCorporais>(() => ({ ...medidasVazias, ...(lerJson<MedidasCorporais>(LS_MEDIDAS) ?? {}) }));
  const [protocolo, setProtocolo] = useState<Protocolo>("3");
  const [dobras3, setDobras3] = useState<string[]>(() => {
    const a = lerJson<{ fold1?: string; fold2?: string; fold3?: string }>(LS_ACIMA);
    return [a?.fold1 ?? "", a?.fold2 ?? "", a?.fold3 ?? ""];
  });
  const [dobras7, setDobras7] = useState<string[]>(() => {
    const b = lerJson<string[]>(LS_ABAIXO);
    return Array.isArray(b) && b.length === 7 ? b.map((x) => String(x ?? "")) : ["", "", "", "", "", "", ""];
  });
  const [sexoTabela, setSexoTabela] = useState<"M" | "F">(salvo?.gender === "female" ? "F" : "M");
  const [refD, setRefD] = useState<RefData>({ ...REF_VAZIO });
  const [novo, setNovo] = useState<NovoData>({ ...NOVO_VAZIO });
  const [comuns, setComuns] = useState<DadosComuns>({ ...DADOS_VAZIOS });
  const [relatorioVisivel, setRelatorioVisivel] = useState(false);
  const [limpar, setLimpar] = useState(false);
  const [carregouComparativo, setCarregouComparativo] = useState(false);

  useEffect(() => gravarJson(LS_BASICO, { activeTab: aba, name: nome, gender: sexo, age: idade, height: altura, weight: peso }), [aba, nome, sexo, idade, altura, peso]);
  useEffect(() => gravarJson(LS_MEDIDAS, medidas), [medidas]);
  useEffect(() => gravarJson(LS_ACIMA, { fold1: dobras3[0], fold2: dobras3[1], fold3: dobras3[2] }), [dobras3]);
  useEffect(() => gravarJson(LS_ABAIXO, dobras7), [dobras7]);
  useEffect(() => {
    const s = carregarComparativo();
    if (s) {
      setRefD(s.refData as RefData);
      setNovo(s.novoData as NovoData);
      setComuns(s.dadosComuns as DadosComuns);
    }
    setCarregouComparativo(true);
  }, []);
  useEffect(() => {
    if (carregouComparativo) salvarComparativo({ refData: refD, novoData: novo, dadosComuns: comuns });
  }, [refD, novo, comuns, carregouComparativo]);

  const nIdade = numero(idade);
  const nAltura = numero(altura);
  const nPeso = numero(peso);
  const tmb = tmbMifflin(sexo, nIdade, nAltura, nPeso);
  const valoresDobras = (protocolo === "3" ? dobras3 : dobras7).map(numero);
  const resultado = resultadoDobras(protocolo, sexo, valoresDobras, nIdade, nPeso);
  const cls = resultado ? classificacao(resultado.bf, sexo, nIdade) : null;
  const rel = useMemo(() => montarRelatorio(refD, novo, comuns), [refD, novo, comuns]);

  const gerarPdfComposicao = async () => {
    try {
      const { generateReport } = await import("@/lib/generateReport");
      await generateReport({
        name: nome,
        gender: sexo,
        age: nIdade,
        height: nAltura,
        weight: nPeso,
        tmbMifflin: tmb,
        bodyFatResult: resultado ? { bf: resultado.bf, tmbKatch: resultado.tmbKatch } : null,
        medidas,
        dobras: resultado ? dobrasDoPdf(protocolo, sexo, valoresDobras) : undefined,
      });
      toast.success("PDF gerado", { description: "Composição corporal" });
    } catch (e) {
      toast.error("Não foi possível gerar o PDF", { description: e instanceof Error ? e.message : "erro inesperado" });
    }
  };
  const gerarPdfComparativo = async () => {
    try {
      const { baixarPdfComparativo } = await import("./pdfComparativo");
      const arquivo = await baixarPdfComparativo(refD, novo, comuns);
      toast.success("PDF gerado", { description: arquivo });
    } catch (e) {
      toast.error("Não foi possível gerar o PDF", { description: e instanceof Error ? e.message : "erro inesperado" });
    }
  };
  const limparTudo = () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("physiqcalc")).forEach((k) => localStorage.removeItem(k));
    } catch {
      /* sem armazenamento */
    }
    limparComparativo();
    setNome("");
    setSexo("male");
    setIdade("");
    setAltura("");
    setPeso("");
    setMedidas({ ...medidasVazias });
    setDobras3(["", "", ""]);
    setDobras7(["", "", "", "", "", "", ""]);
    setRefD({ ...REF_VAZIO });
    setNovo({ ...NOVO_VAZIO });
    setComuns({ ...DADOS_VAZIOS });
    setRelatorioVisivel(false);
    setLimpar(false);
    toast.success("Dados limpos");
  };

  const acoes = (
    <>
      <Botao icone={Eraser} onClick={() => setLimpar(true)} data-btn-limpar-calculadora>Limpar</Botao>
      {aba === "comp" ? (
        <Botao variante="w" icone={FileDown} onClick={() => void gerarPdfComposicao()} disabled={!tmb && !resultado} data-btn-pdf-composicao>Gerar PDF</Botao>
      ) : (
        <Botao variante="w" icone={FileDown} onClick={() => void gerarPdfComparativo()} disabled={!refD.peso && !novo.peso} data-btn-pdf-comparativo>Gerar PDF</Botao>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4" data-calculadora data-aba-calculadora={aba} data-tmb={tmb ? Math.round(tmb) : ""} data-bf={resultado ? resultado.bf.toFixed(1) : ""}>
      {cabecalho?.(acoes)}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado<Aba> rotulo="Calculadora" valor={aba} aoMudar={setAba}
          opcoes={[{ valor: "comp", rotulo: "Composição corporal" }, { valor: "comparativo", rotulo: "Comparativo" }]} />
        {!cabecalho && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>

      {aba === "comp" ? (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Cartao brilho className="p-4 sm:p-5" data-cartao-dados>
              <CabecalhoCartao titulo="Dados da pessoa" extra={<Chip tom="t" icone={Activity}>TMB</Chip>} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo rotulo="Nome" tipo="text" valor={nome} aoMudar={setNome} placeholder="Nome da pessoa" data-campo-nome />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">Sexo</span>
                  <Segmentado<Sexo> rotulo="Sexo" valor={sexo} aoMudar={(v) => { setSexo(v); setSexoTabela(v === "male" ? "M" : "F"); }} className="h-11 items-center"
                    opcoes={[{ valor: "male", rotulo: "Masculino" }, { valor: "female", rotulo: "Feminino" }]} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Campo rotulo="Idade" unidade="anos" valor={idade} aoMudar={setIdade} data-campo-idade />
                <Campo rotulo="Altura" unidade="cm" valor={altura} aoMudar={setAltura} data-campo-altura />
                <Campo rotulo="Peso" unidade="kg" valor={peso} aoMudar={setPeso} data-campo-peso />
              </div>
              {tmb ? (
                <div className="mt-4" data-resultado-tmb>
                  <Numero rotulo="Taxa metabólica basal · Mifflin-St Jeor" valor={Math.round(tmb)} unidade="kcal/dia" tom="var(--p-violeta-3)" data-tmb-mifflin />
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">Gasto energético diário por nível de atividade</p>
                  <TabelaAtividade tmb={tmb} data-tabela-tdee-mifflin />
                </div>
              ) : (
                <p className="mt-4 text-[12.5px] text-texto-3">Preencha idade, altura e peso para ver a TMB e o gasto por nível de atividade.</p>
              )}
            </Cartao>

            <Cartao className="p-4 sm:p-5" data-cartao-medidas>
              <CabecalhoCartao titulo="Medidas corporais" extra={<Chip tom="g" icone={Ruler}>OPCIONAL</Chip>} />
              <p className="-mt-1 mb-3 text-[12px] text-texto-3">Entram no PDF quando preenchidas.</p>
              <FormMedidas medidas={medidas} aoMudar={setMedidas} prefixo="comp" />
            </Cartao>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Cartao className="p-4 sm:p-5" data-cartao-dobras data-protocolo={protocolo}>
              <CabecalhoCartao titulo="% de gordura · dobras cutâneas" extra={<Chip tom="n" icone={Scale}>{protocolo === "3" ? "3 DOBRAS" : "7 DOBRAS"}</Chip>} />
              <Segmentado<Protocolo> rotulo="Protocolo" valor={protocolo} aoMudar={setProtocolo}
                opcoes={[{ valor: "3", rotulo: "Acima de 7%" }, { valor: "7", rotulo: "Abaixo de 7%" }]} />
              <p className="mt-2.5 text-[12px] text-texto-3">
                {protocolo === "3"
                  ? `Protocolo Jackson & Pollock — 3 dobras cutâneas. ${sexo === "male" ? "Masculino." : "Feminino."}`
                  : "Para atletas com menos de 7% de gordura: 7 dobras e a fórmula de Katch-McArdle, que trabalha direto com a massa magra."}
              </p>
              <div className={cn("mt-3 grid gap-3", protocolo === "3" ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
                {(protocolo === "3" ? DOBRAS_3[sexo] : DOBRAS_7).map((rotulo, i) => (
                  <Campo key={`${protocolo}-${rotulo}`} rotulo={rotulo} unidade="mm" data-campo-dobra={`${protocolo}-${i}`}
                    valor={(protocolo === "3" ? dobras3 : dobras7)[i] ?? ""}
                    aoMudar={(v) => (protocolo === "3" ? setDobras3 : setDobras7)((d) => d.map((x, k) => (k === i ? v : x)))} />
                ))}
              </div>
              {!nIdade || !nPeso ? (
                <p className="mt-3 text-[12.5px] text-texto-3">Preencha idade e peso nos dados para calcular.</p>
              ) : resultado && cls ? (
                <div className="mt-4 flex flex-col gap-3" data-resultado-dobras>
                  <div className="grid grid-cols-3 gap-2.5">
                    <Numero rotulo="% gordura" valor={`${resultado.bf.toFixed(1)}%`} tom="var(--p-ambar)" data-bf-valor />
                    <Numero rotulo="Massa gorda" valor={resultado.massaGorda.toFixed(1)} unidade="kg" />
                    <Numero rotulo="Massa magra" valor={resultado.massaMagra.toFixed(1)} unidade="kg" tom="var(--p-verde-3)" />
                  </div>
                  <div className="rounded-[18px] border border-linha bg-superficie px-4 py-3.5" data-classificacao={cls.label}>
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cls.cor }} /> Classificação
                    </p>
                    <p className="mt-1 text-[19px] font-bold" style={{ color: cls.cor }}>{cls.label}</p>
                    <p className="text-[12px] text-texto-3">{cls.descricao}</p>
                    <p className="mt-1.5 text-[10.5px] italic text-texto-4">
                      Gallagher et al. (2000) Am J Clin Nutr 72:694–701 · ACE · Lohman (1993) · ACSM{cls.ajuste > 0 ? ` · Ajuste etário: +${cls.ajuste}%` : ""}
                    </p>
                  </div>
                  <div>
                    <Numero rotulo="TMB específico · Katch-McArdle" valor={Math.round(resultado.tmbKatch)} unidade="kcal/dia" tom="var(--p-verde-3)" data-tmb-katch />
                    <TabelaAtividade tmb={resultado.tmbKatch} data-tabela-tdee-katch />
                    <p className="mt-2 text-[11.5px] text-texto-4">O TMB específico usa a massa magra real para calcular o gasto energético — mais preciso para atletas.</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[12.5px] text-texto-3">Preencha {protocolo === "3" ? "as 3 dobras" : "as 7 dobras"} para ver a composição.</p>
              )}
            </Cartao>

            <Cartao className="p-4 sm:p-5" data-cartao-referencia>
              <CabecalhoCartao titulo="Referência · % gordura" extra={<Chip tom="g" icone={Table2}>GALLAGHER</Chip>}
                acao={<Segmentado<"M" | "F"> rotulo="Sexo da tabela" valor={sexoTabela} aoMudar={setSexoTabela} opcoes={[{ valor: "M", rotulo: "Masc" }, { valor: "F", rotulo: "Fem" }]} />} />
              <div className="divide-y divide-linha-3">
                {FAIXAS_REFERENCIA[sexoTabela].map((f) => (
                  <div key={f.faixa} className={cn("flex items-center justify-between py-2.5", cls?.label === f.faixa && sexoTabela === (sexo === "male" ? "M" : "F") && "font-bold")}>
                    <span className="flex items-center gap-2 text-[13.5px] text-texto">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: f.cor }} /> {f.faixa}
                    </span>
                    <span className="text-[13px] tabular-nums text-texto-2">{f.range}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10.5px] italic text-texto-4">Valores base para adultos de 20 a 39 anos. Acima de 40 anos: +2%. Acima de 60 anos: +4%.</p>
            </Cartao>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-comparativo>
          <Cartao className="p-4">
            <p className="text-[12.5px] leading-relaxed text-texto-2">
              Preencha os dados de antes e os de agora. Nada é salvo no servidor: fica neste aparelho por 24 horas.
            </p>
          </Cartao>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            {(["ref", "novo"] as const).map((lado) => {
              const d = lado === "ref" ? refD : novo;
              const mudar = (patch: Partial<RefData & NovoData>) => (lado === "ref" ? setRefD({ ...refD, ...patch }) : setNovo({ ...novo, ...patch }));
              const p = previa(d.peso, d.pctGordura, comuns.sexo, comuns.idade);
              return (
                <Cartao key={lado} brilho={lado === "novo"} className="p-4 sm:p-5" data-lado={lado}>
                  <CabecalhoCartao titulo={lado === "ref" ? "Antes · referência" : "Agora"} extra={<Chip tom={lado === "ref" ? "g" : "t"}>{lado === "ref" ? "ANTES" : "AGORA"}</Chip>} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {lado === "ref" && <Campo rotulo="Nome" tipo="text" valor={refD.nome} aoMudar={(v) => setRefD({ ...refD, nome: v })} placeholder="ex.: Lucas" data-campo-ref-nome />}
                    <Campo rotulo="Data (opcional)" tipo="date" valor={d.data} aoMudar={(v) => mudar({ data: v })} data-campo-data={lado} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Campo rotulo="Peso" unidade="kg" valor={d.peso} aoMudar={(v) => mudar({ peso: v === "" ? "" : +v.replace(",", ".") })} data-campo-peso-lado={lado} />
                    <Campo rotulo="% gordura" unidade="%" valor={d.pctGordura} aoMudar={(v) => mudar({ pctGordura: v === "" ? "" : +v.replace(",", ".") })} data-campo-gordura-lado={lado} />
                  </div>
                  <div className="mt-4">
                    <FormMedidas medidas={d.medidas} aoMudar={(m) => mudar({ medidas: m })} prefixo={lado} />
                  </div>
                  {p && (
                    <div className="mt-4 grid grid-cols-3 gap-2.5 rounded-[16px] border border-linha bg-superficie p-3 text-center" data-previa={lado}>
                      <div><p className="text-[11px] text-texto-4">Massa gorda</p><p className="text-[14px] font-bold tabular-nums text-texto">{p.mg.toFixed(1)} kg</p></div>
                      <div><p className="text-[11px] text-texto-4">Massa magra</p><p className="text-[14px] font-bold tabular-nums text-texto">{p.mm.toFixed(1)} kg</p></div>
                      <div><p className="text-[11px] text-texto-4">Classificação</p><p className="text-[14px] font-bold" style={{ color: p.cls.cor }}>{p.cls.label}</p></div>
                    </div>
                  )}
                </Cartao>
              );
            })}
          </div>

          <Cartao className="p-4 sm:p-5" data-cartao-comuns>
            <CabecalhoCartao titulo="Dados para a TMB · valem para os dois lados" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">Sexo</span>
                <Segmentado<"M" | "F"> rotulo="Sexo do comparativo" valor={comuns.sexo} aoMudar={(v) => setComuns({ ...comuns, sexo: v })} className="h-11 items-center"
                  opcoes={[{ valor: "M", rotulo: "Masculino" }, { valor: "F", rotulo: "Feminino" }]} />
              </div>
              <Campo rotulo="Idade" unidade="anos" valor={comuns.idade} aoMudar={(v) => setComuns({ ...comuns, idade: v === "" ? "" : +v })} data-campo-comum-idade />
              <Campo rotulo="Altura" unidade="cm" valor={comuns.altura} aoMudar={(v) => setComuns({ ...comuns, altura: v === "" ? "" : +v })} data-campo-comum-altura />
            </div>
            <Botao variante="v" icone={ArrowRightLeft} className="mt-4 w-full justify-center" onClick={() => setRelatorioVisivel(true)} data-btn-gerar-comparativo>
              Gerar relatório comparativo
            </Botao>
          </Cartao>

          {relatorioVisivel && (
            <Cartao brilho className="p-4 sm:p-5" data-relatorio-comparativo>
              <CabecalhoCartao titulo="Relatório comparativo" extra={<Chip tom="t" icone={Flame}>ANTES × AGORA</Chip>}
                acao={<Botao tamanho="sm" variante="w" icone={FileDown} onClick={() => void gerarPdfComparativo()} data-btn-pdf-relatorio>PDF</Botao>} />
              <p className="-mt-1 mb-3 text-[12px] text-texto-3">
                {refD.nome || "Sem nome"} · {comuns.sexo === "M" ? "Masculino" : "Feminino"}, {rel.idade} anos
                {refD.data && ` · Antes: ${refD.data.split("-").reverse().join("/")}`}
                {novo.data && ` · Agora: ${novo.data.split("-").reverse().join("/")}`}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-linha-2 text-left text-[11px] uppercase tracking-[0.12em] text-texto-4">
                      <th className="py-2 pr-2 font-semibold">Métrica</th><th className="py-2 pr-2 font-semibold">Antes</th><th className="py-2 pr-2 font-semibold">Agora</th><th className="py-2 font-semibold">Variação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linha-3">
                    {rel.composicao.map((l) => {
                      const tom = tomVariacao(l.d, l.inv);
                      return (
                        <tr key={l.lbl} data-linha-comparativo={l.lbl}>
                          <td className="py-2.5 pr-2 text-texto-2">{l.lbl}</td>
                          <td className="py-2.5 pr-2 tabular-nums text-texto-3">{l.r}</td>
                          <td className="py-2.5 pr-2 font-semibold tabular-nums text-texto">{l.n}</td>
                          <td className="py-2.5 font-semibold tabular-nums" style={{ color: corVariacao(tom) }}>{textoVariacao(l.d, l.dec)}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="py-2.5 pr-2 text-texto-2">Classificação</td>
                      <td className="py-2.5 pr-2 font-semibold" style={{ color: rel.refCls.cor }}>{rel.refCls.label}</td>
                      <td className="py-2.5 pr-2 font-semibold" style={{ color: rel.novoCls.cor }}>{rel.novoCls.label}</td>
                      <td className="py-2.5 text-texto-3">{rel.novoCls.label === rel.refCls.label ? "mesmo nível" : "mudou de nível"}</td>
                    </tr>
                    {rel.medidas.map((m) => (
                      <tr key={m.key} data-linha-medida={m.key}>
                        <td className="py-2.5 pr-2 text-texto-2">{m.label}</td>
                        <td className="py-2.5 pr-2 tabular-nums text-texto-3">{m.ref !== "" ? `${(m.ref as number).toFixed(1)} cm` : "—"}</td>
                        <td className="py-2.5 pr-2 font-semibold tabular-nums text-texto">{m.novo !== "" ? `${(m.novo as number).toFixed(1)} cm` : "—"}</td>
                        <td className="py-2.5 font-semibold tabular-nums" style={{ color: m.delta === null ? "var(--p-texto-4)" : corVariacao(tomVariacao(m.delta, m.inv)) }}>
                          {m.delta === null ? "—" : textoVariacao(m.delta, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10.5px] italic leading-relaxed text-texto-4">
                Cálculo com os dados digitados, sem ligação com nenhuma conta do Physiq. Classificação: Gallagher et al. (2000) · ACE · Lohman (1993) · ACSM.
                Verde = melhora esperada · rosa = piora esperada.
              </p>
            </Cartao>
          )}
        </div>
      )}

      <p className="text-center text-[11.5px] text-texto-4" data-formulas>
        Fórmulas:{" "}
        <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener noreferrer" className="text-violeta-3 hover:underline">Mifflin-St Jeor</a>
        {" · "}
        <a href="https://pubmed.ncbi.nlm.nih.gov/694835/" target="_blank" rel="noopener noreferrer" className="text-violeta-3 hover:underline">Jackson &amp; Pollock</a>
        {" · "}
        <a href="https://pubmed.ncbi.nlm.nih.gov/15212767/" target="_blank" rel="noopener noreferrer" className="text-violeta-3 hover:underline">Katch-McArdle</a>
      </p>

      <ConfirmarPerigo aberto={limpar} aoMudar={setLimpar} titulo="Limpar todos os dados?" rotulo="Limpar tudo" aoConfirmar={limparTudo} data-confirmar-limpar
        texto="O que foi digitado na calculadora (composição e comparativo) sai deste aparelho e não volta." />
    </div>
  );
}
