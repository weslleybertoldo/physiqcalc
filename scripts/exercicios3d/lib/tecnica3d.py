# Medidas de TÉCNICA do movimento, além de mão no peso e colisão (correção dele 04/10/2026, na remada com os
# cotovelos abertos ~70°: "Você está checando a anatomia do movimento… Posição dos pés (aberto, fechado, para dentro
# ou para fora, cotovelo próximo ao corpo entre outras coisas)" + "a checagem é exatamente para verificar todo o
# movimento"). Funções puras sobre as posições das juntas — cabeça de cada osso do rig no mundo, em metros, Z pra
# cima — medidas no referencial do PRÓPRIO corpo (tronco ou pelve), então valem com o boneco em pé, curvado ou
# deitado. Testes sem o Blender: .venv/bin/python -m pytest -q test_tecnica.py
import math

import numpy as np

CIMA = np.array([0.0, 0.0, 1.0])
LADOS = (("Left", -1.0), ("Right", 1.0))     # "pra fora" = −lado no esquerdo, +lado no direito
JUNTAS = ("Hips", "Spine1", "Neck", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
          "LeftHandMiddle1",
          "RightHandMiddle1", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot",
          "LeftToeBase", "RightToeBase")


def _u(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v * 0.0


def _chao(v):
    return np.array([v[0], v[1], 0.0])


def _ang(a, b):
    c = _u(a) @ _u(b)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def eixos_tronco(j):
    """Referencial do tronco: cima (quadril → pescoço), lado (ombro esquerdo → direito, ⟂ cima) e frente."""
    cima = _u(j["Neck"] - j["Hips"])
    lado = j["RightArm"] - j["LeftArm"]
    lado = _u(lado - cima * (lado @ cima))
    return cima, lado, np.cross(cima, lado)


def eixos_pelve(j):
    """Referencial dos pés, no plano do chão: lado (quadril esquerdo → direito) e frente da pelve."""
    lado = _u(_chao(j["RightUpLeg"] - j["LeftUpLeg"]))
    return lado, np.cross(CIMA, lado)


def cotovelo_tronco(j):
    """Abertura do braço (ombro → cotovelo) pra fora do plano sagital do tronco, graus [E, D]: 0 = cotovelo rente
    ao corpo (braço pra baixo, pra frente ou pra trás), 90 = braço aberto pro lado (em T), − = cruzando pra dentro.
    É o "cotovelo perto do corpo" das remadas, roscas e supinos."""
    _, lado, _ = eixos_tronco(j)
    return [math.degrees(math.asin(max(-1.0, min(1.0, _u(j[L + "ForeArm"] - j[L + "Arm"]) @ (s * lado)))))
            for L, s in LADOS]


def braco_frente(j):
    """Braço à frente (+) ou atrás (−) do tronco, no plano sagital do tronco, graus [E, D]: 0 = pendurado ao lado
    do tronco, 90 = na horizontal à frente (flexão do ombro), −30 = cotovelo atrás do corpo (fim da remada)."""
    cima, lado, frente = eixos_tronco(j)
    out = []
    for L, _ in LADOS:
        b = j[L + "ForeArm"] - j[L + "Arm"]
        b = b - lado * (b @ lado)
        out.append(math.degrees(math.atan2(b @ frente, b @ -cima)))
    return out


def braco_elevacao(j):
    """Braço levantado em relação ao tronco, graus [E, D]: 0 = pendurado, 90 = na altura do ombro, 180 = pra cima
    (pra qualquer lado: frente, lado ou trás)."""
    cima, _, _ = eixos_tronco(j)
    return [_ang(j[L + "ForeArm"] - j[L + "Arm"], -cima) for L, _ in LADOS]


def braco_plano(j):
    """Pra onde o braço levantado aponta, visto de cima do tronco, graus [E, D]: 0 = pro lado (plano frontal),
    30 = plano da escápula, 90 = pra frente, − = atrás do corpo. Só faz sentido com o braço levantado."""
    _, lado, frente = eixos_tronco(j)
    out = []
    for L, s in LADOS:
        b = j[L + "ForeArm"] - j[L + "Arm"]
        out.append(math.degrees(math.atan2(b @ frente, b @ (s * lado))))
    return out


def braco_abertura(j):
    """Abertura do braço no plano frontal do tronco (vista de frente do peito), graus [E, D]: 0 = colado na lateral
    apontando pros pés, 90 = em T. No supino é o "cotovelo a 45–75° do tronco" (90 = cotovelo aberto demais)."""
    cima, lado, _ = eixos_tronco(j)
    out = []
    for L, s in LADOS:
        b = j[L + "ForeArm"] - j[L + "Arm"]
        out.append(math.degrees(math.atan2(b @ (s * lado), b @ -cima)))
    return out


def antebraco_vertical(j):
    """Antebraço (cotovelo → punho) × a vertical do mundo, graus [E, D]: 0 = em pé, punho bem em cima (ou bem
    embaixo) do cotovelo — o "antebraço perpendicular ao chão" dos supinos e desenvolvimentos."""
    out = []
    for L, _ in LADOS:
        a = _ang(j[L + "Hand"] - j[L + "ForeArm"], CIMA)
        out.append(min(a, 180 - a))
    return out


def ombro_frente(j):
    """Articulação do ombro (cabeça do úmero) à frente (+) ou atrás (−) da base do pescoço, no eixo frente do tronco,
    mm [E, D]: protração (+) / retração (−) da escápula. Subir e descer o ombro não mexe nela — no encolhimento ela
    fica parada (o ombro só sobe e desce, sem rolar pra frente nem pra trás; lote 2, 04/10/2026)."""
    _, _, frente = eixos_tronco(j)
    return [float((j[L + "Arm"] - j["Neck"]) @ frente) * 1000 for L, _ in LADOS]


def pes_largura(j):
    """Distância entre os tornozelos (no chão) ÷ distância entre as articulações do quadril: ~1 = pés na largura do
    quadril, ~2 = na largura dos ombros, < 0,7 = pés colados ou cruzando."""
    return [float(np.linalg.norm(_chao(j["LeftFoot"] - j["RightFoot"]))
                  / max(np.linalg.norm(j["LeftUpLeg"] - j["RightUpLeg"]), 1e-9))]


def ponta_pe(j):
    """Ponta do pé (tornozelo → base dos dedos, no chão) virada pra fora (+) ou pra dentro (−) em relação à frente
    da pelve, graus [E, D]."""
    lado, frente = eixos_pelve(j)
    out = []
    for L, s in LADOS:
        p = _chao(j[L + "ToeBase"] - j[L + "Foot"])
        out.append(math.degrees(math.atan2(p @ (s * lado), p @ frente)))
    return out


def ponta_pe_diferenca(j):
    """Um pé mais virado que o outro, graus (valor absoluto)."""
    e, d = ponta_pe(j)
    return [abs(e - d)]


PONTAS = ("LeftToeBase", "RightToeBase")     # ossos que também entram pela PONTA (chave "<osso>_ponta")


def ponta_dedos(j):
    """Dedos (base dos dedos → ponta dos dedos, deitados no chão) virados pra fora (+) ou pra dentro (−) da frente da
    pelve, graus [E, D]. É a direção do pé que vale também com o calcanhar levantado (pé de trás do afundo, lote 2):
    com o pé quase em pé, o tornozelo → base dos dedos visto de cima fica curtinho e o ponta_pe perde o sentido."""
    lado, frente = eixos_pelve(j)
    out = []
    for L, s in LADOS:
        p = _chao(j[L + "ToeBase_ponta"] - j[L + "ToeBase"])
        out.append(math.degrees(math.atan2(p @ (s * lado), p @ frente)))
    return out


def pes_alinhados(j):
    """Um pé à frente do outro, mm (valor absoluto, ao longo da frente da pelve): base paralela = ~0."""
    _, frente = eixos_pelve(j)
    meio = {L: (j[L + "Foot"] + j[L + "ToeBase"]) / 2 for L, _ in LADOS}
    return [abs(float((meio["Left"] - meio["Right"]) @ frente)) * 1000]


def pegada_largura(j):
    """Distância entre as mãos (base do dedo médio = meio da pegada) ÷ distância entre os ombros (cabeça do úmero):
    ~1,2 = mãos na largura dos ombros, ~1,6 = pegada aberta."""
    return [float(np.linalg.norm(j["LeftHandMiddle1"] - j["RightHandMiddle1"])
                  / max(np.linalg.norm(j["LeftArm"] - j["RightArm"]), 1e-9))]


def joelho_fora_do_pe(j):
    """Joelho pra fora (+) ou pra dentro (−, valgo) da base dos dedos, mm [E, D], medido de lado a lado da pelve."""
    lado, _ = eixos_pelve(j)
    return [float((j[L + "Leg"] - j[L + "ToeBase"]) @ (s * lado)) * 1000 for L, s in LADOS]


def joelho_valgo(j):
    """Joelho pra fora (+) ou pra dentro (−, valgo) da reta quadril → tornozelo, mm [E, D], de lado a lado da pelve:
    perna reta = 0, com qualquer largura de base; dobrando, o joelho vai na direção do pé (0 ou um pouco pra fora)."""
    lado, _ = eixos_pelve(j)
    out = []
    for L, s in LADOS:
        h, a, k = j[L + "UpLeg"], j[L + "Foot"], j[L + "Leg"]
        d = a - h
        perto = h + d * (((k - h) @ d) / max(d @ d, 1e-12))
        out.append(float((k - perto) @ (s * lado)) * 1000)
    return out


def coluna(j):
    """Curvatura da coluna, graus: ângulo entre a lombar (quadril → Spine1) e a torácica (Spine1 → pescoço)."""
    return [_ang(j["Spine1"] - j["Hips"], j["Neck"] - j["Spine1"])]


def pes_base_lateral(j):
    """Distância entre os tornozelos SÓ de lado a lado da pelve (sem contar um pé à frente do outro) ÷ distância
    entre as articulações do quadril: ~1 = cada pé embaixo do seu quadril. É a "largura do quadril" da base do
    afundo (lote 2, 04/10/2026), em que o pes_largura (distância no chão inteiro) também conta a passada."""
    lado, _ = eixos_pelve(j)
    return [abs(float((j["LeftFoot"] - j["RightFoot"]) @ lado))
            / max(float(np.linalg.norm(j["LeftUpLeg"] - j["RightUpLeg"])), 1e-9)]


def joelho_altura(j):
    """Altura do centro do joelho acima do chão (z = 0), mm [E, D]: no afundo o joelho de trás desce até quase
    encostar no chão (lote 2). A pele da frente do joelho fica uns 5 cm à frente do centro da junta."""
    return [float(j[L + "Leg"][2]) * 1000 for L, _ in LADOS]


MEDIDAS = {
    "cotovelo_tronco": cotovelo_tronco, "braco_frente": braco_frente, "braco_elevacao": braco_elevacao,
    "braco_plano": braco_plano, "braco_abertura": braco_abertura, "antebraco_vertical": antebraco_vertical,
    "pegada_largura": pegada_largura, "ombro_frente": ombro_frente,
    "pes_largura": pes_largura, "ponta_pe": ponta_pe, "ponta_pe_diferenca": ponta_pe_diferenca,
    "pes_alinhados": pes_alinhados, "joelho_valgo": joelho_valgo, "joelho_fora_do_pe": joelho_fora_do_pe,
    "coluna": coluna,
    "pes_base_lateral": pes_base_lateral, "joelho_altura": joelho_altura, "ponta_dedos": ponta_dedos,
}
UNIDADE = {"pes_alinhados": "mm", "joelho_valgo": "mm", "joelho_fora_do_pe": "mm", "pes_largura": "×",
           "pegada_largura": "×", "ombro_frente": "mm", "pes_base_lateral": "×", "joelho_altura": "mm"}

# ── remada unilateral (lote 2, 04/10/2026): escápula de UM lado e tronco sem girar. O ombro_frente usa a linha dos
# ombros como eixo de lado a lado, e ela gira junto quando só um ombro vai pra frente (os dois lados mexem igual,
# metade cada); aqui o eixo vem da base das clavículas (cabeça dos ossos Shoulder), presa no tórax.
JUNTAS = JUNTAS + ("LeftShoulder", "RightShoulder")


def eixos_torax(j):
    """Referencial do tórax: cima (quadril → pescoço), lado (base da clavícula esquerda → direita, ⟂ cima) e frente.
    A base da clavícula é presa no tórax: subir, levar pra frente ou pra trás a escápula não mexe nesses eixos."""
    cima = _u(j["Neck"] - j["Hips"])
    lado = j["RightShoulder"] - j["LeftShoulder"]
    lado = _u(lado - cima * (lado @ cima))
    return cima, lado, np.cross(cima, lado)


def escapula_frente(j):
    """Ombro (cabeça do úmero) à frente (+, protração) ou atrás (−, retração) da base do pescoço, no eixo frente do
    TÓRAX, mm [E, D]: como o ombro_frente, mas um ombro mexendo sozinho não muda o número do outro (remada
    unilateral: a escápula que rema desce pro chão embaixo e volta pra trás em cima; a do apoio fica parada)."""
    _, _, frente = eixos_torax(j)
    return [float((j[L + "Arm"] - j["Neck"]) @ frente) * 1000 for L, _ in LADOS]


def ombros_nivel(j):
    """Eixo de lado a lado do tórax (base das clavículas, ⟂ ao tronco) × o chão, graus: 0 = nivelado, + = lado
    direito mais alto. Com o tronco curvado perto da horizontal é o giro do tronco em volta do próprio eixo (o "do not
    rotate torso" da remada unilateral); em pé é a inclinação do tórax pro lado."""
    _, lado, _ = eixos_torax(j)
    return [math.degrees(math.asin(max(-1.0, min(1.0, float(lado[2])))))]


def pelve_nivel(j):
    """Linha das articulações do quadril × o chão, graus: 0 = pelve nivelada, + = lado direito mais alto."""
    d = j["RightUpLeg"] - j["LeftUpLeg"]
    return [math.degrees(math.atan2(d[2], math.hypot(d[0], d[1])))]


MEDIDAS.update({"escapula_frente": escapula_frente, "ombros_nivel": ombros_nivel, "pelve_nivel": pelve_nivel})
UNIDADE.update({"escapula_frente": "mm"})


# ── agachamento búlgaro (lote 2, 04/10/2026): o pé de trás fica com o peito do pé em cima do banco, em flexão
# plantar — o tornozelo não pode passar da amplitude normal (Alazzawi S et al., World J Orthop 2017;8(1):21-29,
# tabela 5: flexão plantar 0–50°, dorsiflexão 0–20°). O limites.py não tem o tornozelo.
def tornozelo(j):
    """Ângulo canela × pé (joelho → tornozelo × tornozelo → base dos dedos), graus [E, D]. O boneco em pé com o pé
    chapado mede ~76°; flexão plantar (ponta do pé descendo) diminui o número e dorsiflexão (joelho indo à frente do
    pé) aumenta: flexão plantar de 0 a 50° = ~76° a ~26° no boneco."""
    return [_ang(j[L + "Foot"] - j[L + "Leg"], j[L + "ToeBase"] - j[L + "Foot"]) for L, _ in LADOS]


MEDIDAS.update({"tornozelo": tornozelo})


def medir(j):
    """Todas as medidas de técnica do quadro (o relatório mostra todas, com ou sem regra na ficha)."""
    return {nome: f(j) for nome, f in MEDIDAS.items()}


def valores(medida, vals):
    """"35/37" (graus, mm) ou "1.23" (razão)."""
    return "/".join(("%.2f" if UNIDADE.get(medida) == "×" else "%.0f") % v for v in vals)


def texto(medidas):
    return " ".join("%s %s" % (nome, valores(nome, vals)) for nome, vals in medidas.items())


# Regras padrão pra todo exercício com os dois pés apoiados no chão (checagens.pes_no_chao), sem precisar escrever
# na ficha. Faixas largas de propósito: pegam o erro grosseiro (pé cruzando, virado pra dentro, aberto demais, um à
# frente do outro, joelho entrando, coluna curvada) e a ficha estreita o que for do exercício. Ponta do pé de 0 a 30°
# pra fora, joelho na direção do pé e coluna neutra: Escamilla RF, Med Sci Sports Exerc 2001;33(1):127-141;
# Schoenfeld BJ, J Strength Cond Res 2010;24(12):3497-3506. Mudar uma faixa: checagens.tecnica_padrao =
# {"ponta_pe": [0, 15]}; desligar todas (base diferente de propósito, ex. avanço): checagens.tecnica_padrao = false.
PADRAO_PES_NO_CHAO = (
    ("pes_largura", "pés nem colados nem abertos demais", (0.8, 2.6)),
    ("ponta_pe", "ponta do pé pra frente ou um pouco pra fora", (-5, 30)),
    ("ponta_pe_diferenca", "os dois pés virados igual", (0, 12)),
    ("pes_alinhados", "um pé não fica à frente do outro", (0, 40)),
    ("joelho_valgo", "joelho na direção do pé (sem valgo)", (-20, 100)),
    ("coluna", "coluna neutra", (0, 20)),
)


def regras_padrao(checagens):
    troca = checagens.get("tecnica_padrao", {})
    if not checagens.get("pes_no_chao", True) or troca is False:
        return []
    return [{"nome": nome + " (padrão)", "medida": medida, "t": "todos", "faixa": list(troca.get(medida, faixa))}
            for medida, nome, faixa in PADRAO_PES_NO_CHAO]


def vale_no_quadro(t_regra, t):
    """A regra vale neste quadro? t_regra: número (só aquele quadro), [t0, t1] (faixa) ou "todos"."""
    if t_regra == "todos":
        return True
    if isinstance(t_regra, (list, tuple)):
        return t_regra[0] - 1e-6 <= t <= t_regra[1] + 1e-6
    return abs(t_regra - t) <= 1e-6


def faixa(regra):
    return regra.get("faixa") or regra.get("graus") or regra.get("mm")


def fora_da_faixa(regra, vals):
    lo, hi = faixa(regra)
    return any(not lo <= v <= hi for v in vals)


def do_lado(regra, vals):
    """Regra de UM membro só: regra["lado"] = "E" (esquerdo) ou "D" (direito) fica só com o valor daquele lado; sem
    "lado" vale pros dois, como sempre. No afundo a perna da frente e a de trás têm ângulos diferentes (lote 2)."""
    lado = regra.get("lado")
    if lado is None or len(vals) != 2:
        return vals
    if lado not in ("E", "D"):
        raise ValueError("lado da regra %r: use \"E\" ou \"D\"" % lado)
    return [vals[0 if lado == "E" else 1]]


# ── abdominal bicicleta (lote 2, 05/10/2026): mãos atrás da cabeça com os cotovelos abertos pro lado (Livestrong,
# reproduzido pelo ACE: "hands behind your head (elbows out wide)"). O braco_abertura é medido no referencial quadril →
# pescoço, que muda quando o tronco enrola e gira; a distância entre os cotovelos não depende disso.
def cotovelos_largura(j):
    """Distância entre os cotovelos (cabeça do antebraço) ÷ distância entre os ombros (cabeça do úmero): ~1 = cotovelos
    na largura dos ombros (braços pendurados ou fechados pra frente), ~1,7 = abertos pro lado com as mãos na cabeça."""
    return [float(np.linalg.norm(j["LeftForeArm"] - j["RightForeArm"])
                  / max(np.linalg.norm(j["LeftArm"] - j["RightArm"]), 1e-9))]


MEDIDAS.update({"cotovelos_largura": cotovelos_largura})
UNIDADE.update({"cotovelos_largura": "×"})


# ── desenvolvimento Arnold (lote 3, 05/10/2026): a palma começa virada pro corpo (pegada supinada, como no topo da
# rosca — ExRx Dumbbell Arnold Press: "palms facing body") e termina virada pra frente em cima, girando pelo meio
# (palmas uma pra outra), nunca pra fora. A palma sai do punho (cabeça de Hand) e da base do indicador e do mínimo
# (cabeça de HandIndex1 e HandPinky1), igual ao pegada3d._base que a cena usa pra virar a mão.
JUNTAS = JUNTAS + ("LeftHandIndex1", "RightHandIndex1", "LeftHandPinky1", "RightHandPinky1")


def _palma(j, L):
    """Normal da palma da mão `L` (pra fora da mão pelo lado da palma), no mundo."""
    s = 1.0 if L == "Left" else -1.0
    m = j[L + "Hand"]
    return _u(-s * np.cross(j[L + "HandIndex1"] - m, j[L + "HandPinky1"] - m))


def palma_frente(j):
    """Palma × frente do tronco, graus [E, D]: 0 = palma virada pra frente (pegada pronada em cima do desenvolvimento),
    90 = palma de lado (neutra, ou virada pra cima/baixo), 180 = palma virada pro corpo (supinada: topo da rosca e
    começo do desenvolvimento Arnold)."""
    _, _, frente = eixos_tronco(j)
    return [_ang(_palma(j, L), frente) for L, _ in LADOS]


def palma_dentro(j):
    """Palma virada pro meio do corpo (+) ou pra fora (−), graus [E, D]: asin(palma · direção pro meio), no referencial
    do tronco — 0 = palma pra frente, pra trás, pra cima ou pra baixo; +90 = palmas uma pra outra (pegada neutra);
    −90 = palma virada pra fora. No Arnold a palma passa pelo + (meio) entre o corpo e a frente."""
    _, lado, _ = eixos_tronco(j)
    return [math.degrees(math.asin(max(-1.0, min(1.0, float(_palma(j, L) @ (-s * lado)))))) for L, s in LADOS]


MEDIDAS.update({"palma_frente": palma_frente, "palma_dentro": palma_dentro})


# ── hiperextensão lombar (lote 3, 05/10/2026): o tronco desce dobrando no quadril até ficar perpendicular às pernas e
# sobe até ficar alinhado com elas, sem passar da linha (Schoenfeld, Kolber, Contreras e Hanney, Strength Cond J 2017:
# evitar a hiperextensão da coluna no fim da subida). O "quadril" do checagem3d.medir_juntas não tem sinal: o tronco 10°
# atrás da linha das pernas dá o mesmo número que 10° à frente.
def quadril_sinal(j):
    """Flexão do quadril COM SINAL, graus [E, D]: coxa (quadril → joelho) × prolongamento do tronco pra baixo (pescoço →
    quadril), no plano sagital do tronco: 0 = coxa alinhada com o tronco (corpo reto), + = coxa à frente da linha do
    tronco (flexão: tronco dobrado pra frente, pra coxa; 90 = tronco perpendicular à coxa), − = coxa atrás da linha do
    tronco (o tronco passou da linha das pernas pra trás). No referencial do tronco: vale em pé, curvado ou inclinado."""
    cima, lado, frente = eixos_tronco(j)
    out = []
    for L, _ in LADOS:
        c = j[L + "Leg"] - j[L + "UpLeg"]
        c = c - lado * (c @ lado)
        out.append(math.degrees(math.atan2(c @ frente, c @ -cima)))
    return out


MEDIDAS.update({"quadril_sinal": quadril_sinal})


# ── abdominais refeitos (lote 3, 05/10/2026): no supra e no bicicleta só a parte de cima das costas enrola, até as
# escápulas saírem do chão, e a lombar fica no colchonete (ACE Crunch: "Continue curling up until your upper back is
# lifted off the mat"; ExRx, do ACSM: "elevation of the trunk to 30° is the important criteria"). O "tronco" do
# checagem3d (quadril → pescoço × vertical) não pegava o tronco subindo demais: com a lombar parada no chão ele mede
# só metade do que o tórax sobe — no supra do lote 2 marcava 30° do chão com o tórax a 50°.
def torax_chao(j):
    """Tórax (cabeça do Spine1 → base do pescoço: da transição toracolombar, ~T11–T12 no boneco, até ~C7) × o chão,
    graus: 0 = deitado de costas com as costas no chão, + = a parte de cima subindo (90 = em pé). É quanto as costas
    saem do colchonete nos abdominais, com a lombar parada no chão."""
    d = j["Neck"] - j["Spine1"]
    return [math.degrees(math.atan2(float(d[2]), math.hypot(float(d[0]), float(d[1]))))]


MEDIDAS.update({"torax_chao": torax_chao})


# ── crucifixo invertido com halteres (lote 3, 06/10/2026): com o tronco quase horizontal a cabeça fica na linha da
# coluna, olhando pro chão (NSCA PTQ 9.4, posição de quadril dobrado: "neutral spine position (not rounded over) with
# their chin tucked in looking straight at the floor"). O "pescoco" do checagem3d.medir_juntas não tem sinal: a cabeça
# caída pro chão e a cabeça levantada olhando pra frente dão o mesmo número.
JUNTAS = JUNTAS + ("Head",)


def cabeca_tronco(j):
    """Cabeça (base do pescoço → base da cabeça) × eixo do tronco (quadril → pescoço), no plano sagital do tronco, graus:
    0 = cabeça na linha do tronco, + = levantada pra trás (extensão: olhando pra frente com o tronco inclinado), − = caída
    pra frente (flexão, queixo pro peito). No referencial do tronco: vale em pé, curvado ou deitado (o boneco em pé, no
    repouso, mede ~−11°). Sem a cabeça nas juntas (dicionários montados à mão nos testes antigos), devolve []."""
    if "Head" not in j:
        return []
    cima, lado, frente = eixos_tronco(j)
    c = j["Head"] - j["Neck"]
    c = c - lado * (c @ lado)
    return [math.degrees(math.atan2(-float(c @ frente), float(c @ cima)))]


MEDIDAS.update({"cabeca_tronco": cabeca_tronco})


# ── rosca punho com halter (lote 4, 06/10/2026): sentado, com o antebraço deitado na coxa e o punho logo depois do
# joelho, só o punho mexe — estende (o halter desce) e flexiona (sobe) com a pegada supinada (ExRx, Dumbbell Wrist Curl:
# "Sit and grasp dumbbell with underhand grip. Rest forearm on thigh with wrist just beyond knee."). O "punho" do
# checagem3d.medir_juntas não tem sinal: a mão 50° pra cima e 50° pra baixo dão o mesmo número.
def punho_flexao(j):
    """Flexão (+) / extensão (−) do punho COM SINAL, graus [E, D]: 3º metacarpo (punho → base do dedo médio) × antebraço
    (cotovelo → punho), em volta do eixo de flexão da mão (dedo médio × normal da palma): 0 = mão alinhada com o
    antebraço, + = a mão dobra pro lado da palma (flexão), − = pro lado do dorso (extensão). O desvio radial/ulnar não
    conta. Só usa a mão e o antebraço: vale com o boneco em pé, sentado ou virado."""
    out = []
    for L, _ in LADOS:
        a = _u(j[L + "Hand"] - j[L + "ForeArm"])
        d = _u(j[L + "HandMiddle1"] - j[L + "Hand"])
        k = _u(np.cross(d, _palma(j, L)))
        a = a - k * (a @ k)
        out.append(math.degrees(math.atan2(float(np.cross(a, d) @ k), float(a @ d))))
    return out


def palma_cima(j):
    """Palma × a vertical do mundo, graus [E, D]: 0 = palma virada pra cima, 90 = de lado (ou pra frente/trás), 180 =
    virada pro chão. Com o antebraço deitado e a pegada supinada a palma fica pra cima e o punho, dobrando ou estendendo,
    só a inclina pra trás ou pra frente; passar de 90 = palma pro chão (pegada pronada)."""
    return [_ang(_palma(j, L), CIMA) for L, _ in LADOS]


def punho_alem_joelho(j):
    """Punho (cabeça da mão) à frente do centro do joelho ao longo da coxa (quadril → joelho), mm [E, D]: + = o punho
    passou do joelho. Com o antebraço deitado na coxa é o "wrist just beyond knee" da rosca punho."""
    return [float((j[L + "Hand"] - j[L + "Leg"]) @ _u(j[L + "Leg"] - j[L + "UpLeg"])) * 1000 for L, _ in LADOS]


MEDIDAS.update({"punho_flexao": punho_flexao, "palma_cima": palma_cima, "punho_alem_joelho": punho_alem_joelho})
UNIDADE.update({"punho_alem_joelho": "mm"})


# ── flexão nórdica (lote 4, 06/10/2026): ajoelhado, com os tornozelos presos, o corpo desce RETO dos joelhos à cabeça girando
# no joelho — sem dobrar o quadril nem arquear (NSCA, Exercise Technique Manual for Resistance Training, 4ª ed., Nordic Hamstring
# Curl: "Create a straight line between the ear, hip, and knee"). O quadril_sinal compara a coxa com a linha quadril → pescoço;
# aqui é a linha inteira joelho → quadril → base da cabeça (perto da orelha; o "Head" já está nas JUNTAS desde o lote 3).
def linha_joelho_quadril_cabeca(j):
    """Desvio da linha reta joelho → quadril → cabeça, no quadril, graus (com sinal), no plano sagital do tronco: a coxa
    (centro dos joelhos → centro das articulações do quadril) × a linha quadril → base da cabeça (cabeça do osso Head, na
    altura da orelha). 0 = joelho, quadril e orelha em linha reta (o "straight line between the ear, hip, and knee" da NSCA),
    + = dobrou na cintura (a cabeça vai à frente da linha da coxa: quadril flexionado, bumbum pra trás), − = arqueou (a
    cabeça vai pra trás da linha: quadril passou da linha, barriga pra frente). No referencial do tronco: vale em pé,
    ajoelhado ou com o corpo inclinado; o boneco em pé, no repouso, mede ~7° (o joelho fica 3,5 cm à frente do quadril e a
    cabeça um pouco à frente do tronco). Sem a cabeça nas juntas (dicionários antigos dos testes), devolve []."""
    if "Head" not in j:
        return []
    cima, lado, frente = eixos_tronco(j)
    joelho = (j["LeftLeg"] + j["RightLeg"]) / 2
    quadril = (j["LeftUpLeg"] + j["RightUpLeg"]) / 2
    angs = []
    for v in (quadril - joelho, j["Head"] - quadril):          # inclinação de cada segmento pra frente, no plano sagital
        v = v - lado * (v @ lado)
        angs.append(math.degrees(math.atan2(float(v @ frente), float(v @ cima))))
    return [angs[1] - angs[0]]


MEDIDAS.update({"linha_joelho_quadril_cabeca": linha_joelho_quadril_cabeca})


# ── flexão de braço (lote 7, 08/10/2026): de bruços, apoiado nas mãos e na ponta dos pés, o corpo fica reto da cabeça ao calcanhar,
# sem o quadril cair nem subir (ACE, Push-up: "Do not allow your low back to sag or your hips to hike upwards"), com as mãos
# espalmadas no chão e os dedos pra frente ou um pouco pra dentro (ACE: "with your fingers facing forward or turned slightly
# inward"). O linha_joelho_quadril_cabeca mede o ângulo no quadril; aqui é a distância do quadril até a reta do corpo.
def quadril_linha_ombro_tornozelo(j):
    """Centro das articulações do quadril acima (+, pro lado das costas) ou abaixo (−, pro lado da barriga) da reta ombro → tornozelo
    (do meio das cabeças do úmero ao meio dos tornozelos), no eixo frente do tronco, mm: 0 = quadril na linha do corpo; de bruços
    (flexão de braço), + = o quadril subiu e − = o quadril caiu (lombar afundando). No referencial do tronco: vale em pé, deitado ou
    inclinado; o boneco em pé, no repouso, mede ~+21 (o quadril fica 2 cm atrás da reta, com o joelho dobrado 7°)."""
    _, _, frente = eixos_tronco(j)
    ombro = (j["LeftArm"] + j["RightArm"]) / 2
    pe = (j["LeftFoot"] + j["RightFoot"]) / 2
    quadril = (j["LeftUpLeg"] + j["RightUpLeg"]) / 2
    u = _u(ombro - pe)
    d = (quadril - pe) - u * float((quadril - pe) @ u)
    return [-float(d @ frente) * 1000]


def dedos_mao_dentro(j):
    """Dedos da mão (punho → base do dedo médio, vistos de cima, no plano do chão) virados pra dentro (+, pro meio do corpo) ou pra
    fora (−) em relação à direção da cabeça (quadril → pescoço, no chão), graus [E, D]: 0 = dedos apontando pra frente, na direção
    da cabeça. É a mão espalmada no chão da flexão de braço; com o tronco em pé (na vertical) a medida perde o sentido."""
    frente_chao = _u(_chao(j["Neck"] - j["Hips"]))
    lado = _chao(j["RightArm"] - j["LeftArm"])
    lado = _u(lado - frente_chao * (lado @ frente_chao))
    out = []
    for L, s in LADOS:
        d = _chao(j[L + "HandMiddle1"] - j[L + "Hand"])
        out.append(math.degrees(math.atan2(float(d @ (-s * lado)), float(d @ frente_chao))))
    return out


MEDIDAS.update({"quadril_linha_ombro_tornozelo": quadril_linha_ombro_tornozelo, "dedos_mao_dentro": dedos_mao_dentro})
UNIDADE.update({"quadril_linha_ombro_tornozelo": "mm"})


# ── cadeira abdutora (lote 4, 06/10/2026): sentado, com o quadril dobrado ~90° e a coxa deitada, abrir as pernas é a coxa girando
# em volta da vertical que passa pela articulação do quadril (ExRx, Lever Seated Hip Abduction: "Move legs apart as far as
# possible"). O "quadril" do checagem3d.medir_juntas (coxa × tronco) quase não muda nesse giro e o pes_base_lateral mede os pés,
# não a coxa: aqui é a abertura da coxa, vista de cima.
def coxa_abertura(j):
    """Coxa (articulação do quadril → centro do joelho) aberta pra fora (+) ou fechada pra dentro (−) da frente da pelve, vista
    de cima (no plano do chão), graus [E, D]: 0 = coxa apontando pra frente (as duas paralelas), 45 = aberta 45° pro lado. É a
    abdução (+) / adução (−) do quadril na cadeira abdutora e na adutora. Só faz sentido com a coxa perto da horizontal
    (quadril dobrado, sentado): em pé a coxa aponta pro chão e a medida perde o sentido (como o braco_plano com o braço
    pendurado)."""
    lado, frente = eixos_pelve(j)
    out = []
    for L, s in LADOS:
        c = _chao(j[L + "Leg"] - j[L + "UpLeg"])
        out.append(math.degrees(math.atan2(float(c @ (s * lado)), float(c @ frente))))
    return out


MEDIDAS.update({"coxa_abertura": coxa_abertura})


# ── agachamento sumô com halteres (lote 7, 08/10/2026): pés bem afastados e virados ~45° pra fora, com o joelho em cima do pé e sem
# passar da frente dele (ACE, Dumbbell Sumo Squat: "the toes pointed out to the sides about 45 degrees"; "keep the knees in line with
# the ankles while in the squat position and do not let the knee cross in front of the foot"; ExRx, Dumbbell Squat: "Knees should
# point same direction as feet throughout movement"). Com a base larga e a perna dobrada, o joelho_valgo (joelho × reta quadril →
# tornozelo) dá +24 cm sem nada errado, e o joelho_fora_do_pe mede de lado a lado da PELVE — com o pé virado, isso mistura o joelho
# ir pra frente (na direção do pé) com ir pro lado. Aqui as 2 medidas ficam no referencial do PRÓPRIO pé, visto de cima.
def _pe_frente_fora(j, L, s):
    """Direção do pé `L` (tornozelo → base dos dedos, no chão) e a normal dela no chão apontando pra fora do corpo."""
    lado, _ = eixos_pelve(j)
    p = _u(_chao(j[L + "ToeBase"] - j[L + "Foot"]))
    n = np.cross(CIMA, p)
    return p, (n if float(n @ (s * lado)) >= 0 else -n)


def joelho_plano_pe(j):
    """Centro do joelho pra fora (+) ou pra dentro (−, valgo) do plano vertical do pé — o que passa pelo tornozelo na direção
    tornozelo → base dos dedos —, mm [E, D]: 0 = joelho bem em cima da linha do pé, com o pé virado pra fora ou não."""
    return [float((j[L + "Leg"] - j[L + "Foot"]) @ _pe_frente_fora(j, L, s)[1]) * 1000 for L, s in LADOS]


def joelho_alem_dos_dedos(j):
    """Centro do joelho à frente (+) ou atrás (−) da ponta dos dedos (ponta do osso ToeBase), ao longo da direção do pé vista de
    cima, mm [E, D]: + = o joelho passou da frente do pé. Sem a ponta dos dedos nas juntas (dicionários antigos dos testes),
    devolve []."""
    if "LeftToeBase_ponta" not in j or "RightToeBase_ponta" not in j:
        return []
    return [float((j[L + "Leg"] - j[L + "ToeBase_ponta"]) @ _pe_frente_fora(j, L, s)[0]) * 1000 for L, s in LADOS]


MEDIDAS.update({"joelho_plano_pe": joelho_plano_pe, "joelho_alem_dos_dedos": joelho_alem_dos_dedos})
UNIDADE.update({"joelho_plano_pe": "mm", "joelho_alem_dos_dedos": "mm"})


# ── agachamento frontal com barra (lote 8, 09/10/2026): no rack da pegada de clean o punho dobra muito pra trás, e o
# punho_flexao (a dobra no plano da mão) não vê o punho dobrando de LADO — na 1ª montagem o antebraço chegava no punho quase
# paralelo à barra, com a mão atravessando a barra: o punho ficava ~86° desviado pro lado do polegar enquanto o punho_flexao
# marcava de −53° a 0°. A amplitude normal é desvio radial 20° e ulnar 30° (limites.py: Norkin & White, valores da AAOS).
def punho_desvio(j):
    """Desvio do punho COM SINAL, graus [E, D]: antebraço (cotovelo → punho) × 3º metacarpo (punho → base do dedo médio),
    no plano da palma: 0 = mão na linha do antebraço, + = a mão dobra pro lado do polegar (desvio radial), − = pro lado do
    dedo mínimo (ulnar). A flexão/extensão não conta (é o punho_flexao). Só usa a mão e o antebraço."""
    out = []
    for L, _ in LADOS:
        a = _u(j[L + "Hand"] - j[L + "ForeArm"])
        d = _u(j[L + "HandMiddle1"] - j[L + "Hand"])
        p = _palma(j, L)
        r = j[L + "HandIndex1"] - j[L + "HandPinky1"]              # pro lado do polegar
        r = _u(r - d * (r @ d))
        aq = a - p * (a @ p)
        out.append(math.degrees(math.atan2(float(-(aq @ r)), float(aq @ d))))
    return out


MEDIDAS.update({"punho_desvio": punho_desvio})
