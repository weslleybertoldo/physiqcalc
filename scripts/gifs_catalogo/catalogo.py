# -*- coding: utf-8 -*-
"""Catálogo-alvo do PhysiqCalc: 48 existentes (id) + novos (id=None) com pose A/B, props,
subgrupo e dica (com a base científica citada de forma curta).

Pose: hip, torso, thigh, shin, ua (braço), fa (antebraço), [neck, foot, thigh2, shin2, ua2, fa2,
len{...}, hand_target/bend, hand2_target/bend2]. Ângulos: 0 = direita, 90 = cima; boneco olha
para a direita (facing=-1 espelha).
"""

# ── templates de corpo ────────────────────────────────────────────────────────
def STAND(**o):
    p = dict(hip=(300, 212), torso=90, thigh=-90, shin=-90, foot=0, ua=-90, fa=-90)
    p.update(o); return p

def SEATED(**o):  # banco alto, pés no chão (canela 70)
    p = dict(hip=(280, 262), torso=90, thigh=0, shin=-90, foot=0, ua=-90, fa=-90, len={"shin": 70})
    p.update(o); return p

def SUPINE(**o):  # deitado no banco, cabeça à esquerda, pés no chão
    p = dict(hip=(310, 246), torso=180, neck=180, thigh=-55, shin=-95, foot=-10, ua=-30, fa=95, len={"shin": 46})
    p.update(o); return p

def PRONE(**o):  # deitado de bruços no banco, cabeça à esquerda
    p = dict(hip=(300, 250), torso=180, neck=180, thigh=0, shin=0, foot=-60, ua=-150, fa=-110)
    p.update(o); return p

def BENT(**o):  # em pé, tronco inclinado à frente (hinge)
    p = dict(hip=(295, 222), torso=30, neck=15, thigh=-100, shin=-85, foot=0, ua=-80, fa=-80)
    p.update(o); return p


# ── dicas (texto curto + base) ─────────────────────────────────────────────────
D = {}
D["Supino Reto na Máquina Deitado"] = ("Peitoral médio (porção esternal) · tríceps · deltoide anterior",
    "Escápulas encostadas no banco e pés firmes no chão. Desça as pegadas até a linha do peito e empurre até quase estender, sem travar o cotovelo. Cadência controlada na descida.\nBase: amplitude completa gera mais hipertrofia que parcial (Schoenfeld & Grgic, 2020); máquina reduz a demanda de estabilização e permite maior carga no peitoral (Saeterbakken et al., 2011).")
D["Supino Reto na Máquina Sentado"] = ("Peitoral médio (esternal) · tríceps · deltoide anterior",
    "Ajuste o assento para as pegadas ficarem na altura do meio do peito. Costas apoiadas, empurre à frente até quase estender e volte devagar sentindo o alongamento do peitoral.\nBase: pegadas na linha do peito maximizam a adução horizontal do peitoral maior (Saeterbakken et al., 2011; Schoenfeld & Grgic, 2020).")
D["Supino Declinado na Máquina"] = ("Peitoral inferior (fibras esternais/costais) · tríceps",
    "Pegadas na altura da parte baixa do peito; empurre para baixo e à frente. Não deixe os ombros subirem — mantenha as escápulas deprimidas.\nBase: inclinação negativa desloca a ativação para as fibras esternais/inferiores do peitoral (Glass & Armstrong, 1997).")
D["Supino Inclinado"] = ("Peitoral superior (porção clavicular) · deltoide anterior",
    "Banco entre 30° e 45°. Cotovelos ~45° em relação ao tronco, desça a barra até a parte alta do peito e empurre em linha reta.\nBase: 30–45° maximiza a porção clavicular sem transferir demais para o deltoide (Lauver et al., 2016; Rodríguez-Ridao et al., 2020).")
D["Supino Reto com Halteres"] = ("Peitoral médio (esternal) · tríceps · deltoide anterior",
    "Halteres na linha do peito, desça até sentir alongar e suba aproximando levemente os halteres no topo. Mantenha os punhos neutros e os pés no chão.\nBase: halteres exigem mais estabilização e permitem maior amplitude e adução final (Saeterbakken et al., 2011; Solstad et al., 2020).")
D["Supino Reto com Barra"] = ("Peitoral médio (esternal) · tríceps · deltoide anterior",
    "Pegada 1,5× a largura dos ombros, escápulas retraídas, barra toca a linha dos mamilos e sobe em leve arco. Pés firmes no chão.\nBase: pegada ~1,5× biacromial equilibra ativação do peitoral e menor estresse no ombro (Saeterbakken et al., 2017); amplitude completa favorece hipertrofia (Schoenfeld & Grgic, 2020).")
D["Crucifixo na Máquina"] = ("Peitoral médio (esternal) — adução horizontal isolada",
    "Cotovelos na altura do peito, levemente flexionados. Feche até as pegadas quase se tocarem, segure 1 s e abra devagar até o alongamento confortável.\nBase: exercícios uniarticulares de peito complementam o supino com ênfase na adução horizontal (Solstad et al., 2020; Gentil et al., 2015).")
D["Crucifixo com Halteres"] = ("Peitoral médio (esternal) — adução horizontal",
    "Cotovelos sempre um pouco flexionados, desça em arco até a linha dos ombros e feche por cima do peito. Carga menor que no supino.\nBase: crucifixo com halteres ativa o peitoral de forma comparável ao supino com menor carga absoluta (Solstad et al., 2020).")
D["Cross-over na Polia"] = ("Peitoral inferior/médio (esternal) — adução horizontal",
    "Tronco levemente inclinado, puxe as manoplas de cima para baixo cruzando à frente do quadril. Controle a volta até sentir alongar.\nBase: a trajetória alto→baixo enfatiza as fibras esternais/inferiores; tensão constante do cabo mantém o músculo ativo em toda a amplitude (Schoenfeld, 2010).")
D["Flexão de Braço"] = ("Peitoral médio · tríceps · core (estabilização)",
    "Mãos um pouco mais abertas que os ombros, corpo reto da cabeça ao calcanhar. Desça até o peito quase tocar o chão e suba sem perder o alinhamento.\nBase: flexão e supino com ativação equiparada produzem ganhos de força similares (Calatayud et al., 2015).")

D["Remada Fechada na Máquina"] = ("Latíssimo do dorso · romboides · bíceps",
    "Peito apoiado, puxe com os cotovelos junto ao corpo até a mão chegar ao abdômen; retraia as escápulas no final e volte devagar até alongar.\nBase: remadas com apoio de tronco reduzem a carga lombar mantendo alta ativação do dorsal (Fenwick et al., 2009).")
D["Remada Aberta na Máquina"] = ("Trapézio médio · romboides · deltoide posterior · latíssimo",
    "Cotovelos abertos na altura dos ombros, puxe até as mãos passarem a linha do peito, juntando as escápulas. Não use o tronco para impulsionar.\nBase: pegada aberta/cotovelo alto desloca a ênfase para trapézio médio e deltoide posterior (Fenwick et al., 2009; Schoenfeld et al., 2013).")
