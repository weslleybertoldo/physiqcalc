# Alongamento de Extensão da Coluna — cena da fábrica 3D (lote 15, 13/10/2026). Peso corporal, ALONGAMENTO PARADO, deitado de bruços no
# colchonete de 12 mm dos prontos de costas (a caixa é da própria cena, de apoio; nenhuma peça do lib/), com o apoio nas mãos.
# Ciclo (regra do lote 15 por coerência com a Prancha — fica pra validação final do Weslley): CÍCLICO ("ciclo": true, t = 1 igual a
# t = 0; o app repete): t = 0 é o ALONGAMENTO SEGURADO (a foto parada do app: o tronco levantado nas mãos com a pelve no chão); segura;
# no meio do ciclo desce devagar até deitar de bruços com as mãos no lugar (t = 0,5 é o meio do tempo deitado) e sobe de novo.
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha e em lote4/alongamento_de_extensao_da_coluna/fontes.md):
#  · ExRx, Lying (prone) Abdominal Stretch: "Lie prone on mat or floor. Position hands on floor to sides of shoulders." · "Push torso up
#    keeping pelvis on floor. Hold stretch." · "Arms can also be positioned somewhat bent as an intermediate version of this stretch."
#  · ACE, Cobra (#16): "Lie prone ... with your hands by your sides, positioned directly under your shoulders and hands facing forward.
#    Extend your legs and plantar flex your ankles (toes point away from body)." · "Gently exhale and press your hips into the mat or
#    floor and pull your chest away from the ground while keeping your hips stable. This will arch your low back" · "Gently relax and
#    lower your upper body to rest back upon the mat or floor." · "limit the extension in your arms to keep the hips on the mat."
#  · NASM, Floor Prone Cobra: "elbows close to your body" · "Keep your hips and legs relaxed on the floor" · "Keep your shoulders
#    relaxed and allow the chest to open toward the ceiling" · "Lower yourself back to the floor with control. Rest briefly".
#  · Arthritis Research UK, Half push-ups: "Look up and push up, lifting your head and shoulders up with your arms. Keep your hips on the
#    floor." · "work towards trying to straighten your arms, still keeping your hips on the floor."
#  · Kulig et al. 2007 (ressonância do press-up, tabela 3): extensão de 3,4 a 4,7° por segmento, 20,9° de L1 a S1 nos sem dor.
#  · Edmondston et al. 2011/2012: a torácica estende ~9–12° (até ~26°), mais deitado de bruços que em pé.
# Decisões: a PELVE e as PERNAS ficam PARADAS o ciclo todo (a pelve no colchonete, as pernas esticadas e relaxadas, os pés em flexão
# plantar com o peito do pé e os dedos no colchonete); quem mexe é a COLUNA (a lombar arqueia e a torácica estende um pouco), o pescoço
# e as escápulas, e os braços, que empurram com as mãos PARADAS. A mão fica o mais perto de "embaixo do ombro" que o braço do boneco deixa:
# deitado, a articulação do ombro fica ~16 cm acima do colchonete (o peito é largo) e o cotovelo não passa de ~120° sem o antebraço entrar
# no braço — o punho fica na altura do rosto (o desenho 1 da Arthritis Research UK), um pouco por fora do ombro e com os dedos um pouco
# pra dentro (deitado o cotovelo abre pro lado e, com os dedos pra frente, o punho desviaria ~55°); com a coluna no fim da amplitude e
# a pelve no chão, em cima o cotovelo fica dobrado ~44° (a versão intermediária do ExRx; a foto da ACE; "limit the extension in your
# arms").
# Como o rig faz: em pé, os joelhos esticam, as pernas fecham o mais junto que dá sem uma coxa entrar na outra e o tornozelo faz flexão
# plantar; o corpo gira 90° pra frente (de bruços) em volta do centro dos quadris; as coxas giram até a pele mais baixa delas ficar na
# altura da pele mais baixa da pelve e o corpo desce até a pelve encostar no colchonete; o joelho dobra até o peito do pé encostar e os
# dedos dos pés giram na base até deitar. A coluna gira em 3 pivôs (Spine ~L4–L5, Spine1 ~T12, Spine2 ~T7), o pescoço acerta a cabeça
# e a clavícula gira (retração) em volta do eixo do tronco; o braço vai por IK do ombro até o punho PARADO e a mão vira pela palma e
# pelos dedos, espalmada (o jeito da Flexão de Braço e da Prancha).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TOPO = 0.012            # colchonete de 12 mm (o dos prontos de costas: Abdominal Supra, Ponte de Glúteo)
LARGURA = 0.80          # largura do colchonete (m): as mãos ficam do lado do rosto, a |x| até ~0,34 m (o da Ponte de Glúteo)
# ── pernas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
JOELHO0 = 1.5           # flexão do joelho antes de deitar (graus): esticado (ACE: "Extend your legs"); em pé o boneco tem 7,5°
PES_X = 0.06            # tornozelos a ±6 cm do meio: pernas juntas (fotos do ExRx e da ACE) ...
COXAS_MM = 1.0          # ... sem uma coxa entrar na outra mais que isso (a checagem aceita 2 mm): no boneco musculoso os pés afastam
TORNOZELO = 30.0        # canela × pé (tecnica3d.tornozelo; em pé ~76°): ~46° de flexão plantar, o peito do pé deitado (ACE: "plantar
                        # flex your ankles (toes point away from body)"); o limite da flexão plantar é 50° (Alazzawi 2017) = ~26° no boneco
