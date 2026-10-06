# Abdominal Oblíquo com Pés no Banco — cena da fábrica 3D (lote 4, 06/10/2026).
# É o "Twisting Crunch" do ExRx: "Lie supine on mat with lower legs on bench. Place hands behind neck or head." /
# "Flex and twist waist to raise upper torso from mat to one side. Return until back of shoulders contact mat. Repeat to
# opposite side alternating twists." / "Leg elevation keeps pelvis tilted back keeping low back on mat."
# t = 0 sobe girando pra esquerda (cotovelo DIREITO em direção ao joelho ESQUERDO) · t = 0,5 volta, com a parte de trás
# dos ombros e as escápulas no colchonete · t = 1 sobe girando pra direita (cotovelo esquerdo → joelho direito). O app
# toca 0 → 1 e volta 1 → 0: a volta é a subida pro outro lado, alternando como no ExRx.
# Amplitude como a do abdominal supra aprovado (05/10/2026): só a parte de cima das costas enrola, até as escápulas
# saírem do chão — o tórax fica a ~31° do chão (ExRx, citando o ACSM: "elevation of the truck [tronco] to 30° is the
# important criteria"; Hildenbrand 2004: "the scapulae were lifted above the ground"), a lombar e o sacro no colchonete.
# Pernas: banco atravessado na ponta do colchonete, "to form a T shape" (Muscle & Strength, Twisting Bench Crunch),
# com a parte de baixo das panturrilhas e os calcanhares no estofado ("Your calves should be resting on the top of the
# bench and your legs should be bent at a right angle"): coxas quase na vertical e joelhos a ~97°. O banco é o reto da
# fábrica com as medidas de banco oficial (IPF Technical Rules Book 2026: altura de 42 a 45 cm, largura de 29 a 32 cm,
# comprimento de pelo menos 1,22 m). Pernas paradas (IK presa no banco) e pelve parada: a retroversão que as pernas no
# banco dão (ExRx) é fixa, com a lombar encostada no colchonete o tempo todo.
# Giro: só a parte de cima do tórax (Spine2, ~T7–C7) gira, ±33° em relação à pelve (Ichikawa 2024: rotação da coluna
# torácica de 29,9 ± 6,6° na ressonância e 35,4 ± 7,8° no teste com a lombar travada); a lombar e a pelve não giram (ACE,
# Supine Bicycle Crunches: "The rotation should come from your trunk and not your hips"). Enrolar e girar andam juntos
# (ExRx: "Flex and twist"): o giro é proporcional ao quanto o tórax subiu e os dois param embaixo (os ombros não rolam
# no chão).
# Mãos atrás da cabeça como no abdominal bicicleta (as funções vêm de cenas/abdominal_bicicleta.py): montadas em pé, com
# os dedos soltos encostando de leve atrás da orelha, sem entrelaçar; o braço vira filho do tórax e a cabeça fica na
# linha dele (pescoço neutro — ExRx: "keep their neck in neutral position with space between their chin and sternum,
# particularly with their hands are behind their heads"), então a mão segue a cabeça sem puxá-la (ACE, Supine Bicycle
# Crunches: "Do not pull forward on your head during the trunk curl. Support your head in your hands").
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import deitado3d as dt
import checagem3d as ck
from cena import Cena
from abdominal_bicicleta import maos_na_cabeca, giro_torax, _pontos, _grupo, _entra

TOPO = 0.012                  # colchonete de 12 mm no chão (o do supra e do bicicleta)
AFUNDA = 0.003                # pele das costas (escápulas) dentro do colchonete embaixo
BANCO_TOPO = 0.44             # topo do estofado do banco reto (IPF: 42–45 cm)
BANCO_Y = -0.37               # centro do estofado atravessado (30 cm de largura no Y: de −0,52 a −0,22, na ponta do
                              # colchonete): a borda de perto fica a ~1/2 da canela, embaixo da parte de baixo da
                              # panturrilha (a barriga da panturrilha fica ~12 cm abaixo do eixo da canela com o joelho a
                              # 90° e entraria 4 cm no estofado se ficasse em cima dele)
