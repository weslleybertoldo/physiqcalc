# Deitado de costas no banco reto, pés chapados no chão (supinos do lote 1, 04/10/2026): o corpo todo gira em volta
# das articulações do quadril, desce até o estofado, a cabeça encosta no banco e as pernas vão por IK até os pés.
import math
import numpy as np
from mathutils import Vector, Matrix
import poses3d as p3
import checagem3d as ck

TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder")
LADOS = (("Left", 1), ("Right", -1))


def malha(bon, partes):
    """Vértices (mundo) da pele das partes, com a pose atual."""
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    return co[np.array([n in partes for n in nomes] + [False])[dono]]


def deitar(bon, topo, afunda=0.006, pe_x=0.25, pe_y=-0.40):
    """Deita o boneco de costas com a pele das costas `afunda` m dentro do estofado (topo em `topo` m), a cabeça
    apoiada e os tornozelos em (±pe_x, quadril + pe_y) no chão. Devolve os IKs das pernas."""
    rig = bon.rig
    tornozelo_z = p3.ponta(rig, "LeftLeg").z                 # altura do tornozelo em pé (pé chapado)
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, topo - afunda - malha(bon, TRONCO)[:, 2].min())))
    # cabeça no banco: a nuca ficava 5 cm acima do estofado (curva do pescoço em pé) → estende o pescoço
    pescoco = 0
    while malha(bon, ("Head",))[:, 2].min() > topo - 0.003 and pescoco < 30:
        p3.girar_osso(rig, "Neck", p3.rot_x(-1))
        pescoco += 1
    print("pescoço estendido %d°" % pescoco)
    # pernas: joelho em cima do pé (polo no plano que deixa o joelho na reta quadril → tornozelo vista de cima,
    # 4 cm pra fora: com o polo só "pra cima" o joelho abria 114 mm pra fora dessa reta — a checagem pegou)
    pernas = {}
    for lado, s in LADOS:
        q = p3.cabeca(rig, lado + "UpLeg")
        tz = Vector((s * pe_x, q.y + pe_y, tornozelo_z))
        alvo = p3.vazio("tornozelo_" + lado, tz)
        d = tz - q
        cima = Vector((0, -d.z, d.y)).normalized()
        if cima.z < 0:
            cima.negate()
        polo = p3.vazio("polo_joelho_" + lado, (q + tz) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0)))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
    # com o quadril dobrado o glúteo sobe ~1 cm: desce o corpo até o glúteo encostar (as costas afundam um pouco
    # mais no estofado, onde vai o peso do tronco)
    desce = min(0.0, topo - 0.002 - malha(bon, ("Hips",))[:, 2].min())
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, desce)))
    print("desceu %.1f mm pro glúteo encostar | costas %.1f mm no estofado" % (
        -desce * 1000, (topo - malha(bon, ("Spine1", "Spine2"))[:, 2].min()) * 1000))
    return pernas


def peito(bon, y, meia_largura=0.16, faixa=0.015):
    """Pele do peito mais alta numa faixa de y (linha da barra), entre os ombros."""
    P = malha(bon, TRONCO)
    f = P[(np.abs(P[:, 1] - y) < faixa) & (np.abs(P[:, 0]) < meia_largura)]
    return float(f[:, 2].max())


def polo_cotovelo_baixo(ombro, punho, braco, antebraco):
    """Polo do IK do braço pro cotovelo ficar no ponto mais baixo que o braço deixa (antebraço o mais em pé possível,
    cotovelo embaixo do peso): no círculo onde o cotovelo pode ficar com o ombro e o punho dados."""
    d = punho - ombro
    u = d.normalized()
    a = (braco ** 2 - antebraco ** 2 + d.length ** 2) / (2 * d.length)
    rho = math.sqrt(max(braco ** 2 - a ** 2, 1e-8))
    baixo = (Vector((0, 0, -1)) + u * u.z).normalized()
    return ombro + u * a + baixo * (rho + 0.4)


def cotovelo_embaixo(ombro, punho_z, braco, antebraco, abre, s):
    """Cotovelo com o antebraço na vertical (embaixo do punho) e o braço aberto `abre` graus do tronco, vista de
    cima do peito (0 = colado na lateral apontando pros pés, 90 = em T); s = +1 esquerdo, −1 direito."""
    ez = punho_z - antebraco
    r = math.sqrt(max(braco ** 2 - (ombro.z - ez) ** 2, 1e-6))
    a = math.radians(abre)
    return Vector((ombro.x + s * r * math.sin(a), ombro.y - r * math.cos(a), ez))