AFUNDA_PELVE = 0.0015   # a pele mais baixa da pelve dentro do colchonete (ACE: "press your hips into the mat")
AFUNDA_COXA = 0.0060    # a pele mais baixa da coxa (o meio dela) dentro do colchonete (que cede): a coxa musculosa do boneco não
                        # amassa — com o meio dela no colchonete o joelho fica ~4 cm acima dele (a Prancha: "a pelve e os joelhos
                        # ficam ~3 cm acima"); afundar 6 mm baixa o joelho uns mm
AFUNDA_PE = 0.0010      # peito do pé e dedos encostando no colchonete
# ── tronco, cabeça e escápulas ─────────────────────────────────────────────────────────────────────────────────────────────────
AFUNDA_PEITO = 0.0020   # deitado: a pele mais baixa do peito dentro do colchonete
LOMBAR = 30.0           # extensão da lombar em cima, a mais que deitado (graus): Kulig 2007 mediu 20,9° de L1 a S1 (tabela 3) "as far as
                        # possible within pain tolerance"; Mazzone 2016, 21,4 ± 9,2° só na lombar baixa; a amplitude normal de
                        # extensão lombar é 25° (AAOS), 35° (Kendall) e 40 ± 10,2° (Apti 2023) — somada à de deitado, fica ~39°
LOMBAR_DIV = (0.6, 0.4)  # como a extensão da lombar se divide entre os ossos Spine (~L4–L5) e Spine1 (~T12–L1) (a Prancha)
TORACICA = 20.0         # extensão da torácica em cima (graus): Edmondston 2012, 12,0 ± 8,9° (radiografia; 12,4 ± 4,1° na foto);
                        # Edmondston 2011: deitado de bruços estende mais que em pé (8,7 ± 3,7°)
TORACICA_DIV = (0.5, 0.5)  # entre o Spine1 (~T12) e o Spine2 (~T7)
ESCAPULA = (0.0, -10.0)  # giro da clavícula em volta do eixo do tronco (graus, + protração): deitado → em cima, as escápulas um pouco
                        # pra trás, o peito abrindo (NASM: "Keep your shoulders relaxed and allow the chest to open toward the ceiling")
CABECA = (-4.0, 20.0)    # cabeça × tronco (tecnica3d.cabeca_tronco; o boneco em pé mede ~−11°): deitado → em cima, a cabeça acompanha o
                        # tronco olhando pra frente, um pouco levantada (Arthritis Research UK: "Look up and push up"), sem jogar pra trás
