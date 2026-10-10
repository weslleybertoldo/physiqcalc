# Barra Fixa Supinada (chin-up) — cena da fábrica 3D (lote 9, 10/10/2026). A MESMA barra fixa da Barra Fixa (lote 2), sem mudar nada
# nela: equip3d.barra_fixa (barra de aço de 32 mm, 2 braços horizontais que vêm de 2 colunas 45 cm à frente). O jeito de pendurar é o da
# cena da Barra Fixa (cenas/barra_fixa.py): quem anda é o CORPO (o Hips translada), as mãos ficam paradas na barra, o centro de massa
# fica embaixo da barra em todo quadro (Dempster/Winter) e, pra cara passar atrás da barra, o corpo reto inclina pra trás na subida e as
# pernas vão à frente. Aqui ele inclina mais que na Barra Fixa (~27° em cima × 19°): com a mão em cima do ombro (e não do lado), o ombro
# tem que ficar ~18 cm atrás da mão pro cotovelo não passar de COTOVELO1 — e o centro de massa embaixo da barra leva o corpo junto.
# Muda o que a pegada supinada pede:
# - a PEGADA: palmas viradas pra quem pendura (supinada) e as mãos na largura dos ombros — ExRx, Chin-up ("Step up and grasp bar with
#   underhand shoulder width grip."); ACE, Technique Series: Chin-ups ("grab the bar with both hands, using a palms-up grip"); Prinold
#   2016 e Urbanczyk 2020 (chin-up = "reverse" pull-up: "posterior facing palms and hands approximately shoulder-width apart", "supinated
#   grip at shoulder width"). A largura biacromial do boneco sai da altura dele (Lee & Lim 2017, Tabela 1: 40,3 cm de largura biacromial
#   em 172,5 cm de altura), como na Puxada Frontal Supinada: o meio de cada mão a metade disso do meio da barra.
# - os COTOVELOS: descem pela FRENTE do corpo, no plano sagital, até os lados do tronco — ACE ("the specific joint actions include elbow
#   flexion and shoulder extension in the sagittal plane"; "pulling the body toward the bar so that the elbows move past the rib cage until
#   the chin elevates above the bar"); ExRx ("Pull body up until elbows are to sides."); NFPT, How to Do a Chin-up ("Keep the elbows close
#   to your body"). O polo do cotovelo fica pra frente e pra baixo do ombro (na Barra Fixa ele ia pro lado): em cima o cotovelo fica
#   embaixo do ombro, junto do tronco.
# - o ANTEBRAÇO supinado: "the supinated grip of the chin-up places the shoulder in an externally rotated position, while also placing the
#   radius and ulna bones of the forearm in their natural, parallel position" (ACE).
# - as ESCÁPULAS: descem logo no começo, como na Barra Fixa (Youdas 2010: "pull-ups and chin-ups were initiated by the lower trapezius and
#   pectoralis major"), e vão MENOS pra trás em cima que na pronada (Prinold 2016: "More ScT retraction towards the top of the front
#   pull-up, compared to the reverse pull-up"; amplitude de pro/retração de 22° na pronada e 17° na supinada).
# t = 0 pendurado com os braços estendidos acima da cabeça e os ombros soltos (ExRx: "Lower body until arms and shoulders are fully
# extended") · t = 1 o queixo acima da barra (ACE: "until the chin elevates above the bar"), o peito perto dela (ACE: "Think about lifting the
# chest to the bar by pulling the elbows past the rib cage"), os cotovelos bem dobrados, embaixo dos ombros, e a cabeça de volta na linha
# do tronco (ACE: "Keep the spine long"). Corpo e pernas retos, sem balançar (NFPT: "keep your torso and legs straight"; "never use momentum
# (body swinging)"; ACE: "One of the most common mistakes is using momentum"). Pose do corpo direto na matrix_basis de cada osso, calculada
# do repouso (um update só por quadro).
import math
import numpy as np
from mathutils import Matrix, Quaternion, Vector
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
RECUO = 0.45            # colunas 45 cm à frente da barra (a mesma barra fixa)
BIACROMIAL_ALTURA = 40.3 / 172.5   # largura biacromial ÷ altura (Lee & Lim 2017, Tabela 1, homens): a pegada = 1 × ela
Y_BAR = 0.0             # barra no Y = 0 (o boneco olha pra −Y, pras colunas)
PE_FOLGA = 0.06         # pele mais baixa dos pés acima do chão no pendurado (m): pés soltos, fora do chão
COTOVELO0 = 6           # flexão do cotovelo embaixo (graus): estendido sem travar
QUEIXO = 0.012          # em cima, a pele mais baixa da cabeça (embaixo do queixo) fica isso acima do topo da barra (m) — o mesmo da
                        # Barra Fixa: mais alto, o cotovelo passava do teto (COTOVELO1) e o corpo inclinava ainda mais