D["Remada na Polia Sentado"] = ("Latíssimo do dorso · romboides · trapézio médio",
    "Coluna neutra e tronco quase fixo. Puxe até o abdômen levando o cotovelo para trás e volte alongando as escápulas para a frente.\nBase: remada sentada no cabo gera alta ativação de dorsal e trapézio com baixa carga na lombar quando o tronco fica estável (Fenwick et al., 2009).")
D["Remada Cavalinho na Máquina"] = ("Latíssimo · trapézio médio/inferior · romboides",
    "Peito no apoio, puxe as alças até o tronco e leve os cotovelos para trás e para cima. Pausa de 1 s no topo, descida controlada.\nBase: apoio de peito elimina o momento lombar e mantém a ativação de dorsal/trapézio (Fenwick et al., 2009).")
D["High Row"] = ("Latíssimo (fibras superiores) · trapézio médio · deltoide posterior",
    "Puxe de cima para o peito com os cotovelos altos e abertos, aproximando as escápulas. Segure no final e devolva com controle.\nBase: puxadas com cotovelo alto ativam trapézio médio e deltoide posterior além do dorsal (Schoenfeld et al., 2013).")
D["Puxada Fechada Frontal"] = ("Latíssimo do dorso · bíceps · redondo maior",
    "Peito aberto, puxe a barra até a parte alta do peito levando os cotovelos para baixo e para trás. Volte devagar até os braços quase estenderem.\nBase: largura da pegada muda pouco a ativação do dorsal; a amplitude completa é o que importa (Andersen et al., 2014).")
D["Puxada Fechada Supinada"] = ("Latíssimo do dorso · bíceps braquial",
    "Pegada supinada na largura dos ombros. Puxe até o peito e desça controlando — o bíceps trabalha forte, então não roube com o tronco.\nBase: pegada supinada aumenta a participação do bíceps mantendo alta ativação do dorsal (Lusk et al., 2010).")
D["Puxada Aberta Frontal"] = ("Latíssimo do dorso · redondo maior · trapézio inferior",
    "Pegada aberta pronada, puxe até o peito com os cotovelos apontando para o chão. Não incline demais o tronco para trás.\nBase: pegada pronada e amplitude completa produzem ativação máxima do dorsal (Lusk et al., 2010; Andersen et al., 2014).")
D["Barra Fixa"] = ("Latíssimo do dorso · bíceps · trapézio inferior",
    "Pendure com os braços estendidos e puxe até o queixo passar a barra, iniciando pelas escápulas. Desça completo sem balançar.\nBase: barra fixa/chin-up geram ativação muito alta de dorsal e bíceps (Youdas et al., 2010).")
D["Remada Curvada com Barra"] = ("Latíssimo · trapézio · romboides · eretores (estabilização)",
    "Tronco ~45°, coluna neutra e joelhos levemente flexionados. Puxe a barra até o abdômen e desça controlando; não arredonde a lombar.\nBase: remada curvada é a variação de remada com maior carga nos eretores — exige tronco estável (Fenwick et al., 2009).")
D["Remada Unilateral com Halter"] = ("Latíssimo do dorso · romboides · bíceps",
    "Mão de apoio no banco, tronco paralelo ao chão. Puxe o halter até o quadril levando o cotovelo para trás e volte alongando.\nBase: variações unilaterais mantêm alta ativação do dorsal com menor carga lombar (Fenwick et al., 2009).")
D["Pulldown com Braços Estendidos"] = ("Latíssimo do dorso (isolado) · redondo maior",
    "Braços quase estendidos, puxe a barra de cima até as coxas em arco, sem dobrar os cotovelos. Volte devagar até acima da cabeça.\nBase: extensão do ombro com cotovelo fixo isola o dorsal, útil para quem 'puxa' com o bíceps (Gentil et al., 2015).")
D["Hiperextensão Lombar"] = ("Eretores da espinha · glúteo máximo · isquiotibiais",
    "Quadril no apoio, desça o tronco e suba até a linha do corpo — não hiperestenda além dela. Movimento controlado, sem impulso.\nBase: o exercício ativa fortemente eretores e glúteos; evitar hiperextensão excessiva reduz estresse nas facetas lombares (McGill, 2007).")
D["Levantamento Terra"] = ("Glúteo máximo · isquiotibiais · eretores · quadríceps",
    "Barra junto às canelas, coluna neutra, empurre o chão com as pernas e estenda o quadril mantendo a barra próxima ao corpo. Trave no topo sem inclinar para trás.\nBase: o terra recruta cadeia posterior e quadríceps de forma global (Martín-Fuentes et al., 2020; McAllister et al., 2014).")
D["Encolhimento com Halteres"] = ("Trapézio superior · elevador da escápula",
    "Braços estendidos, eleve os ombros em direção às orelhas, pause 1 s e desça completamente. Não gire os ombros.\nBase: elevação pura da escápula ativa o trapézio superior; a rotação não acrescenta e sobrecarrega o ombro (Pizzari et al., 2014).")

D["Crucifixo Invertido Sentado"] = ("Deltoide posterior · trapézio médio · romboides",
    "Peito no apoio, cotovelos levemente flexionados na altura dos ombros. Abra até a linha do corpo e volte devagar.\nBase: abdução horizontal com pegada neutra maximiza deltoide posterior e trapézio médio (Schoenfeld et al., 2013).")
D["Desenvolvimento na Máquina"] = ("Deltoide anterior/lateral · tríceps",
    "Pegadas na altura das orelhas, empurre até quase estender acima da cabeça e desça até o queixo. Não arqueie a lombar.\nBase: desenvolvimento sentado com apoio permite maior carga com alta ativação do deltoide anterior (Saeterbakken & Fimland, 2013).")
D["Elevação Frontal na Polia"] = ("Deltoide anterior",
    "Cabo baixo atrás do corpo, braço quase estendido, eleve até a altura dos olhos e volte controlado. Sem balançar o tronco.\nBase: elevação frontal isola o deltoide anterior; o cabo mantém tensão constante (Coratella et al., 2020).")
D["Elevação Lateral com Halteres"] = ("Deltoide lateral (médio)",
    "Cotovelos levemente flexionados, suba até a altura dos ombros no plano da escápula (um pouco à frente). Desça em 2–3 s.\nBase: elevação lateral produz a maior ativação do deltoide lateral entre as variações testadas (Coratella et al., 2020).")
D["Elevação Lateral na Polia"] = ("Deltoide lateral (médio)",
    "Cabo baixo do lado oposto, eleve até a altura do ombro sem encolher o trapézio. Volte devagar sentindo a tensão constante.\nBase: variações com cabo mantêm tensão na parte inicial do movimento, onde o halter perde alavanca (Coratella et al., 2020).")
D["Elevação Lateral na Máquina"] = ("Deltoide lateral (médio)",
    "Cotovelos nos apoios, eleve até os braços ficarem paralelos ao chão e desça em 2–3 s. Sem impulso do tronco.\nBase: o apoio no cotovelo mantém o braço de alavanca constante e reduz a participação do trapézio superior (Coratella et al., 2020).")