PE_X = 0.13                   # tornozelo a 13 cm do meio: pés um pouco mais abertos que o quadril (1,2×), joelhos pra cima
TORNOZELO_DY = 0.40           # tornozelo 40 cm à frente (−Y) da articulação do quadril: coxa quase na vertical
AFUNDA_BANCO = 0.004          # pele da panturrilha/calcanhar dentro do estofado (só apoiada)
PLANTAR = 20                  # pé solto, um pouco esticado (flexão plantar, graus)
CADEIA = (12, 20, 4.5, -12.5)  # deitado: retroversão da pelve em volta do sacro e flexão da lombar (Spine), do fim do
                              # tórax (Spine1) e do alto do tórax (Spine2), graus. Com a pelve parada no lugar de deitado,
                              # a curva da lombar do boneco deixava a pele 2 cm acima do colchonete; com a pelve 12° pra trás
                              # e a lombar dobrada a pele do meio das costas fica a 0–5 mm dele, do sacro às escápulas (a
                              # soma dá 0: o alto do tórax, os braços e a cabeça ficam como deitados)
CURL = (("Spine1", 21.5), ("Spine2", 8.5))   # flexão do tórax em cima (graus): tórax a ~31° do chão e a escápula do
                              # lado de baixo do giro ~12 mm fora do colchonete (com 23/9, 33° e 15 mm)
GIRO = 36                     # giro do alto do tórax em cima (graus, + = pra esquerda: o ombro direito sobe): mede ±33°
                              # do tórax em relação à pelve (giro_torax)