COTOVELO1 = 138         # em cima, o cotovelo mais dobrado dos 2 no máximo isso (graus): com a pegada na largura dos ombros a mão fica
                        # em cima do ombro e o cotovelo dobra mais que na pronada aberta; acima de ~138° o antebraço do boneco entra no
                        # bíceps além do vinco (145°: 6–8 mm, sonda de 10/10; a Barra Fixa achou o mesmo: 140° → 3 mm) — se passar, o
                        # tronco inclina mais pra trás (o ombro vai pra trás da barra e o cotovelo abre)
FOLGA_CABECA = 0.012    # barra (superfície) → pele/cabelo da cabeça, pescoço e tronco: mínimo no movimento todo (m). Com a inclinação
                        # mais tardia o alto da cabeça (o cabelo) passa embaixo da barra em t ≈ 0,45 (16 mm na exportação, com a cabeça
                        # já de volta na linha do tronco — CABECA_ATE); com 15 mm e a cabeça voltando só no fim, o corpo ia a 30° em cima
                        # só por causa desse instante (checagem de 10/10)
ELEVA = (20, -5)        # escápula (osso Shoulder do Mixamo) subindo em volta do eixo frente-trás, graus: ombro subido no pendurado
                        # ("arms and shoulders are fully extended", ExRx) → um pouco abaixo do repouso em cima (a mesma da Barra Fixa)
RETRAI = (0, 11)        # escápula pra trás em volta do eixo do tronco, graus: 14° na Barra Fixa × 17/22 (Prinold 2016: amplitude de
                        # pro/retração de 22° na pronada e 17° na supinada; "More ScT retraction towards the top of the front pull-up")
ESCAPULA_ATE = 0.35     # a escápula desce no começo (até t = 0,35) e fica lá (Youdas 2010: começa pelo trapézio inferior)
RETRAI_ATE = 0.70       # e vai pra trás até t = 0,70
QUADRIL = (0, 6)        # flexão do quadril, graus: pernas na linha do corpo embaixo → um pouco à frente em cima (a da Barra Fixa)
JOELHO = 0              # joelhos quase estendidos, soltos: os ~7° do repouso (graus a mais)
PLANTAR = 20            # pés soltos, a ponta um pouco pra baixo (flexão plantar, graus)
FECHA_PERNA = 2         # cada perna fecha um pouco em relação à base de repouso (graus): pernas paralelas, sem cruzar
INCLINA_ATE = (0.1, 0.9)     # o tronco inclina pra trás entre esses t: quase em pé no começo da subida e inclinado quando o peito chega
                             # na barra (com (0, 0,75), o da Barra Fixa, já ficava ~20° no meio da subida, com as pernas ~45 cm à
                             # frente — a sequência de lado de 10/10 parecia o corpo jogado pra trás cedo demais)
SUBIDA_MEIO = 0.25      # o corpo sobe 25% mais devagar no meio (e mais rápido no começo e no fim) que em linha reta no t
ALINHAR = (0.7, 0.5)    # quanto os dedos seguem o antebraço VISTO DE LADO (a parte dele no plano ⟂ à barra) em vez de apontar pra
                        # cima — 0,7 até o meio da subida e 0,5 em cima: a barra rola na palma e o punho fica quase reto ("the radius
                        # and ulna bones of the forearm in their natural, parallel position", ACE); os nós dos dedos continuam
                        # paralelos à barra (o desvio de lado que sobra é o do antebraço). Em cima menos, porque a mão seguindo o
                        # antebraço leva o punho pra perto do ombro e o cotovelo dobra mais (0,8: 146°); com 0,5 o tempo todo o punho
                        # estendia 21° em t ≈ 0,2–0,4 (checagem de 10/10)