D["Crucifixo Invertido"] = ("Deltoide posterior · trapézio médio · romboides",
    "Tronco inclinado ~45°, cotovelos levemente flexionados, abra os halteres até a linha dos ombros com o polegar apontando para baixo/neutro.\nBase: pegada neutra/pronada na abdução horizontal aumenta a ativação do deltoide posterior (Schoenfeld et al., 2013).")
D["Desenvolvimento Arnold"] = ("Deltoide anterior · lateral · tríceps",
    "Comece com as palmas voltadas para o rosto, gire e empurre até acima da cabeça; volte invertendo. Movimento contínuo, sem travar no topo.\nBase: a rotação amplia a amplitude no deltoide anterior; sem evidência de vantagem sobre o desenvolvimento tradicional — use como variação (Saeterbakken & Fimland, 2013).")
D["Desenvolvimento com Halteres"] = ("Deltoide anterior/lateral · tríceps",
    "Sentado com apoio, halteres na altura das orelhas, empurre até quase estender e desça controlado. Core firme.\nBase: versão com halteres exige mais estabilização e ativa igualmente o deltoide anterior (Saeterbakken & Fimland, 2013).")
D["Face Pull na Polia"] = ("Deltoide posterior · trapézio médio · rotadores externos",
    "Cabo na altura do rosto, puxe as cordas em direção às orelhas girando os ombros para fora (polegares para trás). Pause 1 s.\nBase: rotação externa + retração escapular fortalecem estabilizadores do ombro, protetor contra lesões em treino de força (Kolber et al., 2010).")
D["Elevação Frontal com Halteres"] = ("Deltoide anterior",
    "Braços quase estendidos, eleve até a altura dos olhos alternando ou junto; desça em 2–3 s sem balançar.\nBase: elevação frontal ativa o deltoide anterior de forma isolada (Coratella et al., 2020).")

D["Rosca Alternada na Máquina"] = ("Bíceps braquial (cabeça curta) · braquial",
    "Braço apoiado no pad, flexione até a contração máxima e desça até quase estender. Alterne os braços sem deixar o tronco compensar.\nBase: apoio do braço à frente do corpo favorece a cabeça curta do bíceps (Oliveira et al., 2009).")
D["Rosca Alternada no Banco Inclinado"] = ("Bíceps braquial (cabeça longa)",
    "Banco a ~45°, braços pendentes atrás da linha do tronco. Flexione sem trazer o cotovelo à frente e desça completo — o alongamento é o segredo.\nBase: braço atrás do corpo alonga a cabeça longa e aumenta a atividade do bíceps (Oliveira et al., 2009); treino em maior comprimento muscular favorece hipertrofia (Pedrosa et al., 2022).")
D["Rosca Scott com Halteres"] = ("Bíceps braquial (cabeça curta) · braquial",
    "Axila apoiada no pad, desça até quase estender e suba sem tirar o braço do apoio. Sem impulso.\nBase: no banco Scott a cabeça curta trabalha mais no início do movimento (Oliveira et al., 2009).")
D["Rosca Scott na máquina"] = ("Bíceps braquial (cabeça curta) · braquial",
    "Ajuste o assento para o cotovelo alinhar com o eixo da máquina. Flexione até o pico e desça controlado até quase estender.\nBase: alinhar o cotovelo ao eixo mantém a curva de resistência da máquina em toda a amplitude (Oliveira et al., 2009).")
D["Rosca Martelo na Polia"] = ("Braquial · braquiorradial · bíceps",
    "Pegada neutra na corda, cotovelos fixos ao lado do corpo, flexione até o topo e desça devagar.\nBase: pegada neutra aumenta a participação de braquial e braquiorradial em relação à rosca supinada (Marcolin et al., 2018).")
D["Rosca Punho com Halter Apoiado"] = ("Flexores do antebraço",
    "Antebraço apoiado na coxa/banco, palma para cima, deixe o halter descer abrindo os dedos e flexione o punho até o topo.\nBase: flexão de punho isolada é a forma mais direta de treinar os flexores do antebraço (Marcolin et al., 2018).")
D["Rosca Direta com Barra"] = ("Bíceps braquial (cabeças curta e longa)",
    "Cotovelos colados ao tronco, suba a barra até a contração máxima e desça em 2–3 s até estender. Sem balançar o tronco.\nBase: a rosca supinada com barra é a que mais ativa o bíceps braquial entre as variações de rosca (Marcolin et al., 2018).")
D["Rosca Martelo com Halteres"] = ("Braquial · braquiorradial · bíceps",
    "Pegada neutra (polegar para cima), cotovelo fixo, flexione até o ombro e desça controlado. Pode alternar os braços.\nBase: pegada neutra enfatiza braquial e braquiorradial (Marcolin et al., 2018).")
D["Rosca Concentrada"] = ("Bíceps braquial (pico) · braquial",
    "Sentado, cotovelo apoiado na parte interna da coxa. Flexione até o pico, aperte 1 s e desça completo. Um braço por vez.\nBase: a rosca concentrada apresentou a maior ativação do bíceps entre 8 exercícios comparados (Young et al., ACE, 2014).")

D["Mergulho (Tríceps)"] = ("Tríceps · peitoral inferior · deltoide anterior",
    "Tronco vertical (para tríceps), desça até o cotovelo ~90° e empurre até estender. Ombros para baixo, sem afundar demais.\nBase: mergulho em barras gera ativação de tríceps entre as mais altas comparadas a outras extensões (Boehler et al., ACE, 2011).")
D["Tríceps Francês Unilateral na Polia Baixa"] = ("Tríceps (cabeça longa)",
    "Cabo baixo atrás, braço acima da cabeça com o cotovelo apontando para cima. Estenda completo e volte até o antebraço passar da cabeça.\nBase: extensão acima da cabeça alonga a cabeça longa e produziu mais hipertrofia do tríceps que a extensão com braço neutro (Maeo et al., 2023).")
D["Tríceps Pulley"] = ("Tríceps (cabeças lateral e medial)",
    "Cotovelos fixos ao lado do tronco, estenda a barra até travar suavemente e volte até o antebraço passar de 90°. Tronco levemente inclinado.\nBase: com o braço ao lado do corpo a ênfase recai nas cabeças lateral e medial; a cabeça longa pede posição acima da cabeça (Maeo et al., 2023).")
D["Tríceps Testa"] = ("Tríceps (cabeça longa e lateral)",
    "Deitado, braços apontando um pouco para trás da vertical. Desça a barra até a testa/atrás da cabeça e estenda sem mover os cotovelos.\nBase: a extensão deitada promoveu hipertrofia regional do tríceps, sobretudo da cabeça longa (Wakahara et al., 2012).")
D["Tríceps Corda na Polia"] = ("Tríceps (cabeças lateral e medial)",
    "Cotovelos ao lado do tronco, estenda separando as pontas da corda no final para contrair mais. Volte controlando.\nBase: abrir a corda no final aumenta a extensão completa do cotovelo; ênfase nas cabeças lateral/medial (Maeo et al., 2023).")
