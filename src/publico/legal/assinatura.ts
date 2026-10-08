import { PLANOS_APP_PADRAO, TESTE_DIAS_APP } from "@/app-aluno/sozinho/regras";
import { FAIXAS, NOME_PLANO, PLANOS, PRECOS_PADRAO, TESTE_DIAS, TESTE_MAX_ALUNOS, type Faixa, type PlanoConta } from "@/nucleo/cobranca/regras";
import { lerMarkdown, type ItemLista } from "./markdown";
import { DATA_DOS_TEXTOS, ROTA_POLITICA, ROTA_TERMOS, VENDEDOR } from "./versao";

/**
 * hml-11 (H-28, D8) — os Termos de assinatura (a cobrança do plano do profissional e do plano do app), em revisão: só no build de
 * staging até a virada (src/publico/legal/versao.ts). Base: o rascunho para o advogado
 * (physiqcalc-scratch/hml/hml11/rascunhos/termos-de-assinatura.md, conferido no código do 82064d3) com as decisões padrão da spec
 * (P3: o Physiq recebe em nome do profissional nas contas com o Mercado Pago ligado; P6: o anual sem devolução depois dos 7 dias,
 * como hoje; P7: o e-mail do suporte) e sem os marcadores do rascunho.
 *
 * Os números NÃO ficam soltos no texto: os preços e o teste do profissional vêm de src/nucleo/cobranca/regras.ts (PRECOS_PADRAO,
 * TESTE_DIAS, TESTE_MAX_ALUNOS — iguais ao banco de produção em 08/10/2026) e os do plano do app de src/app-aluno/sozinho/regras.ts
 * (PLANOS_APP_PADRAO, TESTE_DIAS_APP — a seed da W7b). O preço que vale é o do banco (o master muda sem deploy): mudou lá → aviso de
 * 30 dias (seção 11) e a versão nova aqui. A seção "Resumo" vira o resumo antes de pagar das 3 telas que vendem
 * (ResumoAntesDePagar.tsx, Decreto 7.962/2013, art. 4º, I).
 */

/** Os rótulos dos 2 blocos do Resumo que valem só para um público (o resumo da tela tira o do outro). */
const ROTULO_PROFISSIONAL = "Profissional:";
const ROTULO_ALUNO = "Aluno sem profissional:";

export const TITULO_RESUMO = "Resumo — o mais importante, antes de pagar";

const NUMERO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "R$ 1.499,00" (espaço comum: o leitor do texto prende o número ao "R$" na tela). */
const reais = (valor: number) => `R$ ${NUMERO.format(valor)}`;

/** "a, b ou c" */
function juntar(itens: string[], ultimo: "ou" | "e"): string {
  return itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} ${ultimo} ${itens[itens.length - 1]}`;
}

function linhaDoPreco(plano: PlanoConta, faixa: Faixa) {
  const linha = PRECOS_PADRAO.find((l) => l.plano === plano && l.faixa === faixa);
  if (!linha) throw new Error(`PRECOS_PADRAO sem ${plano}/${faixa}`);
  // o anual = 10 mensalidades (regras.ts, precoDoPlano)
  const anual = linha.valor_anual ?? Math.round(linha.valor_mensal * 10 * 100) / 100;
  return { mensal: linha.valor_mensal, anual, min: linha.min_alunos, max: linha.max_alunos };
}

/** O que cada plano do app inclui (a coluna da tabela 2.2); plano novo no banco sem texto aqui → a descrição dele. */
const O_QUE_INCLUI: Readonly<Record<string, string>> = {
  app_treino: "montar o treino ou usar um treino pronto pelo objetivo; funciona sem internet",
  app_treino_alimentacao: "o Treino e os pratos prontos pelo objetivo, com calorias e macronutrientes",
};

function tabelaDoProfissional(): string {
  const faixas = FAIXAS.map((faixa, i) => {
    const { min, max } = linhaDoPreco(PLANOS[0], faixa);
    const rotulo = max === null ? "Sem limite" : `${min} a ${max}`;
    return i === 0 ? `${rotulo} alunos ativos` : rotulo;
  });
  return [
    `| Plano | ${faixas.join(" | ")} |`,
    `|---|${faixas.map(() => "---").join("|")}|`,
    ...PLANOS.map((plano) => `| ${NOME_PLANO[plano]} | ${FAIXAS.map((faixa) => reais(linhaDoPreco(plano, faixa).mensal)).join(" | ")} |`),
  ].join("\n");
}

/** Os preços do anual, juntando os planos que custam o mesmo ("Só Treino ou Só Nutrição: …"). */
function anuaisDoProfissional(): string {
  const grupos: { nomes: string[]; valores: string[] }[] = [];
  for (const plano of PLANOS) {
    const valores = FAIXAS.map((faixa) => reais(linhaDoPreco(plano, faixa).anual));
    const igual = grupos.find((g) => g.valores.join("|") === valores.join("|"));
    if (igual) igual.nomes.push(NOME_PLANO[plano]);
    else grupos.push({ nomes: [NOME_PLANO[plano]], valores });
  }
  return grupos.map((g, i) => `  - ${juntar(g.nomes, "ou")}: ${juntar(g.valores, "ou")}${i === grupos.length - 1 ? "." : ";"}`).join("\n");
}

function tabelaDoApp(): string {
  return [
    "| Plano | Preço por mês | O que inclui |",
    "|---|---|---|",
    ...PLANOS_APP_PADRAO.map((p) => `| ${p.nome} | ${reais(p.valor)} | ${O_QUE_INCLUI[p.codigo] ?? p.descricao ?? ""} |`),
  ].join("\n");
}

const EMAIL = `[${VENDEDOR.email}](mailto:${VENDEDOR.email})`;
const NOMES_DOS_PLANOS = juntar(PLANOS.map((p) => NOME_PLANO[p]), "ou");
/** "Treino, **R$ 29,90 por mês**, ou Treino + Alimentação, **R$ 49,90 por mês**" */
const PLANOS_DO_APP = PLANOS_APP_PADRAO.map((p) => `${p.nome}, **${reais(p.valor)} por mês**`).join(", ou ");

export const TERMOS_DE_ASSINATURA = `
Estes termos valem para quem paga um plano ao Physiq:
- **o profissional**, pela conta dele;
- **o aluno que treina sem profissional**, pelo plano do app.

