# Abdominal Infra (reverse crunch) — cena da fábrica 3D (lote 12, 11/10/2026).
# t = 0 deitado de costas no colchonete, a pelve e a lombar apoiadas, as COXAS NA VERTICAL, os joelhos a 90° (canelas na
# horizontal) e os pés juntos no ar, os braços ao lado do tronco com as palmas no colchonete · t = 1 a pelve enrolou ~60° pra trás
# e saiu do chão (a pele do glúteo ~15 cm acima do colchonete): a coluna enrolou de baixo pra cima — a lombar inteira fora e o fim
# do tórax saindo —, com as escápulas, os ombros, a cabeça e os braços parados no colchonete; os joelhos no mesmo ângulo e as coxas
# ~65° além da vertical, na direção do peito (o app faz a volta: desce desenrolando até a pelve apoiar e as coxas voltarem à
# vertical, sem os pés encostarem no chão).
# free-exercise-db (o fonte_en "Reverse Crunch"): "Lie down on the floor with your legs fully extended and arms to the side of your
# torso with the palms on the floor. Your arms should be stationary for the entire exercise." / "Move your legs up so that your
# thighs are perpendicular to the floor and feet are together and parallel to the floor. This is the starting position." / "move
# your legs towards the torso as you roll your pelvis backwards and you raise your hips off the floor. At the end of this movement
# your knees will be touching your chest."; ACE (Reverse Crunch): "raising your knees directly above your hips while maintaining a
# 90 degree bend in the knees" / "slowly raise your hips off the mat, rolling your spine up as if trying to bring your knees towards
# your head (your hips and pelvis should move towards your rib cage). Avoid any change in the angle of your knees during the
# roll-up" / "continue to curl-up until your spine cannot roll any further" / na volta, "ensuring that your knees don't move past
# your hips"; ACE (estudo de 2001): "Lie flat on the floor with your lower back pressed to the ground"; ExRx (Lying Leg-Hip Raise):
# "Continue to raise knees toward shoulders by flexing waist, raising hips from board" / "keep knees fully flexed, so as not to
# throw weight of lower legs over head".
# AMPLITUDE: as fontes divergem — a foto do free-exercise-db fica quase de ponta-cabeça (só os ombros no chão, coxa ~90° além da
# vertical); a da ACE, com a lombar saindo até o meio das costas e a coxa ~65–70°. Fica a da ACE: a coluna enrola até o fim do
# tórax e a parte de cima das costas (as escápulas), os ombros e a cabeça ficam no colchonete — a linha quadril → pescoço a ~22° do
# chão (na foto da ACE, ~20°) e os joelhos a ~17 cm do tronco. Os joelhos não chegam a "touching your chest": pra isso o quadril
# teria que subir até só os ombros ficarem no chão.
# COMO O RIG FAZ: o Spine2 (T8–C7: escápulas e ombros) fica PARADO no mundo (o pino) e as dobras vão nas juntas de baixo dele — L3
# (cabeça do Spine), T12 (cabeça do Spine1) e T8 (cabeça do Spine2) —, de baixo pra cima (L3 anda mais no começo e T8 no fim); a
# pelve gira a soma pra trás e o corpo anda até o Spine2 voltar pro pino. A cabeça e os braços (filhos do Spine2) não mexem: as mãos não
# escorregam. Embaixo a lombar já vem achatada (a pelve 12° pra trás, a CADEIA do oblíquo com pés no banco; ACE 2001: "lower back
# pressed to the ground"). PERNAS por FK, filhas da pelve: coxa na vertical embaixo, joelho a 90° o tempo todo, coxas fechadas 3° e
# o giro externo do quadril que junta os pés (free-exercise-db: "feet are together"; os joelhos ficam ~10 cm afastados, pele a pele
# — com as coxas mais fechadas elas entravam uma na outra perto da virilha). O quadril dobra só 5° a mais em cima (coxa × pelve 85 → 90°):
# quem leva os joelhos pro peito é a pelve enrolando (ACE: "the emphasis of the movement should be on pulling your pelvis upwards
# towards your rib cage").
# BRAÇOS ao lado do tronco, palmas no colchonete (free-exercise-db; a ACE abre os braços pros lados): IK até o punho → FK, palma pra
# baixo e dedos esticados apontando pros pés; o cotovelo dobra ~33° pra fora (esticado e colado no corpo, o braço entrava no dorsal).
# DIFERENTE da Elevação de Pernas (pernas esticadas subindo só pelo quadril, lombar e pelve no chão), do Supra (sobe o tórax com a
# pelve no chão), do Bicicleta (tronco girando, pernas pedalando) e da Elevação de Pernas Suspenso na Barra (pendurado, a pelve parada
# e a coluna sem enrolar): aqui a pelve enrola e sai do chão, com a parte de cima das costas parada no colchonete.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from cena import Cena
from abdominal_bicicleta import _congelar, _orientar, _grupo, _arvore, _cruza
from abdominal_completo import _esticar_dedos, _mao, _distancia