# ── braços e mãos ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
AFUNDA_MAO = 0.0008     # palma e dedos apertando o colchonete (a Flexão de Braço)
DENTRO = 18.0           # dedos das mãos um pouco pra dentro (graus): deitado o cotovelo abre pro lado (o punho fica à frente do ombro) e o
                        # antebraço chega na mão vindo de fora — com os dedos pra frente (ACE: "hands facing forward") o punho desviava
                        # ~55° pro lado do dedo mínimo (o normal é até 30°, Norkin & White); com 18° pra dentro e a mão um pouco mais aberta
                        # o desvio fica ~−20° deitado e ~+5° em cima (o "fingers facing forward or turned slightly inward" da ACE na flexão)
PUNHO_X = 0.28          # |x| do punho (m): a mão do lado do corpo, um pouco por fora do ombro (a cabeça do úmero fica a |x| 0,20 m): a base do
                        # dedo médio fica na largura dos ombros, ~1,2 × a distância entre os ombros (ACE: "hands by your sides"; fotos do ExRx
                        # e da ACE)
COTOVELO_BAIXO = 117.0  # flexão do cotovelo deitado (graus): a mão o mais perto de embaixo do ombro (ACE, NASM, Arthritis Research UK) sem
                        # o antebraço entrar no braço (na Flexão de Braço, a 129° ele entrava 2,5 mm)
