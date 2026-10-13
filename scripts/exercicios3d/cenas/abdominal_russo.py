# Abdominal Russo (russian twist) — cena da fábrica 3D (lote 12, 11/10/2026).
# t = 0 tronco girado pra ESQUERDA · t = 0,5 de frente · t = 1 girado pra DIREITA (o app toca 0 → 1 e volta 1 → 0: a volta é o
# giro pro outro lado, alternando). Sentado no colchonete, joelhos dobrados a 90° e pés chapados, quase juntos e SOLTOS; tronco
# reclinado ~40° atrás da vertical (o "V" com as coxas) e PARADO; braços quase esticados na frente do peito, palma com palma; só o
# tórax gira (±40° em relação à pelve), levando os braços e a cabeça; a pelve, as pernas e os pés ficam parados.
# free-exercise-db (o fonte_en "Russian Twist"): "Elevate your upper body so that it creates an imaginary V-shape with your thighs.
# Your arms should be fully extended in front of you perpendicular to your torso and with the hands clasped." / "Twist your torso to
# the right side ..." / "Hold the contraction for a second ... Now move to the opposite side"; ACE (V-twist): "lean back at about a 45
# degree angle", "keep the knees bent about 90 degrees", "While maintaining a straight back, rotate the shoulders from side to side";
# ACE (Seated Medicine Ball Trunk Rotations): "knees bent, feet together, heels on the floor", "Pause briefly at the end range of
# motion", "prevent any arching in your low back"; NASM: "Sit on the floor with your knees bent and feet flat on the ground", "Lead
# with your shoulders".
# PÉS SOLTOS: o free-exercise-db prende os pés ("under something that will not move or by having a partner hold them"), o que pede
# uma peça que não existe; a ACE e a NASM não prendem → fica a que não pede peça (como no Abdominal Completo).
# TRONCO: o corpo inteiro reclina em volta das articulações do quadril (INCLINA) e a pelve reclina RETRO a mais, devolvidos na lombar
# (a lombar fica um pouco achatada, sem arquear — ACE): a pele de baixo do glúteo apoia mais pra trás e o centro de massa (Dempster/
# Winter, a tabela SEG da Barra Fixa) fica 21–28 mm pra dentro da base (glúteo + pés) em todo quadro (sem o RETRO, 4–14 mm).
# JOELHO 90 (ACE V-twist) e não os 100 do Completo: com 100 (e as mãos mais perto do peito) a margem ficava em 13–21 mm.
# GIRO: as 3 vértebras do rig giram em volta do próprio eixo, mais em cima (Spine2 ~T1–T7 50%, Spine1 ~T8–T12 35%, lombar 15% —
# Wilke 2017: a torácica de cima gira mais que a de baixo; Ichikawa 2024: a torácica gira ~30° na ressonância), até ±40° do tórax em
# relação à pelve (tecnica3d.tronco_giro): abaixo dos 48–49° do máximo sentado com as coxas presas (Sugaya 2014) e acima dos ~20° em
# que o oblíquo externo começa a trabalhar forte (Sugaya 2014; Torén 2001). A pelve (Hips) não mexe: o glúteo não gira nem escorrega.
# MÃOS: palma com palma (ACE, Russian Twist na bola suíça: "Hold the arms out straight in front of the chest with the palms touching
# each other"), montadas de frente (t = 0,5) por IK → FK e presas no tórax (o braço vira filho dele e vai junto no giro: as mãos ficam
# paradas uma em relação à outra); cada mão fecha FECHA° pro lado da outra e vira ROLA° pra cima — com as palmas paralelas só a base
# do polegar encostava e os dedos ficavam a 3–6 cm — e as duas se aproximam até o vão FOLGA_MAOS. Braços quase esticados (cotovelo
# ~30°): com as mãos perto do peito (cotovelo ~95°), palma com palma, o punho dobrava 54–57° pra trás (limite 55°); assim, ~15°.
# DIFERENTE do Abdominal Oblíquo com Pés no Banco e do Bicicleta (deitados: o tronco SOBE enrolando enquanto gira, com as mãos atrás
# da cabeça) e do Supra e do Completo (sobem sem girar): aqui é SENTADO, o tronco fica parado inclinado e só o giro mexe.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
import tecnica3d as tc
from cena import Cena
from abdominal_bicicleta import _congelar, _orientar, _grupo, _arvore, _entra
from abdominal_completo import _esticar_dedos, _mao, _distancia
from barra_fixa import SEG
from mergulho_nas_paralelas import centro_de_massa