TOPO = 0.012          # colchonete de 12 mm no chão (o da elevação de pernas, do supra, do bicicleta e do completo)
AFUNDA = 0.004        # pele das costas dentro do colchonete deitado (a da elevação de pernas e do supra)
AFUNDA_COSTAS = 0.005  # embaixo, com a lombar achatada: a pele mais funda das costas fica 5 mm dentro do colchonete
AFUNDA_CABELO = 0.002  # o cabelo da nuca encosta no colchonete (a pele fica embaixo do cabelo, como no completo)
AFUNDA_MAO = 0.0015   # palma e dedos encostando no colchonete
JOELHO = 84           # dobra do joelho no rig (rot_x do Leg): o joelho mede ~90° (o boneco em repouso já tem ~6°)
ADUZ = 3              # as coxas fecham um pouco (graus): com 4 elas entravam até 10 mm uma na outra perto da virilha
PLANTAR = 15          # pés soltos, a ponta um pouco esticada (flexão plantar, graus)
FOLGA_PES = 0.001     # vão entre os pés juntos (m): o giro externo do quadril aproxima os pés até esse vão
MAO_X = 0.25          # punho a 25 cm do meio do corpo: a mão inteira fica em cima do colchonete (de 14 a 28 cm do meio;
                      # o colchonete tem 0,62 m de largura)
ALCANCE = 0.96        # punho a 96% do comprimento do braço: o cotovelo dobra ~33° pra fora. Com o braço quase esticado
                      # (98,5%, o da elevação de pernas) e a mão em cima do colchonete, o braço entrava 9 mm no dorsal
                      # embaixo e 15 mm no meio da subida (a lateral do tronco engorda quando a lombar dobra); com 97%, 4 mm
POLO_COT = (0.50, 0.0, 0.10)   # polo do cotovelo em relação ao cotovelo de repouso: pra fora e um pouco pra cima
# coluna: dobra (graus) em cada junta do rig — L3 = cabeça do Spine (pelve × lombar), T12 = cabeça do Spine1 (lombar × fim do
# tórax), T8 = cabeça do Spine2 (fim do tórax × alto do tórax). O Spine2 (T8–C7: escápulas e ombros) fica PARADO no mundo e a
# pelve gira o total pra trás (retroversão), o que deixa a cabeça e os braços parados no colchonete o movimento todo.
EMBAIXO = {"Spine": 20.0, "Spine1": 4.5, "Spine2": -12.5}   # lombar achatada no colchonete (a CADEIA do oblíquo com pés no
                      # banco): pelve 12° pra trás, a pele do meio das costas encosta do sacro às escápulas
CIMA = {"Spine": 38.0, "Spine1": 22.0, "Spine2": 12.0}      # em cima: pelve 72° pra trás em relação a deitado (60° além do
                      # começo) — a lombar inteira fora do colchonete e o fim do tórax saindo
FORMA = {"Spine": lambda x: 1 - (1 - x) ** 2,   # enrola de baixo pra cima: L3 anda mais no começo (sai na frente), T12
         "Spine1": lambda x: x,                  # por igual e T8 mais no fim (o fim do tórax sai por último). A soma (a pelve)
         "Spine2": lambda x: x * x}              # anda quase por igual: com o ease do exportador fica um ease só — com rampas
                      # em smoothstep (0–0,7 / 0,1–0,85 / 0,3–1) os 10 primeiros quadros quase não mexiam (pelve ≤ 1°) e o meio
                      # corria (salto de 90 mm com ida_s 2,0)