D["Tríceps Francês com Halter"] = ("Tríceps (cabeça longa)",
    "Sentado, halter acima da cabeça com as duas mãos, desça atrás da cabeça até o alongamento e estenda completo. Cotovelos apontando para a frente.\nBase: posição acima da cabeça gera ~40% mais hipertrofia do tríceps que a extensão neutra (Maeo et al., 2023).")
D["Tríceps Coice com Halter"] = ("Tríceps (cabeças lateral e longa)",
    "Tronco inclinado, braço paralelo ao chão e cotovelo fixo. Estenda até a linha do corpo, pause 1 s e volte.\nBase: o coice foi um dos exercícios com maior ativação de tríceps na comparação da ACE (Boehler et al., 2011).")

D["Afundo com Halteres"] = ("Quadríceps · glúteo máximo · isquiotibiais",
    "Passo à frente, desça até o joelho de trás quase tocar o chão mantendo o tronco ereto; empurre com o calcanhar da frente para voltar.\nBase: afundos e avanços ativam fortemente quadríceps e glúteo; segurar os halteres ao lado não muda a ativação (Stastny et al., 2015).")
D["Agachamento Livre"] = ("Quadríceps · glúteo máximo · adutores · eretores",
    "Pés na largura dos ombros, desça empurrando o quadril para trás e para baixo até pelo menos a paralela, joelhos acompanhando a ponta dos pés. Suba empurrando o chão.\nBase: agachamento profundo é seguro para joelhos saudáveis e aumenta a ativação de glúteo e quadríceps (Hartmann et al., 2013; Escamilla, 2001).")
D["Extensora"] = ("Quadríceps (reto femoral e vastos)",
    "Costas no apoio, eixo da máquina na linha do joelho. Estenda até travar suavemente, pause 1 s e desça completo em 2–3 s.\nBase: treinar a parte inicial/alongada da extensão gerou mais hipertrofia do quadríceps que a parte final (Pedrosa et al., 2022).")
D["Agachamento na Máquina"] = ("Quadríceps · glúteo máximo",
    "Pés na plataforma na largura dos ombros, desça controlando até a paralela ou abaixo e suba sem travar os joelhos.\nBase: a máquina reduz a demanda de equilíbrio e permite focar na amplitude; agachar fundo favorece glúteo e quadríceps (Escamilla, 2001).")
D["Agachamento Sumô"] = ("Adutores · glúteo máximo · quadríceps",
    "Pés bem afastados e pontas para fora, desça mantendo os joelhos alinhados com os pés e o tronco ereto. Suba apertando o glúteo.\nBase: a base larga aumenta a ativação de adutores e glúteo em relação ao agachamento tradicional (Paoli et al., 2009; Escamilla et al., 2001).")
D["Leg Press"] = ("Quadríceps · glúteo máximo · isquiotibiais",
    "Pés na largura dos ombros no meio da plataforma, desça até ~90° no joelho sem tirar o quadril do banco e empurre sem travar.\nBase: pés mais altos aumentam glúteo/isquiotibiais, mais baixos aumentam quadríceps (Escamilla et al., 2001).")
D["Agachamento Búlgaro"] = ("Quadríceps · glúteo máximo (unilateral)",
    "Pé de trás sobre o banco, desça até a coxa da frente ficar paralela mantendo o joelho alinhado. Empurre com o calcanhar da frente.\nBase: o búlgaro atinge ativação de quadríceps e glúteo semelhante ao agachamento com metade da carga (Mackey & Riemann, 2021).")
D["Agachamento no Hack"] = ("Quadríceps (vastos) · glúteo",
    "Costas no apoio, pés no meio da plataforma. Desça até pelo menos 90° e suba sem travar os joelhos.\nBase: o apoio do tronco reduz a demanda lombar e permite maior profundidade com ênfase no quadríceps (Escamilla, 2001).")

D["Flexora de Perna Sentado"] = ("Isquiotibiais (semitendíneo · semimembranáceo · bíceps femoral)",
    "Costas no apoio, eixo na linha do joelho. Flexione até o final e volte devagar até quase estender — a fase de alongamento é a que mais importa.\nBase: a flexora sentada (quadril flexionado, músculo alongado) gerou mais hipertrofia dos isquiotibiais que a deitada (Maeo et al., 2021).")
D["Flexora Deitado"] = ("Isquiotibiais · gastrocnêmio (assistência)",
    "Quadril colado no banco, flexione até o pad tocar o glúteo e desça controlado. Não levante o quadril para ajudar.\nBase: a flexora deitada ativa bem os isquiotibiais, mas com o quadril estendido o músculo trabalha mais curto (Maeo et al., 2021).")
D["Flexora em Pé"] = ("Isquiotibiais (unilateral)",
    "Tronco apoiado, flexione o joelho levando o calcanhar ao glúteo e volte devagar. Quadril estável, sem inclinar.\nBase: variações unilaterais ajudam a equilibrar assimetrias entre as pernas (Bourne et al., 2017).")
D["Levantamento Terra Romeno (Stiff)"] = ("Isquiotibiais (porção proximal) · glúteo máximo · eretores",
    "Joelhos levemente flexionados, empurre o quadril para trás mantendo a coluna neutra e a barra próxima às pernas. Desça até o alongamento e suba estendendo o quadril.\nBase: o stiff ativa preferencialmente a porção proximal dos isquiotibiais, complementando a flexora (Schoenfeld et al., 2015; McAllister et al., 2014).")
D["Elevação Pélvica"] = ("Glúteo máximo · isquiotibiais",
    "Costas no banco na linha das escápulas, pés no chão com joelhos ~90° no topo. Suba até o quadril alinhar com o tronco, aperte 1 s e desça.\nBase: o hip thrust produz maior ativação do glúteo máximo que o agachamento (Contreras et al., 2015; Neto et al., 2020).")
D["Coice na Polia Baixa"] = ("Glúteo máximo (extensão de quadril isolada)",
    "Tronco levemente inclinado e apoiado, estenda o quadril para trás sem arquear a lombar; volte controlado.\nBase: extensão de quadril isolada mantém alta ativação do glúteo máximo (Neto et al., 2020).")
D["Flexão Nórdica"] = ("Isquiotibiais (excêntrico) · bíceps femoral",
    "Joelhos apoiados, tornozelos presos, desça o tronco o mais devagar possível mantendo quadril estendido; ajude com as mãos na volta.\nBase: a nórdica é o exercício de maior ativação excêntrica de isquiotibiais e reduz risco de lesão (Bourne et al., 2017).")
D["Abdutora"] = ("Glúteo médio · glúteo mínimo · tensor da fáscia lata",
    "Sentado com as costas apoiadas, abra as pernas contra os pads até o fim e volte devagar sem bater. Inclinar levemente à frente aumenta o glúteo.\nBase: abdução de quadril ativa glúteo médio/mínimo, estabilizadores importantes da pelve (Reiman et al., 2012).")
