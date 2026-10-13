# Ponte de Glúteo — cena da fábrica 3D (lote 12, 11/10/2026). Peso corporal, deitado de costas no colchonete (sem peça do lib/: o
# colchonete de 12 mm dos abdominais é uma caixa da própria cena, de apoio).
# t = 0 embaixo: deitado de costas, o glúteo e as costas encostados no colchonete, os joelhos dobrados (~108°) e os pés chapados no
# colchonete na largura do quadril, com as pontas pra frente; os braços ao lado do corpo com as palmas pra baixo e a cabeça apoiada ·
# t = 1 em cima: o quadril subiu até a coxa ficar na linha do tronco (o quadril neutro: ombros, quadril e joelhos numa linha reta, a
# ~24° do chão), com os joelhos a 90° e a canela inclinada (o tornozelo à frente do joelho), apoiado nos ombros e na parte de cima das
# costas (~T3); a cabeça e os braços continuam no colchonete (o app faz a volta: desce devagar até o glúteo encostar de novo).
# Técnica (cópias e frases em lote4/ponte_de_gluteo/fontes.md):
#   free-exercise-db, Butt Lift (Bridge) — o fonte_en do catálogo: "Lie flat on the floor on your back with the hands by your side and
#   your knees bent. Your feet should be placed around shoulder width." / "Pushing mainly with your heels, lift your hips off the floor
#   while keeping your back straight. ... hold at the top for a second." / "Slowly go back to the starting position as you breathe in."
#   ACE, Glute Bridge (nº 49): "Place your feet hip-width apart with the toes facing away from you" / "press your heels into the floor
#   for more stability. Avoid pushing your hips too high as this generally increases the amount of hyperextension (arching) in your low
#   back." ACE nº 66: "Rest on the shoulders and the upper back while keeping the body in a straight line from the knees to the head".
#   ACE nº 318: "Slowly lower the tailbone back to the floor".
#   Colonna et al. 2025 (revisão da ponte no chão): "the feet placed on the ground at hip-width apart"; "while maintaining the upper spine
#   in contact with the ground, the pelvis is lifted from the floor until it reaches the neutral angular position of the hip"; "globally
#   stabilize the spine in the neutral position, so the trunk is considered as a single segment"; o apoio das costas "in the
#   interscapular area, approximately at the T3 level".
#   PÉS: na largura do QUADRIL (ACE nº 49/145/318 e Colonna); o free-exercise-db diz "around shoulder width" (divergência).
#   LOMBAR: neutra e parada, com a curva natural (Colonna; ExRx, hip thrust: "torso rigid"). A ACE pede achatar a lombar no chão
#   ("flatten your low back into the floor"): testado com 8° de retroversão constante, o vão da lombar embaixo só caiu de 14 para 11 mm
#   e a cabeça estendia mais pra encostar (−26° em vez de −18°) — ficou a neutra, a mesma curva do Abdominal Supra e do Completo.
# Como o rig faz: deitado como o abdominal supra; o tronco e a pelve são UM bloco (a coluna parada na forma de em pé) que gira em volta
# de um ponto NO colchonete, na altura de ~T3, e sobe ou desce só na vertical até a pele das costas (embaixo, também o glúteo) encostar:
# a pele que apoia rola sem escorregar e o apoio passa sozinho pras escápulas e pros ombros. As pernas vão por IK até os tornozelos
# PARADOS (o pé fica com a orientação de em pé: chapado); a distância dos pés sai da conta — a que deixa o joelho a 90° com a coxa na
# linha do tronco em cima. A cabeça fica apoiada: em todo quadro o pescoço dobra ou estende até o cabelo da nuca encostar. As mãos
# ficam PARADAS no colchonete, com a palma pra baixo (IK do ombro até o punho parado, o antebraço gira pra palma e o punho põe os dedos
# na linha do antebraço); como a articulação do ombro fica ~12 cm acima das costas, ela anda ~5 cm pra cabeça quando o tronco inclina:
# o cotovelo, dobrado embaixo (~43°), estica em cima (~16°), e a escápula desce um pouco (a clavícula gira 8° em cima).
# DIFERENTE DA ELEVAÇÃO PÉLVICA COM BARRA (lote 1): lá as costas apoiam na borda de um banco de 40 cm, a barra fica na dobra do quadril
# com as mãos nela, os pés na largura dos ombros, o glúteo começa 5 cm acima do chão e em cima o tronco e as coxas ficam PARALELOS ao
# chão com a canela vertical; aqui os ombros ficam no colchonete (Colonna: "the shoulders are typically supported on the floor at the
# same level as the feet"), então em cima a linha ombro → joelho fica INCLINADA (~24°), a canela inclinada, o glúteo começa encostado
# e o quadril estende menos (de ~55° de flexão até o neutro).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from cena import Cena

