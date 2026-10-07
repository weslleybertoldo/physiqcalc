# Agachamento no Smith — cena da fábrica 3D (lote 4, 06/10/2026). Máquina NOVA: equip3d.smith (a barra corre presa em 2 trilhos
# verticais). O corpo e a pegada vêm do Agachamento Livre com Barra (aprovado pelo Weslley em 04/10/2026): barra apoiada no
# trapézio, mãos fechadas na barra por fora dos ombros, pés na largura dos ombros, joelhos na direção dos pés, pés chapados.
# t = 0 em pé (pernas esticadas) · t = 1 embaixo (coxa ~paralela ao chão).
# O que muda no Smith (as frases das fontes estão na ficha): a barra só anda na VERTICAL, então a linha dela fica parada e os pés
# ficam um pouco À FRENTE dela (Gutierrez e Bahamonde, ISBS 2009: "Due to the linear restriction of the bar motion along the
# vertical axis in the SMS the subjects positioned their feet forward to enable bar lowering"); com os pés à frente o tronco
# inclina MENOS que no agachamento livre e a canela fica mais em pé ("there was less trunk flexion and less ankle dorsiflexion"),
# sem o tronco ficar reto demais com o joelho indo lá pra frente (ExRx, análise do Smith Squat: "Back too upright forcing knees
# forward"); desce até a coxa ~paralela (ExRx, Smith Squat: "Descend until thighs are just past parallel to floor").
# Como o rig faz: em pé é a pose do agachamento livre (corpo reto, a barra no trapézio) e a linha da barra fica onde ela cai assim:
# logo atrás do calcanhar — o pé todo fica à frente dela. A cada quadro o tronco inclina (girando o quadril), o quadril desce e vai
# pra trás EXATAMENTE o tanto que deixa a barra (no trapézio) na mesma linha vertical; as pernas seguem por IK com os tornozelos
# parados e os pés chapados. A barra do Smith anda junto, só na vertical (sm.mover), e as mãos fecham nela como no livre (a barra
# do Smith não gira: a mão, que segue o tronco, rola em volta dela). Embaixo: tronco a TRONCO_BAIXO graus da vertical e a coxa
# paralela ao chão (a profundidade sai de uma busca: o quanto o quadril desce até a coxa ficar na horizontal).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import polegar3d as P3
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
RAIO = 0.015              # barra de 30 mm na pegada (Titan Smith Machine: "Barbell Shaft Diameter: 30mm")
GRIP_X = 0.43             # meia pegada, do meio da barra ao meio da mão (a do agachamento livre aprovado)
BARRA_OFF = Vector((0, 0.075, -0.039))    # eixo da barra em relação à base do pescoço, no referencial do tronco: apoiada no
                                          # trapézio (a do agachamento livre aprovado; zona da ficha −4 a 5 mm)
TRONCO_BAIXO = 30.0       # tronco à frente embaixo (graus da vertical): menos que os 40° do agachamento livre aprovado
                          # (Gutierrez e Bahamonde 2009: "less trunk flexion") e longe do "back too upright" (ExRx)
COXA_BAIXO = 0.0          # coxa embaixo: graus da horizontal (+ = joelho abaixo do quadril) — paralela ao chão (ExRx: "just
                          # past parallel"; NSCA: "mid-thigh is parallel to the floor")
PESCOCO = 0.75            # o pescoço volta 75% da inclinação do tronco: a cabeça olha pra frente (ExRx: "Keep head facing
                          # forward"), como no agachamento livre aprovado
ALINHA = 0.15             # quanto os dedos seguem o antebraço (maos3d.Maos.segurar, alinhar): 0 = a mão do agachamento livre
PALMA_INCL = 0.12         # palma de frente pra barra, inclinada um pouco pra cima (a do agachamento livre aprovado: 0,12)
POLO_JOELHO_X = 0.40      # polo do joelho (IK) 0,40 m pro lado, 1,2 m à frente: o joelho vai na direção da ponta do pé (ExRx: "Knees
                          # should point same direction as feet throughout movement"); com o 0,32 do livre ele ficava 19 mm pra dentro
                          # da base dos dedos embaixo