D["Adutora"] = ("Adutores (longo · curto · magno)",
    "Feche as pernas contra os pads de forma controlada e abra devagar até o alongamento confortável, sem forçar.\nBase: exercícios de adução fortalecem os adutores, ligados à prevenção de dor na virilha (Serner et al., 2014).")
D["Abdução de Quadril na Polia"] = ("Glúteo médio · glúteo mínimo",
    "Tornozeleira no cabo baixo, tronco reto segurando o apoio; leve a perna para o lado sem inclinar e volte devagar.\nBase: abdução em pé com cabo ativa o glúteo médio e o lado oposto como estabilizador (Reiman et al., 2012).")
D["Panturrilha na Máquina"] = ("Gastrocnêmio · sóleo",
    "Ponta dos pés no apoio, desça o calcanhar até o alongamento máximo, pause e suba até a ponta. Sem quicar.\nBase: treinar a panturrilha em comprimento alongado gerou mais hipertrofia que na porção encurtada (Kassiano et al., 2023).")
D["Panturrilha no Step"] = ("Gastrocnêmio · sóleo",
    "Ponta dos pés na borda, desça o calcanhar abaixo do step, pause 1–2 s e suba até o topo. Joelhos estendidos para focar o gastrocnêmio.\nBase: a posição alongada (calcanhar abaixo) é a que mais gera hipertrofia; a direção dos pés não altera a ativação (Kassiano et al., 2023; Nunes et al., 2020).")
D["Panturrilha em Pé na Máquina"] = ("Gastrocnêmio · sóleo",
    "Ombros nos apoios, joelhos estendidos, desça o calcanhar totalmente e suba até a ponta dos pés com pausa no topo.\nBase: joelho estendido enfatiza o gastrocnêmio; amplitude completa favorece hipertrofia (Kassiano et al., 2023).")

D["Abdominais na Máquina"] = ("Reto abdominal · oblíquos",
    "Flexione o tronco levando as costelas em direção ao quadril, expire no final e volte controlado sem soltar o peso.\nBase: flexão de tronco com resistência ativa o reto abdominal e é segura em amplitudes moderadas (Escamilla et al., 2010; Schoenfeld & Kolber, 2016).")
D["Elevação de Pernas"] = ("Reto abdominal (porção inferior) · flexores do quadril",
    "Deitado, mãos ao lado do corpo, eleve as pernas até a vertical e desça devagar sem encostar no chão. Lombar sempre em contato com o solo.\nBase: elevações de perna ativam reto abdominal inferior e flexores do quadril (Escamilla et al., 2006).")
D["Abdominal Supra no Solo"] = ("Reto abdominal (porção superior)",
    "Joelhos flexionados, mãos ao lado da cabeça, eleve as escápulas do chão expirando e desça controlado. Não puxe o pescoço.\nBase: o abdominal tradicional produz alta ativação do reto abdominal superior (Escamilla et al., 2010).")
D["Corrida"] = ("Cardiorrespiratório · membros inferiores",
    "Postura ereta, passadas curtas e cadência alta (~170–180 passos/min), aterrissando com o pé sob o quadril. Progrida volume 10%/semana.\nBase: cadência mais alta e passada mais curta melhoram economia de corrida e reduzem impacto (Barnes & Kilding, 2015).")


# ── exercícios ────────────────────────────────────────────────────────────────
E = []

def ex(nome, grupo, emoji, A, B, props, id=None, facing=1, front=None, tipo="musculacao", nome_atual=None):
    E.append(dict(nome=nome, grupo=grupo, emoji=emoji, A=A, B=B, props=props, id=id, facing=facing, front=front, tipo=tipo, nome_atual=nome_atual or nome))

TOWER_R, TOWER_L = 470, 130

# PEITORAL
ex("Supino Reto na Máquina Deitado", "Peitoral", "🏋️", SUPINE(ua=-25, fa=95), SUPINE(ua=70, fa=95),
   [("bench", 110, 370, 252), ("tower", 450), ("stack", 495), ("lever", (441, 128), "hand"), ("handle", True)], id="1b1a1328", nome_atual="Supino Reto na Maquina Deitado")
ex("Supino Reto na Máquina Sentado", "Peitoral", "🏋️", SEATED(ua=-170, fa=0), SEATED(ua=0, fa=0),
   [("seat", 90), ("tower", TOWER_R), ("stack", 515), ("lever", (TOWER_R, 150), "hand"), ("handle", True)], id="e6edd5b3")
ex("Supino Declinado na Máquina", "Peitoral", "🏋️", SUPINE(hip=(320, 236), torso=195, neck=195, thigh=-60, ua=-15, fa=105), SUPINE(hip=(320, 236), torso=195, neck=195, thigh=-60, ua=80, fa=105),
   [("incline",), ("tower", 450), ("stack", 495), ("lever", (441, 128), "hand"), ("handle", True)], id="fefee8d3", nome_atual="Supino Declinado na Maquina")
ex("Supino Inclinado", "Peitoral", "🏋️", SUPINE(hip=(320, 250), torso=150, neck=150, thigh=-80, shin=-95, ua=-10, fa=80, len={"shin": 46}), SUPINE(hip=(320, 250), torso=150, neck=150, thigh=-80, shin=-95, ua=60, fa=75, len={"shin": 46}),
   [("incline",), ("barbell", 14)], id="f09b4daa")
ex("Supino Reto com Halteres", "Peitoral", "🏋️", SUPINE(ua=-30, fa=95), SUPINE(ua=75, fa=95),
   [("bench", 110, 370, 252), ("dumbbell", False)], id="bb673b75")
ex("Crucifixo na Máquina", "Peitoral", "🏋️", SEATED(ua=160, fa=170), SEATED(ua=10, fa=10),
   [("seat", 90), ("tower", TOWER_L), ("stack", 110), ("lever", (300, 118), "hand"), ("pad_at", "hand", 90)], id="aa61d549")
ex("Supino Reto com Barra", "Peitoral", "🏋️", SUPINE(ua=-30, fa=95), SUPINE(ua=75, fa=95),
   [("bench", 110, 370, 252), ("barbell", 15)])
ex("Crucifixo com Halteres", "Peitoral", "🏋️", SUPINE(ua=-35, fa=20), SUPINE(ua=80, fa=95),
   [("bench", 110, 370, 252), ("dumbbell", False)])
ex("Cross-over na Polia", "Peitoral", "🏋️", STAND(torso=75, ua=150, fa=130), STAND(torso=75, ua=-30, fa=-20),
   [("tower", TOWER_L), ("stack", 110), ("cable", (TOWER_L, 95), "hand"), ("handle", True)])
ex("Flexão de Braço", "Peitoral", "🏋️",
   dict(hip=(270, 280), torso=18, neck=10, thigh=194, shin=194, foot=-95, ua=-95, fa=-85),
   dict(hip=(270, 300), torso=12, neck=6, thigh=191, shin=190, foot=-95, ua=-150, fa=-55), [])