TOPO = 0.012            # colchonete de 12 mm no chão (o do supra, do completo e da elevação de pernas); os pés ficam em cima dele
AFUNDA = 0.004          # pele das costas dentro do colchonete (igual ao supra)
AFUNDA_GLUTEO = 0.002   # embaixo o glúteo encosta no colchonete
AFUNDA_CABELO = 0.002   # o cabelo da nuca encosta no colchonete (a pele fica embaixo do cabelo)
AFUNDA_PE = 0.001
AFUNDA_MAO = 0.001      # palma e dedos encostando no colchonete
AFUNDA_COTOVELO = 0.002
PE_X = 0.12             # tornozelo a 12 cm do meio: pés na largura do quadril (ACE; Colonna 2025)
JOELHO_CIMA = 90.0      # flexão do joelho em cima (graus)
T3 = 0.6                # o apoio das costas em cima: fração do Spine2 (~T7) até a base do pescoço (~C7) — ~T3 (Colonna 2025)
MAO_FORA = 0.06         # punho por fora do ombro (m): a mão fica do lado do quadril, a |x| ≤ 0,30 m
ESTICA_CIMA = 0.99      # punho a 99% do comprimento do braço EM CIMA (o ombro anda pra cabeça quando o tronco inclina)
DEDOS_FORA = 5.0        # dedos apontando pros pés, um pouco pra fora (graus) — provisório: depois eles vão na linha do antebraço
DEDOS_DESCE = 8.0       # mão um pouco inclinada pra baixo (graus): a base da palma e os dedos encostam
DEPRIME = 12.0          # depressão da escápula em cima (graus, a clavícula gira em volta da frente do tronco)
Q_CIMA = 0.0            # coxa × linha do tronco em cima (tecnica3d.quadril_sinal): 0 = alinhados, o corpo reto
LARGURA = 0.80          # largura do colchonete (m): com os braços ao lado do corpo o cotovelo deste boneco (ombros largos) chega a
                        # |x| 0,36 m embaixo — no de 0,62 m dos abdominais ele ficava pra fora da borda