# ── tempos (o ciclo) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
SEGURA_S = 5.0          # s segurando no alto por ciclo (a segurada da Prancha; Arthritis Research UK: "Hold for a count of 5")
DESCE_S = 2.0           # s descendo (ACE: "Gently relax and lower your upper body"; NASM: "with control"; Kulig: "slowly lower the trunk")
EMBAIXO_S = 1.0         # s deitado (NASM: "Rest briefly before repeating the stretch")
SOBE_S = 2.0            # s subindo (ACE: "Gently exhale and press"; NASM: "Jerky or uncontrolled movements" é erro)
CICLO_S = SEGURA_S + DESCE_S + EMBAIXO_S + SOBE_S
T_DESCE = (0.5 - (EMBAIXO_S / 2 + DESCE_S) / CICLO_S, 0.5 - EMBAIXO_S / 2 / CICLO_S)
T_SOBE = (0.5 + EMBAIXO_S / 2 / CICLO_S, 0.5 + (EMBAIXO_S / 2 + SOBE_S) / CICLO_S)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def descida(t):
    """Quanto o tronco já desceu no quadro t (0 = em cima, segurando; 1 = deitado), com saída e chegada suaves (seno)."""
    if t <= T_DESCE[0] or t >= T_SOBE[1]:
        return 0.0
    if t < T_DESCE[1]:
        return p3.suave((t - T_DESCE[0]) / (T_DESCE[1] - T_DESCE[0]))
    if t <= T_SOBE[0]:
        return 1.0
    return p3.suave((T_SOBE[1] - t) / (T_SOBE[1] - T_SOBE[0]))


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos (aqui não há pegador: as mãos ficam abertas, espalmadas)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    def zmin(partes):
        return float(pele(partes)[:, 2].min())

    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length
    dedos_repouso = {L: p3.mundo_osso(rig, L + "ToeBase").to_3x3() for L, _ in LADOS}

    # ── pernas em pé: joelhos esticados, pernas o mais juntas que der, flexão plantar (antes de deitar) ──────────────────────────
    for lado, _ in LADOS:
        Hq, K, A = (c(lado + n) for n in ("UpLeg", "Leg", "Foot"))
        coxa, canela = (K - Hq).normalized(), (A - K).normalized()
        flex = math.degrees(coxa.angle(canela))
        quer = coxa.slerp(canela, JOELHO0 / flex) if flex > JOELHO0 else canela
        p3.girar_osso(rig, lado + "Leg", canela.rotation_difference(quer).to_matrix())
    coxas_soltas = {L: PB[p3.P + L + "UpLeg"].matrix_basis.copy() for L, _ in LADOS}

    def fechar_pernas(px):
        """Cada coxa fecha em volta do quadril até o tornozelo ficar a `px` m do meio; devolve quanto uma coxa entra na outra
        (mm). (a Flexão de Braço)"""
        for lado, s in LADOS:
            PB[p3.P + lado + "UpLeg"].matrix_basis = coxas_soltas[lado].copy()
        p3.atualizar()
        for lado, s in LADOS:
            Hq, A = c(lado + "UpLeg"), c(lado + "Foot")
            v = A - Hq
            dx = s * px - Hq.x
            quer = Vector((dx, v.y, -math.sqrt(max(v.length ** 2 - dx ** 2 - v.y ** 2, 1e-6))))
            p3.girar_osso(rig, lado + "UpLeg", v.rotation_difference(quer).to_matrix())
        co, tri, (nomes, dono) = _malha(bon)
        return ck.corpo_x_corpo(co, tri, nomes, dono)[0]["coxaE×coxaD"]

    px = PES_X
    if fechar_pernas(px) > COXAS_MM:
        lo, hi = PES_X, 0.20
        for _ in range(10):
            meio = (lo + hi) / 2
            if fechar_pernas(meio) > COXAS_MM:
                lo = meio
            else:
                hi = meio
        px = hi
    print("PÉS | tornozelos a ±%.3f m do meio (o mais junto sem uma coxa entrar na outra) | coxa × coxa %.1f mm" % (
        px, fechar_pernas(px)))
    for lado, _ in LADOS:                 # tornozelo: o pé gira no plano canela-pé até canela × pé = TORNOZELO
        K, A, T = (c(lado + n) for n in ("Leg", "Foot", "ToeBase"))
        canela, pe = (A - K).normalized(), (T - A).normalized()
        eixo = canela.cross(pe).normalized()
        p3.girar_osso(rig, lado + "Foot", Matrix.Rotation(math.radians(TORNOZELO - math.degrees(canela.angle(pe))), 3, eixo))

    # ── de bruços: o corpo gira 90° pra frente em volta do centro dos quadris (o meio dos quadris em y = 0) ──────────────────────
    Hc = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(90.0), pivo=Hc)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((-Hc.x, -Hc.y, 0.0)))
    coxas_deitadas = {L: PB[p3.P + L + "UpLeg"].matrix_basis.copy() for L, _ in LADOS}
    TRONCO_PELVE = ("Hips",)
    COXAS = ("LeftUpLeg", "RightUpLeg")

    def coxas(g):
        """As 2 coxas giram `g` graus em volta do eixo de lado a lado (+ = o joelho desce pro colchonete: flexão do quadril)."""
        for L, _ in LADOS:
            PB[p3.P + L + "UpLeg"].matrix_basis = coxas_deitadas[L].copy()
        p3.atualizar()
        if g:
            for L, _ in LADOS:
                p3.girar_osso(rig, L + "UpLeg", p3.rot_x(-g))

    # a pele mais baixa das coxas (o meio delas) na altura da pele mais baixa da pelve menos o que a coxa afunda a mais
    alvo_dz = AFUNDA_PELVE - AFUNDA_COXA
    lo, hi = -8.0, 8.0
    for _ in range(14):
        meio = (lo + hi) / 2
        coxas(meio)
        if zmin(COXAS) - zmin(TRONCO_PELVE) > alvo_dz:      # coxa alta demais → o joelho desce (flexão)
            lo = meio
        else:
            hi = meio
    G_COXA = (lo + hi) / 2
    coxas(G_COXA)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA_PELVE - zmin(TRONCO_PELVE))))
    print("PERNAS DEITADAS | coxas giram %+.2f° | pele mais baixa (mm, topo do colchonete em %.0f): pelve %.1f, coxas %.1f" % (
        G_COXA, TOPO * 1000, zmin(TRONCO_PELVE) * 1000, zmin(COXAS) * 1000))

    # ── joelho e pé: o joelho dobra até o peito do pé encostar; os dedos dos pés giram na base até deitar no colchonete ────────────
    dedos_alvo = {}
    for lado, _ in LADOS:
        K0 = PB[p3.P + lado + "Leg"].matrix_basis.copy()
        T0 = PB[p3.P + lado + "ToeBase"].matrix_basis.copy()

        def joelho(dk):
            PB[p3.P + lado + "Leg"].matrix_basis = K0.copy()
            PB[p3.P + lado + "ToeBase"].matrix_basis = T0.copy()
            p3.atualizar()
            if dk:
                p3.girar_osso(rig, lado + "Leg", p3.rot_x(dk))       # + = a canela sobe pras costas (o joelho dobra)

        lo, hi = -2.0, 40.0
        for _ in range(14):
            meio = (lo + hi) / 2
            joelho(meio)
            if zmin((lado + "Foot",)) < TOPO - AFUNDA_PE:
                lo = meio
            else:
                hi = meio
        joelho(hi)
        g0 = 0.0
        lo, hi = -40.0, 40.0                                         # os dedos giram na base (+ = a ponta desce: os dedos
        for _ in range(14):                                          # apontam pra +Y, pra trás)
            meio = (lo + hi) / 2
            PB[p3.P + lado + "ToeBase"].matrix_basis = T0.copy()
            p3.atualizar()
            p3.girar_osso(rig, lado + "ToeBase", p3.rot_x(-meio))
            if zmin((lado + "ToeBase",)) > TOPO - AFUNDA_PE:
                lo = meio
            else:
                hi = meio
        PB[p3.P + lado + "ToeBase"].matrix_basis = T0.copy()
        p3.atualizar()
        p3.girar_osso(rig, lado + "ToeBase", p3.rot_x(-hi))
        dedos_alvo[lado] = p3.mundo_osso(rig, lado + "ToeBase").to_3x3()
        jj = ck.posicoes(rig)
        print("PÉ %s | joelho dobra %.2f° | dedos giram %+.2f° | pé %.1f, dedos %.1f, joelho (pele) %.1f mm | tornozelo %.1f" % (
            lado, ck.medir_juntas(rig)["joelho" + ("E" if lado == "Left" else "D")], hi, zmin((lado + "Foot",)) * 1000,
            zmin((lado + "ToeBase",)) * 1000, zmin((lado + "Leg",)) * 1000,
            tc.tornozelo(jj)[0 if lado == "Left" else 1]))

    # ── coluna deitada: a lombar estende até o peito encostar (a pelve parada) ───────────────────────────────────────────────
    COLUNA = ("Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder")
    coluna0 = {n: PB[p3.P + n].matrix_basis.copy() for n in COLUNA}

    def escapula(g):
        """Clavícula (osso Shoulder) girada `g` graus em volta do eixo do tronco: + = protração (a Flexão de Braço)."""
        cima = (c("Neck") - c("Hips")).normalized()
        for lado, s in LADOS:
            PB[p3.P + lado + "Shoulder"].matrix_basis = coluna0[lado + "Shoulder"].copy()
            p3.atualizar()
            if g:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * g), 3, cima))

    def coluna(lomb, tor, pesc=0.0, esc=0.0):
        """Coluna a partir de deitada reta: lombar estendida `lomb` graus (Spine/Spine1), torácica `tor` graus (Spine1/Spine2), pescoço
        estendido `pesc` graus, escápulas `esc` graus (+ protração)."""
        for n in COLUNA:
            PB[p3.P + n].matrix_basis = coluna0[n].copy()
        p3.atualizar()
        giros = {"Spine": lomb * LOMBAR_DIV[0], "Spine1": lomb * LOMBAR_DIV[1] + tor * TORACICA_DIV[0], "Spine2": tor * TORACICA_DIV[1]}
        for n in ("Spine", "Spine1", "Spine2"):
            if giros[n]:
                p3.girar_osso(rig, n, p3.rot_x(-giros[n]))           # − = extensão: a ponta de cima sobe (de bruços)
        if pesc:
            p3.girar_osso(rig, "Neck", p3.rot_x(-pesc))              # − = extensão do pescoço: a cabeça levanta
        escapula(esc)

    lo, hi = -15.0, 35.0
    for _ in range(14):
        meio = (lo + hi) / 2
        coluna(meio, 0.0)
        if zmin(("Spine2",)) < TOPO - AFUNDA_PEITO:
            lo = meio
        else:
            hi = meio
    LB = hi

    def pescoco_para(alvo, lomb, tor, esc):
        """Extensão do pescoço (graus) que deixa cabeca_tronco = alvo com a coluna assim."""
        lo, hi = -40.0, 60.0
        for _ in range(16):
            meio = (lo + hi) / 2
            coluna(lomb, tor, meio, esc)
            if tc.cabeca_tronco(ck.posicoes(rig))[0] < alvo:
                lo = meio
            else:
                hi = meio
        return (lo + hi) / 2

    BAIXO = dict(lomb=LB, tor=0.0, esc=ESCAPULA[0])
    CIMA = dict(lomb=LB + LOMBAR, tor=TORACICA, esc=ESCAPULA[1])
    BAIXO["pesc"] = pescoco_para(CABECA[0], BAIXO["lomb"], BAIXO["tor"], BAIXO["esc"])
    CIMA["pesc"] = pescoco_para(CABECA[1], CIMA["lomb"], CIMA["tor"], CIMA["esc"])

    def tronco_txt():
        jj = ck.posicoes(rig)
        return ("peito %.1f, barriga (Spine1/Spine) %.1f/%.1f, pelve %.1f, cabeça %.1f mm | ombros E (%.0f %.0f %.0f) D (%.0f %.0f %.0f) mm | "
                "coluna_sinal %.1f, tórax × chão %.1f, cabeça × tronco %.1f, escápula %s mm" % (
                    zmin(("Spine2",)) * 1000, zmin(("Spine1",)) * 1000, zmin(("Spine",)) * 1000, zmin(("Hips",)) * 1000,
                    zmin(("Head",)) * 1000, *(c("LeftArm") * 1000), *(c("RightArm") * 1000), tc.coluna_sinal(jj)[0],
                    tc.torax_chao(jj)[0], tc.cabeca_tronco(jj)[0], "/".join("%+.0f" % a for a in tc.escapula_frente(jj))))

    coluna(**BAIXO)
    S_b = {L: c(L + "Arm").copy() for L, _ in LADOS}
    print("DEITADO | lombar estende %.2f° pro peito encostar, pescoço %+.1f° | %s" % (LB, BAIXO["pesc"], tronco_txt()))
    coluna(**CIMA)
    S_c = {L: c(L + "Arm").copy() for L, _ in LADOS}
    print("EM CIMA | lombar %.2f° (+%.1f), torácica %.1f°, pescoço %+.1f° | %s" % (CIMA["lomb"], LOMBAR, TORACICA, CIMA["pesc"], tronco_txt()))

    # ── braços: IK do ombro ao punho; a mão vira pela palma e pelos dedos (o jeito da Flexão de Braço e da Prancha) ───────────────
    punhos, polos, iks = {}, {}, {}
    for lado, s in LADOS:                 # alvo nasce no punho de repouso e o polo afastado (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.3, 0.3, 0.3)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
        iks[lado].mute = True
    p3.atualizar()
    BRACO = {L: [pb.name[len(p3.P):] for pb in PB if pb.name[len(p3.P):].startswith((L + "Arm", L + "ForeArm", L + "Hand"))]
             for L, _ in LADOS}
    braco_solto = {L: {n: PB[p3.P + n].matrix_basis.copy() for n in BRACO[L]} for L in BRACO}
    DEDOS = {L: [n for n in BRACO[L] if n.startswith(L + "Hand") and n != L + "Hand"] for L in BRACO}
    MAO = {L: tuple(n for n in BRACO[L] if n.startswith(L + "Hand")) for L in BRACO}
    dedos_pose = {}
    polo_ok = {}

    def esticar_dedos(lado):
        """Dedos esticados no plano da palma e um pouco abertos, polegar deitado do lado do indicador (a mão de apoio da Flexão de
        Braço)."""
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 0.5)
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
        """Com a palma no colchonete: cada dedo (e o polegar) gira só na base, pro lado da palma, até a pele mais baixa dele encostar
        (TOPO − AFUNDA_MAO); sem passar disso (a Flexão de Braço)."""
        palma, eixo_nos = pg._base(rig, lado)[:2]
        co, _, (nomes, dono) = _malha(bon)
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

    def por_mao(lado, W, dedos_q, palma_q, polo):
        """Punho em W, dedos pra `dedos_q` e palma pra `palma_q` (mundo), cotovelo do lado do `polo` (a Flexão de Braço)."""
        for n, M in braco_solto[lado].items():
            PB[p3.P + n].matrix_basis = M.copy()
        iks[lado].mute = False
        punhos[lado].location = W
        polos[lado].location = polo
        p3.atualizar()
        if lado not in polo_ok:
            polo_ok[lado] = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        iks[lado].mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        dedos_q = Vector(dedos_q).normalized()
        palma_q = Vector(palma_q)
        palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        # linha dos nós (indicador → mínimo) da mão no fim: de lado (s · dedos × palma); o antebraço gira (pronação) até ela ficar
        # nessa direção e o punho depois só acerta a palma, sem torcer (conserto de 11/10/2026 da Flexão de Braço)
        nos_q = dedos_q.cross(palma_q) * (1 if lado == "Left" else -1)
        ax = (f1 - f0).normalized()
        quer = nos_q - ax * nos_q.dot(ax)
        tem = pg._base(rig, lado)[1]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        n_m, _, y_m = pg._base(rig, lado)[:3]             # o resto no punho, pela base da PALMA (punho → nós, normal)
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        if lado in dedos_pose:
            for n, M in dedos_pose[lado].items():
                PB[p3.P + n].matrix_basis = M.copy()
            p3.atualizar()
        return (p3.cabeca(rig, lado + "Hand") - W).length

    DEDOS_Q = {L: Vector((-s * math.sin(math.radians(DENTRO)), -math.cos(math.radians(DENTRO)), 0.0)) for L, s in LADOS}
    PALMA_Q = Vector((0, 0, -1))
    POLO_T = {L: Vector((s * 0.40, 0.25, 0.05)) for L, s in LADOS}    # polo a partir do ombro: pra fora e pra trás (com o
                                                                    # punho à frente do ombro o cotovelo não fica atrás dele: deitado
                                                                    # ele abre pro lado e pra cima, como no fim da descida da flexão)

    def polo(lado):
        return c(lado + "Arm") + POLO_T[lado]

    def d_cotovelo(flex):
        """Distância ombro → punho (m) com o cotovelo dobrado `flex` graus."""
        return math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(flex)))

    def cotovelo_com(d):
        cs = (Lb ** 2 + La ** 2 - d * d) / (2 * Lb * La)
        return 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, cs))))

    # o punho: x na largura dos ombros, z com a palma encostando, y com o cotovelo a COTOVELO_BAIXO deitado
    W = {}
    for lado, s in LADOS:
        W[lado] = Vector((s * PUNHO_X, S_b[lado].y - 0.20, TOPO + 0.030))
    for volta in range(4):
        coluna(**BAIXO)
        for lado, s in LADOS:
            S = c(lado + "Arm")
            d = d_cotovelo(COTOVELO_BAIXO)
            dxz = (S.x - W[lado].x) ** 2 + (S.z - W[lado].z) ** 2
            W[lado].y = S.y - math.sqrt(max(d * d - dxz, 1e-6))
            if volta == 0:                # dedos esticados (pose local guardada, igual em todo quadro)
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo(lado))
                esticar_dedos(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
            for _ in range(3):            # o punho desce/sobe até a pele da palma (com a tenar) encostar
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo(lado))
                W[lado].z += (TOPO - AFUNDA_MAO) - zmin((lado + "Hand", lado + "HandThumb1"))
            if volta == 3:                # cada dedo dobra na base até encostar (vale em todo quadro)
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo(lado))
                dedos_no_chao(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        print("MÃOS volta %d | punho E (%.4f %.4f %.4f) D (%.4f %.4f %.4f)" % (volta, *W["Left"], *W["Right"]))

    def pose_u(u):
        """u = 0 em cima (segurando), 1 deitado: a coluna, o pescoço e as escápulas interpolados; as mãos paradas."""
        k = {n: CIMA[n] + (BAIXO[n] - CIMA[n]) * u for n in CIMA}
        coluna(**k)
        for lado, _ in LADOS:
            por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo(lado))

    estado = {"t": 0.0, "u": 0.0}

    def pose(t):
        """t = 0 (e 1): em cima, segurando o alongamento; deita no meio do ciclo (t = 0,5 deitado) e sobe de novo."""
        u = descida(t)
        estado["t"], estado["u"] = t, u
        pose_u(u)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, _, (nomes, dono) = _malha(bon)
        G = lambda partes: co[_grupo(nomes, dono, partes)]
        txt = []
        for L, s in LADOS:
            dedos = "/".join("%+.1f" % ((G(tuple("%sHand%s%d" % (L, d, i) for i in (1, 2, 3)))[:, 2].min() - TOPO) * 1000)
                             for d in p3.DEDOS + ("Thumb",))
            txt.append("%s: punho a %.1f mm do alvo, palma %+.1f, dedos %s, cotovelo (%.0f %.0f %.0f) mm, pé %+.1f dedos %+.1f joelho %+.1f mm" % (
                L[0], (c(L + "Hand") - W[L]).length * 1000, (G((L + "Hand",))[:, 2].min() - TOPO) * 1000, dedos,
                *(c(L + "ForeArm") * 1000), (G((L + "Foot",))[:, 2].min() - TOPO) * 1000,
                (G((L + "ToeBase",))[:, 2].min() - TOPO) * 1000, (G((L + "Leg",))[:, 2].min() - TOPO) * 1000))
        return ("u %.3f | do topo do colchonete (mm): pelve %+.1f coxas %+.1f peito %+.1f barriga %+.1f cabeça %+.1f | coluna_sinal %.1f | "
                "tórax × chão %.1f | cabeça × tronco %.1f | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | braço (ombro → punho) × chão %s | "
                "escápula %s mm | joelho %.0f/%.0f° | tornozelo %s | %s" % (
                    estado["u"], (G(("Hips",))[:, 2].min() - TOPO) * 1000, (G(COXAS)[:, 2].min() - TOPO) * 1000,
                    (G(("Spine2",))[:, 2].min() - TOPO) * 1000, (G(("Spine", "Spine1"))[:, 2].min() - TOPO) * 1000,
                    (G(("Head",))[:, 2].min() - TOPO) * 1000, tc.coluna_sinal(jj)[0], tc.torax_chao(jj)[0], tc.cabeca_tronco(jj)[0],
                    juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.1f" % a for a in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Arm", "Hand"]})),
                    "/".join("%+.0f" % a for a in tc.escapula_frente(jj)), juntas["joelhoE"], juntas["joelhoD"],
                    "/".join("%.0f" % a for a in tc.tornozelo(jj)), " | ".join(txt)))

    # ── colchonete: da ponta dos dedos das mãos (com folga) até depois dos pés ─────────────────────────────────────────────────
    pose_u(1.0)
    co, _, (nomes, dono) = _malha(bon)
    y_maos = float(co[_grupo(nomes, dono, MAO["Left"] + MAO["Right"])][:, 1].min())
    y_pes = float(co[_grupo(nomes, dono, ("LeftToeBase", "RightToeBase"))][:, 1].max())
    y_min, y_max = y_maos - 0.08, y_pes + 0.10
    colchonete = e3.caixa("colchonete", (0, (y_min + y_max) / 2, TOPO / 2), (LARGURA, y_max - y_min, TOPO), e3.mat_estofado(),
                          chanfro=0.004)
    print("COLCHONETE %.2f × %.2f m (y %.3f a %.3f)" % (LARGURA, y_max - y_min, y_min, y_max))

    for t in (0.0, T_DESCE[0], (T_DESCE[0] + T_DESCE[1]) / 2, 0.5, (T_SOBE[0] + T_SOBE[1]) / 2, 1.0):
        pose(t)
        co = _malha(bon)[0]
        print("t=%.3f | corpo x %.3f → %.3f, y %.3f → %.3f, z %.3f → %.3f | %s" % (
            t, co[:, 0].min(), co[:, 0].max(), co[:, 1].min(), co[:, 1].max(), co[:, 2].min(), co[:, 2].max(), info()))
    pose(0.0)
    print("COTOVELO em cima %.1f° (com a mão %.0f mm à frente do ombro deitado e %.0f mm em cima)" % (
        cotovelo_com((S_c["Left"] - W["Left"]).length), (S_b["Left"].y - W["Left"].y) * 1000, (S_c["Left"].y - W["Left"].y) * 1000))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.2, 0.25),
                camera_video=((3.4, -1.6, 1.0), (0, -0.2, 0.25), 50), info=info, apoios=[colchonete], afunda_apoio_mm=10.0)