# COSTAS
ex("Remada Fechada na Máquina", "Costas", "🏋️", SEATED(ua=-10, fa=-5), SEATED(ua=-155, fa=-15),
   [("seat", None), ("chest_pad", 40), ("tower", TOWER_R), ("stack", 515), ("lever", (TOWER_R, 150), "hand"), ("handle", True)], id="b7a120f0")
ex("Remada Aberta na Máquina", "Dorsal / Rombóide", "🏋️", SEATED(ua=5, fa=5), SEATED(ua=-160, fa=10),
   [("seat", None), ("chest_pad", 40), ("tower", TOWER_R), ("stack", 515), ("lever", (TOWER_R, 130), "hand"), ("handle", True)], id="37da252b")
ex("Remada na Polia Sentado", "Dorsal / Rombóide", "🏋️",
   dict(hip=(250, 270), torso=80, thigh=-15, shin=-40, foot=60, ua=-10, fa=-5, len={"shin": 62}),
   dict(hip=(250, 270), torso=92, thigh=-15, shin=-40, foot=60, ua=-150, fa=-10, len={"shin": 62}),
   [("bench", 190, 300, 278), ("footplate", (362, 300)), ("tower", TOWER_R), ("stack", 515), ("cable_via", (366, 300), "hand"), ("handle", True)], id="59b8f69d")
ex("Remada Cavalinho na Máquina", "Dorsal / Trapézio", "🏋️", BENT(torso=38, neck=25, ua=-70, fa=-70), BENT(torso=38, neck=25, ua=-150, fa=-60),
   [("chest_pad_incline",), ("lever", (330, 340), "hand"), ("handle", False)], id="3ff85379")
ex("High Row", "Dorsal / Rombóide", "🏋️", SEATED(ua=40, fa=40), SEATED(ua=-150, fa=-10),
   [("seat", 90), ("tower", TOWER_R), ("stack", 515), ("lever", (TOWER_R, 90), "hand"), ("handle", True)], id="89e42973")
ex("Puxada Fechada Frontal", "Dorsal / Bíceps", "🏋️", SEATED(ua=95, fa=90), SEATED(ua=-110, fa=60),
   [("seat", None), ("knee_pad",), ("tower", TOWER_R), ("stack", 515), ("cable_via", (300, 78), "hand"), ("handle", False)], id="1ad63bb7")
ex("Puxada Fechada Supinada", "Dorsal / Bíceps", "🏋️", SEATED(ua=95, fa=90), SEATED(ua=-110, fa=60),
   [("seat", None), ("knee_pad",), ("tower", TOWER_R), ("stack", 515), ("cable_via", (300, 78), "hand"), ("handle", True)], id="ca81c43e")
ex("Puxada Aberta Frontal", "Dorsal / Bíceps", "🏋️", SEATED(ua=100, fa=80), SEATED(ua=-150, fa=40),
   [("seat", None), ("knee_pad",), ("tower", TOWER_R), ("stack", 515), ("cable_via", (300, 78), "hand"), ("handle", False)])
ex("Barra Fixa", "Dorsal / Bíceps", "🏋️",
   dict(hip=(300, 250), torso=90, thigh=-100, shin=-80, foot=-20, ua=90, fa=90),
   dict(hip=(300, 192), torso=90, thigh=-100, shin=-80, foot=-20, ua=90, fa=90, hand_target=(300, 98), bend=-1),
   [("pullup_bar", 98)])
ex("Remada Curvada com Barra", "Dorsal / Rombóide", "🏋️", BENT(ua=-80, fa=-80), BENT(ua=-160, fa=-80),
   [("barbell", 15)])
ex("Remada Unilateral com Halter", "Dorsal / Rombóide", "🏋️",
   BENT(torso=25, neck=15, ua=-85, fa=-85, hand2_target=(400, 262), bend2=1),
   BENT(torso=25, neck=15, ua=-165, fa=-75, hand2_target=(400, 262), bend2=1),
   [("bench", 350, 490, 262), ("dumbbell", False)])
ex("Pulldown com Braços Estendidos", "Dorsal / Rombóide", "🏋️", STAND(torso=80, ua=45, fa=45), STAND(torso=80, ua=-70, fa=-70),
   [("tower", TOWER_R), ("stack", 515), ("cable", (TOWER_R, 90), "hand"), ("handle", False)])
ex("Hiperextensão Lombar", "Lombar", "🏋️",
   dict(hip=(300, 236), torso=-40, neck=-30, thigh=210, shin=200, foot=-100, ua=-120, fa=-20),
   dict(hip=(300, 236), torso=22, neck=25, thigh=210, shin=200, foot=-100, ua=-120, fa=-20),
   [("roman_chair",)])
ex("Levantamento Terra", "Posterior de Coxa", "🏋️",
   dict(hip=(275, 232), torso=32, neck=20, thigh=-60, shin=-105, foot=0, ua=-80, fa=-80, hand_target=(340, 292), bend=1),
   STAND(ua=-90, fa=-90), [("barbell", 20)])
ex("Encolhimento com Halteres", "Trapézio", "🏋️", STAND(len={"torso": 70}), STAND(len={"torso": 80}),
   [("dumbbell", True)])

# OMBRO
ex("Crucifixo Invertido Sentado", "Deltóide", "🏋️‍♂️", SEATED(ua=5, fa=5), SEATED(ua=178, fa=176),
   [("seat", None), ("chest_pad", 40), ("tower", TOWER_R), ("stack", 515), ("lever", (300, 118), "hand"), ("handle", True)], id="e9241c10")
ex("Desenvolvimento na Máquina", "Deltóide", "🏋️", SEATED(ua=-30, fa=85), SEATED(ua=85, fa=90),
   [("seat", 90), ("tower", TOWER_L), ("stack", 110), ("lever", (TOWER_L, 100), "hand"), ("handle", True)], id="a7ff4aaf")
ex("Elevação Frontal na Polia", "Deltóide", "🏋️‍♂️", STAND(ua=-80, fa=-80), STAND(ua=15, fa=15),
   [("tower", TOWER_L), ("stack", 110), ("cable", (TOWER_L, 325), "hand"), ("handle", False)], id="0cf2c040")
ex("Elevação Lateral com Halteres", "Deltóide Lateral", "🏋️", STAND(ua=-85, fa=-85), STAND(ua=-2, fa=6),
   [("dumbbell", False)], id="ee4b34f0")
ex("Elevação Lateral na Polia", "Deltóide Lateral", "🏋️‍♂️", STAND(ua=-85, fa=-85), STAND(ua=-2, fa=6),
   [("tower", TOWER_L), ("stack", 110), ("cable", (TOWER_L, 325), "hand"), ("handle", True)], id="4270d1f6")
ex("Elevação Lateral na Máquina", "Deltóide Lateral", "🏋️", SEATED(ua=-85, fa=-20), SEATED(ua=0, fa=70),
   [("seat", 90), ("tower", TOWER_L), ("stack", 110), ("lever", (300, 140), "elbow"), ("pad_at", "elbow", 0)])
ex("Crucifixo Invertido", "Deltóide Posterior", "🏋️", BENT(torso=22, ua=-80, fa=-70), BENT(torso=22, ua=115, fa=110),
   [("dumbbell", False)], id="6f78e74c")