Eles fazem parte dos [Termos de Uso](${ROTA_TERMOS}). A [Política de Privacidade](${ROTA_POLITICA}) explica o que fazemos com os
dados de pagamento.

## ${TITULO_RESUMO}

- **Quem vende:** ${VENDEDOR.nome}, pessoa física, CPF ${VENDEDOR.cpf} (seção 1).
- **${ROTULO_PROFISSIONAL}**
  - planos por módulo (${NOMES_DOS_PLANOS}) e por faixa de alunos ativos, mensal ou anual;
  - o anual custa 10 mensalidades e vale 12 meses;
  - **${TESTE_DIAS} dias grátis** no ${NOME_PLANO.treino_nutricao}, com até ${TESTE_MAX_ALUNOS} alunos e sem cartão (seções 2 e 3).
- **${ROTULO_ALUNO}**
  - ${PLANOS_DO_APP};
  - **${TESTE_DIAS_APP} dias grátis**, sem cartão (seções 2 e 3).
- **Pagamento pelo Mercado Pago:** Pix (vale 72 horas), cartão à vista ou **cobrança automática no cartão, que renova todo mês até
  você cancelar** (seções 4 e 5).
- **Sem pagamento**, o acesso é bloqueado no dia seguinte ao vencimento. **O bloqueio não apaga dados** (seção 6).
- **Cancele quando quiser**, sem multa. O acesso continua até o fim do que já foi pago (seção 8).
- **Desistência:** em até **7 dias depois de um pagamento**, você pode desistir e recebe de volta o valor desse pagamento (seção 9).
- **Fora desse prazo, o que já foi pago não é devolvido, nem em parte** (seção 10).
- **Os preços podem mudar**, com aviso de **30 dias** (seção 11).
- **A mensalidade que o aluno paga ao profissional dele não é venda do Physiq** (seção 16).

## 1. Quem vende

O Physiq é oferecido e vendido por **${VENDEDOR.nome}**, pessoa física, CPF ${VENDEDOR.cpf}, com endereço na ${VENDEDOR.endereco}.
O e-mail de contato é ${EMAIL} (Decreto nº 7.962/2013, art. 2º).

## 2. Os planos e os preços

### 2.1 Plano da conta do profissional (por mês)

${tabelaDoProfissional()}

- **Anual:** 10 mensalidades por 12 meses (2 meses grátis):
${anuaisDoProfissional()}
- **A faixa conta os alunos ativos da conta.** Não dá para escolher uma faixa menor do que os alunos ativos de hoje. Se a conta
  passar do limite da faixa, o painel avisa para mudar de faixa.