POLEGAR_VOLTA = (-10.0, 28.0, 1.0, 28.0, -8.3, 35.0)
                          # polegar NOVO dando a volta na barra, FIXO nas 2 mãos e em todos os quadros: postura anatômica (CMC
                          # flexão, abdução, rotação, MCP flexão, abdução, IP flexão, graus — polegar3d.CAMPOS) que a busca do
                          # pg.polegar_em_volta achou do zero na mão esquerda em pé (sonda de 07/10/2026: viável — pele da base
                          # esticando 2,50× e 0 triângulo do avesso, nada na barra, 1,3 mm nos dedos —, polpa a 11 mm das
                          # falanges médias, envolve 355°). Por que fixa: ver o montar(), no fim


def _tipo_polegar(dedos):
    th = (dedos or {}).get("Thumb")
    return th[0] if isinstance(th, tuple) and th and isinstance(th[0], str) else "de hoje"


def _polegar_nos_angulos(bon, lado, q):
    """Polegar da mão `lado` na postura anatômica q = (cmc_flex, cmc_abd, cmc_rot, mcp_flex, mcp_abd, ip_flex), em graus — a
    mesma conta do pg.polegar_em_volta quando ele acha a postura (polegar3d.eixos_do_polegar + rotacoes, osso por osso)."""
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    cab = [np.array(p3.cabeca(rig, o)) for o in ossos]
    eixos = P3.eixos_do_polegar(np.array(pg._base(rig, lado)[0]), cab, np.array(p3.ponta(rig, ossos[2])))
    for o, R in zip(ossos, P3.rotacoes(eixos, q)):
        if not np.allclose(R, np.eye(3)):
            p3.girar_osso(rig, o, Matrix(R.tolist()))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)     # mão de referência da barra de 30 mm (Shimawaki 2019, interpolada) — antes do Maos
    rig = bon.rig
    PB = rig.pose.bones

    # ── pernas: tornozelos parados (IK), pés chapados, joelhos pra frente e um pouco pra fora (como no livre) ────────────────
    pernas = {}
    for lado, s in LADOS:
        alvo = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polo = p3.vazio("polo_joelho_" + lado, (s * POLO_JOELHO_X, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    p3.atualizar()

    def tronco(inclina, desce, recua):
        """Tronco inclinado `inclina` graus à frente (giro do quadril), quadril `desce` m pra baixo e `recua` m pra trás, a
        cabeça olhando pra frente; devolve o eixo da barra apoiada no trapézio (mundo)."""
        for n in ("Hips", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina), mover=Vector((0, recua, desce)))
        c = p3.cabeca(rig, "Neck") + p3.rot_x(inclina) @ BARRA_OFF
        p3.girar_osso(rig, "Neck", p3.rot_x(-inclina * PESCOCO))
        return c

    c_pe = tronco(0.0, 0.0, 0.0)
    Y_BARRA = c_pe.y                  # a linha da barra: onde ela cai com o corpo reto em pé (trapézio)

    def corpo(inclina, desce):
        """Tronco e quadril com a barra na linha vertical: o quadril vai pra trás o tanto que deixa o eixo da barra em Y_BARRA
        (o quadril é a raiz do tronco: andar `recua` leva a barra junto, o mesmo tanto)."""
        c = tronco(inclina, desce, 0.0)
        recua = Y_BARRA - c.y
        return tronco(inclina, desce, recua), recua

    def coxa():
        return sum(ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["UpLeg", "Leg"]})) / 2

    # ── profundidade: o quanto o quadril desce (com o tronco a TRONCO_BAIXO e a barra na linha) até a coxa ficar paralela ─────
    corpo(TRONCO_BAIXO, -0.45)
    for lado, _ in LADOS:              # polo do joelho certo na pose de baixo
        p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
    lo, hi = -0.65, -0.25              # desce mais (mais negativo) = coxa mais pra cima (joelho acima do quadril)
    for _ in range(18):
        meio = (lo + hi) / 2
        corpo(TRONCO_BAIXO, meio)
        if coxa() > COXA_BAIXO:        # joelho ainda abaixo do quadril: desce mais
            hi = meio
        else:
            lo = meio
    DESCE = (lo + hi) / 2

    # ── o caminho: joelho e quadril dobram JUNTOS, cada um a mesma fração t do caminho de em pé até embaixo (ExRx: "Squat down
    # by bending hips back while allowing knees to bend forward"; NSCA: "Simultaneously flex knees while pushing hips back").
    # Interpolar o tronco e a descida do quadril em linha reta mandava o joelho 19 cm à frente no meio e o trazia de volta no
    # fim (a canela ia a 26° e voltava a 19°); assim a canela e o tronco só aumentam. Em cada quadro: Newton em (inclinação do
    # tronco, descida do quadril) até a flexão do joelho e a do quadril (medidas da checagem) baterem com as do quadro, com a
    # barra sempre na linha (corpo()).
    def juntas():
        jj = ck.medir_juntas(rig)
        return (jj["joelhoE"] + jj["joelhoD"]) / 2, (jj["quadrilE"] + jj["quadrilD"]) / 2

    J = {}

    def medir_pontas():
        """Flexão do joelho e do quadril em pé (J[0]) e embaixo (J[1]): as pontas do caminho."""
        corpo(0.0, 0.0)
        J[0] = juntas()
        c, r = corpo(TRONCO_BAIXO, DESCE)
        J[1] = juntas()
        return c, r

    c_baixo, recua_baixo = medir_pontas()
    z_pe, z_baixo = c_pe.z, c_baixo.z

    def caminho(t):
        """(inclinação do tronco, descida do quadril) do quadro t: joelho e quadril com a fração t da flexão de baixo."""
        caminho.erro = 0.0
        if t <= 0.0:
            return 0.0, 0.0
        if t >= 1.0:
            return TRONCO_BAIXO, DESCE
        alvo = (p3.lerp(J[0][0], J[1][0], t), p3.lerp(J[0][1], J[1][1], t))
        x = [TRONCO_BAIXO * t, DESCE * t]
        for _ in range(12):
            corpo(*x)
            f = juntas()
            e = (f[0] - alvo[0], f[1] - alvo[1])
            if max(abs(e[0]), abs(e[1])) < 0.02:
                break
            corpo(x[0] + 0.5, x[1])
            fa = juntas()
            corpo(x[0], x[1] - 0.004)
            fb = juntas()
            a, b = (fa[0] - f[0]) / 0.5, (fb[0] - f[0]) / -0.004
            c_, d = (fa[1] - f[1]) / 0.5, (fb[1] - f[1]) / -0.004
            det = a * d - b * c_
            x = [x[0] + (-d * e[0] + b * e[1]) / det, x[1] + (c_ * e[0] - a * e[1]) / det]
        caminho.erro = max(abs(e[0]), abs(e[1]))
        return x[0], x[1]

    caminho.erro = 0.0

    # ── o Smith em volta do corpo: trilhos na linha da barra, curso de em pé até embaixo ─────────────────────────────────────
    sm = e3.smith("smith", y=Y_BARRA, z=z_pe, curso=(z_baixo - 0.002, z_pe + 0.002))
    eixo_barra = Vector((1, 0, 0))

    def pose(t):
        """t=0 em pé, t=1 embaixo (coxa paralela)."""
        inclina, desce = caminho(t)
        c, recua = corpo(inclina, desce)
        c = Vector((0.0, Y_BARRA, c.z))
        sm.mover(c.z)                  # a barra do Smith anda junto, só na vertical
        R = p3.rot_x(inclina)
        # mãos na barra (como no livre): atrás da barra, dedos pra cima, palma pra frente, linha dos nós ao longo da barra
        dedos_q = R @ Vector((0, PALMA_INCL, 1)).normalized()
        palma_q = R @ Vector((0, -1, PALMA_INCL))
        for lado, s in LADOS:
            polo = p3.cabeca(rig, lado + "Arm") + R @ Vector((s * 0.30, 0.35, -0.40))
            maos.segurar(lado, c + eixo_barra * (s * GRIP_X), dedos_q, palma_q, polo=polo, alinhar=ALINHA)
        for lado, _ in LADOS:          # os 4 dedos fecham até a pele encostar na barra (o polegar do fechar_em_volta é trocado
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, c, eixo_barra, RAIO, polegar_modo="busca")   # pelo novo, fixo)
            _polegar_nos_angulos(bon, lado, POLEGAR_VOLTA)
            pose.dedos[lado]["Thumb"] = ("volta fixo",) + POLEGAR_VOLTA
        pose.recua = recua

    pose.dedos = {}
    pose.recua = 0.0

    pose(1.0)                          # polos certos (joelho e cotovelo na pose de baixo)
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    # ── polegar novo FIXO (POLEGAR_VOLTA), a mesma postura nas 2 mãos e em todos os quadros. A mão e a barra andam juntas com o
    # tronco (a barra fica sempre no mesmo lugar do trapézio), então a pegada é a mesma em todo quadro — mas a busca do
    # pg.polegar_em_volta fica na beirada do viável nessa pegada (mão atrás da barra, punho estendido ~40°; o braço resolvido
    # por IK muda um pouco a cada quadro e a pele da base do polegar acompanha): refeita quadro a quadro (1ª checagem de 25
    # quadros, 06/10) ela achou o polegar novo até o quadro 8 e caiu no polegar de hoje do 9 em diante — o polegar trocava no
    # meio do movimento —; feita uma vez em pé, ora achava (cada vez numa postura), ora não (2ª checagem: as 2 mãos com o
    # polegar de hoje); na mão DIREITA não acha nunca (a pele da base já sai com 8 triângulos do avesso com o polegar de hoje,
    # e a busca exige zero). A postura que a busca achou na mão esquerda vai pronta nas 2 (polegar3d: "a mão direita sai
    # espelhada da esquerda sem trocar sinal nenhum"); medida em t = 0, 0,5 e 1 (sonda de 07/10): esquerda envolve 355°, pele
    # da base 2,29–2,34× com 1–3 triângulos do avesso, 1,3 mm nos dedos; direita envolve 357°, 2,63× e 6 triângulos (com o
    # polegar de hoje: 327°, 2,54× e 8), 2,8 mm nos dedos.
    print("POLEGAR | novo, fixo nas 2 mãos: postura (CMC flex, abd, rot, MCP flex, abd, IP flex) %s" % (POLEGAR_VOLTA,), flush=True)
    medir_pontas()                     # as pontas do caminho de novo, com o polo do joelho final
    print("CAMINHO | joelho %.1f° → %.1f° | quadril %.1f° → %.1f°" % (J[0][0], J[1][0], J[0][1], J[1][1]), flush=True)

    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    pe_v = co[np.array([n in ("LeftFoot", "LeftToeBase") for n in nomes] + [False])[dono]]
    calcanhar, ponta = float(pe_v[:, 1].max()), float(pe_v[:, 1].min())

    def info():
        j = ck.posicoes(rig)
        jj = ck.medir_juntas(rig)
        canela = []
        for L, _ in LADOS:
            K, A = j[L + "Leg"], j[L + "Foot"]
            canela.append(math.degrees(math.atan2(A[1] - K[1], K[2] - A[2])))
        b = sm.barra.matrix_world.to_translation()
        return ("barra z %.3f (y %.4f, saiu da linha %.1f mm) | tronco %.1f° | coxa %s° | joelho %.0f/%.0f° | quadril %.0f/%.0f° | "
                "canela %.1f/%.1f° | tornozelo %s° | quadril pra trás %.0f mm | joelho à frente do tornozelo %.0f mm | "
                "caminho ±%.2f° | polegar E %s D %s | %s" % (
                    b.z, b.y, math.hypot(b.x, b.y - Y_BARRA) * 1000, ck.angulo_chave(rig, {"medida": "tronco"})[0],
                    "/".join("%.1f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["UpLeg", "Leg"]})),
                    jj["joelhoE"], jj["joelhoD"], jj["quadrilE"], jj["quadrilD"], *canela,
                    "/".join("%.0f" % v for v in tc.tornozelo(j)), pose.recua * 1000,
                    (j["LeftFoot"][1] - j["LeftLeg"][1]) * 1000, caminho.erro, _tipo_polegar(pose.dedos.get("Left")),
                    _tipo_polegar(pose.dedos.get("Right")), maos.info()))

    A = p3.cabeca(rig, "LeftFoot")
    print("SMITH | linha da barra y %.4f | calcanhar %.0f mm, tornozelo %.0f mm, meio do pé %.0f mm e ponta do pé %.0f mm à frente "
          "dela | barra em pé z %.3f, embaixo z %.3f (curso %.0f mm) | quadril desce %.0f mm e vai %.0f mm pra trás" % (
              Y_BARRA, (Y_BARRA - calcanhar) * 1000, (Y_BARRA - A.y) * 1000, (Y_BARRA - (calcanhar + ponta) / 2) * 1000,
              (Y_BARRA - ponta) * 1000, z_pe, z_baixo, (z_pe - z_baixo) * 1000, -DESCE * 1000, recua_baixo * 1000), flush=True)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    bk = ck.Barra(sm.barra, raio=RAIO, meio_compr=sm.meia)
    return Cena(pose, sm.equipamentos, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, Y_BARRA, 0.95),
                camera_video=((4.4, -3.1, 1.35), (0, Y_BARRA + 0.05, 1.0), 45), info=info, apoios=sm.apoios,
                afunda_apoio_mm=5.0)