ex("Desenvolvimento Arnold", "Ombro", "🏋️", SEATED(ua=-10, fa=100), SEATED(ua=85, fa=90),
   [("seat", 90), ("dumbbell", False)], id="b57159b0")
ex("Desenvolvimento com Halteres", "Deltóide", "🏋️", SEATED(ua=-30, fa=85), SEATED(ua=85, fa=90),
   [("seat", 90), ("dumbbell", False)])
ex("Face Pull na Polia", "Deltóide Posterior", "🏋️‍♂️", STAND(ua=8, fa=8), STAND(hand_target=(306, 128), bend=-1),
   [("tower", TOWER_R), ("stack", 515), ("cable", (TOWER_R, 150), "hand"), ("rope",)])
ex("Elevação Frontal com Halteres", "Deltóide", "🏋️", STAND(ua=-85, fa=-85), STAND(ua=15, fa=15),
   [("dumbbell", False)])

# BÍCEPS
ex("Rosca Alternada na Máquina", "Bíceps", "💪", SEATED(ua=-40, fa=-35), SEATED(ua=-40, fa=120),
   [("seat", 90), ("preacher",), ("tower", TOWER_R), ("stack", 515), ("lever", (440, 245), "hand"), ("handle", True)], id="333ca7e7")
ex("Rosca Alternada no Banco Inclinado", "Bíceps", "💪", SEATED(torso=110, neck=100, ua=-110, fa=-110), SEATED(torso=110, neck=100, ua=-110, fa=20),
   [("seat", 112), ("dumbbell", False)], id="0eed6ebd")
ex("Rosca Scott com Halteres", "Bíceps", "💪", SEATED(ua=-45, fa=-40), SEATED(ua=-45, fa=115),
   [("seat", None), ("preacher",), ("dumbbell", False)], id="bba4b446")
ex("Rosca Scott na máquina", "Bíceps", "💪", SEATED(ua=-45, fa=-40), SEATED(ua=-45, fa=115),
   [("seat", None), ("preacher",), ("tower", TOWER_R), ("stack", 515), ("lever", (440, 245), "hand"), ("handle", True)], id="9ff64ebf")
ex("Rosca Martelo na Polia", "Bíceps / Braquial", "💪", STAND(ua=-85, fa=-85), STAND(ua=-85, fa=40),
   [("tower", TOWER_R), ("stack", 515), ("cable", (TOWER_R, 325), "hand"), ("rope",)], id="cc614132")
ex("Rosca Punho com Halter Apoiado", "Bíceps / Braquial", "💪", SEATED(torso=70, neck=60, ua=-45, fa=-12), SEATED(torso=70, neck=60, ua=-45, fa=18),
   [("seat", None), ("dumbbell", False)], id="c2c93530")
ex("Rosca Direta com Barra", "Bíceps", "💪", STAND(ua=-90, fa=-90), STAND(ua=-80, fa=60),
   [("barbell", 10)])
ex("Rosca Martelo com Halteres", "Bíceps / Braquial", "💪", STAND(ua=-90, fa=-90), STAND(ua=-85, fa=45),
   [("dumbbell", True)])
ex("Rosca Concentrada", "Bíceps", "💪", SEATED(torso=65, neck=55, ua=-60, fa=-60), SEATED(torso=65, neck=55, ua=-60, fa=100),
   [("seat", None), ("dumbbell", False)])

# TRÍCEPS
ex("Mergulho (Tríceps)", "Tríceps", "🏋️",
   dict(hip=(300, 240), torso=90, thigh=-100, shin=-160, foot=-60, ua=-90, fa=-90),
   dict(hip=(300, 284), torso=85, thigh=-100, shin=-160, foot=-60, ua=-90, fa=-90, hand_target=(300, 252), bend=-1),
   [("dip_bars", 252)], id="4e5b8db8")
ex("Tríceps Francês Unilateral na Polia Baixa", "Tríceps", "💪", STAND(ua=100, fa=-140), STAND(ua=100, fa=100),
   [("tower", TOWER_L), ("stack", 110), ("cable", (TOWER_L, 325), "hand"), ("handle", True)], id="45f56d80")
ex("Tríceps Pulley", "Tríceps", "💪", STAND(torso=80, ua=-95, fa=10), STAND(torso=80, ua=-95, fa=-85),
   [("tower", TOWER_R), ("stack", 515), ("cable", (TOWER_R, 90), "hand"), ("handle", False)], id="3f6e172a")
ex("Tríceps Testa", "Tríceps", "💪", SUPINE(ua=95, fa=190), SUPINE(ua=95, fa=95),
   [("bench", 110, 370, 252), ("barbell", 11)], id="c7016a9d")
ex("Tríceps Corda na Polia", "Tríceps", "💪", STAND(torso=80, ua=-95, fa=10), STAND(torso=80, ua=-95, fa=-95),
   [("tower", TOWER_R), ("stack", 515), ("cable", (TOWER_R, 90), "hand"), ("rope",)])
ex("Tríceps Francês com Halter", "Tríceps", "💪", SEATED(ua=95, fa=-140), SEATED(ua=95, fa=95),
   [("seat", 90), ("dumbbell", False)])
ex("Tríceps Coice com Halter", "Tríceps", "💪", BENT(torso=25, ua=-165, fa=-95), BENT(torso=25, ua=-165, fa=-170),
   [("dumbbell", False)])

# QUADRÍCEPS / GLÚTEO
ex("Afundo com Halteres", "Quadríceps", "🏋️", STAND(),
   dict(hip=(300, 258), torso=90, thigh=-20, shin=-90, foot=0, thigh2=-125, shin2=-150, foot2=-90, ua=-90, fa=-90),
   [("dumbbell", True)], id="58dccb5e")
ex("Agachamento Livre", "Quadríceps", "🏋️",
   dict(hip=(300, 204), torso=90, thigh=-90, shin=-90, foot=0, ua=-90, fa=-90, len={"shin": 76}, hand_target=(292, 128), bend=-1),
   dict(hip=(270, 232), torso=65, neck=60, thigh=-45, shin=-108, foot=0, ua=-90, fa=-90, len={"shin": 76}, hand_target=(291, 165), bend=-1),
   [("barbell_back",)], id="f06e45bc")
ex("Agachamento Sumô", "Quadríceps / Glúteo", "🏋️",
   dict(hip=(300, 204), torso=90, thigh=-90, shin=-90, foot=0, ua=-80, fa=-80, len={"shin": 76}),
   dict(hip=(275, 236), torso=70, neck=65, thigh=-50, shin=-108, foot=0, ua=-75, fa=-75, len={"shin": 76}),
   [("dumbbell", True)], id="5143c9ed")
ex("Extensora", "Quadríceps", "🦵", SEATED(ua=-70, fa=-70, shin=-80), SEATED(ua=-70, fa=-70, shin=-5),
   [("seat", 90), ("tower", TOWER_R), ("stack", 515), ("lever", "knee", "foot"), ("pad_foot",)], id="e55a6426")