TOPO = 0.012          # colchonete de 12 mm no chão (o do supra, do bicicleta, do oblíquo e do completo)
INCLINA = 40          # corpo inteiro reclinado em volta das articulações do quadril (graus atrás da vertical)
JOELHO = 90           # flexão do joelho (graus)
RETRO = 10            # a pelve reclina mais que o tórax e a lombar dobra o mesmo tanto (lombar achatada, sem arquear)
PE_X = 0.055          # tornozelo a 5,5 cm do meio: pés quase juntos (com 4,8 cm os tornozelos entravam 7 mm um no outro)
AFUNDA_PE = 0.001
AFUNDA_GLUTEO = 0.003
PESCOCO = 10          # queixo um pouco pra dentro (graus)
FRENTE = 0.50         # meio das palmas à frente da linha dos ombros (m, referencial do tórax)
BAIXO = 0.13          # e abaixo dela, ao longo do tórax (m)
ROLA = 7              # palma virada um pouco pra cima (graus, em volta do dedo): encosta o lado do mínimo também
FECHA = 15            # cada mão dobra os dedos pro lado da outra (graus): as palmas encostam também nos dedos, não só na base
FOLGA_MAOS = 0.0008   # vão entre as palmas (m)
POLO_COT = (0.30, 0.45, 0.0)   # polo do cotovelo em relação ao ombro: pra fora, pra baixo (ao longo do tórax), pra frente
GIRO = 42             # giro nas pontas (graus, + = pra esquerda), repartido nas vértebras: mede ±40° (tronco_giro)
GIRO_PARTE = (0.15, 0.35, 0.50)   # Spine (lombar), Spine1 (~T8–T12), Spine2 (~T1–T7)
OSSOS_G = ("Spine", "Spine1", "Spine2")


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos; aqui a mão não segura nada (não há fechar_em_volta)
    rig = bon.rig
    PB = rig.pose.bones
    colchonete = e3.caixa("colchonete", (0, 0.0, TOPO / 2), (0.62, 1.90, TOPO), e3.mat_estofado(), chanfro=0.004)
    tornozelo_z = p3.ponta(rig, "LeftLeg").z
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    c_ = lambda n: p3.cabeca(rig, n)

    def pele(partes):
        return dt.malha(bon, partes)

    j0 = ck.posicoes(rig)
    print("REPOUSO | tórax %.1f° do chão | coluna %.1f° | quadris (%.3f %.3f %.3f) | tronco giro %+.1f°" % (
        tc.torax_chao(j0)[0], tc.coluna(j0)[0], *((c_("LeftUpLeg") + c_("RightUpLeg")) / 2), tc.tronco_giro(j0)[0]))

    # ── sentado: corpo inteiro reclinado em volta das articulações do quadril ─────────────────────────────────────
    q = (c_("LeftUpLeg") + c_("RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-(INCLINA + RETRO)), pivo=q)
    p3.girar_osso(rig, "Spine", p3.rot_x(RETRO))

    d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(math.radians(JOELHO)))
    alvos, polos, iks = {}, {}, {}
    for lado, s in dt.LADOS:
        alvos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos[lado] = p3.vazio("polo_joelho_" + lado, p3.cabeca(rig, lado + "Leg") + Vector((0, -0.6, 0.3)))
        iks[lado] = p3.ik(rig, lado + "Leg", alvos[lado], polos[lado])
        p3.travar_rotacao(rig, lado + "Foot")

    def pernas(acertar=False):
        for lado, s in dt.LADOS:
            qq = c_(lado + "UpLeg")
            tz = TOPO + tornozelo_z - AFUNDA_PE
            dx, dz = s * PE_X - qq.x, tz - qq.z
            dy = math.sqrt(max(d * d - dx * dx - dz * dz, 1e-6))
            a = Vector((s * PE_X, qq.y - dy, tz))
            alvos[lado].location = a
            dd = a - qq
            cima = Vector((0, -dd.z, dd.y)).normalized()
            if cima.z < 0:
                cima.negate()
            polos[lado].location = (qq + a) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0))
        p3.atualizar()
        if acertar:
            for lado, _ in dt.LADOS:
                p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")

    pernas(acertar=True)
    CONTATO = ("Hips", "LeftUpLeg", "RightUpLeg")
    for _ in range(4):
        z = pele(CONTATO)[:, 2].min()
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA_GLUTEO - z)))
        pernas()
    pernas(acertar=True)
    p3.girar_osso(rig, "Neck", p3.rot_x(PESCOCO))
    j1 = ck.posicoes(rig)
    print("SENTADO | tórax %.1f° | pelve→pescoço %.1f° da vertical | quadril_sinal %s | joelho %s | glúteo %+.1f mm | "
          "quadris (%.3f %.3f %.3f)" % (
              tc.torax_chao(j1)[0], ck._ang(j1["Neck"] - j1["Hips"], (0, 0, 1)),
              tc.valores("quadril_sinal", tc.quadril_sinal(j1)),
              ["%.0f" % v for v in (ck.medir_juntas(rig)["joelhoE"], ck.medir_juntas(rig)["joelhoD"])],
              (pele(CONTATO)[:, 2].min() - TOPO) * 1000, *((c_("LeftUpLeg") + c_("RightUpLeg")) / 2)))

    # ── giro do tórax (as vértebras do rig giram em volta do próprio eixo; a pelve fica parada) ─────────────────────
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_G}
    acerto = [0.0]

    def tronco(t):
        u = 1 - 2 * t
        for n, M in base.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        for n, f in zip(OSSOS_G, GIRO_PARTE):
            if f:
                ax = (p3.ponta(rig, n) - p3.cabeca(rig, n)).normalized()
                p3.girar_osso(rig, n, Matrix.Rotation(math.radians((GIRO * u + acerto[0]) * f), 3, ax))

    giro = lambda: tc.tronco_giro(ck.posicoes(rig))[0]
    for _ in range(3):
        tronco(0.5)
        acerto[0] -= giro()
    tronco(0.0)
    g0 = giro()
    tronco(1.0)
    g1 = giro()
    tronco(0.5)
    print("GIRO acerto %+.1f° | meio %+.1f° | pontas %+.1f° / %+.1f°" % (acerto[0], giro(), g0, g1))

    # ── braços: mãos juntas (palma com palma) na frente do peito, montadas de frente (t = 0,5) e presas no tórax ────
    def torax():
        cima = (c_("Neck") - c_("Spine1")).normalized()
        lado = c_("RightShoulder") - c_("LeftShoulder")
        lado = (lado - cima * lado.dot(cima)).normalized()
        return cima, lado, cima.cross(lado)

    cima, lado_v, frente = torax()
    Smid = (c_("LeftArm") + c_("RightArm")) / 2
    C = Smid + frente * FRENTE - cima * BAIXO
    punhos, polos_b, iks_b = {}, {}, {}
    for lado, s in dt.LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos_b[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.5, 0, 0)))
        iks_b[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos_b[lado])
        _esticar_dedos(rig, lado)
    acertado = {}

    def ref(lado):
        return (c_(lado + "Hand") + c_(lado + "HandMiddle1")) / 2

    def braco(lado, s, P, voltas=10):
        out = -s * lado_v
        rola = math.radians(ROLA)
        palma_q = (-out * math.cos(rola) + cima * math.sin(rola)).normalized()
        fecha = math.radians(FECHA)
        dedos_q = (frente * math.cos(fecha) + palma_q * math.sin(fecha)).normalized()   # dedos pra frente do tórax
        S = c_(lado + "Arm")
        alvo = P - dedos_q * 0.05
        erro = Vector()
        for _ in range(voltas):
            iks_b[lado].mute = False
            punhos[lado].location = alvo
            polos_b[lado].location = S + out * POLO_COT[0] - cima * POLO_COT[1] + frente * POLO_COT[2]
            p3.atualizar()
            if lado not in acertado:
                acertado[lado] = p3.acertar_polo(rig, iks_b[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            _congelar(rig, iks_b[lado], lado)
            _orientar(rig, lado, dedos_q, palma_q)
            erro = P - ref(lado)
            alvo = alvo + erro
            if erro.length < 0.0003:
                break
        return erro.length

    def mao_mao():
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        mE = _grupo(nomes, dono, _mao("Left"))
        mD = _grupo(nomes, dono, _mao("Right"))
        return min(_entra(co, mE, _arvore(co, tri, mD), 0.1), _entra(co, mD, _arvore(co, tri, mE), 0.1)) / 1000

    w = 0.03
    erros = {}
    for volta in range(6):
        for lado, s in dt.LADOS:
            erros[lado] = braco(lado, s, C - s * lado_v * w)
        dm = mao_mao()
        print("MÃOS volta %d | meia distância %.1f mm | mão × mão %.2f mm | erro E %.1f D %.1f mm" % (
            volta, w * 1000, dm * 1000, erros["Left"] * 1000, erros["Right"] * 1000))
        if abs(dm - FOLGA_MAOS) < 0.0003:
            break
        w -= (dm - FOLGA_MAOS) / 2
    print("MÃOS | polo %s | mão × mão %.2f mm" % (acertado, mao_mao() * 1000))

    # ── medidas ─────────────────────────────────────────────────────────────────────────────────────────────────
    quadril0 = {L: c_(L + "UpLeg").copy() for L, _ in dt.LADOS}
    tornoz0 = {L: c_(L + "Foot").copy() for L, _ in dt.LADOS}
    massa = sum(m for m, _ in SEG.values()) + sum(m for k, (m, _) in SEG.items() if k not in ("tronco", "cabeca"))

    def centro_massa():
        tot = Vector()
        quadril = (c_("LeftUpLeg") + c_("RightUpLeg")) / 2
        ombros = (c_("LeftArm") + c_("RightArm")) / 2
        m, k = SEG["tronco"]
        tot += m * quadril.lerp(ombros, k)
        m, k = SEG["cabeca"]
        tot += m * c_("Head").lerp(p3.ponta(rig, "Head"), 0.4)
        for L, _ in dt.LADOS:
            for seg, a, b in (("braco", L + "Arm", L + "ForeArm"), ("antebraco", L + "ForeArm", L + "Hand"),
                              ("mao", L + "Hand", L + "HandMiddle1"), ("coxa", L + "UpLeg", L + "Leg"),
                              ("perna", L + "Leg", L + "Foot"), ("pe", L + "Foot", L + "ToeBase")):
                m, k = SEG[seg]
                tot += m * c_(a).lerp(c_(b), k)
        return tot / massa

    def casco(P):
        P = sorted(set(map(tuple, np.round(P, 4))))
        if len(P) < 3:
            return P

        def giro_(o, a, b):
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        baixo, alto = [], []
        for p in P:
            while len(baixo) >= 2 and giro_(baixo[-2], baixo[-1], p) <= 0:
                baixo.pop()
            baixo.append(p)
        for p in reversed(P):
            while len(alto) >= 2 and giro_(alto[-2], alto[-1], p) <= 0:
                alto.pop()
            alto.append(p)
        return baixo[:-1] + alto[:-1]

    def margem(H, p):
        """Distância (m) do ponto p até a borda do polígono convexo H (anti-horário): + = dentro."""
        menor = 1e9
        for i in range(len(H)):
            a, b = np.array(H[i]), np.array(H[(i + 1) % len(H)])
            e = b - a
            n = np.array([-e[1], e[0]]) / max(np.linalg.norm(e), 1e-9)
            menor = min(menor, float((np.array(p) - a) @ n))
        return menor

    def medidas():
        j = ck.posicoes(rig)
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = {"torax": tc.torax_chao(j)[0], "giro": tc.tronco_giro(j)[0], "coluna": tc.coluna(j)[0],
             "quadril": tc.quadril_sinal(j), "cabeca": (tc.cabeca_tronco(j) or [float("nan")])[0]}
        m["vertical"] = ck._ang(j["Neck"] - j["Hips"], (0, 0, 1))
        mE, mD = _grupo(nomes, dono, _mao("Left")), _grupo(nomes, dono, _mao("Right"))
        m["mao_mao"] = min(_entra(co, mE, _arvore(co, tri, mD), 0.1), _entra(co, mD, _arvore(co, tri, mE), 0.1))
        bracos = _grupo(nomes, dono, ("LeftArm", "LeftForeArm", "RightArm", "RightForeArm") + _mao("Left")
                        + _mao("Right"))
        pernas_m = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot",
                                        "LeftToeBase", "RightToeBase"))
        m["bracos_pernas"] = _distancia(_arvore(co, tri, pernas_m), co[bracos][::2], 0.3) * 1000
        m["mao_z"] = (co[mE | mD][:, 2].min() - TOPO) * 1000
        peE = _grupo(nomes, dono, ("LeftFoot", "LeftToeBase"))
        peD = _grupo(nomes, dono, ("RightFoot", "RightToeBase"))
        m["pes_vao"] = _distancia(_arvore(co, tri, peD), co[peE], 0.3) * 1000
        m["canelas_vao"] = _distancia(_arvore(co, tri, _grupo(nomes, dono, ("RightLeg",))),
                                      co[_grupo(nomes, dono, ("LeftLeg",))], 0.3) * 1000
        m["gluteo"] = (co[_grupo(nomes, dono, CONTATO)][:, 2].min() - TOPO) * 1000
        m["quadril_andou"] = max((c_(L + "UpLeg") - quadril0[L]).length * 1000 for L, _ in dt.LADOS)
        m["tornozelo_andou"] = max((c_(L + "Foot") - tornoz0[L]).length * 1000 for L, _ in dt.LADOS)
        cont = co[(co[:, 2] < TOPO + 0.003) & (_grupo(nomes, dono, CONTATO) | _grupo(nomes, dono, (
            "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")))]
        cm = centro_massa()
        H = casco(cont[:, :2])
        m["cm"] = cm
        m["cm_margem"] = margem(H, (cm.x, cm.y)) * 1000 if len(H) >= 3 else float("nan")
        cu = centro_de_massa(bon)
        m["cm_malha"] = cu
        m["cm_malha_margem"] = margem(H, (cu.x, cu.y)) * 1000 if len(H) >= 3 else float("nan")
        gl = co[(co[:, 2] < TOPO + 0.003) & _grupo(nomes, dono, CONTATO)]
        m["gluteo_y"] = (gl[:, 1].min(), gl[:, 1].max()) if len(gl) else (float("nan"), float("nan"))
        pe = co[(co[:, 2] < TOPO + 0.003) & _grupo(nomes, dono, ("LeftFoot", "RightFoot", "LeftToeBase",
                                                                  "RightToeBase"))]
        m["pe_y"] = (pe[:, 1].min(), pe[:, 1].max()) if len(pe) else (float("nan"), float("nan"))
        return m

    def info():
        m = medidas()
        return ("tórax %.0f° do chão | pelve→pescoço %.0f° da vertical | giro do tórax %+.0f° | coluna %.0f° | quadril_sinal "
                "%.0f/%.0f° | cabeça × tronco %.0f° | mão × mão %.1f mm | braços e mãos × pernas %.0f mm | mão %.0f mm acima "
                "do colchonete | pé × pé %.0f mm | canela × canela %.0f mm | glúteo %+.1f mm | junta do quadril andou %.1f mm | "
                "tornozelo andou %.1f mm | "
                "centro de massa (%.3f, %.3f) %+.0f mm dentro da base (malha uniforme: (%.3f, %.3f) %+.0f mm) (glúteo y "
                "%.3f..%.3f, pés y %.3f..%.3f)" % (
                    m["torax"], m["vertical"], m["giro"], m["coluna"], m["quadril"][0], m["quadril"][1], m["cabeca"],
                    m["mao_mao"], m["bracos_pernas"], m["mao_z"], m["pes_vao"], m["canelas_vao"], m["gluteo"],
                    m["quadril_andou"], m["tornozelo_andou"], m["cm"].x, m["cm"].y, m["cm_margem"], m["cm_malha"].x,
                    m["cm_malha"].y, m["cm_malha_margem"], *m["gluteo_y"], *m["pe_y"]))

    def pose(t):
        """t=0 tórax girado pra esquerda, t=0,5 de frente, t=1 girado pra direita (pelve e pernas paradas)."""
        tronco(t)

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.1, 0.35),
                camera_video=((-1.8, -3.2, 1.55), (0, -0.12, 0.38), 50), info=info, apoios=[colchonete],
                afunda_apoio_mm=20)