- Só o dono da conta vê o plano e paga.
- Antes de pagar, a tela mostra o plano, a faixa, o valor e até quando o acesso vai valer.

### 2.2 Plano do app (aluno sem profissional)

${tabelaDoApp()}

- O plano do app é só mensal.
- Os preços são os de ${DATA_DOS_TEXTOS}. O preço que vale é o que a tela mostra antes de pagar.

## 3. Teste grátis

- **Profissional:** a conta nova ganha **${TESTE_DIAS} dias grátis** no ${NOME_PLANO.treino_nutricao}, com até ${TESTE_MAX_ALUNOS} alunos
  ativos e sem cartão. No fim do teste, o painel é bloqueado até o dono escolher um plano e pagar. Quem paga durante o teste não
  perde os dias que faltam.
- **Aluno sem profissional:** **${TESTE_DIAS_APP} dias grátis**, sem cartão. No fim do teste, o app fecha e só a tela de Pagamentos
  abre, até o pagamento.
- O teste não se renova sozinho e não vira cobrança sem que você pague ou ligue a cobrança automática.

## 4. Formas de pagamento

Pelo Mercado Pago, dentro do app ou do site: o profissional paga em Configurações › Plano, e o aluno, em Perfil › Pagamentos.

- **Pix:** o código vale **72 horas** e confirma na hora.
- **Cartão à vista:** paga o período escolhido (1 mês, ou 12 no anual do profissional).
- **Cobrança automática no cartão:** só no plano mensal. O Mercado Pago cobra o valor do plano todo mês, no mesmo cartão. O plano
  anual é pago por Pix ou cartão à vista.
- Os dados do cartão são digitados direto no formulário do Mercado Pago. O Physiq não vê nem guarda o número do cartão.

## 5. Vigência e renovação

- **Pix ou cartão à vista:** com o pagamento aprovado, o acesso ganha 1 mês (ou 12, no anual). A contagem começa do maior entre:
  o vencimento, o fim do teste e o dia de hoje. Ninguém perde dia.
- **Cobrança automática:**
  - a 1ª cobrança sai no fim do teste ou do período já pago, ou no dia, se o plano já estiver vencido;
  - depois, **renova todo mês, sozinha, até você cancelar** (seção 8);
  - cada cobrança aprovada soma 1 mês.
- O dia do vencimento é o último dia com acesso.
- **Confirmação:** com o pagamento aprovado, a tela confirma e o pagamento aparece no histórico.

## 6. Avisos de vencimento e bloqueio

- **Pix ou cartão à vista:** uma faixa no topo avisa do vencimento **7 dias antes, de novo faltando 2 dias e 1 dia, e no dia**. Na
  cobrança automática não há esse aviso.
- **Sem pagamento:**
  - **profissional:** o painel é bloqueado no dia seguinte ao vencimento. As contas antigas do PhysiqCalc têm 7 dias de
    tolerância, com a faixa "pague até";
  - **aluno sem profissional:** o app fecha e só a tela de Pagamentos abre.
- **O bloqueio não apaga dados.** Eles ficam guardados até você voltar a pagar ou excluir a conta. O acesso volta assim que o
  pagamento é aprovado.

## 7. Troca de plano

- **Profissional:**
  - subir de plano ou de faixa vale na hora;
  - descer só é possível se os alunos ativos couberem na faixa nova;
  - o preço novo vale a partir do próximo pagamento, e a cobrança automática passa ao valor novo;
  - se um módulo sair (por exemplo, de ${NOME_PLANO.treino_nutricao} para ${NOME_PLANO.treino}), os dados dele ficam guardados e
    escondidos, e quem só atende nesse módulo perde o acesso.
- **Aluno sem profissional:**
  - trocar entre ${juntar(PLANOS_APP_PADRAO.map((p) => p.nome), "e")} vale a partir do próximo pagamento;
  - se você colocar o código de um profissional, o plano do app termina, a cobrança automática é cancelada e você passa a pagar
    como combinar com ele.

## 8. Cancelamento

- **Não há fidelidade nem multa.** Você pode parar quando quiser.
- **Pix ou cartão à vista:** não há nada a cancelar. Se você não pagar de novo, o acesso vai até o vencimento.
- **Cobrança automática:** cancele em Configurações › Plano › Cancelar cobrança automática (profissional) ou em Perfil ›
  Pagamentos (aluno). A cobrança para na hora no Mercado Pago, e **o acesso continua até o fim do período já pago**.
- **Excluir a conta** também cancela a cobrança automática ([Termos de Uso](${ROTA_TERMOS}), seção 11).