ex("Leg Press", "Quadríceps / Glúteo", "🦵",
   dict(hip=(250, 272), torso=125, neck=120, thigh=75, shin=-15, foot=60, ua=-100, fa=-40),
   dict(hip=(250, 272), torso=125, neck=120, thigh=30, shin=30, foot=105, ua=-100, fa=-40),
   [("seat", 125), ("legpress",)], id="3274a384")
ex("Agachamento Búlgaro", "Quadríceps / Glúteo", "🏋️",
   dict(hip=(300, 214), torso=90, thigh=-80, shin=-95, foot=0, thigh2=-160, shin2=-175, foot2=-100, ua=-90, fa=-90),
   dict(hip=(300, 250), torso=80, thigh=-40, shin=-105, foot=0, thigh2=-140, shin2=143, foot2=-100, ua=-90, fa=-90),
   [("bench", 120, 236, 240), ("dumbbell", True)])
ex("Agachamento no Hack", "Quadríceps", "🦵",
   dict(hip=(300, 200), torso=112, neck=105, thigh=-80, shin=-100, foot=0, ua=110, fa=60),
   dict(hip=(285, 245), torso=112, neck=105, thigh=-30, shin=-115, foot=0, ua=110, fa=60),
   [("incline",), ("shoulder_pads",)])

# POSTERIOR / GLÚTEO
ex("Flexora de Perna Sentado", "Isquiotibiais", "🦵", SEATED(ua=-70, fa=-70, shin=0), SEATED(ua=-70, fa=-70, shin=-80),
   [("seat", 90), ("tower", TOWER_R), ("stack", 515), ("lever", "knee", "foot"), ("pad_foot",)], id="3e848d7d")
ex("Flexora Deitado", "Isquiotibiais", "🦵", PRONE(shin=0), PRONE(shin=100),
   [("bench", 150, 420, 258, False), ("tower", TOWER_R), ("stack", 515), ("lever", "knee", "foot"), ("pad_foot",)], id="ebaa51d6")
ex("Flexora em Pé", "Posterior de Coxa", "🏋️", STAND(ua=-20, fa=-20, shin=-90, thigh2=-90, shin2=-90), STAND(ua=-20, fa=-20, shin=-160, thigh2=-90, shin2=-90),
   [("tower", TOWER_R), ("stack", 515), ("lever", (300, 272), "foot"), ("pad_foot",), ("hand_rest",)], id="578f2cf4")
ex("Levantamento Terra Romeno (Stiff)", "Posterior de Coxa", "🏋️", STAND(), BENT(hip=(285, 215), torso=15, neck=5, thigh=-100, shin=-85, ua=-80, fa=-80),
   [("barbell", 15)], id="79c9f663")
ex("Elevação Pélvica", "Glúteo", "🍑",
   dict(hip=(300, 296), torso=160, neck=160, thigh=20, shin=-95, foot=-5, ua=-90, fa=-90, hand_target=(304, 288), bend=1),
   dict(hip=(300, 250), torso=180, neck=180, thigh=-25, shin=-95, foot=-5, ua=-90, fa=-90, hand_target=(304, 242), bend=1),
   [("bench", 110, 240, 246), ("plate_hip",)], id="8fa6d8ea")
ex("Coice na Polia Baixa", "Glúteo", "🍑", STAND(torso=80, ua=-10, fa=-10, thigh=-90, shin=-90, thigh2=-90, shin2=-90),
   STAND(torso=80, ua=-10, fa=-10, thigh=-150, shin=-140, foot=-90, thigh2=-90, shin2=-90),
   [("tower", TOWER_L), ("stack", 110), ("cable", (TOWER_L, 325), "foot"), ("hand_rest",)], id="5be8bb3e")
ex("Flexão Nórdica", "Isquiotibiais", "🦵",
   dict(hip=(300, 268), torso=90, thigh=-90, shin=180, foot=-90, ua=-40, fa=40),
   dict(hip=(352, 298), torso=30, neck=25, thigh=-150, shin=180, foot=-90, ua=-30, fa=30),
   [("nordic_anchor",)])
ex("Abdutora", "Abdutores da Coxa / Glúteo", "🦵", None, None, [], id="6e06bce6", front="abducao")
ex("Adutora", "Adutores da Coxa", "🦵", None, None, [], id="a7f62fd1", front="aducao")
ex("Abdução de Quadril na Polia", "Abdutores da Coxa / Glúteo", "🍑", None, None, [], front="abducao_polia")
ex("Panturrilha na Máquina", "Panturrilha", "🦵", SEATED(foot=12, ua=-60, fa=-60), SEATED(hip=(280, 254), foot=-30, ua=-60, fa=-60),
   [("seat", None), ("step",), ("knee_pad",), ("tower", TOWER_R), ("stack", 515)], id="919d1ad4")
ex("Panturrilha no Step", "Panturrilha", "🦵", STAND(hip=(300, 216), foot=14), STAND(hip=(300, 200), foot=-28),
   [("step",)], id="d7498204")
ex("Panturrilha em Pé na Máquina", "Panturrilha", "🦵", STAND(hip=(300, 216), foot=14, ua=75, fa=170), STAND(hip=(300, 200), foot=-28, ua=75, fa=170),
   [("step",), ("tower", TOWER_L), ("stack", 110), ("shoulder_pads",)])

# ABDÔMEN / CARDIO
ex("Abdominais na Máquina", "Abdômen", "🧘", SEATED(torso=95, ua=70, fa=20), SEATED(torso=48, neck=40, ua=70, fa=20),
   [("seat", 90), ("tower", TOWER_L), ("stack", 110), ("lever", (TOWER_L, 100), "hand"), ("pad_at", "hand", 0)], id="17e52ced")
ex("Elevação de Pernas", "Abdômen", "🧘",
   dict(hip=(300, 320), torso=180, neck=180, thigh=0, shin=0, foot=60, ua=0, fa=0),
   dict(hip=(300, 320), torso=180, neck=180, thigh=85, shin=85, foot=150, ua=0, fa=0), [("mat",)])
ex("Abdominal Supra no Solo", "Abdômen", "🧘",
   dict(hip=(300, 320), torso=180, neck=180, thigh=40, shin=-95, foot=-5, ua=150, fa=60, hand_target=(212, 300), bend=1),
   dict(hip=(300, 320), torso=140, neck=120, thigh=40, shin=-95, foot=-5, ua=150, fa=60, hand_target=(236, 262), bend=1), [("mat",)])
ex("Corrida", "Corrida", "🏃‍♂️",
   STAND(torso=82, thigh=-60, shin=-100, foot=10, thigh2=-120, shin2=-150, foot2=-40, ua=-50, fa=30, ua2=-130, fa2=-40),
   STAND(torso=82, thigh=-120, shin=-150, foot=-40, thigh2=-60, shin2=-100, foot2=10, ua=-130, fa=-40, ua2=-50, fa2=30),
   [("treadmill",)], id="4a151e92", tipo="corrida")

for e in E:
    e["sub"], e["dica"] = D[e["nome"]]
