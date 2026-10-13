# Elevação de Pernas Suspenso na Barra (hanging leg raise) — cena da fábrica 3D (lote 12, 11/10/2026). A MESMA barra fixa da Barra Fixa
# (lote 2), sem mudar nada nela: equip3d.barra_fixa (barra de aço de 32 mm, 2 braços horizontais que vêm de 2 colunas 45 cm à frente). O
# jeito de pendurar é o das cenas da Barra Fixa e da Barra Fixa Supinada: as mãos ficam paradas na barra, o corpo é posto osso a osso direto
# na matrix_basis (um update por passo) e o Hips translada; o centro de massa fica embaixo da barra em todo quadro (pendurado parado, sem
# balanço, é a única posição de equilíbrio — massas e centros dos segmentos de Dempster adaptados por Winter, a tabela SEG da Barra Fixa).
# O que é deste exercício (fontes no fontes.md do rascunho e na ficha):
# - t = 0 pendurado com os braços estendidos acima da cabeça, as pernas retas pra baixo e a pelve um pouco retrovertida — free-exercise-db
#   (o fonte_en do catálogo), Hanging Leg Raise: "Hang from a chin-up bar with both arms extended at arms length in top of you using
#   either a wide grip or a medium grip. The legs should be straight down with the pelvis rolled slightly backwards."
# - t = 1 o quadril e os JOELHOS dobrados: as coxas um pouco acima da horizontal e os joelhos a ~90°, com as canelas penduradas — ExRx,
#   Hanging Leg Raise ("Raise legs by flexing hips and knees until hips are completely flexed or knees are well above hips"; "Also known
#   as Hanging Knee Raise") e a foto de cima do free-exercise-db (coxas ~20° acima da horizontal e joelhos a ~90°, medido na foto; o texto
#   dele: "Raise your legs until the torso makes a 90-degree angle with the legs"). O joelho dobra um pouco antes do quadril (os pés
#   ficam atrás dos joelhos no meio da subida, como na animação do ExRx) e as canelas terminam quase na vertical.
# - só o QUADRIL dobra: a coluna não enrola (a pelve fica com a mesma retroversão do começo ao fim) — no ExRx o enrolar da cintura é outro
#   exercício, o Leg-Hip Raise ("Rectus Abdominis and Obliques only contract dynamically if actual waist flexion occurs. With no waist
#   flexion, Rectus Abdominis and External Oblique will only act to stabilize pelvis and waist during hip flexion.").
# - braços estendidos e ombros pendurados o tempo todo (não há puxada); pegada pronada um pouco mais aberta que os ombros (ExRx: "Grasp and
#   hang from high bar with slightly wider than shoulder width overhand grip.").
# - SEM balanço: com as pernas indo à frente, o corpo inteiro vai pra trás (o tronco continua de pé, como na foto de cima do free-exercise-db)
#   e os braços inclinam, até o centro de massa voltar pra baixo da barra.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import bpy
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

RAIO = 0.016            # barra de 32 mm (1,25"), a da Barra Fixa (TITAN: "Overall Diameter 1.25-in.")
MEIA = 0.75             # meia distância entre os braços que seguram a barra (a mesma barra fixa)
RECUO = 0.45            # colunas 45 cm à frente da barra (a mesma barra fixa): quem pendura fica de frente pra elas
BIACROMIAL_ALTURA = 40.3 / 172.5   # largura biacromial ÷ altura (Lee & Lim 2017, Tabela 1, homens), como na Barra Fixa Supinada
PEGADA = 1.25           # vão a vão das mãos ÷ largura biacromial: "slightly wider than shoulder width overhand grip" (ExRx); "medium grip"
                        # (free-exercise-db) — a Barra Fixa (pull-up aberta) usa 1,5 (Snarr 2017)
