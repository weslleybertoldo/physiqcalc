// Avaliação física do aluno (25/09/2026): 3 dobras ou 7 dobras (Jackson & Pollock + Siri) ou bioimpedância
// (o professor digita o que a balança mostra), e a TMB escolhida: Mifflin-St Jeor, Katch-McArdle ou a da balança.
// Mesma conta no formulário do professor, na evolução, na tela do aluno e nos PDFs.

export type Sexo = "male" | "female";
export type MetodoAvaliacao = "dobras_3" | "dobras_7" | "bioimpedancia";
export type TmbMetodo = "mifflin" | "katch" | "balanca";

/** Linha de physiq_profiles ou physiq_avaliacoes. */
type Registro = Record<string, unknown>;

export const METODOS_AVALIACAO: ReadonlyArray<{ key: MetodoAvaliacao; label: string }> = [
  { key: "dobras_3", label: "3 dobras" },
  { key: "dobras_7", label: "7 dobras" },
  { key: "bioimpedancia", label: "Bioimpedância" },
];

/** Registro sem método (anterior a 25/09/2026) é de 3 dobras. */
export function metodoDe(v: unknown): MetodoAvaliacao {
  return v === "dobras_7" || v === "bioimpedancia" ? v : "dobras_3";
}

export function rotuloMetodo(v: unknown): string {
  const m = metodoDe(v);
  return METODOS_AVALIACAO.find((x) => x.key === m)!.label;
}

export const DOBRA_KEYS = ["dobra_1", "dobra_2", "dobra_3", "dobra_4", "dobra_5", "dobra_6", "dobra_7"] as const;

export const DOBRAS_7_ROTULOS = ["Peitoral", "Axilar média", "Tríceps", "Subescapular", "Abdômen", "Supra-ilíaca", "Coxa"];

/** Rótulo de cada dobra na ordem de dobra_1..dobra_N. */
export function rotulosDobras(metodo: MetodoAvaliacao, sexo: Sexo): string[] {
  if (metodo === "dobras_7") return [...DOBRAS_7_ROTULOS];
  if (metodo === "dobras_3") return sexo === "male" ? ["Peitoral", "Abdômen", "Coxa"] : ["Tríceps", "Supra-ilíaca", "Coxa"];
  return [];
}

export const BIO_CAMPOS = [
  { key: "percentual_gordura", label: "% Gordura", unidade: "%" },
  { key: "massa_muscular", label: "Massa muscular", unidade: "kg" },
  { key: "agua_corporal", label: "Água corporal", unidade: "%" },
  { key: "gordura_visceral", label: "Gordura visceral", unidade: "nível" },
  { key: "tmb_balanca", label: "TMB da balança", unidade: "kcal" },
] as const;
export type BioKey = (typeof BIO_CAMPOS)[number]["key"];

/** Siri: % de gordura a partir da densidade corporal; fora de (0, 100) = medida inválida. */
function siri(densidade: number): number | null {
  const bf = (4.95 / densidade - 4.5) * 100;
  return bf > 0 && bf < 100 ? bf : null;
}

export function gordura3Dobras(sexo: Sexo, soma: number, idade: number): number | null {
  const d = sexo === "male"
    ? 1.10938 - 0.0008267 * soma + 0.0000016 * soma * soma - 0.0002574 * idade
    : 1.0994921 - 0.0009929 * soma + 0.0000023 * soma * soma - 0.0001392 * idade;
  return siri(d);
}

export function gordura7Dobras(sexo: Sexo, soma: number, idade: number): number | null {
  const d = sexo === "male"
    ? 1.112 - 0.00043499 * soma + 0.00000055 * soma * soma - 0.00028826 * idade
    : 1.097 - 0.00046971 * soma + 0.00000056 * soma * soma - 0.00012828 * idade;
  return siri(d);
}

export function tmbMifflin(sexo: Sexo, peso: number, altura: number, idade: number): number {
  return sexo === "male"
    ? 10 * peso + 6.25 * altura - 5 * idade + 5
    : 10 * peso + 6.25 * altura - 5 * idade - 161;
}

export function tmbKatch(massaMagra: number): number {
  return 370 + 21.6 * massaMagra;
}

/** Formulário da avaliação como o professor digitou (texto de cada campo). */
export interface ValoresAvaliacao {
  metodo: MetodoAvaliacao;
  dobras3: string[];
  dobras7: string[];
  bio: Record<BioKey, string>;
}

export function valoresVazios(metodo: MetodoAvaliacao = "dobras_3"): ValoresAvaliacao {
  return {
    metodo,
    dobras3: ["", "", ""],
    dobras7: ["", "", "", "", "", "", ""],
    bio: { percentual_gordura: "", massa_muscular: "", agua_corporal: "", gordura_visceral: "", tmb_balanca: "" },
  };
}

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Número digitado; vazio, zero ou negativo = sem valor. */
export function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Abre o formulário com os valores do método salvo no registro (os outros métodos começam vazios). */
export function valoresDoRegistro(r: Registro): ValoresAvaliacao {
  const v = valoresVazios(metodoDe(r.metodo_avaliacao));
  if (v.metodo === "dobras_3") v.dobras3 = DOBRA_KEYS.slice(0, 3).map((k) => texto(r[k]));
  else if (v.metodo === "dobras_7") v.dobras7 = DOBRA_KEYS.map((k) => texto(r[k]));
  else v.bio = Object.fromEntries(BIO_CAMPOS.map((c) => [c.key, texto(r[c.key])])) as Record<BioKey, string>;
  return v;
}