CABECA = 10.0           # a cabeça volta pra linha do tronco, olhando pra barra (graus de extensão, metade no Neck e metade no Head, a
                        # partir do repouso do boneco, que fica com a cabeça ~11° pra frente): "Keep the spine long" (ACE); o alto da
                        # cabeça e o pescoço vão pra trás da barra com menos inclinação do corpo todo
CABECA_ATE = 0.4        # e chega lá até t = 0,4, antes do alto da cabeça passar embaixo da barra (t ≈ 0,45)
DEDOS_Q = Vector((0, 0, 1))      # dedos pra cima
PALMA_Q = Vector((0, 1, 0))      # pegada SUPINADA: palma virada pra quem pendura (+Y), o dorso da mão pra frente (pras colunas)
POLO = (0.02, -0.30, -0.45)      # polo do cotovelo em relação ao ombro, no referencial do tronco inclinado (m: pra fora, pra trás (− =
                                 # pra FRENTE), pra cima): embaixo o cotovelo aponta pra frente (braço acima da cabeça, antebraço
                                 # supinado) e em cima ele fica embaixo do ombro, junto do tronco — desce pela frente do corpo. Sonda de
                                 # 10/10 em cima: 0,10 pra fora abre os cotovelos 1,4 × a largura dos ombros e o punho desvia 25–30° pro
                                 # polegar (o normal vai até 20°); 0,04 → 1,2× e 16–20°; −0,02 → o braço direito entra 4 mm no tronco
TORCE = 0.5             # parte da torção do antebraço que passa pro osso da mão (a mão fica igual): o antebraço supinado gira ~100°
                        # no rig de UM osso (no braço de verdade gira o rádio, quase nada perto do cotovelo) — o jeito da Puxada
                        # Frontal Supinada; sem isso a carne perto do cotovelo torcia junto
LADOS = (("Left", 1), ("Right", -1))
# Dempster adaptado por Winter (2009), tabela do BMClab (Duarte M., "Body segment parameters"): fração da massa e
# posição do centro a partir da ponta de cima do segmento
SEG = {"tronco": (0.497, 0.5), "cabeca": (0.081, 1.0), "braco": (0.028, 0.436), "antebraco": (0.016, 0.430),
       "mao": (0.006, 0.506), "coxa": (0.100, 0.433), "perna": (0.0465, 0.433), "pe": (0.0145, 0.5)}
CORPO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder",
         "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot")
NAO_BRACO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder")
TRONCO_OSSOS = ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder")
PES = ("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase")