Y_BAR = 0.0             # barra no Y = 0 (o boneco olha pra −Y, pras colunas)
PE_FOLGA = 0.06         # pele mais baixa dos pés acima do chão no pendurado (m): pés soltos, fora do chão (o da Barra Fixa)
COTOVELO0 = 6           # flexão do cotovelo o tempo todo (graus): braços estendidos sem travar ("both arms extended at arms length")
ELEVA = 20              # escápula subida (graus, em volta do eixo frente-trás): o ombro pendurado da pose de baixo da Barra Fixa, o tempo todo
RETRO = 10              # retroversão da pelve (graus), parada do começo ao fim: "the pelvis rolled slightly backwards" (free-exercise-db); a
                        # lombar dobra o mesmo tanto pro tórax ficar onde estava e as coxas estendem o mesmo tanto pras pernas ficarem retas
                        # pra baixo
QUADRIL = 96            # flexão do quadril em cima (graus a mais, coxa × tronco): mede ~99° e as coxas ficam ~9° acima da horizontal, os
                        # joelhos acima do quadril — entre o texto do free-exercise-db ("the torso makes a 90-degree angle with the legs") e a
                        # foto dele / o ExRx ("knees are well above hips"). Mais que isso a coxa entra na barriga do boneco (sonda de 11/10:
                        # 99° = 0 mm; 100° = 7,7 mm; 108° = 8–9 mm, a 15–17 cm da junta do quadril, fora da dobra da virilha)
JOELHO = 87             # flexão do joelho em cima (graus a mais que os ~7° do repouso): ~93° (foto do free-exercise-db, ~90°; ExRx "flexing
                        # hips and knees"), com a canela quase na vertical ("keeping your lower legs perpendicular to the floor", Healthline)
JOELHO_ANTES = 10       # o joelho dobra até isso a mais que a parte dele no meio da subida (graus × sen(π·t)): os pés ficam um pouco atrás dos
                        # joelhos no meio, como na animação do ExRx, e a canela continua perto da vertical
INCLINA = 2             # o tronco gira isso em cima (graus; + = o quadril vai pra trás da linha dos ombros): fica de pé, como na foto de cima do
                        # free-exercise-db (ombro e quadril na mesma vertical, medido nela) e na animação do ExRx; o centro de massa volta pra
                        # baixo da barra com o corpo inteiro indo pra trás e os braços inclinando
PLANTAR = 20            # pés soltos, a ponta um pouco pra baixo (flexão plantar, graus), como na Barra Fixa
FECHA_PERNA = 2         # cada perna fecha um pouco em relação à base de repouso (graus): pernas paralelas, sem cruzar (a da Barra Fixa)
ALINHAR = 0.2           # quanto os dedos seguem o antebraço em vez de apontar pra cima (o da Barra Fixa)
DEDOS_Q = Vector((0, 0, 1))      # dedos pra cima
PALMA_Q = Vector((0, -1, 0))     # pegada pronada: palma pra frente (pras colunas)
POLO = (0.35, 0.0, -0.6)         # polo do cotovelo em relação ao ombro (m: pra fora, pra trás, pra cima), o da Barra Fixa: o cotovelo quase
                                 # reto aponta pra fora
VINCO_QUADRIL = 0.10    # coxa × barriga (e × pele da pelve) até 10 cm da junta do quadril = dobra da virilha (não conta), como no Abdominal
                        # Bicicleta
VINCO_JOELHO = 0.09     # panturrilha × coxa até 9 cm do centro do joelho = dobra de trás do joelho (não conta)
LADOS = (("Left", 1), ("Right", -1))
# Dempster adaptado por Winter (2009), tabela do BMClab (Duarte M., "Body segment parameters"): fração da massa e
# posição do centro a partir da ponta de cima do segmento
SEG = {"tronco": (0.497, 0.5), "cabeca": (0.081, 1.0), "braco": (0.028, 0.436), "antebraco": (0.016, 0.430),
       "mao": (0.006, 0.506), "coxa": (0.100, 0.433), "perna": (0.0465, 0.433), "pe": (0.0145, 0.5)}
CORPO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder",
         "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot")
PES = ("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase")