CONTATO = ("Spine1", "Spine2", "LeftShoulder", "RightShoulder")   # pele das costas que apoia no colchonete
OSSOS_T = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder")


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _mao(lado):
    return (lado + "Hand",) + tuple("%sHand%s%d" % (lado, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3))


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos; aqui a mão não segura nada (não há fechar_em_volta)
    rig = bon.rig
    PB = rig.pose.bones
    tornozelo_z = p3.ponta(rig, "LeftLeg").z
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length

    def linha_ombro_joelho(j):
        """Quanto a linha ombro → quadril → joelho dobra no quadril (graus; 0 = reta), com os centros das articulações."""
        o, q, k = [(j["Left" + n] + j["Right" + n]) / 2 for n in ("Arm", "UpLeg", "Leg")]
        c_ = float(np.dot(o - q, k - q) / (np.linalg.norm(o - q) * np.linalg.norm(k - q)))
        return 180 - math.degrees(math.acos(max(-1.0, min(1.0, c_))))

    j_pe = ck.posicoes(rig)
    print("EM PÉ | coxa %.3f canela %.3f braço %.3f antebraço %.3f | quadril com sinal %.1f° | coluna %.1f° | cabeça × "
          "tronco %.1f° | linha joelho-quadril-cabeça %.1f° | linha ombro-quadril-joelho dobra %.1f°" % (
              coxa, canela, Lb, La, float(np.mean(ck.tc.quadril_sinal(j_pe))), ck.tc.coluna(j_pe)[0],
              ck.tc.cabeca_tronco(j_pe)[0], ck.tc.linha_joelho_quadril_cabeca(j_pe)[0], linha_ombro_joelho(j_pe)))

    def malha():
        return ck._avaliar(bon.corpo, 1)

    def pele(partes):
        return dt.malha(bon, partes)

    def cabelo_z():
        return float(ck._avaliar_simples(bon.cabelo)[0][:, 2].min())

    # ── deitado de costas (o jeito do supra) ─────────────────────────────────────────────────────────────────────────
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - pele(dt.TRONCO)[:, 2].min())))

    # ── pernas: IK até os tornozelos PARADOS no colchonete (pés chapados: o pé fica com a orientação de em pé) ─────────
    tz = TOPO + tornozelo_z - AFUNDA_PE
    pe_y = [float(pivo.y) - 0.48]
    alvos, polos, iks = {}, {}, {}
    for lado, s in dt.LADOS:
        q = p3.cabeca(rig, lado + "UpLeg")
        alvos[lado] = p3.vazio("tornozelo_" + lado, Vector((s * PE_X, pe_y[0], tz)))
        polos[lado] = p3.vazio("polo_joelho_" + lado, q + Vector((s * 0.04, -0.25, 0.6)))
        iks[lado] = p3.ik(rig, lado + "Leg", alvos[lado], polos[lado])
        p3.travar_rotacao(rig, lado + "Foot")

    def pernas(acertar=False):
        for lado, s in dt.LADOS:
            q = p3.cabeca(rig, lado + "UpLeg")
            a = Vector((s * PE_X, pe_y[0], tz))
            alvos[lado].location = a
            dd = a - q
            cima = Vector((0, -dd.z, dd.y)).normalized()
            if cima.z < 0:
                cima.negate()
            polos[lado].location = (q + a) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0))
        p3.atualizar()
        if acertar:
            for lado, _ in dt.LADOS:
                p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")

    pernas(acertar=True)
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_T}

    # apoio das costas em cima: a pele do meio das costas na altura de ~T3 (entre as escápulas)
    co, _, (nomes, dono) = malha()
    s2, nk = p3.cabeca(rig, "Spine2"), p3.cabeca(rig, "Neck")
    yt3 = float(s2.y + (nk.y - s2.y) * T3)
    m = _grupo(nomes, dono, ("Spine2", "Neck")) & (np.abs(co[:, 0]) < 0.02) & (np.abs(co[:, 1] - yt3) < 0.012)
    pt = co[m][np.argmin(co[m][:, 2])]
    # o bloco gira em volta de um ponto NO colchonete (a pele que encosta não escorrega: rola sobre as costas)
    P_T3 = Vector((0.0, float(pt[1]), TOPO - AFUNDA))
    print("APOIO ~T3 (%.3f %.3f %.3f) pele a %+.1f mm | Spine2 y %.3f pescoço y %.3f" % (
        *P_T3, (pt[2] - TOPO) * 1000, s2.y, nk.y))

    estado = {"bracos": None}

    def escapulas(deprime):
        if deprime:
            cima, lado = dt.eixos_tronco(rig)
            frente = cima.cross(lado)
            for L, s in dt.LADOS:
                p3.girar_osso(rig, L + "Shoulder", p3.rot_eixo(-s * deprime, frente))

    rolar = {"th": None, "dy": None}             # tabela bloco → deslocamento em y que deixa a pele das costas sem escorregar

    def desliza(th):
        if rolar["th"] is None:
            return 0.0
        return float(np.interp(th, rolar["th"], rolar["dy"]))

    def colocar(th, com_bracos=False, deprime=0.0, dy=None):
        """Tronco e pelve como UM bloco (a coluna parada na forma de em pé, neutra) girando `th` graus em volta do apoio das costas
        (~T3; + = o quadril sobe), andando `dy` em y (o rolar sem escorregar; padrão: da tabela) e subindo ou descendo até as
        costas (ou o glúteo, embaixo) encostarem no colchonete."""
        for n in OSSOS_T:
            PB[p3.P + n].matrix_basis = base[n].copy()
        p3.atualizar()
        if th:
            p3.girar_osso(rig, "Hips", p3.rot_x(-th), pivo=P_T3)
        d = desliza(th) if dy is None else dy
        if d:
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, d, 0)))
        escapulas(deprime)
        for _ in range(2):
            pernas()
            if com_bracos and estado["bracos"]:
                estado["bracos"]()
            co, _, (nomes, dono) = malha()
            zc = float(co[_grupo(nomes, dono, CONTATO)][:, 2].min())
            zg = float(co[_grupo(nomes, dono, ("Hips",))][:, 2].min())
            sobe = max(TOPO - AFUNDA - zc, TOPO - AFUNDA_GLUTEO - zg)
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, sobe)))
        pernas()
        if com_bracos and estado["bracos"]:
            estado["bracos"]()

    def diferenca_gluteo(th):
        """Quanto o glúteo fica mais alto que as costas (cada um em relação ao seu afundamento), com o bloco girado `th`."""
        for n in OSSOS_T:
            PB[p3.P + n].matrix_basis = base[n].copy()
        p3.atualizar()
        if th:
            p3.girar_osso(rig, "Hips", p3.rot_x(-th), pivo=P_T3)
        pernas()
        co, _, (nomes, dono) = malha()
        zc = float(co[_grupo(nomes, dono, CONTATO)][:, 2].min())
        zg = float(co[_grupo(nomes, dono, ("Hips",))][:, 2].min())
        return (zg - (TOPO - AFUNDA_GLUTEO)) - (zc - (TOPO - AFUNDA))

    def joelho():
        med = ck.medir_juntas(rig)
        return (med["joelhoE"] + med["joelhoD"]) / 2

    def quadril():
        return float(np.mean(ck.tc.quadril_sinal(ck.posicoes(rig))))

    def achar_cima():
        """Bloco girado até a coxa ficar na linha do tronco (quadril_sinal = Q_CIMA: ombros, quadril e joelhos em linha reta)."""
        lo, hi = 2.0, 50.0
        for _ in range(16):
            meio = (lo + hi) / 2
            colocar(meio, deprime=DEPRIME)
            if quadril() > Q_CIMA:
                lo = meio
            else:
                hi = meio
        return (lo + hi) / 2

    def achar_baixo():
        """Bloco girado até o glúteo E as costas encostarem (deitado: os 2 apoios no colchonete)."""
        lo, hi = -10.0, 6.0
        for _ in range(16):
            meio = (lo + hi) / 2
            if diferenca_gluteo(meio) > 0:
                hi = meio
            else:
                lo = meio
        return (lo + hi) / 2

    # distância dos pés: a que deixa o joelho a JOELHO_CIMA em cima, com o quadril neutro (secante em pe_y)
    historico = []
    for volta in range(6):
        th1 = achar_cima()
        colocar(th1, deprime=DEPRIME)
        k1 = joelho()
        historico.append((pe_y[0], k1, th1))
        print("PÉS volta %d | tornozelo y %.4f | em cima: bloco %.2f° quadril %.1f° joelho %.1f°" % (
            volta, pe_y[0], th1, quadril(), k1))
        if abs(k1 - JOELHO_CIMA) < 0.3:
            break
        if len(historico) >= 2:
            (y0, a0, _), (y1, a1, _) = historico[-2], historico[-1]
            pe_y[0] = y1 + (JOELHO_CIMA - a1) * (y1 - y0) / (a1 - a0) if abs(a1 - a0) > 1e-6 else y1 - 0.01
        else:
            pe_y[0] -= 0.02 * (1 if k1 > JOELHO_CIMA else -1)
    pernas(acertar=True)
    TH1 = achar_cima()
    TH0 = achar_baixo()
    colocar(TH0)
    k0, q0 = joelho(), quadril()
    co, _, (nomes, dono) = malha()
    zg0 = float(co[_grupo(nomes, dono, ("Hips",))][:, 2].min())
    meio = np.abs(co[:, 0]) < 0.04
    ys = (p3.cabeca(rig, "Spine").y - 0.03, p3.cabeca(rig, "Spine1").y + 0.03)
    lomb = co[meio & (co[:, 1] > ys[0]) & (co[:, 1] < ys[1]) & _grupo(nomes, dono, ("Hips", "Spine", "Spine1"))]
    print("EMBAIXO | bloco %.2f° | joelho %.1f° | quadril %.1f° | glúteo %+.1f mm | lombar-meio %+.1f mm | costas %+.1f mm "
          "(do topo do colchonete)" % (TH0, k0, q0, (zg0 - TOPO) * 1000, (lomb[:, 2].min() - TOPO) * 1000,
                                       (co[_grupo(nomes, dono, CONTATO)][:, 2].min() - TOPO) * 1000))
    colocar(TH1, deprime=DEPRIME)
    print("EM CIMA | bloco %.2f° | joelho %.1f° | quadril %.1f° | tronco %.1f° da vertical" % (
        TH1, joelho(), quadril(), math.degrees((p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")).angle(Vector((0, 0, 1))))))

    # rolar sem escorregar: subindo aos poucos, a pele das costas que segue encostada não pode andar no colchonete — o corpo anda em y
    # o que ela andou (girar em volta de um ponto parado e subir na vertical faz a pele encostada andar ~5 mm até em cima)
    COSTAS = ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder")
    ths, dys, ant, dy = [], [], None, 0.0
    for i in range(49):
        f = i / 48
        th = TH0 + (TH1 - TH0) * f
        for volta in range(3):
            colocar(th, deprime=DEPRIME * f, dy=dy)
            co, _, (nomes, dono) = malha()
            m = _grupo(nomes, dono, COSTAS) & (co[:, 2] < TOPO - AFUNDA + 0.0015)
            if ant is None or volta == 2:
                break
            ambos = m & ant[1]
            if not ambos.any():
                break
            andou = float(np.mean(co[ambos, 1] - ant[0][ambos, 1]))
            if abs(andou) < 1e-5:
                break
            dy -= andou
        ant = (co.copy(), m)
        ths.append(th)
        dys.append(dy)
    rolar["th"], rolar["dy"] = ths, dys
    print("ROLAR | o corpo anda %+.1f mm em y até em cima (meio %+.1f mm)" % (dys[-1] * 1000, dys[24] * 1000))

    # ── cabeça no colchonete: o pescoço dobra ou estende até o cabelo da nuca encostar (todo quadro) ─────────────────────
    pescoco = {"g": 0.0}

    def cabeca():
        alvo = TOPO - AFUNDA_CABELO
        neck0 = PB[p3.P + "Neck"].matrix_basis.copy()

        def altura(g):
            PB[p3.P + "Neck"].matrix_basis = neck0.copy()
            p3.atualizar()
            if g:
                p3.girar_osso(rig, "Neck", p3.rot_x(g))
            return cabelo_z()

        lo, hi = -40.0, 60.0                    # + = flexão (o queixo vem pro peito, a nuca sobe)
        for _ in range(14):
            g = (lo + hi) / 2
            if altura(g) > alvo:
                hi = g
            else:
                lo = g
        altura(hi)
        pescoco["g"] = hi

    # ── braços ao lado do corpo, palmas pra baixo, mãos paradas no colchonete: IK do ombro ao punho parado ─────────────────
    punhos, polos_b, iks_b = {}, {}, {}
    for lado, s in dt.LADOS:                    # alvo nasce no punho de repouso e o polo afastado (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos_b[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.4, 0.0, 0.3)))
        iks_b[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos_b[lado])
        iks_b[lado].mute = True
    p3.atualizar()
    BRACO = {L: [pb.name[len(p3.P):] for pb in PB if pb.name[len(p3.P):].startswith((L + "Arm", L + "ForeArm", L + "Hand"))]
             for L, _ in dt.LADOS}
    braco_solto = {L: {n: PB[p3.P + n].matrix_basis.copy() for n in BRACO[L]} for L in BRACO}
    DEDOS = {L: [n for n in BRACO[L] if n.startswith(L + "Hand") and n != L + "Hand"] for L in BRACO}
    dedos_pose, polo_ok = {}, {}
    DEDOS_Q = {L: Vector((s * math.sin(math.radians(DEDOS_FORA)) * math.cos(math.radians(DEDOS_DESCE)),
                          -math.cos(math.radians(DEDOS_FORA)) * math.cos(math.radians(DEDOS_DESCE)),
                          -math.sin(math.radians(DEDOS_DESCE)))) for L, s in dt.LADOS}     # provisório (sai do antebraço)
    PALMA_Q = Vector((0, 0, -1))
    cot_z = {L: TOPO + 0.035 for L, _ in dt.LADOS}

    def polo_cotovelo(lado, s, W):
        """Polo pro cotovelo ficar na altura cot_z[lado], o mais pra fora possível (o jeito do supra)."""
        S = p3.cabeca(rig, lado + "Arm")
        u = (W - S).normalized()
        dist = (W - S).length
        a = (Lb ** 2 - La ** 2 + dist ** 2) / (2 * dist)
        rho = math.sqrt(max(Lb ** 2 - a ** 2, 1e-8))
        c = S + u * a
        e1 = Vector((s, 0, 0)) - u * (u.x * s)
        e1.normalize()
        e2 = u.cross(e1)
        A, B = e1.z * rho, e2.z * rho
        R = max(math.hypot(A, B), 1e-9)
        b0 = math.atan2(B, A)
        k = math.acos(max(-1.0, min(1.0, (cot_z[lado] - c.z) / R)))
        melhor = None
        for fi in (b0 + k, b0 - k):
            E = c + (e1 * math.cos(fi) + e2 * math.sin(fi)) * rho
            if melhor is None or E.x * s > melhor.x * s:
                melhor = E
        return c + (melhor - c).normalized() * (rho + 0.4)

    E0 = {}

    def polo_perto(lado, s, W):
        """Polo pro cotovelo ficar o mais perto possível de onde estava embaixo (E0), sem descer abaixo de cot_z (o colchonete):
        o ombro anda e o cotovelo mexe o mínimo."""
        S = p3.cabeca(rig, lado + "Arm")
        u = (W - S).normalized()
        dist = (W - S).length
        a = (Lb ** 2 - La ** 2 + dist ** 2) / (2 * dist)
        rho = math.sqrt(max(Lb ** 2 - a ** 2, 1e-8))
        c = S + u * a
        e1 = Vector((s, 0, 0)) - u * (u.x * s)
        e1.normalize()
        e2 = u.cross(e1)
        melhor = None
        for g in np.arange(0.0, 360.0, 0.5):
            f = math.radians(g)
            E = c + (e1 * math.cos(f) + e2 * math.sin(f)) * rho
            custo = (E - E0[lado]).length + 10 * max(0.0, cot_z[lado] - E.z)
            if melhor is None or custo < melhor[0]:
                melhor = (custo, E)
        return c + (melhor[1] - c).normalized() * (rho + 0.4)

    def polo(lado, s, W):
        return polo_perto(lado, s, W) if lado in E0 else polo_cotovelo(lado, s, W)

    def por_mao(lado, W, polo):
        """Punho em W, dedos pra DEDOS_Q e palma pra baixo, cotovelo do lado do `polo` (o jeito da Flexão de Braço)."""
        for n, M in braco_solto[lado].items():
            PB[p3.P + n].matrix_basis = M.copy()
        iks_b[lado].mute = False
        punhos[lado].location = W
        polos_b[lado].location = polo
        p3.atualizar()
        if lado not in polo_ok:
            polo_ok[lado] = p3.acertar_polo(rig, iks_b[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        nomes_b = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes_b]
        iks_b[lado].mute = True
        for n, M in zip(nomes_b, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        dedos_q = DEDOS_Q[lado]
        palma_q = (PALMA_Q - dedos_q * PALMA_Q.dot(dedos_q)).normalized()
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        ax = (f1 - f0).normalized()                       # 1) antebraço gira (pronação) pra palma ir pra baixo
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, lado)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        n_m, _, y_m = pg._base(rig, lado)[:3]             # 2) o resto no punho, pela base da PALMA (punho → nós, normal)
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        F_quer = Matrix((dedos_q, palma_q, dedos_q.cross(palma_q))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        if lado in dedos_pose:
            for n, M in dedos_pose[lado].items():
                PB[p3.P + n].matrix_basis = M.copy()
            p3.atualizar()
        return (p3.cabeca(rig, lado + "Hand") - W).length

    def esticar_dedos(lado):
        """Dedos esticados e juntos no plano da palma, o polegar deitado do lado do indicador (a mão de apoio do supra)."""
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 1.0)
        for d in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, lado)[0]
                o = "%sHand%s%d" % (lado, d, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if d == "Thumb":
                    plano = plano - palma * 0.10 * f.length
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def dedos_no_chao(lado):
        """Com a palma no colchonete: cada dedo (e o polegar) gira só na base, pro lado da palma, até a pele mais baixa dele
        encostar (AFUNDA_MAO); sem passar disso (a Flexão de Braço)."""
        palma, eixo_nos = pg._base(rig, lado)[:2]
        co, _, (nomes, dono) = malha()
        for d in p3.DEDOS + ("Thumb",):
            ossos = ["%sHand%s%d" % (lado, d, i) for i in ((1, 2, 3) if d != "Thumb" else (2, 3))]
            Pd = co[_grupo(nomes, dono, ossos)]
            h = p3.cabeca(rig, ossos[0])
            f = (p3.ponta(rig, ossos[0]) - h).normalized()
            eixo = eixo_nos if d != "Thumb" else f.cross(palma).normalized()
            sinal = 1 if eixo.cross(f).dot(palma) > 0 else -1          # + = gira pro lado da palma (pro colchonete)
            escolha = None
            z0 = float(Pd[:, 2].min())
            for g in np.arange(-25.0, 60.01, 0.5):                     # do mais esticado pro mais dobrado
                if pg._rot(Pd, np.array(h), eixo, g * sinal)[:, 2].min() <= TOPO - AFUNDA_MAO:
                    escolha = float(g)
                    break
            if escolha is None:
                print("  dedo %s %s não chega no colchonete" % (lado, d))
                continue
            if escolha:
                p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo))
            print("  dedo %s %s: estava a %+.1f mm do colchonete, base gira %+.1f°" % (lado, d, (z0 - TOPO) * 1000, escolha))

    # punho: por fora do ombro (MAO_FORA), a ESTICA_CIMA do comprimento do braço em cima (no ponto mais longe do ombro)
    colocar(TH1, deprime=DEPRIME)
    S1 = {L: p3.cabeca(rig, L + "Arm").copy() for L, _ in dt.LADOS}
    colocar(TH1)
    S1b = p3.cabeca(rig, "LeftArm").copy()
    colocar(TH0)
    S0 = {L: p3.cabeca(rig, L + "Arm").copy() for L, _ in dt.LADOS}
    W = {}
    for lado, s in dt.LADOS:
        w = Vector((S0[lado].x + s * MAO_FORA, 0.0, TOPO + 0.025))
        R = ESTICA_CIMA * (Lb + La)
        dx, dz = w.x - S1[lado].x, w.z - S1[lado].z
        w.y = S1[lado].y - math.sqrt(max(R * R - dx * dx - dz * dz, 1e-6))
        W[lado] = w
    print("OMBRO E embaixo (%.3f %.3f %.3f) em cima (%.3f %.3f %.3f) | andou %.1f mm (sem a depressão da escápula %.1f mm) | "
          "clavícula %.3f m" % (*S0["Left"], *S1["Left"], (S1["Left"] - S0["Left"]).length * 1000, (S1b - S0["Left"]).length * 1000,
                               (p3.cabeca(rig, "LeftArm") - p3.cabeca(rig, "LeftShoulder")).length))

    def bracos():
        for lado, s in dt.LADOS:
            por_mao(lado, W[lado], polo(lado, s, W[lado]))

    def ajustar_embaixo(voltas):
        """Embaixo: o punho desce/sobe até a palma encostar no colchonete e o cotovelo até a pele mais baixa do braço e do
        antebraço encostar."""
        for _ in range(voltas):
            colocar(TH0)
            for lado, s in dt.LADOS:
                por_mao(lado, W[lado], polo_cotovelo(lado, s, W[lado]))
                co, _, (nomes, dono) = malha()
                W[lado].z += (TOPO - AFUNDA_MAO) - float(co[_grupo(nomes, dono, (lado + "Hand", lado + "HandThumb1"))][:, 2].min())
                cot_z[lado] += (TOPO - AFUNDA_COTOVELO) - float(co[_grupo(nomes, dono, (lado + "ForeArm", lado + "Arm"))][:, 2].min())

    estado["bracos"] = bracos
    colocar(TH0)
    for lado, s in dt.LADOS:
        por_mao(lado, W[lado], polo_cotovelo(lado, s, W[lado]))
        esticar_dedos(lado)
        dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
    ajustar_embaixo(3)
    # dedos na linha do antebraço no meio do movimento (a mão fica parada no mundo; o antebraço gira um pouco em volta dela)
    colocar(TH0 + (TH1 - TH0) * 0.5, com_bracos=True, deprime=DEPRIME * 0.5)
    for lado, s in dt.LADOS:
        a = p3.cabeca(rig, lado + "Hand") - p3.cabeca(rig, lado + "ForeArm")
        h = Vector((a.x, a.y, 0.0)).normalized()
        c_ = math.cos(math.radians(DEDOS_DESCE))
        DEDOS_Q[lado] = Vector((h.x * c_, h.y * c_, -math.sin(math.radians(DEDOS_DESCE))))
        print("DEDOS %s apontam %.1f° pra fora da direção dos pés" % (lado, math.degrees(math.atan2(s * h.x, -h.y))))
    ajustar_embaixo(3)
    colocar(TH0)
    for lado, s in dt.LADOS:
        por_mao(lado, W[lado], polo_cotovelo(lado, s, W[lado]))
        dedos_no_chao(lado)
        dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        E0[lado] = p3.cabeca(rig, lado + "ForeArm").copy()
    for t_ in (0.0, 0.5, 1.0):
        colocar(TH0 + (TH1 - TH0) * t_, com_bracos=True, deprime=DEPRIME * t_)
        co, _, (nomes, dono) = malha()
        mao_x = float(np.abs(co[_grupo(nomes, dono, _mao("Left") + _mao("Right"))][:, 0]).max())
        braco_x = float(np.abs(co[_grupo(nomes, dono, ("LeftArm", "LeftForeArm", "RightArm", "RightForeArm"))][:, 0]).max())
        print("LARGURA t=%g | mão até |x| %.3f, braço e antebraço até %.3f (o colchonete vai até %.3f)" % (
            t_, mao_x, braco_x, LARGURA / 2))
        for lado, s in dt.LADOS:
            S = p3.cabeca(rig, lado + "Arm")
            print("BRAÇO %s t=%g | punho (%.3f %.3f %.3f) erro %.1f mm | ombro → punho %.1f%% do braço | cotovelo (%.3f %.3f %.3f)"
                  % (lado, t_, *W[lado], (p3.cabeca(rig, lado + "Hand") - W[lado]).length * 1000,
                     (W[lado] - S).length / (Lb + La) * 100, *p3.cabeca(rig, lado + "ForeArm")))

    # ── colchonete: do alto da cabeça até a ponta dos pés, com folga ──────────────────────────────────────────────────────
    colocar(TH0, com_bracos=True)
    cabeca()
    co, _, (nomes, dono) = malha()
    y_pe = float(co[_grupo(nomes, dono, ("LeftToeBase", "RightToeBase"))][:, 1].min())
    y_cab = float(co[_grupo(nomes, dono, ("Head",))][:, 1].max())
    y_min, y_max = y_pe - 0.08, y_cab + 0.06
    colchonete = e3.caixa("colchonete", (0, (y_min + y_max) / 2, TOPO / 2), (LARGURA, y_max - y_min, TOPO), e3.mat_estofado(),
                          chanfro=0.004)
    print("COLCHONETE %.2f × %.2f m (y %.3f a %.3f) | pescoço embaixo %+.1f°" % (LARGURA, y_max - y_min, y_min, y_max, pescoco["g"]))

    # ── medidas de diagnóstico ────────────────────────────────────────────────────────────────────────────────────────────
    entrada = {}                                # pele encostada: onde cada vértice estava quando encostou (pra medir se escorrega)

    def info():
        j = ck.posicoes(rig)
        co, tri, (nomes, dono) = malha()
        encosta = co[:, 2] < TOPO
        escorrega = {}
        for nome, partes in (("costas", ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder")),
                             ("braços", ("LeftArm", "LeftForeArm", "RightArm", "RightForeArm")),
                             ("mãos", _mao("Left") + _mao("Right")),
                             ("pés", ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"))):
            m = _grupo(nomes, dono, partes) & encosta
            e = entrada.setdefault(nome, np.full(co.shape, np.nan))
            novo_ = m & np.isnan(e[:, 0])
            e[novo_] = co[novo_]
            e[~m] = np.nan
            escorrega[nome] = float(np.linalg.norm((co[m] - e[m])[:, :2], axis=1).max()) * 1000 if m.any() else 0.0
        tr = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder"))
        enc = co[tr & encosta]
        pele_z = {k: (float(co[_grupo(nomes, dono, (k,))][:, 2].min()) - TOPO) * 1000
                  for k in ("Hips", "Spine", "Spine1", "Spine2", "Head", "LeftArm", "LeftForeArm")}
        mao_z = [(float(co[_grupo(nomes, dono, _mao(L))][:, 2].min()) - TOPO) * 1000 for L, _ in dt.LADOS]
        dedos_z = " ".join("%s%s %.1f" % (L[0], d[0], (float(co[_grupo(nomes, dono, tuple("%sHand%s%d" % (L, d, i)
                                                                                         for i in (1, 2, 3)))][:, 2].min()) - TOPO) * 1000)
                           for L, _ in dt.LADOS for d in p3.DEDOS + ("Thumb",))
        palma_z = " ".join("%s %.1f" % (L[0], (float(co[_grupo(nomes, dono, (L + "Hand",))][:, 2].min()) - TOPO) * 1000)
                           for L, _ in dt.LADOS)
        d_ = j["Neck"] - j["Hips"]
        med = ck.medir_juntas(rig)
        linha = linha_ombro_joelho(j)
        return ("cotovelo %.0f/%.0f° | quadril com sinal %.1f/%.1f° | linha ombro-quadril-joelho dobra %.1f° | joelho %.0f° | "
                "tronco %.0f° do chão | cabeça × tronco %.0f° | pescoço %+.1f° | pele acima do colchonete (mm): glúteo %.0f lombar %.0f "
                "T11-T8 %.0f T7-C7 %.0f cabeça %.0f braço %.0f antebraço %.0f mão E %.1f D %.1f cabelo %.1f | costas no chão de y "
                "%.3f a %.3f | pele encostada andou (mm) %s | palma (mm) %s | dedos (mm) %s" % (
                    med["cotoveloE"], med["cotoveloD"], *ck.tc.quadril_sinal(j), linha, joelho(),
                    math.degrees(math.atan2(-d_[2], math.hypot(d_[0], d_[1]))), ck.tc.cabeca_tronco(j)[0], pescoco["g"],
                    pele_z["Hips"], pele_z["Spine"], pele_z["Spine1"], pele_z["Spine2"], pele_z["Head"], pele_z["LeftArm"],
                    pele_z["LeftForeArm"], mao_z[0], mao_z[1], (cabelo_z() - TOPO) * 1000,
                    float(enc[:, 1].min()) if len(enc) else float("nan"), float(enc[:, 1].max()) if len(enc) else float("nan"),
                    " ".join("%s %.1f" % kv for kv in escorrega.items()), palma_z, dedos_z))

    def pose(t):
        """t=0 embaixo (glúteo e costas no colchonete), t=1 em cima (linha ombro → quadril → joelho reta)."""
        colocar(TH0 + (TH1 - TH0) * t, com_bracos=True, deprime=DEPRIME * t)
        cabeca()

    pose(0.0)
    print("PONTE bloco de %.2f° (embaixo) a %.2f° (em cima) | tornozelos y %.4f | %s" % (TH0, TH1, pe_y[0], info()))
    entrada.clear()
    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.0, 0.25),
                camera_video=((3.6, -1.4, 1.0), (0, 0.0, 0.25), 50), info=info, apoios=[colchonete],
                afunda_apoio_mm=20)