/** Colunas do método ativo pra gravar; as dos outros métodos vão null (percentual_gordura sai da composição). */
export function colunasDoMetodo(v: ValoresAvaliacao): Record<string, string | number | null> {
  const dobras = v.metodo === "dobras_3" ? v.dobras3 : v.metodo === "dobras_7" ? v.dobras7 : [];
  const bio = v.metodo === "bioimpedancia";
  const out: Record<string, string | number | null> = { metodo_avaliacao: v.metodo };
  DOBRA_KEYS.forEach((k, i) => { out[k] = i < dobras.length ? numero(dobras[i]) : null; });
  out.massa_muscular = bio ? numero(v.bio.massa_muscular) : null;
  out.agua_corporal = bio ? numero(v.bio.agua_corporal) : null;
  out.gordura_visceral = bio ? numero(v.bio.gordura_visceral) : null;
  out.tmb_balanca = bio ? numero(v.bio.tmb_balanca) : null;
  return out;
}

export interface Composicao {
  bf: number | null;
  massaGorda: number | null;
  massaMagra: number | null;
  tmbMifflin: number | null;
  tmbKatch: number | null;
  tmbBalanca: number | null;
}

export function calcularComposicao(
  v: ValoresAvaliacao,
  p: { sexo: Sexo; idade: number | null; peso: number | null; altura: number | null },
): Composicao {
  const idade = numero(p.idade), peso = numero(p.peso), altura = numero(p.altura);
  let bf: number | null = null;
  if (v.metodo === "bioimpedancia") {
    const x = numero(v.bio.percentual_gordura);
    bf = x !== null && x < 100 ? x : null;
  } else {
    const dobras = (v.metodo === "dobras_3" ? v.dobras3 : v.dobras7).map(numero);
    if (idade && dobras.every((d) => d !== null)) {
      const soma = (dobras as number[]).reduce((a, b) => a + b, 0);
      bf = v.metodo === "dobras_3" ? gordura3Dobras(p.sexo, soma, idade) : gordura7Dobras(p.sexo, soma, idade);
    }
  }
  const massaGorda = bf !== null && peso ? peso * (bf / 100) : null;
  const massaMagra = massaGorda !== null && peso ? peso - massaGorda : null;
  return {
    bf,
    massaGorda,
    massaMagra,
    tmbMifflin: peso && altura && idade ? tmbMifflin(p.sexo, peso, altura, idade) : null,
    tmbKatch: massaMagra !== null ? tmbKatch(massaMagra) : null,
    tmbBalanca: v.metodo === "bioimpedancia" ? numero(v.bio.tmb_balanca) : null,
  };
}

export const TMB_OPCOES: ReadonlyArray<{ key: TmbMetodo; label: string }> = [
  { key: "mifflin", label: "Mifflin-St Jeor" },
  { key: "katch", label: "Katch-McArdle" },
  { key: "balanca", label: "Balança" },
];

/** Pra que serve cada TMB (ⓘ ao lado do seletor). */
export const TMB_LEGENDA: Record<TmbMetodo, string> = {
  mifflin: "Estima pelo peso, altura, idade e sexo. Serve pra maioria das pessoas e não precisa do % de gordura.",
  katch: "Calcula pela massa magra, então precisa do % de gordura (dobras ou balança). É a mais precisa pra quem treina e tem bastante músculo.",
  balanca: "Usa a TMB que a própria balança de bioimpedância mostra. Só aparece quando a avaliação é por bioimpedância.",
};

export function tmbMetodoDe(v: unknown): TmbMetodo {
  return v === "katch" || v === "balanca" ? v : "mifflin";
}

export function rotuloTmb(v: unknown): string {
  const m = tmbMetodoDe(v);
  return TMB_OPCOES.find((x) => x.key === m)!.label;
}

/** A escolha só vale se a TMB dela existe; senão fica Mifflin (é o que se grava). */
export function tmbValida(escolha: TmbMetodo, c: Composicao): TmbMetodo {
  if (escolha === "katch" && c.tmbKatch !== null) return "katch";
  if (escolha === "balanca" && c.tmbBalanca !== null) return "balanca";
  return "mifflin";
}

/** TMB escolhida de um registro salvo; sem o valor dela (registro antigo), cai na Mifflin. */
export function tmbEscolhida(r: Registro): { metodo: TmbMetodo; label: string; valor: number | null } {
  const escolha = tmbMetodoDe(r.tmb_metodo);
  const valor = numero(r[`tmb_${escolha}`]);
  if (valor !== null || escolha === "mifflin") return { metodo: escolha, label: rotuloTmb(escolha), valor };
  return { metodo: "mifflin", label: rotuloTmb("mifflin"), valor: numero(r.tmb_mifflin) };
}

/** Dados da balança de um registro salvo, prontos pra exibir (só os preenchidos). */
export function dadosBalanca(r: Registro): { key: BioKey; label: string; valor: string }[] {
  if (metodoDe(r.metodo_avaliacao) !== "bioimpedancia") return [];
  const out: { key: BioKey; label: string; valor: string }[] = [];
  const mm = numero(r.massa_muscular), ag = numero(r.agua_corporal), gv = numero(r.gordura_visceral);
  if (mm !== null) out.push({ key: "massa_muscular", label: "Massa muscular", valor: `${mm.toFixed(1)} kg` });
  if (ag !== null) out.push({ key: "agua_corporal", label: "Água corporal", valor: `${ag.toFixed(1)}%` });
  if (gv !== null) out.push({ key: "gordura_visceral", label: "Gordura visceral", valor: `nível ${Number.isInteger(gv) ? gv : gv.toFixed(1)}` });
  return out;
}