def _suave(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _subida(t):
    """Fração da subida do corpo no quadro t (0 → 1), mais lenta no meio: derivada 1 + A·cos(2πt), A = SUBIDA_MEIO."""
    return t + SUBIDA_MEIO * math.sin(2 * math.pi * t) / (2 * math.pi)


def montar(bon):
    pg.usar_polegar("volta")                             # polegar dando a volta na barra (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)                        # mão de referência de 32 mm (Shimawaki 2019, interpolada), antes do Maos
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    # ── a pegada: 1 × a largura biacromial do boneco (pela altura dele, em pé, antes de pendurar) ──────────────────────────────────
    co0 = ck._avaliar(bon.corpo, 1)[0]
    altura = float(co0[:, 2].max() - co0[:, 2].min())
    biacromial = BIACROMIAL_ALTURA * altura
    meia_pegada = biacromial / 2                         # do meio da barra ao vão de cada mão
    ombros0 = (c("LeftArm") - c("RightArm")).length
    print("PEGADA | altura do boneco %.3f m → largura biacromial %.3f m (Lee & Lim 2017: 40,3/172,5) | vão de cada mão a %.3f m do "
          "meio da barra | entre as articulações dos ombros %.3f m (pegada_largura esperada %.2f)" % (
              altura, biacromial, meia_pegada, ombros0, biacromial / ombros0), flush=True)

    Lb = (c("LeftForeArm") - c("LeftArm")).length       # braço
    La = (c("LeftHand") - c("LeftForeArm")).length      # antebraço
    pivo = (c("LeftUpLeg") + c("RightUpLeg")) / 2        # o corpo inclina em volta das articulações do quadril
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

    # ── perfis no tempo (t já vem suavizado pelo exportador) ──────────────────────────────────────────────────────
    inc = [0.0]                                          # inclinação do tronco em cima (graus), acertada pela folga e pelo cotovelo

    def perfil(t):
        e = _suave(t / ESCAPULA_ATE)
        a = _suave((t - INCLINA_ATE[0]) / (INCLINA_ATE[1] - INCLINA_ATE[0]))
        return dict(eleva=p3.lerp(*ELEVA, e), retrai=p3.lerp(*RETRAI, _suave(t / RETRAI_ATE)), inclina=inc[0] * a,
                    quadril=p3.lerp(*QUADRIL, a), cabeca=CABECA * _suave(t / CABECA_ATE))

    Y, Z = Vector((0, 1, 0)), Vector((0, 0, 1))

    def corpo(t, dy=0.0, dz=0.0):
        """Tronco inclinado, cabeça, escápulas, pernas e o corpo todo deslocado (dy, dz) — os braços vêm depois (segurar)."""
        f = perfil(t)
        for n in ("Spine", "Spine1", "Spine2", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        PB[p3.P + "Hips"].matrix_basis = base("Hips", p3.rot_x(-f["inclina"]), pivo, Vector((0, dy, dz)))  # − = pra trás
        if f["cabeca"]:                                  # cabeça volta pra linha do tronco (− = pra trás, como o Hips)
            for n in ("Neck", "Head"):
                PB[p3.P + n].matrix_basis = base(n, p3.rot_x(-f["cabeca"] / 2))
        for lado, s in LADOS:
            # escápula: sobe/desce em volta do eixo frente-trás e vai pra trás em volta do eixo do tronco (na base do osso
            # Shoulder); o que sobra de lado vira deslize da base do osso (como na Barra Fixa); perna: fecha um pouco, quadril
            # dobra, joelho quase reto, pé solto
            R = Matrix.Rotation(math.radians(s * f["retrai"]), 3, Z) @ Matrix.Rotation(math.radians(-s * f["eleva"]), 3, Y)
            h = repouso[lado + "Shoulder"].to_translation()
            girado = h + R @ (ombro0[lado] - h)
            PB[p3.P + lado + "Shoulder"].matrix_basis = base(lado + "Shoulder", R, None,
                                                             Vector((ombro0[lado].x - girado.x, 0, 0)))
            R = p3.rot_x(-f["quadril"]) @ Matrix.Rotation(math.radians(s * FECHA_PERNA), 3, Y)
            PB[p3.P + lado + "UpLeg"].matrix_basis = base(lado + "UpLeg", R)
            PB[p3.P + lado + "Leg"].matrix_basis = base(lado + "Leg", p3.rot_x(JOELHO))
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

    # ── punho em relação ao vão da mão com os dedos pra cima e a palma pro corpo (1º chute da altura do corpo) ────────
    corpo(0.0, 0.0, 0.6)
    off = {}
    for lado, s in LADOS:
        S = c(lado + "Arm")
        g = S + Vector((s * 0.02, 0.0, 0.5))
        maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S + Vector((s * POLO[0], POLO[1], POLO[2])))
        off[lado] = g - c(lado + "Hand")
        nos = pg._base(rig, lado)[1]
        print("VÃO − PUNHO %s (%.3f %.3f %.3f) | nós dos dedos × barra %.1f° | erro do vão %.1f mm | braço %.4f antebraço %.4f" % (
            lado, *off[lado], math.degrees(min(nos.angle(Vector((1, 0, 0))), nos.angle(Vector((-1, 0, 0))))),
            maos.erro[lado] * 1000, Lb, La), flush=True)

    def flexao_cotovelo(lado, g):
        """Flexão do cotovelo (graus) que leva o punho até o vão `g` com o ombro onde está (geometria: braço + antebraço)."""
        d = (g - off[lado] - c(lado + "Arm")).length
        cos = (d * d - Lb * Lb - La * La) / (2 * Lb * La)
        return math.degrees(math.acos(max(-1.0, min(1.0, cos))))

    def dz_cotovelo(t, alvo_graus):
        """Altura do corpo (dz) com o cotovelo mais esticado dos dois a `alvo_graus` (bissecção: subir dobra o cotovelo)."""
        lo, hi = -0.5, 1.5
        for _ in range(22):
            meio = (lo + hi) / 2
            no_lugar(t, meio)
            g = pegadas()
            if min(flexao_cotovelo(l, g[l]) for l, _ in LADOS) < alvo_graus:
                lo = meio
            else:
                hi = meio
        return (lo + hi) / 2

    def pele(partes, niveis=1):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
        return co[np.array([n in partes for n in nomes] + [False])[dono]]

    def dz_queixo(t):
        """Altura do corpo (dz) com a pele mais baixa da cabeça QUEIXO acima do topo da barra."""
        dz = 0.6
        for _ in range(3):
            no_lugar(t, dz)
            dz += (zb[0] + RAIO + QUEIXO) - pele(("Head",), 0)[:, 2].min()
        return dz

    def folga_agora(niveis=1):
        """Barra (superfície) → pele da cabeça, pescoço e tronco + cabelo, sobrancelhas e olhos (m), onde e de quem (osso ou peça)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
        m = np.array([n in NAO_BRACO for n in nomes] + [False])[dono]
        P, quem = [co[m]], [np.array([nomes[k] for k in dono[m]], dtype=object)]
        for o in extras:
            Q = ck._avaliar_simples(o)[0]
            P.append(Q)
            quem.append(np.full(len(Q), o.name, dtype=object))
        P, quem = np.concatenate(P), np.concatenate(quem)
        sel = np.abs(P[:, 0]) < meia_pegada - 0.05
        P, quem = P[sel], quem[sel]
        d = np.hypot(P[:, 1] - Y_BAR, P[:, 2] - zb[0]) - RAIO
        i = int(d.argmin())
        return float(d[i]), P[i], quem[i]

    def polo(lado, s, t):
        a = math.radians(perfil(t)["inclina"])          # eixos do tronco inclinado pra trás
        tras, cima = Vector((0, math.cos(a), -math.sin(a))), Vector((0, math.sin(a), math.cos(a)))
        return c(lado + "Arm") + Vector((s * POLO[0], 0, 0)) + tras * POLO[1] + cima * POLO[2]

    def torcer():
        """Passa TORCE da torção do antebraço (giro em volta do próprio eixo, o Y do osso) pro osso da mão: o antebraço aponta igual
        e gira menos; a mão fica no mesmo lugar e virada igual (o jeito da Puxada Frontal Supinada). Guarda a torção medida."""
        for L, _ in LADOS:
            pb_f = PB[p3.P + L + "ForeArm"]
            loc, q, esc = pb_f.matrix_basis.decompose()
            tau = 2 * math.atan2(q.y, q.w)                 # torção (swing-twist: q = swing @ twist em volta do Y)
            tau = (tau + math.pi) % (2 * math.pi) - math.pi
            fica = tau * (1 - TORCE)
            torcer.tau[L] = (math.degrees(tau), math.degrees(fica))
            if not TORCE:
                continue
            q_sw = q @ Quaternion((math.cos(tau / 2), 0.0, math.sin(tau / 2), 0.0)).inverted()
            Mh = PB[p3.P + L + "Hand"].matrix.copy()
            pb_f.matrix_basis = Matrix.LocRotScale(loc, q_sw @ Quaternion((math.cos(fica / 2), 0.0, math.sin(fica / 2), 0.0)), esc)
            p3.atualizar()
            PB[p3.P + L + "Hand"].matrix = Mh
            p3.atualizar()

    torcer.tau = {}

    X = Vector((1, 0, 0))

    def bracos(t):
        """Os 2 braços até as mãos na barra. O IK parte sempre do braço de repouso (cotovelo dobrado pra frente, como o
        do corpo): partindo do quadro anterior, o braço podia girar no próprio eixo e o cotovelo dobrar de lado. Os dedos
        seguem ALINHAR do antebraço visto de lado (a parte dele ⟂ à barra): antebraço ↔ mão em poucas voltas."""
        g = pegadas()
        al = p3.lerp(ALINHAR[0], ALINHAR[1], _suave((t - 0.5) / 0.5))
        for lado, s in LADOS:
            dq = DEDOS_Q.copy()
            for _ in range(5):
                for n in ("Arm", "ForeArm", "Hand"):
                    PB[p3.P + lado + n].matrix_basis = Matrix()
                p3.atualizar()
                maos.segurar(lado, g[lado], dq, PALMA_Q, polo=polo(lado, s, t))
                f = c(lado + "Hand") - c(lado + "ForeArm")
                f = (f - X * f.dot(X)).normalized()          # antebraço visto de lado
                novo = (DEDOS_Q * (1 - al) + f * al).normalized()
                pronto = novo.angle(dq) < math.radians(0.3)
                dq = novo
                if pronto:
                    break
        torcer()

    def cotovelo_max():
        j = ck.medir_juntas(rig)
        return max(j["cotoveloE"], j["cotoveloD"])

    # ── inclinação do tronco em cima: a menor que deixa a cara, o pescoço e o peito FOLGA_CABECA longe da barra e o cotovelo
    # mais dobrado (em cima, com os braços de verdade) com no máximo COTOVELO1 ─────────────────────────────────────────────
    def pior_folga(graus, dz0):
        inc[0] = graus
        dz1 = dz_queixo(1.0)
        piores = []
        for t in np.arange(0.20, 1.001, 0.05):
            no_lugar(float(t), p3.lerp(dz0, dz1, _subida(float(t))))
            d, p, quem = folga_agora(0)
            piores.append((d, round(float(t), 2), tuple(round(float(x), 3) for x in p) + (quem,)))
        no_lugar(1.0, dz1)
        bracos(1.0)
        return min(piores), dz1, cotovelo_max()

    def inclinacao(dz0):
        lo, hi = 0.0, 30.0
        for _ in range(8):
            meio = (lo + hi) / 2
            (pf, _, _), _, cot = pior_folga(meio, dz0)
            if pf < FOLGA_CABECA or cot > COTOVELO1:
                lo = meio
            else:
                hi = meio
        (pf, tpf, ppf), dz1, cot = pior_folga(hi, dz0)
        print("INCLINAÇÃO em cima %.1f° | pior folga barra → cabeça/tronco %.1f mm em t=%.2f no ponto %s | cotovelo em cima %.1f° "
              "(máx %d) | dz %.3f → %.3f" % (inc[0], pf * 1000, tpf, ppf, cot, COTOVELO1, dz0, dz1), flush=True)
        return dz1

    def acertar_polos(t):
        for lado, _ in LADOS:
            for n in ("Arm", "ForeArm", "Hand"):
                PB[p3.P + lado + n].matrix_basis = Matrix()
            maos.iks[lado].mute = False
            e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            print("polo cotovelo", lado, "erro %.3f ang %d" % e, flush=True)
        bracos(t)

    # 1º chute (mão fixa, sem o ALINHAR): cotovelo quase estendido embaixo, pés PE_FOLGA acima do chão e a inclinação
    dz0 = dz_cotovelo(0.0, COTOVELO0)
    no_lugar(0.0, dz0)
    d = PE_FOLGA - pele(PES)[:, 2].min()
    zb[0], dz0 = zb[0] + d, dz0 + d                        # barra e corpo sobem juntos (nada muda nos braços)
    dz1 = inclinacao(dz0)
    no_lugar(0.5, p3.lerp(dz0, dz1, _subida(0.5)))       # polo certo do cotovelo no meio do movimento
    bracos(0.5)
    acertar_polos(0.5)

    # embaixo com os braços de verdade (a mão segue o antebraço ALINHAR): bissecção no cotovelo medido
    lo, hi = dz0 - 0.05, dz0 + 0.05
    for _ in range(16):
        meio = (lo + hi) / 2
        no_lugar(0.0, meio)
        bracos(0.0)
        j = ck.medir_juntas(rig)
        if min(j["cotoveloE"], j["cotoveloD"]) < COTOVELO0 or max(maos.erro.values()) > 0.002:
            lo = meio
        else:
            hi = meio
    dz0 = hi
    no_lugar(0.0, dz0)
    d = PE_FOLGA - pele(PES)[:, 2].min()
    zb[0], dz0 = zb[0] + d, dz0 + d
    print("BARRA eixo em z %.3f (pés %.0f mm do chão no pendurado) | corpo dz %.3f embaixo" % (zb[0], PE_FOLGA * 1000, dz0),
          flush=True)
    dz1 = inclinacao(dz0)

    barra = e3.barra_fixa("barra_fixa", altura=zb[0], meia=MEIA, raio=RAIO, recuo=RECUO)
    barra.location = (0, Y_BAR, zb[0])
    p3.atualizar()

    def pose(t):
        """t=0 pendurado com os braços estendidos (palmas pro corpo), t=1 queixo acima da barra."""
        pose.dy = no_lugar(t, p3.lerp(dz0, dz1, _subida(t)))
        bracos(t)
        for lado, _ in LADOS:                             # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, Vector((0, Y_BAR, zb[0])), Vector((1, 0, 0)), RAIO,
                                                  polegar_antes=antes)

    pose.dedos = {}
    pose.dy = 0.0

    # ── medidas à parte (a checagem ignora o que fica dentro da mão) ─────────────────────────────────────────────────────────────
    pecas = {o.name: o for o in [barra] + list(barra.children_recursive) if o.type == "MESH"}
    estrutura = [o for n, o in pecas.items() if n != "barra_fixa_barra"]

    def _sinal(bvh, pts):
        menor = 1e9
        for p in pts:
            v = Vector(p)
            loc, nor, idx, dist = bvh.find_nearest(v)
            if loc is not None:
                menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
        return menor

    def medidas_maos():
        """Mão × barra (a pele que entra no tubo, em toda a barra: − = entrou, a pegada aperta até 1,5 mm), mão × estrutura da barra
        fixa (braços, colunas: menor distância), mão × mão (pele, com sinal), braço/mão × cabeça+cabelo (com sinal) e antebraço/mão ×
        tronco (com sinal) — mm."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        grupo = lambda partes: np.array([n in partes for n in nomes] + [False])[dono]
        out = {}
        bvh_cab = ck._bvh(co, tri[grupo(("Head", "Neck"))[tri].all(axis=1)])
        bvh_tr = ck._bvh(co, tri[grupo(TRONCO_OSSOS)[tri].all(axis=1)])
        cabelo = getattr(bon, "cabelo", None)
        bvh_cb = ck._bvh(*ck._avaliar_simples(cabelo)) if cabelo is not None else None
        E = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.01) for o in estrutura])
        maos_v = {}
        for L, s in LADOS:
            mao = grupo(tuple(n for n in nomes if n.startswith(L + "Hand")))
            maos_v[L] = mao
            H = co[mao]
            rad = np.hypot(H[:, 1] - Y_BAR, H[:, 2] - zb[0]) - RAIO
            out["barra" + L[0]] = float(rad.min()) * 1000
            perto = E[((E >= H.min(axis=0) - 0.3) & (E <= H.max(axis=0) + 0.3)).all(axis=1)]   # estrutura a até 30 cm da mão
            if len(perto):
                bvh_m = ck._bvh(co, tri[mao[tri].all(axis=1)])
                out["estr" + L[0]] = _sinal(bvh_m, perto) * 1000
            else:
                out["estr" + L[0]] = 300.0                 # nada da estrutura a menos de 30 cm da mão
            braco = grupo(tuple(n for n in nomes if n.startswith(L + "Hand") or n in (L + "Arm", L + "ForeArm")))
            Pb = co[braco]
            d = _sinal(bvh_cab, Pb[::3])
            if bvh_cb is not None:
                d = min(d, float(min(bvh_cb.find_nearest(Vector(p))[3] for p in Pb[::3])))
            out["cab" + L[0]] = d * 1000
            ant = grupo(tuple(n for n in nomes if n.startswith(L + "Hand") or n == L + "ForeArm"))
            out["tr" + L[0]] = _sinal(bvh_tr, co[ant][::2]) * 1000
        bvh_d = ck._bvh(co, tri[maos_v["Right"][tri].all(axis=1)])
        out["mm"] = _sinal(bvh_d, co[maos_v["Left"]][::2]) * 1000
        for L, _ in LADOS:                                 # meio da pele de cada pé (os closes dos pés miram aqui: o pé fica no ar)
            P_ = co[grupo((L + "Foot", L + "ToeBase"))]
            out["pe" + L[0]] = tuple(float(x) for x in (P_.min(axis=0) + P_.max(axis=0)) / 2)
        return out

    def info():
        """Centro de massa × barra, barra × cabeça/tronco, queixo × topo da barra, polegar, braços, punho e as medidas das mãos."""
        g = pegadas()
        cm = centro_massa(g, bracos_reais=True)
        cab = pele(("Head",))
        f, p, quem = folga_agora()
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        mm = medidas_maos()

        def pol(lado):
            v = pose.dedos.get(lado, {}).get("Thumb", ())
            return str(tuple(round(float(x), 2) if isinstance(x, float) else x for x in v) if isinstance(v, tuple) else v)
        fmt = lambda nome, f_="%.0f": "/".join(f_ % v for v in tc.MEDIDAS[nome](jj))
        return (maos.info() + " | centro de massa − barra %+.0f mm (frente−/trás+) | barra → cabeça/tronco %.0f mm (%.2f %.2f %.2f) | "
                "%s | queixo − topo da barra %+.0f mm | corpo dy %+.3f | cotovelo %.0f/%.0f° | elevação %s° | braço à frente %s° | "
                "cotovelo × tronco %s° | plano do braço %s° | abertura %s° | palma × frente %s° | punho flexão %s° desvio %s° | "
                "pegada %.2f | escápula %s mm | tronco %.1f° | cabeça %s° | torção do antebraço E %.0f→%.0f° D %.0f→%.0f° | mão × barra "
                "E %+.1f D %+.1f mm | mão × estrutura E %.0f D %.0f mm | braço/mão × cabeça E %+.1f D %+.1f mm | antebraço/mão × tronco "
                "E %+.1f D %+.1f mm | mão × mão %.0f mm | pé E (%.3f %.3f %.3f) D (%.3f %.3f %.3f) | polegar E %s D %s" % (
                    (cm.y - Y_BAR) * 1000, f * 1000, *p, quem, (cab[:, 2].min() - zb[0] - RAIO) * 1000, pose.dy, jt["cotoveloE"],
                    jt["cotoveloD"], fmt("braco_elevacao"), fmt("braco_frente"), fmt("cotovelo_tronco"), fmt("braco_plano"),
                    fmt("braco_abertura"), fmt("palma_frente"), fmt("punho_flexao", "%+.0f"), fmt("punho_desvio", "%+.0f"),
                    tc.pegada_largura(jj)[0], fmt("escapula_frente"),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    fmt("cabeca_tronco"), *torcer.tau.get("Left", (0, 0)), *torcer.tau.get("Right", (0, 0)), mm["barraL"],
                    mm["barraR"], mm["estrL"], mm["estrR"], mm["cabL"], mm["cabR"], mm["trL"], mm["trR"], mm["mm"], *mm["peL"],
                    *mm["peR"], pol("Left"), pol("Right")))

    bk = ck.Barra(barra, raio=RAIO, meio_compr=MEIA)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.0, 1.3),
                camera_video=((3.6, 4.2, 1.7), (0, 0.0, 1.3), 35), info=info)