def eixos_tronco(rig):
    """cima (quadril → pescoço) e pra fora de cada lado (s = +1 esquerdo, −1 direito), do jeito da tecnica3d."""
    cima = (p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")).normalized()
    lado = p3.cabeca(rig, "RightArm") - p3.cabeca(rig, "LeftArm")
    lado = (lado - cima * lado.dot(cima)).normalized()
    return cima, lado


def barra_acima_do_peito(bon, ponto, distancia, cima=Vector((0, 0, 1)), meia_largura=0.16):
    """Barra ao longo do X que sai de `ponto` e sobe na direção `cima` (⟂ X) até ficar a `distancia` m de toda a pele
    do tronco entre as mãos (distância de verdade no plano YZ: vale com o peito inclinado). Devolve o centro dela."""
    P = malha(bon, TRONCO)
    P = P[np.abs(P[:, 0]) < meia_largura] - np.array(ponto)
    w = np.array(cima.normalized())
    v = np.cross([1.0, 0, 0], w)
    c, o = P @ w, P @ v
    f = np.abs(o) < distancia
    return ponto + cima.normalized() * float((c[f] + np.sqrt(distancia ** 2 - o[f] ** 2)).max())


def inclinar(bon, angulo, assento, afunda=0.006, pe_x=0.25, pe_y=-0.42):
    """Sentado no banco inclinado: tronco a `angulo` graus da horizontal, glúteo no assento (topo em `assento` m),
    cabeça no encosto e pés no chão. O banco é montado em volta do corpo: devolve junta_y, onde o topo do encosto
    (a `afunda` m da pele das costas) cruza o topo do assento."""
    rig = bon.rig
    tornozelo_z = p3.ponta(rig, "LeftLeg").z
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-(90 - angulo)), pivo=pivo)
    pernas = {}
    for lado, s in LADOS:                      # pernas como no deitar: joelho na reta quadril → tornozelo
        q = p3.cabeca(rig, lado + "UpLeg")
        tz = Vector((s * pe_x, q.y + pe_y, tornozelo_z))
        alvo = p3.vazio("tornozelo_" + lado, tz)
        d = tz - q
        cima = Vector((0, -d.z, d.y)).normalized()
        if cima.z < 0:
            cima.negate()
        polo = p3.vazio("polo_joelho_" + lado, (q + tz) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0)))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    for _ in range(3):                         # glúteo no assento (o quadril dobra e o glúteo muda: 3 voltas)
        p3.girar_osso(rig, "Hips", Matrix.Identity(3),
                      mover=Vector((0, 0, assento - 0.002 - malha(bon, ("Hips",))[:, 2].min())))
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
    a = math.radians(angulo)
    n = Vector((0, -math.sin(a), math.cos(a)))                 # normal do encosto (pro corpo)
    costas = malha(bon, ("Spine1", "Spine2"))
    d_enc = float((costas @ np.array(n)).min()) + afunda       # topo do encosto: n·p = d_enc
    pescoco = 0
    while float((malha(bon, ("Head",)) @ np.array(n)).min()) > d_enc + 0.003 and pescoco < 30:
        p3.girar_osso(rig, "Neck", p3.rot_x(-1))
        pescoco += 1
    junta_y = (math.cos(a) * assento - d_enc) / math.sin(a)
    print("inclinado %d° | pescoço estendido %d° | junta do banco y %.3f" % (angulo, pescoco, junta_y))
    return junta_y




def polo_cotovelo_faixa(rig, ombro, punho, braco, antebraco, s, faixa, peso=3.0):
    """Polo do braço com o antebraço o mais em pé possível SEM o cotovelo sair da faixa de abertura do tronco
    (braco_abertura, graus): no círculo onde o cotovelo pode ficar, minimiza inclinação do antebraço + `peso` × o
    quanto a abertura sai da faixa (contínuo: o cotovelo não salta entre quadros). No supino inclinado o ponto mais
    baixo do círculo colava o cotovelo no tronco embaixo (26°) e abria demais no meio (102°)."""
    cima, lado = eixos_tronco(rig)
    fora = -s * lado
    d = punho - ombro
    u = d.normalized()
    a = (braco ** 2 - antebraco ** 2 + d.length ** 2) / (2 * d.length)
    rho = math.sqrt(max(braco ** 2 - a ** 2, 1e-8))
    e1 = (Vector((0, 0, -1)) + u * u.z).normalized()           # pra baixo
    e2 = u.cross(e1)
    if e2.dot(fora) < 0:
        e2.negate()
    # perto do topo (cotovelo pouco dobrado) vale o ponto mais baixo: a faixa puxando o cotovelo ali deitava o
    # antebraço 31° no inclinado; ela pesa inteira só embaixo (cotovelo dobrado 140°). Rampa suave de 65° a 140°,
    # medida no inclinado com 25 quadros (04/10/2026): de 50° a 90° o cotovelo saltava 108 mm entre 2 quadros;
    # de 40° a 130° o antebraço deitava 26° em t=0,25 (regra ≤ 25); de 30° a 130°, 30° e salto de 113 mm;
    # de 65° a 140° o pior quadro fica em 23° e o maior salto em 55 mm (limite 80)
    dobra = 180 - math.degrees(math.acos(max(-1.0, min(1.0, (braco ** 2 + antebraco ** 2 - d.length ** 2)
                                                         / (2 * braco * antebraco)))))
    x = max(0.0, min(1.0, (dobra - 65) / 75))
    peso *= x * x * (3 - 2 * x)
    melhor = None
    for graus in range(-120, 121):
        f = math.radians(graus)
        direcao = e1 * math.cos(f) + e2 * math.sin(f)
        b = u * a + direcao * rho
        ab = (punho - ombro - b)
        incl = math.degrees(ab.angle(Vector((0, 0, 1))))
        abre = math.degrees(math.atan2(b.dot(fora), b.dot(-cima)))
        custo = incl + peso * max(0.0, faixa[0] - abre, abre - faixa[1])
        if melhor is None or custo < melhor[0]:
            melhor = (custo, direcao)
    return ombro + u * a + melhor[1] * (rho + 0.4)