## 9. Desistência (direito de arrependimento)

- Em até **7 dias depois de um pagamento**, você pode desistir dele (Código de Defesa do Consumidor, art. 49).
- **Como pedir:** pelo ${EMAIL}. Diga o e-mail da conta e o pagamento.
- **O que acontece:**
  - devolvemos **o valor inteiro desse pagamento** pelo Mercado Pago, no mesmo meio usado para pagar;
  - o acesso pago por ele termina;
  - no cartão, o Mercado Pago avisa a administradora para não cobrar ou para estornar (Decreto nº 7.962/2013, art. 5º);
  - respondemos em até 5 dias.

## 10. Fora do prazo de desistência

- O que já foi pago **não é devolvido, nem em parte**, e o acesso continua até o fim do período pago.
- Isso vale também para o plano anual.

## 11. Reajuste

- **Os preços podem mudar.** Avisamos por e-mail e no app com **30 dias** de antecedência.
- O preço novo só vale nos pagamentos feitos depois desse prazo.
- Se não concordar, cancele antes, sem multa.

## 12. Preço especial e contas antigas

- Uma conta pode ter um preço especial, combinado com o Physiq. Ele vale no plano e na faixa combinados.
- As contas que vieram do PhysiqCalc e do PhysiqNutri mantêm o preço e as regras de antes até trocarem de plano ou de faixa. Antes
  de trocar, a tela avisa que o preço e as regras de antes deixam de valer.

## 13. Conta isenta e conta suspensa

- **Isenta:** uma conta pode ser isenta de cobrança, por decisão do Physiq. Não há nada a pagar.
- **Suspensa:** o Physiq pode suspender uma conta nos casos dos [Termos de Uso](${ROTA_TERMOS}) (seção 11). Para voltar, fale com o
  suporte.

## 14. Comprovante

- Cada pagamento fica no histórico do app (profissional: Configurações › Plano; aluno: Perfil › Pagamentos), com a data, o valor
  e a situação.

## 15. Versão da Google Play

Na versão do app instalada pela Google Play não há pagamento dentro do app:
- o profissional paga pelo site;
- o plano do app para quem treina sem profissional não aparece nessa versão.

Se isso mudar (pagamento pela Google Play), estes termos ganham uma versão nova.

## 16. O que não é venda do Physiq

- **A mensalidade e as cobranças que o aluno paga ao profissional dele** são combinadas entre os dois ([Termos de Uso](${ROTA_TERMOS}),
  seção 8). O preço, o vencimento, o bloqueio por atraso, o recibo e a devolução são decisões do profissional. Estes termos não
  valem para elas.
- **Nas contas em que o Physiq liga o Mercado Pago**, o pagamento do aluno é processado na conta do Mercado Pago do Physiq, em
  nome do profissional, e repassado a ele como combinado com ele. A devolução ao aluno continua sendo decisão do profissional.

## 17. Atendimento

- Dúvida, reclamação, cancelamento ou desistência: ${EMAIL}. Respondemos em até **5 dias** (Decreto nº 7.962/2013, art. 4º,
  parágrafo único).
- Lei e foro: os dos [Termos de Uso](${ROTA_TERMOS}) (seção 14).
`;

/**
 * O resumo antes de pagar (Decreto 7.962/2013, art. 4º, I: o sumário do contrato antes de contratar, com destaque nas cláusulas que
 * limitam direitos): os itens da seção "Resumo" deste texto, com o negrito dele — a página /assinatura e as telas leem o MESMO
 * texto. `para` tira o bloco do outro público (a tela do profissional não mostra o plano do app, e vice-versa). Sem a seção = erro
 * (o teste acusa antes de uma tela sair sem resumo).
 */
export function resumoDaAssinatura(para?: "profissional" | "aluno", md: string = TERMOS_DE_ASSINATURA): ItemLista[] {
  const blocos = lerMarkdown(md);
  const inicio = blocos.findIndex((b) => b.tipo === "titulo" && b.texto === TITULO_RESUMO);
  const lista = inicio >= 0 ? blocos[inicio + 1] : undefined;
  if (!lista || lista.tipo !== "lista") throw new Error(`Termos de assinatura sem a seção "${TITULO_RESUMO}"`);
  const doOutro = para === "profissional" ? ROTULO_ALUNO : para === "aluno" ? ROTULO_PROFISSIONAL : null;
  return lista.itens.filter((item) => !(doOutro && item.trechos[0]?.negrito && item.trechos[0].texto === doOutro));
}