GIRO_PARTE = (0.0, 1.0)       # quanto do giro vai em cada vértebra do rig (Spine1, Spine2): o fim do tórax (~T8–T11), que
                              # fica perto do colchonete, não gira (girando, o lado de baixo das costas entrava no chão — a
                              # lição do bicicleta, lote 3)


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos; aqui a mão não segura nada (não há fechar_em_volta)
    rig = bon.rig
    PB = rig.pose.bones
    extras = [bon.cabelo]
    colchonete = e3.caixa("colchonete", (0, 0.43, TOPO / 2), (0.62, 1.30, TOPO), e3.mat_estofado(), chanfro=0.004)
    banco = e3.banco("banco", -0.61, 0.61, topo=BANCO_TOPO)     # 1,22 m; atravessado: gira 90° no chão
    banco.rotation_euler = (0, 0, math.radians(90))
    banco.location = (0, BANCO_Y, 0)
    p3.atualizar()

    def pele(partes):
        return dt.malha(bon, partes)

    # em pé: região das escápulas (igual à do bicicleta: costas entre a ponta de baixo da escápula, ~T7, e a espinha
    # dela, de 4 a 15 cm do meio), queixo (ponta de baixo do rosto) e fúrcula do esterno (alto do peito, no meio) — só
    # pro diagnóstico (info)
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    tronco_v = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2"))
    escap = {s_: tronco_v & (co[:, 1] > 0.0) & (co[:, 2] > 1.20) & (co[:, 2] < 1.40) & (s_ * co[:, 0] > 0.04)
             & (s_ * co[:, 0] < 0.15) for s_ in (1, -1)}
    i_cab = np.where(_grupo(nomes, dono, ("Head",)))[0]
    rosto = i_cab[co[i_cab][:, 1] < co[i_cab][:, 1].mean() - 0.03]
    i_queixo = rosto[np.argmin(co[rosto][:, 2])]
    i_peito = np.where(_grupo(nomes, dono, ("Spine2",)))[0]
    meio_peito = i_peito[(np.abs(co[i_peito][:, 0]) < 0.015) & (co[i_peito][:, 1] < -0.05)]
    i_furcula = meio_peito[np.argmax(co[meio_peito][:, 2])]
    maos = maos_na_cabeca(bon, extras)                         # em pé: o braço vira filho do tórax e vai junto
    for lado, o in maos.items():
        print("MÃOS NA CABEÇA %s | vão %.1f mm (palma %.1f) | punho %.0f° | dedos %s" % (
            lado, o["vao"], o["vao_palma"], o["punho"], o["dedos"]))

    # ── deitado de costas (cabeça pra +Y), pelve em retroversão e lombar no colchonete ──────────────────────────
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - pele(dt.TRONCO)[:, 2].min())))
    gl = pele(("Hips",))
    sacro = Vector(gl[np.argmin(gl[:, 2])])                     # onde o sacro encosta no colchonete
    sacro.x = 0.0
    R, x, w, v = CADEIA
    p3.girar_osso(rig, "Hips", p3.rot_x(-R), pivo=sacro)
    p3.girar_osso(rig, "Spine", p3.rot_x(x))
    p3.girar_osso(rig, "Spine1", p3.rot_x(w))
    p3.girar_osso(rig, "Spine2", p3.rot_x(v))
    z = pele(("Spine2",))[:, 2].min()                           # escápulas encostando no colchonete
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - z)))

    # ── pernas por IK: tornozelo em cima do banco, joelho pra cima; a altura do tornozelo é a que deixa a pele da
    # panturrilha/calcanhar AFUNDA_BANCO dentro do estofado ─────────────────────────────────────────────────────
    alvos, polos, iks = {}, {}, {}
    for lado, s in dt.LADOS:
        alvos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))     # alvo nasce no tornozelo de repouso
        polos[lado] = p3.vazio("polo_joelho_" + lado, p3.cabeca(rig, lado + "Leg") + Vector((0, 0, 0.6)))
        iks[lado] = p3.ik(rig, lado + "Leg", alvos[lado], polos[lado])
    tz = {lado: BANCO_TOPO + 0.06 for lado, _ in dt.LADOS}
    ty = {lado: p3.cabeca(rig, lado + "UpLeg").y - TORNOZELO_DY for lado, _ in dt.LADOS}

    def pernas(acertar=False):
        for lado, s in dt.LADOS:
            q = p3.cabeca(rig, lado + "UpLeg")
            a = Vector((s * PE_X, ty[lado], tz[lado]))
            alvos[lado].location = a
            dd = a - q
            cima = Vector((0, -dd.z, dd.y)).normalized()        # joelho no plano quadril → tornozelo, pra cima
            if cima.z < 0:
                cima.negate()
            polos[lado].location = (q + a) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0))
        p3.atualizar()
        if acertar:
            for lado, _ in dt.LADOS:
                p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")

    pernas(acertar=True)
    for lado, _ in dt.LADOS:
        p3.girar_osso(rig, lado + "Foot", p3.rot_x(PLANTAR))

    def no_banco(lado):
        return ck._zona_no_apoio(pele((lado + "Leg", lado + "Foot", lado + "ToeBase")), [banco], "banco")

    for volta in range(5):
        for lado, _ in dt.LADOS:
            tz[lado] += -AFUNDA_BANCO - no_banco(lado)
        pernas(acertar=(volta == 0))
    print("PERNAS | tornozelo y %.3f z E %.3f D %.3f | no banco E %.1f D %.1f mm" % (
        ty["Left"], tz["Left"], tz["Right"], no_banco("Left") * 1000, no_banco("Right") * 1000))

    base = {n: PB[p3.P + n].matrix_basis.copy() for n in ("Spine", "Spine1", "Spine2")}
    acerto = [0.0]                                             # giro que deixa as duas subidas iguais (rig assimétrico)

    def tronco(t):
        """Tórax enrolado e girado no quadro t (pelve, lombar e pernas paradas). u = 1 − 2t vai de +1 (em cima, girado
        pra esquerda) a −1 (em cima, pra direita) passando por 0 embaixo; o quanto sobe é u² e o giro u·|u| (= o quanto
        subiu, com o sinal do lado): os dois param juntos embaixo (velocidade zero, as escápulas encostam e voltam) e em
        cima (onde o app volta)."""
        u = 1 - 2 * t
        c, r = u * u, u * abs(u)
        for n, M in base.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        for n, g in CURL:
            p3.girar_osso(rig, n, p3.rot_x(g * c))
        for n, f in zip(("Spine1", "Spine2"), GIRO_PARTE):
            if f:
                ax = (p3.ponta(rig, n) - p3.cabeca(rig, n)).normalized()
                p3.girar_osso(rig, n, Matrix.Rotation(math.radians((GIRO * r + acerto[0] * c) * f), 3, ax))

    for _ in range(3):
        tronco(0.0)
        g0 = giro_torax(rig)
        tronco(1.0)
        g1 = giro_torax(rig)
        acerto[0] -= (g0 + g1) / 2 / 0.8
    tronco(0.0)
    g0 = giro_torax(rig)
    tronco(1.0)
    print("GIRO acerto %+.1f° | tórax em cima %+.1f° / %+.1f°" % (acerto[0], g0, giro_torax(rig)))

    def pose(t):
        """t=0 em cima girado pra esquerda (cotovelo direito → joelho esquerdo), t=0,5 embaixo (ombros no colchonete),
        t=1 em cima girado pra direita."""
        tronco(t)

    ED = {"Left": "E", "Right": "D"}

    def medidas():
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = {}
        m["escapula"] = {L: (co[escap[sg]][:, 2].min() - TOPO) * 1000 for L, sg in (("E", 1), ("D", -1))}
        meio = np.abs(co[:, 0]) < 0.03                         # meio das costas, do sacro ao fim do tórax, de 4 em 4 cm
        perfil = []
        for y0 in np.arange(-0.02, 0.30, 0.04):
            f = co[meio & (co[:, 1] > y0) & (co[:, 1] < y0 + 0.04) & (co[:, 2] < 0.10)]
            perfil.append(("%.0f" % ((f[:, 2].min() - TOPO) * 1000)) if len(f) else "-")
        m["perfil"] = " ".join(perfil)
        for k in ("Hips", "Spine", "Spine1", "Spine2", "Head"):
            m["z_" + k] = (co[_grupo(nomes, dono, (k,))][:, 2].min() - TOPO) * 1000
        bvh_cab = _pontos(bon, extras)[2]
        for L in ("Left", "Right"):
            mm = np.array([n.startswith(L + "Hand") for n in nomes] + [False])[dono]
            m["maoz" + ED[L]] = (co[mm][:, 2].min() - TOPO) * 1000
            m["mao" + ED[L]] = _entra(co, mm, bvh_cab)
            braco = _grupo(nomes, dono, (L + "Arm", L + "ForeArm"))
            m["bracoz" + ED[L]] = (co[braco][:, 2].min() - TOPO) * 1000
            m["banco" + ED[L]] = ck._zona_no_apoio(co[_grupo(nomes, dono, (L + "Leg", L + "Foot", L + "ToeBase"))],
                                                  [banco], "banco") * 1000
        for L, O in (("Left", "Right"), ("Right", "Left")):
            m["cot_joelho" + ED[L]] = (p3.cabeca(rig, L + "ForeArm") - p3.cabeca(rig, O + "Leg")).length * 1000
        m["giro"] = giro_torax(rig)
        m["queixo"] = np.linalg.norm(co[i_queixo] - co[i_furcula]) * 1000
        return m

    def info():
        m = medidas()
        j = ck.posicoes(rig)
        return ("tórax %.0f° do chão | giro do tórax %+.0f° | escápula E %.0f D %.0f mm do colchonete | pele acima do "
                "colchonete (mm): Hips %.1f Spine %.1f Spine1 %.1f Spine2 %.1f cabeça %.0f | meio das costas, do sacro "
                "ao fim do tórax (4 em 4 cm): %s | mão E %.0f D %.0f, braço E %.0f D %.0f mm acima do colchonete | mão × "
                "cabeça E %.1f D %.1f mm | panturrilha/calcanhar no banco E %.1f D %.1f mm | cotovelo → joelho do outro "
                "lado E %.0f D %.0f mm (centro a centro) | queixo × fúrcula %.0f mm" % (
                    ck.tc.torax_chao(j)[0], m["giro"], m["escapula"]["E"], m["escapula"]["D"], m["z_Hips"],
                    m["z_Spine"], m["z_Spine1"], m["z_Spine2"], m["z_Head"], m["perfil"], m["maozE"], m["maozD"],
                    m["bracozE"], m["bracozD"], m["maoE"], m["maoD"], m["bancoE"], m["bancoD"], m["cot_joelhoE"],
                    m["cot_joelhoD"], m["queixo"]))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.1, 0.3),
                camera_video=((2.7, 1.1, 1.6), (0, 0.1, 0.3), 50), info=info, apoios=[colchonete, banco],
                afunda_apoio_mm=20)