def _cruza(co, tri, ma, mb, junta=None, raio=0.0):
    """Quanto a pele A entra na pele B (mm, 0 = não cruza), só onde os triângulos se cruzam de verdade (o jeito do
    checagem3d.corpo_x_corpo e do Abdominal Bicicleta); perto da `junta` (até `raio` m) é o vinco normal e não conta. Devolve (mm, cm
    da junta)."""
    ta, tb = tri[ma[tri].all(axis=1)], tri[mb[tri].all(axis=1)]
    if not len(ta) or not len(tb):
        return 0.0, 0.0
    ba = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in ta], all_triangles=True)
    bb = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tb], all_triangles=True)
    pares = ba.overlap(bb)
    fundo, onde = 0.0, 0.0
    for i in np.unique(ta[[p_[0] for p_ in pares]].ravel()) if pares else ():
        v = Vector(co[i])
        longe = (v - junta).length if junta is not None else 0.0
        if junta is not None and longe < raio:
            continue
        loc, nor, idx, dist = bb.find_nearest(v, 0.03)
        if loc is not None and (v - loc).dot(nor) < 0 and dist > fundo:
            fundo, onde = dist, longe
    return fundo * 1000, onde * 100


def montar(bon):
    pg.usar_polegar("volta")                             # polegar dando a volta na barra (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)                        # mão de referência de 32 mm (Shimawaki 2019, interpolada), antes do Maos
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    # ── a pegada: PEGADA × a largura biacromial do boneco (pela altura dele, em pé, antes de pendurar) ─────────────────────────────
    co0 = ck._avaliar(bon.corpo, 1)[0]
    altura = float(co0[:, 2].max() - co0[:, 2].min())
    biacromial = BIACROMIAL_ALTURA * altura
    meia_pegada = PEGADA * biacromial / 2                # do meio da barra ao vão de cada mão
    ombros0 = (c("LeftArm") - c("RightArm")).length
    print("PEGADA | altura do boneco %.3f m → largura biacromial %.3f m (Lee & Lim 2017: 40,3/172,5) | vão de cada mão a %.3f m do meio "
          "da barra (%.2f × biacromial) | entre as articulações dos ombros %.3f m (pegada_largura esperada %.2f)" % (
              altura, biacromial, meia_pegada, PEGADA, ombros0, 2 * meia_pegada / ombros0), flush=True)

    Lb = (c("LeftForeArm") - c("LeftArm")).length       # braço
    La = (c("LeftHand") - c("LeftForeArm")).length      # antebraço
    Yo = Vector((0, 1, 0))

    def pelve_torax():
        """Pelve (osso Hips) × tórax (osso Spine1) no plano sagital, graus (+ = a pelve inclinada pra trás em relação ao tórax)."""
        pel = p3.mundo_osso(rig, "Hips").to_3x3() @ Yo
        tor = p3.mundo_osso(rig, "Spine1").to_3x3() @ Yo
        return math.degrees(math.atan2(pel.cross(tor).x, pel.dot(tor)))

    pelve0 = pelve_torax()                               # no repouso (os 2 ossos não são paralelos no boneco)
    pivo = (c("LeftUpLeg") + c("RightUpLeg")) / 2        # pelve e tronco giram em volta das articulações do quadril
    repouso = {n: rig.data.bones[p3.P + n].matrix_local.copy() for n in CORPO}
    ombro0 = {l: rig.data.bones[p3.P + l + "Arm"].head_local.copy() for l, _ in LADOS}   # articulação do ombro no repouso
    extras = [o for o in bpy.data.objects if o.type == "MESH" and o is not bon.corpo and o.parent is rig]
    maos = Maos(bon, RAIO, polegar_modo="volta")
    zb = [2.2]                                           # altura do eixo da barra (acertada pelos pés, abaixo)

    def pegadas():
        return {l: Vector((s * meia_pegada, Y_BAR, zb[0])) for l, s in LADOS}

    def base(nome, R, pivo_=None, mover=Vector()):
        """matrix_basis do osso girado R (mundo, com o pai no repouso) em volta do pivô (padrão: a cabeça dele) e
        deslocado `mover`. Com o pai girado, o giro vai junto no referencial do pai (é o mesmo jeito do girar_osso)."""
        M = repouso[nome]
        h = M.to_translation() if pivo_ is None else Vector(pivo_)
        return M.inverted() @ Matrix.Translation(h + mover) @ R.to_4x4() @ Matrix.Translation(-h) @ M

    # ── perfis no tempo (t já vem suavizado pelo exportador) ──────────────────────────────────────────────────────────────────────
    def perfil(t):
        return dict(quadril=QUADRIL * t, joelho=JOELHO * t + JOELHO_ANTES * math.sin(math.pi * t), inclina=INCLINA * t)

    def corpo(t, dy=0.0, dz=0.0):
        """Pelve retrovertida, tronco inclinado, escápulas, pernas e o corpo todo deslocado (dy, dz) — os braços vêm depois."""
        f = perfil(t)
        for n in ("Spine1", "Spine2", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        # pelve: retroversão (− = a parte de cima vai pra trás) + o tronco inclinado (+ = a parte de cima vai à frente do quadril, o
        # quadril fica pra trás), as 2 em volta das articulações do quadril; a lombar (Spine) desfaz a retroversão (o tórax fica com a
        # inclinação do tronco)
        PB[p3.P + "Hips"].matrix_basis = base("Hips", p3.rot_x(f["inclina"] - RETRO), pivo, Vector((0, dy, dz)))
        PB[p3.P + "Spine"].matrix_basis = base("Spine", p3.rot_x(RETRO))
        for lado, s in LADOS:
            # escápula subida (o ombro pendurado), em volta do eixo frente-trás na base do osso Shoulder; o que sobra de lado vira
            # deslize da base do osso (como na Barra Fixa)
            R = Matrix.Rotation(math.radians(-s * ELEVA), 3, Yo)
            h = repouso[lado + "Shoulder"].to_translation()
            girado = h + R @ (ombro0[lado] - h)
            PB[p3.P + lado + "Shoulder"].matrix_basis = base(lado + "Shoulder", R, None, Vector((ombro0[lado].x - girado.x, 0, 0)))
            # coxa: desfaz a retroversão (pernas retas pra baixo em t = 0) e dobra o quadril (− = a coxa vai à frente), fechando um pouco
            R = p3.rot_x(RETRO - f["quadril"]) @ Matrix.Rotation(math.radians(s * FECHA_PERNA), 3, Yo)
            PB[p3.P + lado + "UpLeg"].matrix_basis = base(lado + "UpLeg", R)
            PB[p3.P + lado + "Leg"].matrix_basis = base(lado + "Leg", p3.rot_x(f["joelho"]))
            PB[p3.P + lado + "Foot"].matrix_basis = base(lado + "Foot", p3.rot_x(PLANTAR))
        p3.atualizar()

    def centro_massa(g, bracos_reais=False):
        """Centro de massa (Dempster/Winter). Sem os braços postos (bracos_reais=False), cada braço inteiro fica na reta
        ombro → vão da mão, a 42% do ombro (onde fica o centro dele com o cotovelo estendido)."""
        tot = Vector()
        quadril = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        ombros = (c("LeftArm") + c("RightArm")) / 2
        m, k = SEG["tronco"]
        tot += m * quadril.lerp(ombros, k)
        m, k = SEG["cabeca"]                             # do C7/T1 ao ouvido, centro no ouvido (~0,4 do osso Head)
        tot += m * c("Head").lerp(p3.ponta(rig, "Head"), 0.4)
        for lado, _ in LADOS:
            S = c(lado + "Arm")
            if bracos_reais:
                for seg, a, b in (("braco", lado + "Arm", lado + "ForeArm"), ("antebraco", lado + "ForeArm", lado + "Hand"),
                                  ("mao", lado + "Hand", lado + "HandMiddle1")):
                    m, k = SEG[seg]
                    tot += m * c(a).lerp(c(b), k)
            else:
                tot += 0.05 * S.lerp(g[lado], 0.42)
            for seg, a, b in (("coxa", lado + "UpLeg", lado + "Leg"), ("perna", lado + "Leg", lado + "Foot"),
                              ("pe", lado + "Foot", lado + "ToeBase")):
                m, k = SEG[seg]
                tot += m * c(a).lerp(c(b), k)
        return tot

    def no_lugar(t, dz):
        """Corpo no quadro t com o centro de massa embaixo da barra (2 voltas: o braço inteiro anda 58% com o ombro)."""
        g = pegadas()
        dy = 0.0
        for _ in range(2):
            corpo(t, dy, dz)
            dy += (Y_BAR - centro_massa(g).y) / 0.958
        corpo(t, dy, dz)
        return dy

    # ── punho em relação ao vão da mão com os dedos pra cima e a palma pra frente (pra conta do cotovelo) ──────────────────────────────
    corpo(0.0, 0.0, 0.6)
    off = {}
    for lado, s in LADOS:
        S = c(lado + "Arm")
        g = S + Vector((s * 0.06, 0.0, 0.5))
        maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S + Vector((s * POLO[0], POLO[1], POLO[2])))
        off[lado] = g - c(lado + "Hand")
        nos = pg._base(rig, lado)[1]
        print("VÃO − PUNHO %s (%.3f %.3f %.3f) | nós dos dedos × barra %.1f° | erro do vão %.1f mm | braço %.4f antebraço %.4f" % (
            lado, *off[lado], math.degrees(min(nos.angle(Vector((1, 0, 0))), nos.angle(Vector((-1, 0, 0))))),
            maos.erro[lado] * 1000, Lb, La), flush=True)
    d_reto = math.sqrt(Lb * Lb + La * La + 2 * Lb * La * math.cos(math.radians(COTOVELO0)))   # ombro → punho com o cotovelo a COTOVELO0
    acerto = [0.0]                                       # o que os braços de verdade (mão seguindo o antebraço) pedem a mais no dz

    def no_lugar_reto(t, dz_chute=0.6):
        """Corpo no quadro t com o centro de massa embaixo da barra e o cotovelo mais esticado dos 2 a COTOVELO0: o dz sai direto da
        distância ombro → punho (o deslocamento vertical não muda o centro de massa em Y, então o dy vale pros 2)."""
        dy = no_lugar(t, dz_chute)
        g = pegadas()
        sobe = -1e9
        for lado, _ in LADOS:
            S = c(lado + "Arm")
            alvo = g[lado] - off[lado]
            h2 = d_reto * d_reto - (alvo.x - S.x) ** 2 - (alvo.y - S.y) ** 2
            sobe = max(sobe, alvo.z - math.sqrt(max(h2, 0.0)) - S.z)
        dz = dz_chute + sobe + acerto[0]
        corpo(t, dy, dz)
        return dy, dz

    def pele(partes, niveis=1):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
        return co[np.array([n in partes for n in nomes] + [False])[dono]]

    def polo(lado, s, t):
        a = math.radians(perfil(t)["inclina"])          # eixos do tronco inclinado (+ = a parte de cima vai à frente)
        tras, cima = Vector((0, math.cos(a), math.sin(a))), Vector((0, -math.sin(a), math.cos(a)))
        return c(lado + "Arm") + Vector((s * POLO[0], 0, 0)) + tras * POLO[1] + cima * POLO[2]

    def bracos(t):
        """Os 2 braços até as mãos na barra. O IK parte sempre do braço de repouso (cotovelo dobrado pra frente, como o
        do corpo): partindo do quadro anterior, o braço podia girar no próprio eixo e o cotovelo dobrar de lado."""
        g = pegadas()
        for lado, s in LADOS:
            for n in ("Arm", "ForeArm", "Hand"):
                PB[p3.P + lado + n].matrix_basis = Matrix()
            p3.atualizar()
            maos.segurar(lado, g[lado], DEDOS_Q, PALMA_Q, polo=polo(lado, s, t), alinhar=ALINHAR)

    def acertar_polos(t):
        for lado, _ in LADOS:
            for n in ("Arm", "ForeArm", "Hand"):
                PB[p3.P + lado + n].matrix_basis = Matrix()
            maos.iks[lado].mute = False
            e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            print("polo cotovelo", lado, "erro %.3f ang %d" % e, flush=True)
        bracos(t)

    def cotovelo_min():
        j = ck.medir_juntas(rig)
        return min(j["cotoveloE"], j["cotoveloD"])

    # 1º chute (conta com o punho da mão fixa): pés PE_FOLGA acima do chão → barra e corpo sobem juntos (nada muda nos braços)
    no_lugar_reto(0.0)
    zb[0] += PE_FOLGA - pele(PES)[:, 2].min()
    no_lugar_reto(0.5)
    bracos(0.5)
    acertar_polos(0.5)                                   # polo certo do cotovelo no meio do movimento
    # braços de verdade (a mão segue o antebraço ALINHAR): acerto do dz pro cotovelo medido ficar em COTOVELO0 (bissecção em t = 0)
    lo, hi = -0.05, 0.05
    for _ in range(16):
        acerto[0] = (lo + hi) / 2
        no_lugar_reto(0.0)
        bracos(0.0)
        if cotovelo_min() < COTOVELO0 or max(maos.erro.values()) > 0.002:
            lo = acerto[0]
        else:
            hi = acerto[0]
    acerto[0] = hi
    no_lugar_reto(0.0)
    zb[0] += PE_FOLGA - pele(PES)[:, 2].min()
    _, dz0 = no_lugar_reto(0.0)
    print("BARRA eixo em z %.3f (pés %.0f mm do chão no pendurado) | acerto do dz pelos braços de verdade %+.1f mm | corpo dz %.3f "
          "embaixo" % (zb[0], PE_FOLGA * 1000, acerto[0] * 1000, dz0), flush=True)

    barra = e3.barra_fixa("barra_fixa", altura=zb[0], meia=MEIA, raio=RAIO, recuo=RECUO)
    barra.location = (0, Y_BAR, zb[0])
    p3.atualizar()

    def pose(t):
        """t=0 pendurado com as pernas retas pra baixo, t=1 quadril e joelhos dobrados (coxas um pouco acima da horizontal)."""
        pose.dy, pose.dz = no_lugar_reto(t)
        bracos(t)
        for lado, _ in LADOS:                             # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, Vector((0, Y_BAR, zb[0])), Vector((1, 0, 0)), RAIO,
                                                  polegar_antes=antes)

    pose.dedos = {}
    pose.dy = pose.dz = 0.0

    # ── medidas à parte (a checagem ignora o que fica dentro da mão e não tem coxa × tronco nem panturrilha × coxa) ─────────────────────
    pecas = {o.name: o for o in [barra] + list(barra.children_recursive) if o.type == "MESH"}
    estrutura = [o for n, o in pecas.items() if n != "barra_fixa_barra"]
    E_amostras = {o.name: ck._amostras(*ck._avaliar_simples(o), 0.01) for o in estrutura}   # a barra fixa não mexe
    travessa = ck._avaliar_simples(pecas["barra_fixa_travessa"])[0]
    trav_topo, trav_y = float(travessa[:, 2].max()), (float(travessa[:, 1].min()), float(travessa[:, 1].max()))

    def _sinal(bvh, pts):
        menor = 1e9
        for p in pts:
            v = Vector(p)
            loc, nor, idx, dist = bvh.find_nearest(v)
            if loc is not None:
                menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
        return menor

    def medidas():
        """mm: mão × barra (a pele que entra no tubo: − = entrou; a pegada aperta ~1,5–2,5 mm), mão × estrutura da barra fixa, mão × mão,
        braço/mão × cabeça+cabelo, perna/pé × estrutura (colunas, braços, pés, travessa), ponta do pé × topo da travessa quando passa
        em cima dela, coxa × barriga e coxa × pele da pelve (fora de 10 cm da junta do quadril) e panturrilha × coxa (fora da dobra do
        joelho). A coxa × pele da pelve com o quadril a ~90° é a dobra da virilha entre as coxas, perto do púbis: o boneco não tem colisão
        de pele ali e ela cruza 10–15 mm em todo exercício com o quadril a ~90° (Elevação de Pernas, Desenvolvimento com Halteres, Cadeira
        Extensora — sonda de 11/10/2026)."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        grupo = lambda partes: np.array([n in partes for n in nomes] + [False])[dono]
        out = {}
        bvh_cab = ck._bvh(co, tri[grupo(("Head", "Neck"))[tri].all(axis=1)])
        cabelo = getattr(bon, "cabelo", None)
        bvh_cb = ck._bvh(*ck._avaliar_simples(cabelo)) if cabelo is not None else None
        E = np.concatenate(list(E_amostras.values()))
        maos_v = {}
        for L, s in LADOS:
            mao = grupo(tuple(n for n in nomes if n.startswith(L + "Hand")))
            maos_v[L] = mao
            H = co[mao]
            out["barra" + L[0]] = float((np.hypot(H[:, 1] - Y_BAR, H[:, 2] - zb[0]) - RAIO).min()) * 1000
            perto = E[((E >= H.min(axis=0) - 0.3) & (E <= H.max(axis=0) + 0.3)).all(axis=1)]
            out["estr" + L[0]] = (_sinal(ck._bvh(co, tri[mao[tri].all(axis=1)]), perto) * 1000) if len(perto) else 300.0
            braco = grupo(tuple(n for n in nomes if n.startswith(L + "Hand") or n in (L + "Arm", L + "ForeArm")))
            Pb = co[braco]
            d = _sinal(bvh_cab, Pb[::3])
            if bvh_cb is not None:
                d = min(d, float(min(bvh_cb.find_nearest(Vector(p))[3] for p in Pb[::3])))
            out["cab" + L[0]] = d * 1000
            perna = grupo((L + "UpLeg", L + "Leg", L + "Foot", L + "ToeBase"))
            Pp = co[perna]
            perto = E[((E >= Pp.min(axis=0) - 0.3) & (E <= Pp.max(axis=0) + 0.3)).all(axis=1)]
            out["pernaestr" + L[0]] = (_sinal(ck._bvh(co, tri[perna[tri].all(axis=1)]), perto) * 1000) if len(perto) else 300.0
            pe = co[grupo((L + "Foot", L + "ToeBase"))]
            em_cima = pe[(pe[:, 1] >= trav_y[0] - 0.01) & (pe[:, 1] <= trav_y[1] + 0.01)]
            out["trav" + L[0]] = (float(em_cima[:, 2].min()) - trav_topo) * 1000 if len(em_cima) else None
            out["coxatr" + L[0]] = _cruza(co, tri, grupo((L + "UpLeg",)), grupo(("Spine", "Spine1", "Spine2")),
                                          c(L + "UpLeg"), VINCO_QUADRIL)
            out["coxapel" + L[0]] = _cruza(co, tri, grupo((L + "UpLeg",)), grupo(("Hips",)), c(L + "UpLeg"), VINCO_QUADRIL)
            out["pantcoxa" + L[0]] = _cruza(co, tri, grupo((L + "Leg",)), grupo((L + "UpLeg",)), c(L + "Leg"), VINCO_JOELHO)
            out["pe" + L[0]] = tuple(float(x) for x in (pe.min(axis=0) + pe.max(axis=0)) / 2)
        out["mm"] = _sinal(ck._bvh(co, tri[maos_v["Right"][tri].all(axis=1)]), co[maos_v["Left"]][::2]) * 1000
        return out

    def angulos():
        """Graus: braço (ombro → punho) × vertical, tronco (quadril → pescoço) × vertical (+ = quadril atrás da linha dos ombros),
        coxa acima da horizontal, canela à frente da vertical (+ = pé à frente do joelho), pelve × tórax (retroversão)."""
        out = {}
        for L, _ in LADOS:
            b = c(L + "Hand") - c(L + "Arm")
            out["braco" + L[0]] = math.degrees(math.atan2(-b.y, b.z))          # + = punho à frente (−Y) do ombro
            k = c(L + "Leg") - c(L + "UpLeg")
            out["coxa" + L[0]] = math.degrees(math.atan2(k.z, -k.y))          # acima da horizontal, olhando pra frente
            p = c(L + "Foot") - c(L + "Leg")
            out["canela" + L[0]] = math.degrees(math.atan2(-p.y, -p.z))
        tr = c("Neck") - c("Hips")
        out["tronco"] = math.degrees(math.atan2(-tr.y, tr.z))                 # + = pescoço à frente do quadril
        out["pelve"] = pelve_torax() - pelve0                                 # retroversão em relação ao repouso
        return out

    def info():
        """Centro de massa × barra, inclinações, polegar e as medidas à parte."""
        g = pegadas()
        cm = centro_massa(g, bracos_reais=True)
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        mm = medidas()
        an = angulos()

        def pol(lado):
            v = pose.dedos.get(lado, {}).get("Thumb", ())
            return str(tuple(round(float(x), 2) if isinstance(x, float) else x for x in v) if isinstance(v, tuple) else v)
        fmt = lambda nome, f_="%.0f": "/".join(f_ % v for v in tc.MEDIDAS[nome](jj))
        trav = lambda v: "-" if v is None else "%+.0f" % v
        return (maos.info() + " | centro de massa − barra %+.0f mm (frente−/trás+) | corpo dy %+.3f dz %.3f | cotovelo %.0f/%.0f° | "
                "quadril %.0f/%.0f° | joelho %.0f/%.0f° | coxa acima da horizontal %+.0f/%+.0f° | canela à frente da vertical %+.0f/%+.0f° | "
                "tronco %+.1f° (quadril atrás +) | braço × vertical %+.1f/%+.1f° (punho à frente +) | pelve × tórax %+.1f° | "
                "elevação %s° | palma × frente %s° | punho flexão %s° desvio %s° | pegada %.2f | coluna %s° | cabeça %s° | "
                "mão × barra E %+.1f D %+.1f mm | mão × estrutura E %.0f D %.0f mm | braço/mão × cabeça E %+.1f D %+.1f mm | "
                "mão × mão %.0f mm | perna/pé × estrutura E %.0f D %.0f mm | pé − topo da travessa E %s D %s mm | coxa × barriga "
                "cruzando E %.1f (%.0f cm) D %.1f (%.0f cm) mm | coxa × pele da pelve (dobra da virilha entre as coxas) E %.1f (%.0f cm) "
                "D %.1f (%.0f cm) mm | panturrilha × coxa cruzando E %.1f (%.0f cm) D %.1f (%.0f cm) mm | "
                "pé E (%.3f %.3f %.3f) D (%.3f %.3f %.3f) | "
                "polegar E %s D %s" % (
                    (cm.y - Y_BAR) * 1000, pose.dy, pose.dz, jt["cotoveloE"], jt["cotoveloD"], jt["quadrilE"], jt["quadrilD"],
                    jt["joelhoE"], jt["joelhoD"], an["coxaL"], an["coxaR"], an["canelaL"], an["canelaR"], an["tronco"],
                    an["bracoL"], an["bracoR"], an["pelve"], fmt("braco_elevacao"), fmt("palma_frente"),
                    fmt("punho_flexao", "%+.0f"), fmt("punho_desvio", "%+.0f"), tc.pegada_largura(jj)[0], fmt("coluna"),
                    fmt("cabeca_tronco"), mm["barraL"], mm["barraR"], mm["estrL"], mm["estrR"], mm["cabL"], mm["cabR"], mm["mm"],
                    mm["pernaestrL"], mm["pernaestrR"], trav(mm["travL"]), trav(mm["travR"]), *mm["coxatrL"], *mm["coxatrR"],
                    *mm["coxapelL"], *mm["coxapelR"], *mm["pantcoxaL"], *mm["pantcoxaR"], *mm["peL"], *mm["peR"], pol("Left"), pol("Right")))

    bk = ck.Barra(barra, raio=RAIO, meio_compr=MEIA)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, -0.1, 1.2),
                camera_video=((4.4, 2.6, 1.6), (0, -0.12, 1.2), 35), info=info)