QUADRIL_EXTRA = 5.0   # flexão a mais do quadril em cima (graus, em relação à pelve)
OSSOS_T = ("Hips", "Spine", "Spine1", "Spine2")
PERNAS = ("LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot")


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos; aqui a mão não segura nada (não há fechar_em_volta)
    rig = bon.rig
    PB = rig.pose.bones
    colchonete = e3.caixa("colchonete", (0, 0.0, TOPO / 2), (0.62, 1.90, TOPO), e3.mat_estofado(), chanfro=0.004)
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length

    def pele(partes):
        return dt.malha(bon, partes)

    # ── deitado de costas (o jeito da elevação de pernas) ───────────────────────────────────────────────────────
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - pele(dt.TRONCO)[:, 2].min())))
    base_t = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_T}
    base_p = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNAS}
    pino = [p3.cabeca(rig, "Spine2").copy()]          # onde o Spine2 (T8) fica no mundo

    def coluna(t):
        """Coluna e pelve no quadro t: as dobras de EMBAIXO a CIMA, cada junta na sua FORMA (de baixo pra cima); a pelve gira
        a soma pra trás e o corpo anda até o Spine2 voltar pro pino (alto do tórax, cabeça e braços parados)."""
        for n, M in base_t.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        b = {n: EMBAIXO[n] + (CIMA[n] - EMBAIXO[n]) * FORMA[n](t) for n in EMBAIXO}
        p3.girar_osso(rig, "Hips", p3.rot_x(-sum(b.values())))
        for n in ("Spine", "Spine1", "Spine2"):
            p3.girar_osso(rig, n, p3.rot_x(b[n]))
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=pino[0] - p3.cabeca(rig, "Spine2"))
        return b

    def coxa_alem():
        """Coxa além da vertical (graus, média dos 2 lados): + = pra cabeça."""
        v = [p3.cabeca(rig, L + "Leg") - p3.cabeca(rig, L + "UpLeg") for L, _ in dt.LADOS]
        return sum(math.degrees(math.atan2(d.y, d.z)) for d in v) / 2

    # ── pernas (FK, filhas da pelve): coxa na vertical embaixo, joelho a 90°, coxas um pouco fechadas e o giro externo do
    # quadril que junta os pés ───────────────────────────────────────────────────────────────────────────────────
    giro = [0.0]
    flexao = [85.0 - sum(EMBAIXO.values())]

    def pernas():
        for n, M in base_p.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        for lado, s in dt.LADOS:
            p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(-flexao[0]))
            p3.girar_osso(rig, lado + "Leg", p3.rot_x(JOELHO))
            p3.girar_osso(rig, lado + "UpLeg", Matrix.Rotation(math.radians(-s * ADUZ), 3, "Y"))
            if giro[0]:
                ax = (p3.cabeca(rig, lado + "Leg") - p3.cabeca(rig, lado + "UpLeg")).normalized()
                p3.girar_osso(rig, lado + "UpLeg", Matrix.Rotation(math.radians(-s * giro[0]), 3, ax))
            p3.girar_osso(rig, lado + "Foot", p3.rot_x(PLANTAR))

    def pe_x_pe():
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        bvh = _arvore(co, tri, _grupo(nomes, dono, ("RightFoot", "RightToeBase")))
        return _distancia(bvh, co[_grupo(nomes, dono, ("LeftFoot", "LeftToeBase"))][::2], 0.3)

    coluna(0.0)
    for _ in range(3):
        pernas()
        flexao[0] -= coxa_alem()                      # a coxa fica na vertical em t = 0
    pernas()
    # giro externo: aumenta até os pés encostarem e volta um passo (passos de 1°, 0,25° e 0,05°): o vão fica logo acima de FOLGA_PES
    for passo in (1.0, 0.25, 0.05):
        while pe_x_pe() > FOLGA_PES and giro[0] < 30:
            giro[0] += passo
            pernas()
        giro[0] -= passo
        pernas()
    base_p = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNAS}   # as pernas de t = 0, em relação à pelve
    print("PERNAS | flexão do quadril no rig %.1f° | giro externo %.2f° | coxa além da vertical %+.1f° | pé × pé %.1f mm" % (
        flexao[0], giro[0], coxa_alem(), pe_x_pe() * 1000))

    # ── altura: a pele mais funda das costas embaixo fica AFUNDA_COSTAS dentro do colchonete (o pino sobe ou desce junto) ──
    coluna(0.0)
    z = pele(("Hips", "Spine", "Spine1", "Spine2"))[:, 2].min()
    pino[0] = pino[0] + Vector((0, 0, TOPO - AFUNDA_COSTAS - z))
    coluna(0.0)
    print("EMBAIXO | pino do Spine2 z %.4f | pele (mm do topo do colchonete): glúteo %+.1f lombar %+.1f T12-T8 %+.1f "
          "T7-C7 %+.1f" % (pino[0].z, *[(pele((k,))[:, 2].min() - TOPO) * 1000 for k in ("Hips", "Spine", "Spine1", "Spine2")]))

    # ── cabeça no colchonete: o pescoço estende até o cabelo da nuca encostar (o jeito do completo) ───────────────────
    cabelo_z = lambda: float(ck._avaliar_simples(bon.cabelo)[0][:, 2].min())
    pescoco = 0.0
    for passo in (2.0, 0.5, 0.1):
        while cabelo_z() > TOPO - AFUNDA_CABELO and pescoco > -40:
            p3.girar_osso(rig, "Neck", p3.rot_x(-passo))
            pescoco -= passo
        p3.girar_osso(rig, "Neck", p3.rot_x(passo))
        pescoco += passo
    print("CABEÇA | pescoço %+.1f° (− estende) | cabelo %+.1f mm | pele da cabeça %+.1f mm" % (
        pescoco, (cabelo_z() - TOPO) * 1000, (pele(("Head",))[:, 2].min() - TOPO) * 1000))

    # ── braços ao lado do tronco, palmas no colchonete: IK até o punho → FK, palma pra baixo, dedos esticados pra frente
    # (pros pés); o punho desce até a palma encostar. Os braços são filhos do Spine2, que não mexe: ficam parados ──────
    alvo_z = {lado: TOPO + 0.025 for lado, _ in dt.LADOS}
    for lado, s in dt.LADOS:
        punho = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))           # nasce no punho de repouso
        polo = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * POLO_COT[0], POLO_COT[1],
                                                                                            POLO_COT[2])))
        ik = p3.ik(rig, lado + "ForeArm", punho, polo)
        p3.atualizar()
        acertado = None
        for volta in range(5):
            S = p3.cabeca(rig, lado + "Arm")
            dx, dz = s * MAO_X - S.x, alvo_z[lado] - S.z
            dy = math.sqrt(max(((Lb + La) * ALCANCE) ** 2 - dx * dx - dz * dz, 1e-4))
            ik.mute = False
            punho.location = Vector((s * MAO_X, S.y - dy, alvo_z[lado]))
            p3.atualizar()
            if acertado is None:
                acertado = p3.acertar_polo(rig, ik, lado + "ForeArm", lado + "Arm", lado + "Hand")
            _congelar(rig, ik, lado)
            f = p3.cabeca(rig, lado + "Hand") - p3.cabeca(rig, lado + "ForeArm")
            dedos = Vector((f.x, f.y, 0.0)).normalized()
            _orientar(rig, lado, dedos, Vector((0, 0, -1)))
            _esticar_dedos(rig, lado)
            erro = (TOPO - AFUNDA_MAO) - pele(_mao(lado))[:, 2].min()
            alvo_z[lado] += erro
            if abs(erro) < 0.0002:
                break
        print("BRAÇO %s | punho (%.3f %.3f %.3f) | mão %+.1f mm do topo | polo %s" % (
            lado, *p3.cabeca(rig, lado + "Hand"), (pele(_mao(lado))[:, 2].min() - TOPO) * 1000, acertado))

    maos0 = {lado: p3.cabeca(rig, lado + "HandMiddle1").copy() for lado, _ in dt.LADOS}
    eixo_pelve = lambda: (p3.mundo_osso(rig, "Hips").to_3x3() @ Vector((0, 1, 0))).normalized()
    ang_pelve = lambda: math.degrees(math.atan2(eixo_pelve().z, eixo_pelve().y))
    pelve0 = [ang_pelve()]

    def pose(t):
        """t = 0 embaixo (coxas na vertical, pelve apoiada), t = 1 em cima (a pelve enrolou pra trás e saiu do chão)."""
        for n, M in base_p.items():
            PB[p3.P + n].matrix_basis = M.copy()
        coluna(t)
        if QUADRIL_EXTRA:
            ex = QUADRIL_EXTRA * t
            for lado, _ in dt.LADOS:
                p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(-ex))

    def medidas():
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = {"pele": {k: (co[_grupo(nomes, dono, (k,))][:, 2].min() - TOPO) * 1000
                      for k in ("Hips", "Spine", "Spine1", "Spine2", "Head")}}
        m["cabelo"] = (float(ck._avaliar_simples(bon.cabelo)[0][:, 2].min()) - TOPO) * 1000
        meio = np.abs(co[:, 0]) < 0.04
        tr = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2"))
        enc = co[meio & tr & (co[:, 2] < TOPO + 0.004)]
        m["encosta"] = (float(enc[:, 1].min()), float(enc[:, 1].max())) if len(enc) else (float("nan"),) * 2
        m["coxa"] = coxa_alem()
        m["pelve"] = pelve0[0] - ang_pelve()                    # quanto a pelve girou pra trás desde t = 0
        ep = eixo_pelve()
        m["coxa_pelve"] = [math.degrees((p3.cabeca(rig, L + "Leg") - p3.cabeca(rig, L + "UpLeg")).angle(-ep))
                           for L, _ in dt.LADOS]
        # joelho × peito: pele do joelho (até 8 cm da junta) até a pele do tórax e da barriga
        bvh_tronco = _arvore(co, tri, _grupo(nomes, dono, ("Spine", "Spine1", "Spine2")))
        perto = []
        for L, _ in dt.LADOS:
            J = np.array(p3.cabeca(rig, L + "Leg"))
            kn = _grupo(nomes, dono, (L + "UpLeg", L + "Leg")) & (np.linalg.norm(co - J, axis=1) < 0.08)
            perto.append(_distancia(bvh_tronco, co[kn][::2], 0.6) * 1000)
        m["joelho_peito"] = perto
        m["coxa_tronco"] = [_cruza(co, tri, _grupo(nomes, dono, (L + "UpLeg",)),
                                   _grupo(nomes, dono, ("Spine", "Spine1", "Spine2")), p3.cabeca(rig, L + "UpLeg"), 0.10)[0]
                            for L, _ in dt.LADOS]
        bracos = _grupo(nomes, dono, ("LeftArm", "LeftForeArm", "RightArm", "RightForeArm") + _mao("Left") + _mao("Right"))
        bvh_quadril = _arvore(co, tri, _grupo(nomes, dono, ("Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")))
        m["bracos_quadril"] = _distancia(bvh_quadril, co[bracos][::2], 0.3) * 1000
        m["mao_z"] = [(co[_grupo(nomes, dono, _mao(L))][:, 2].min() - TOPO) * 1000 for L, _ in dt.LADOS]
        m["mao_anda"] = max((p3.cabeca(rig, L + "HandMiddle1") - maos0[L]).length * 1000 for L, _ in dt.LADOS)
        bvh_pe = _arvore(co, tri, _grupo(nomes, dono, ("RightFoot", "RightToeBase")))
        m["pe_pe"] = _distancia(bvh_pe, co[_grupo(nomes, dono, ("LeftFoot", "LeftToeBase"))][::2], 0.3) * 1000
        return m

    def info():
        m = medidas()
        p = m["pele"]
        return ("pelve %.0f° pra trás desde t=0 | coxa além da vertical %+.0f° | coxa × pelve %.0f/%.0f° | pele acima do "
                "colchonete (mm): glúteo %.0f lombar %.0f T12-T8 %.0f T7-C7 %.0f cabeça %.0f cabelo %.0f | costas encostam y "
                "%.3f..%.3f | joelho × tronco E %.0f D %.0f mm | coxa × tronco cruzando E %.1f D %.1f mm (fora da virilha) | "
                "braços × quadril/pernas %.0f mm | mão E %.1f D %.1f mm do colchonete, andou %.1f mm | pé × pé %.1f mm" % (
                    m["pelve"], m["coxa"], m["coxa_pelve"][0], m["coxa_pelve"][1], p["Hips"], p["Spine"], p["Spine1"],
                    p["Spine2"], p["Head"], m["cabelo"], m["encosta"][0], m["encosta"][1], m["joelho_peito"][0],
                    m["joelho_peito"][1], m["coxa_tronco"][0], m["coxa_tronco"][1], m["bracos_quadril"], m["mao_z"][0],
                    m["mao_z"][1], m["mao_anda"], m["pe_pe"]))

    pose(0.0)
    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.1, 0.35),
                camera_video=((3.6, -0.5, 1.1), (0, 0.1, 0.35), 50), info=info, apoios=[colchonete],
                afunda_apoio_mm=20)
