# Equipamentos simples em 3D (barra, anilha, halter, máquina) com materiais neutros.
import bpy, math
from mathutils import Vector, Matrix
import boneco3d as b3

ACO = (0.62, 0.63, 0.65, 1)
BORRACHA = (0.035, 0.035, 0.04, 1)
ESTOFADO = (0.06, 0.065, 0.075, 1)
ESTRUTURA = (0.16, 0.17, 0.19, 1)


def mat_aco():
    return b3.material_liso("Aco", ACO, rug=0.3, metal=1.0)


def mat_borracha():
    return b3.material_liso("Borracha", BORRACHA, rug=0.65)


def mat_estofado():
    return b3.material_liso("Estofado", ESTOFADO, rug=0.55)


def mat_estrutura():
    return b3.material_liso("Estrutura", ESTRUTURA, rug=0.4, metal=0.6)


def _cilindro(nome, raio, compr, loc, rot, mat, vertices=32, pai=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=raio, depth=compr, location=loc, rotation=rot, vertices=vertices)
    o = bpy.context.active_object
    o.name = nome
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    if pai is not None:
        o.parent = pai
    return o


def caixa(nome, centro, tamanho, mat, rot=(0, 0, 0), pai=None, chanfro=0.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centro, rotation=rot)
    o = bpy.context.active_object
    o.name = nome
    o.scale = tamanho
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if chanfro:
        m = o.modifiers.new("chanfro", "BEVEL")
        m.width = chanfro
        m.segments = 3
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    if pai is not None:
        o.parent = pai
    return o


def tubo(nome, a, b, raio, mat, pai=None, vertices=24):
    """Cilindro de a até b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    rot = d.to_track_quat("Z", "Y").to_euler()
    return _cilindro(nome, raio, d.length, (a + b) / 2, rot, mat, vertices, pai)


def barra(nome="barra", comprimento=2.0, raio_anilha=0.2, larg_anilha=0.05, pegada=1.32):
    """Barra olímpica ao longo do X, centrada na origem do vazio devolvido (mover o vazio move tudo)."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    rot = (0, math.radians(90), 0)
    _cilindro(nome + "_eixo", 0.0145, comprimento, (0, 0, 0), rot, mat_aco(), pai=raiz)
    for s in (-1, 1):
        x = s * (pegada / 2 + 0.03 + larg_anilha / 2)
        _cilindro(nome + "_anilha%+d" % s, raio_anilha, larg_anilha, (x, 0, 0), rot, mat_borracha(), vertices=48, pai=raiz)
        _cilindro(nome + "_miolo%+d" % s, 0.03, larg_anilha + 0.012, (x, 0, 0), rot, mat_aco(), pai=raiz)
        _cilindro(nome + "_trava%+d" % s, 0.026, 0.03, (s * (pegada / 2 + 0.012), 0, 0), rot, mat_aco(), pai=raiz)
    return raiz


def halter(nome="halter", pegada=0.13, raio=0.016, raio_anilha=0.07, larg_anilha=0.05):
    """Halter ao longo do X, pegada no meio, centrado na origem do vazio devolvido (lotes de 04/10/2026)."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    rot = (0, math.radians(90), 0)
    _cilindro(nome + "_eixo", raio, pegada + 2 * larg_anilha + 0.02, (0, 0, 0), rot, mat_aco(), pai=raiz)
    for s in (-1, 1):
        x = s * (pegada / 2 + larg_anilha / 2)
        _cilindro(nome + "_anilha%+d" % s, raio_anilha, larg_anilha, (x, 0, 0), rot, mat_borracha(), vertices=40,
                  pai=raiz)
    return raiz


def banco(nome="banco", y0=-0.34, y1=0.86, topo=0.44, largura=0.30, espessura=0.06):
    """Banco reto ao longo do Y (de y0 a y1, cabeça pra +Y), estofado com o topo em `topo` m e estrutura embaixo:
    viga central, 2 colunas e 2 pés no chão (supinos, elevação pélvica — lotes de 04/10/2026)."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    meio, compr = (y0 + y1) / 2, y1 - y0
    caixa(nome + "_estofado", (0, meio, topo - espessura / 2), (largura, compr, espessura), mat_estofado(),
          pai=raiz, chanfro=0.015)
    base = topo - espessura                                   # embaixo do estofado
    caixa(nome + "_viga", (0, meio, base - 0.025), (0.08, compr - 0.16, 0.05), mat_estrutura(), pai=raiz)
    for y in (y0 + 0.10, y1 - 0.10):
        caixa(nome + "_coluna", (0, y, (base - 0.05) / 2 + 0.02), (0.06, 0.06, base - 0.09), mat_estrutura(),
              pai=raiz)
        caixa(nome + "_pe", (0, y, 0.02), (largura + 0.10, 0.07, 0.04), mat_estrutura(), pai=raiz)
    return raiz


def banco_inclinado(nome="banco", angulo=30, assento=0.44, junta_y=0.0, encosto=0.95, largura=0.28, espessura=0.06):
    """Banco inclinado (supino inclinado, 04/10/2026): assento reto com o topo em `assento` m, à frente (−Y) da junta,
    e encosto subindo pra +Y a `angulo` graus da horizontal a partir da junta (topo do estofado passa pela junta)."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    a = math.radians(angulo)
    u = Vector((0, math.cos(a), math.sin(a)))                 # ao longo do encosto, pra cima
    n = Vector((0, -math.sin(a), math.cos(a)))                # normal do encosto (pro lado do corpo)
    junta = Vector((0, junta_y, assento))
    caixa(nome + "_assento", (0, junta_y - 0.17, assento - espessura / 2), (largura + 0.02, 0.34, espessura),
          mat_estofado(), pai=raiz, chanfro=0.015)
    caixa(nome + "_encosto", junta + u * (encosto / 2) - n * (espessura / 2), (largura, encosto, espessura),
          mat_estofado(), rot=(a, 0, 0), pai=raiz, chanfro=0.015)
    meio_enc = junta + u * (encosto * 0.55) - n * espessura   # embaixo do meio do encosto
    caixa(nome + "_coluna_encosto", (0, meio_enc.y, (meio_enc.z + 0.04) / 2), (0.06, 0.06, meio_enc.z - 0.04),
          mat_estrutura(), pai=raiz)
    caixa(nome + "_coluna_assento", (0, junta_y - 0.17, (assento - espessura + 0.04) / 2),
          (0.06, 0.06, assento - espessura - 0.04), mat_estrutura(), pai=raiz)
    y0, y1 = junta_y - 0.30, meio_enc.y + 0.10
    caixa(nome + "_base", (0, (y0 + y1) / 2, 0.03), (0.08, y1 - y0, 0.04), mat_estrutura(), pai=raiz)
    for y in (y0 + 0.035, y1 - 0.035):
        caixa(nome + "_pe", (0, y, 0.02), (largura + 0.12, 0.07, 0.04), mat_estrutura(), pai=raiz)
    return raiz


def barra_fixa(nome="barra_fixa", altura=2.3, meia=0.75, raio=0.016, recuo=0.45, lado=0.06):
    """Barra fixa (lote 2, 05/10/2026): barra de aço ao longo do X com o eixo na origem do vazio devolvido, a `altura` m
    do chão (mover o vazio move tudo). As pontas da barra entram em 2 braços horizontais que vêm de 2 colunas plantadas
    `recuo` m à frente dela (−Y: quem pendura fica de frente pras colunas, como na barra de parede), por fora das pontas
    (x = ±(meia + lado/2)); tubo quadrado de `lado` m, pé comprido no chão ao longo do Y e uma travessa baixa ligando as
    colunas. Nada passa no meio, onde o corpo sobe e desce, nem atrás dele. Barra de 32 mm (raio 0,016): a medida comum
    de barra fixa, 1,25" (TITAN Series 1.25" Single Pull-Up Bar: "Overall Diameter 1.25-in.")."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    xc = meia + lado / 2
    # tudo em anéis (_em_aneis, como nas paralelas): a forma é a mesma, mas a checagem não espalha milhares de pontos
    # em triângulos de 1,5–2 m — o chanfro das caixas só pega as quinas (limite por ângulo), não os cortes
    _em_aneis(_cilindro(nome + "_barra", raio, 2 * xc, (0, 0, 0), (0, math.radians(90), 0), mat_aco(), pai=raiz))
    for s in (-1, 1):
        _em_aneis(caixa(nome + "_braco%+d" % s, (s * xc, -recuo / 2, 0), (lado, recuo + lado, lado), mat_estrutura(),
                        pai=raiz))
        _em_aneis(caixa(nome + "_coluna%+d" % s, (s * xc, -recuo, (lado / 2 - altura) / 2), (lado, lado, altura + lado / 2),
                        mat_estrutura(), pai=raiz))
        _em_aneis(caixa(nome + "_pe%+d" % s, (s * xc, -recuo, 0.02 - altura), (lado + 0.02, 0.80, 0.04), mat_estrutura(),
                        pai=raiz))
    _em_aneis(caixa(nome + "_travessa", (0, -recuo, 0.10 - altura), (2 * xc, lado, lado), mat_estrutura(), pai=raiz))
    return raiz


def _em_aneis(o, passo=0.04):
    """Corta o tubo em anéis a cada `passo` m ao longo dele (só a malha; a forma não muda). A checagem espalha pontos na
    superfície do equipamento triângulo por triângulo (grade de 8 mm nos 2 lados que saem do 1º vértice): um triângulo
    comprido e fino de um tubo de 1,5 m vira ~17 mil pontos, e as paralelas levavam 73 s por quadro só nisso. Em anéis
    os triângulos ficam curtos e a mesma superfície sai com poucos milhares de pontos."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    longas = [e for e in bm.edges if e.calc_length() > 1.5 * passo]
    if longas:
        cortes = int(math.ceil(max(e.calc_length() for e in longas) / passo)) - 1
        bmesh.ops.subdivide_edges(bm, edges=longas, cuts=cortes, use_grid_fill=True)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    return o


def paralelas(nome="paralelas", largura=0.50, altura=1.10, comprimento=1.40, raio=0.019, y0=0.0, raio_coluna=0.025,
              sobra=0.04):
    """Paralelas de mergulho (Mergulho nas Paralelas, lote 2, 05/10/2026): 2 barras de aço redondas ao longo do Y, com os
    eixos em x = ±largura/2 e na altura `altura` (eixo da barra), cada uma em cima de 2 colunas (uma em cada ponta, em
    y0 ± comprimento/2, a barra passando `sobra` m de cada uma) chumbadas no chão por uma sapata. Entre as barras e
    entre as colunas fica livre: o corpo desce no meio e as pernas passam por dentro. Medidas de academia: barra de
    38 mm (Lacertosus Training Dip Station: "Overlarge handle diameter of 38 mm") e 50 cm entre os eixos (FIG Apparatus
    Norms 2023, MAG 5 Parallel Bars: "Distance between bars from 42 cm to 52 cm"; Lacertosus: "The distance between
    the handles' axes at the narrowest and widest points measures 52 and 62 cm"). Devolve a raiz (mover a raiz move
    tudo) e as 2 barras [+X, −X]: o eixo local Z de cada barra é o eixo dela (pegada: checagem3d.Barra(barra, raio,
    meio_compr, eixo=(0, 0, 1)))."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    ya, yb = y0 - comprimento / 2, y0 + comprimento / 2
    barras = []
    for s in (1, -1):
        x = s * largura / 2
        barras.append(_em_aneis(tubo(nome + "_barra%+d" % s, (x, ya - sobra, altura), (x, yb + sobra, altura), raio,
                                     mat_aco(), pai=raiz, vertices=32)))
        for k, y in enumerate((ya, yb)):
            _em_aneis(tubo(nome + "_coluna%+d%s" % (s, "ft"[k]), (x, y, 0.012), (x, y, altura), raio_coluna,
                           mat_estrutura(), pai=raiz))
            caixa(nome + "_sapata%+d%s" % (s, "ft"[k]), (x, y, 0.006), (0.12, 0.12, 0.012), mat_estrutura(), pai=raiz,
                  chanfro=0.003)
    return raiz, barras


def banco_hiperextensao(nome="banco_hiper", origem=(0, 0, 1.0), angulo=45, estofado=(-0.44, -0.14, 0.12, 0.075, 0.40),
                        rolos=(-0.80, -0.09, 0.05, 0.14, 0.12), plataforma=(-0.93, -0.07, 0.25, 0.015, 0.46),
                        viga=0.27, frente=-0.30, tubo=0.06, alto=None, travessa=None):
    """Banco de hiperextensão a 45° (Hiperextensão Lombar, lote 3, 05/10/2026), o modelo de academia em que o corpo fica
    inclinado `angulo` graus do chão (Technogym "Pure Strength 45 Degree Hyperextension Bench" PG05, o banco do estudo de
    Andersen et al., J Sports Sci Med 2021; Body-Solid GHYP345, "exact 45° angle"): 2 estofados das coxas lado a lado, 2
    rolos acolchoados que prendem a parte de trás dos tornozelos, plataforma dos pés (2 chapas, uma de cada lado da haste
    dos rolos) e a estrutura em tubo quadrado (viga inclinada embaixo dos estofados, coluna da frente, pé de trás, base no
    chão, travessa dos estofados e haste dos rolos, que sobe entre os pés).
    Medidas no referencial do corpo, em m: `origem` = um ponto da linha do corpo (a articulação do quadril), s = ao longo
    do corpo pra cabeça (sobe `angulo` graus pra −Y), d = pra frente do corpo (o lado do peito: desce pra −Y), x = de lado.
      estofado = (s_baixo, s_cima, d_topo, espessura, largura): topo dos estofados no plano d = d_topo (onde a pele das
                 coxas encosta), de s_baixo até a borda de cima s_cima;
      rolos = (s, d_eixo, raio, comprimento, x): eixo dos 2 rolos (ao longo de X) em (s, d_eixo), centrados em ±x;
      plataforma = (s_topo, d0, d1, espessura, largura): topo das chapas no plano s = s_topo (onde a sola encosta), de d0
                   a d1;
      viga = d do eixo da viga; frente = s onde a coluna da frente encontra a viga; alto = s da ponta de cima da viga
      (padrão: 5 cm antes da borda de cima do estofado); travessa = s da travessa embaixo dos estofados (padrão: o meio
      deles) — embaixo, com o tronco dobrado, os braços cruzados passam perto da estrutura atrás do estofado.
    Devolve 4 raízes, cada uma um equipamento da cena: "estofado", "rolos" e "plataforma" são APOIO do corpo (encostar é o
    certo) e a "estrutura" não pode encostar nele. Tubos compridos em anéis (_em_aneis): a checagem fica rápida."""
    th = math.radians(90 - angulo)                            # inclinação do corpo a partir da vertical
    u = Vector((0, -math.sin(th), math.cos(th)))              # ao longo do corpo, pra cabeça
    d = Vector((0, -math.cos(th), -math.sin(th)))             # pra frente do corpo (pro chão, na frente)
    O = Vector(origem)
    rot_u = (math.pi / 2 + th, 0, 0)                          # caixa com o Y local ao longo de u e o Z local em d
    rot_s = (th, 0, 0)                                        # caixa com o Z local ao longo de u (Y local em −d)

    def P(s, dd, x=0.0):
        return O + u * s + d * dd + Vector((x, 0, 0))

    def raiz_nova(sufixo):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        return r

    est, rol, pla, estr = (raiz_nova(n) for n in ("estofado", "rolos", "plataforma", "estrutura"))
    # estofados das coxas: 2 almofadas lado a lado (uma embaixo de cada coxa), vão de 4 cm no meio
    s0, s1, d_topo, esp, larg = estofado
    meia = (larg - 0.04) / 2
    for k in (-1, 1):
        caixa(nome + "_estofado%+d" % k, P((s0 + s1) / 2, d_topo + esp / 2, k * (0.02 + meia / 2)), (meia, s1 - s0, esp),
              mat_estofado(), rot=rot_u, pai=est, chanfro=0.018)
    # rolos dos tornozelos (espuma) num eixo de aço que passa pela haste do meio
    s_r, d_r, raio, compr, x_r = rolos
    for k in (-1, 1):
        _cilindro(nome + "_rolo%+d" % k, raio, compr, P(s_r, d_r, k * x_r), (0, math.radians(90), 0), mat_estofado(),
                  vertices=32, pai=rol)
    # plataforma dos pés: 2 chapas, uma de cada lado da haste dos rolos
    s_p, d0, d1, esp_p, larg_p = plataforma
    meia_p = (larg_p - tubo - 0.02) / 2
    for k in (-1, 1):
        caixa(nome + "_chapa%+d" % k, P(s_p - esp_p / 2, (d0 + d1) / 2, k * (tubo / 2 + 0.01 + meia_p / 2)),
              (meia_p, d1 - d0, esp_p), mat_aco(), rot=rot_s, pai=pla, chanfro=0.003)
    # estrutura: viga inclinada embaixo dos estofados, da plataforma até perto da borda de cima
    s_baixo, s_alto = s_p - 0.07, (s1 - 0.05 if alto is None else alto)
    _em_aneis(caixa(nome + "_viga", P((s_baixo + s_alto) / 2, viga), (tubo, s_alto - s_baixo, tubo * 4 / 3), mat_estrutura(),
                    rot=rot_u, pai=estr, chanfro=0.006))
    # travessa embaixo dos estofados + poste até a viga
    d_trav = d_topo + esp + 0.025
    s_trav = (s0 + s1) / 2 if travessa is None else travessa
    _em_aneis(caixa(nome + "_travessa", P(s_trav, d_trav), (larg - 0.06, 0.05, 0.05), mat_estrutura(), rot=rot_u,
                    pai=estr, chanfro=0.005))
    caixa(nome + "_poste_estofado", P(s_trav, (d_trav + viga) / 2), (0.05, 0.05, viga - d_trav), mat_estrutura(),
          rot=rot_u, pai=estr, chanfro=0.005)
    # haste dos rolos: sai da viga e sobe entre os pés até o eixo dos rolos; eixo de aço de um rolo ao outro
    _em_aneis(caixa(nome + "_haste_rolos", P(s_r, (viga + d_r) / 2), (0.05, 0.05, viga - d_r + 0.03), mat_estrutura(),
                    rot=rot_u, pai=estr, chanfro=0.005))
    _em_aneis(_cilindro(nome + "_eixo_rolos", 0.012, 2 * x_r + compr - 0.02, P(s_r, d_r), (0, math.radians(90), 0), mat_aco(),
                        pai=estr))
    # coluna da frente (vertical, do chão até a viga) e pé de trás (da ponta de baixo da viga ao chão), base no chão
    topo_f, ponta = P(frente, viga), P(s_baixo + 0.04, viga)
    _em_aneis(caixa(nome + "_coluna", (0, topo_f.y, (topo_f.z + 0.04) / 2), (tubo, tubo, topo_f.z - 0.04), mat_estrutura(),
                    pai=estr, chanfro=0.006))
    caixa(nome + "_pe_tras", (0, ponta.y, (ponta.z + 0.04) / 2), (tubo, tubo, max(ponta.z - 0.04, 0.02)), mat_estrutura(),
          pai=estr, chanfro=0.006)
    y0, y1 = topo_f.y - 0.06, ponta.y + 0.06
    _em_aneis(caixa(nome + "_base", (0, (y0 + y1) / 2, 0.025), (tubo, y1 - y0, 0.05), mat_estrutura(), pai=estr,
                    chanfro=0.005))
    for y in (topo_f.y, ponta.y):
        _em_aneis(caixa(nome + "_pe", (0, y, 0.02), (0.56, 0.07, 0.04), mat_estrutura(), pai=estr, chanfro=0.005))
    return {"estofado": est, "rolos": rol, "plataforma": pla, "estrutura": estr}


# ── POLIA: estação de cabo (Tríceps Testa na Polia, lote 3, 05/10/2026) ───────────────────────────────────────────────────
# Coluna única com a caixa da pilha de pesos (a pilha fica parada: o app não mostra a carga), um trilho na frente dela e
# um carrinho no trilho com a roldana na altura pedida (baixa ~0,1–0,4 m; alta ~2,0–2,2 m). O cabo desce pelo trilho
# (pedaço parado), dá a volta por baixo da roldana e sai em linha reta até o engate do acessório — esse pedaço é UM
# objeto, raiz própria "<nome>_cabo", com a origem no eixo da roldana, que GIRA e ESTICA (escala no Z local) a cada
# quadro; ele leva a marca "anima_escala", que o exportar_exercicio.py usa pra gravar a escala SÓ nele.
# Uso numa cena (acessório: barra_polia hoje; corda, puxador e barra W entram como funções novas do mesmo jeito — origem
# no eixo da pegada, engate no +Y local a `engate` m dela):
#   pol = e3.polia("polia", y=1.42, altura=0.25)            # roldana baixa, de frente pra −Y
#   barra = e3.barra_polia("barra_polia")
#   no pose(t): u = pol.direcao(c)                            # c = eixo da pegada no quadro; o gancho gira livre e se
#               e3.por_acessorio(barra, c, eixo, u)           # alinha com o cabo
#               pol.ligar(c + u * e3.ENGATE_BARRA_POLIA)     # cabo da saída da roldana até o engate
#   Cena(pose, [barra] + pol.raizes, ...)
# Medidas (escolha da fábrica, de estação comum): cabo passando a 45 mm do eixo da roldana (roldana de ~10,5 cm), cabo de
# aço de 6 mm, coluna de 2,15 m. Peças compridas em anéis (_em_aneis): a checagem fica rápida.
ENGATE_BARRA_POLIA = 0.13          # do eixo da barra até onde o cabo começa (dentro da bola de borracha do cabo)
CARENAGEM = (0.10, 0.105, 0.115, 1)


def mat_carenagem():
    return b3.material_liso("Carenagem", CARENAGEM, rug=0.5, metal=0.3)


class Polia:
    """Estação de cabo pronta na cena (polia()). raizes = [torre (parada), cabo (gira e estica)]: as duas entram em
    Cena.equipamentos junto com o acessório. O cabo desce pelo lado da torre e dá a volta por baixo da roldana."""

    def __init__(self, torre, cabo, centro, raio, frente):
        self.torre, self.cabo = torre, cabo
        self.raizes = [torre, cabo]
        self.centro = Vector(centro)          # eixo da roldana (mundo)
        self.raio = raio                      # eixo da roldana → eixo do cabo no canal
        self.frente = Vector(frente)
        self.saida = None                     # onde o cabo deixa a roldana no último ligar()
        self.comprimento = 0.0                # comprimento do cabo reto no último ligar() (m)

    def tangente(self, p):
        """Saída do cabo (ponto da roldana onde ele fica tangente), direção do cabo (da saída pra p) e a normal
        (eixo da roldana → saída), no plano vertical que passa pelo eixo da roldana e por p."""
        cima = Vector((0.0, 0.0, 1.0))
        v = Vector(p) - self.centro
        f = Vector((v.x, v.y, 0.0))
        f = f.normalized() if f.length > 1e-6 else self.frente.copy()
        vf, vc = v.dot(f), v.dot(cima)
        dist = math.hypot(vf, vc)
        if dist <= self.raio * 1.01:
            raise ValueError("polia: ponto %s dentro da roldana" % (tuple(p),))
        a = math.atan2(vc, vf) + math.asin(self.raio / dist)
        d = f * math.cos(a) + cima * math.sin(a)
        n = f * math.sin(a) - cima * math.cos(a)
        return self.centro + n * self.raio, d, n

    def direcao(self, p):
        """Direção (mundo, unitária) de p pra saída da roldana: por onde passa o cabo que chega em p. O gancho do
        acessório gira livre em volta da pegada e se alinha com ela (o eixo da pegada fica na linha do cabo)."""
        return -self.tangente(p)[1]

    def ligar(self, engate):
        """Cabo reto da saída da roldana até `engate` (mundo): gira e estica o objeto do cabo. Chamar a cada quadro,
        depois de pôr o acessório. Devolve o comprimento do cabo reto (m)."""
        T, d, n = self.tangente(engate)
        L = (Vector(engate) - T).length
        R = Matrix((n.cross(d), n, d)).transposed()          # colunas: X = eixo da roldana, Y = pra saída, Z = cabo
        self.cabo.matrix_world = Matrix.Translation(self.centro) @ R.to_4x4() @ Matrix.Diagonal((1.0, 1.0, L, 1.0))
        self.saida, self.comprimento = T, L
        return L


def polia(nome="polia", x=0.0, y=1.45, altura=0.25, frente=(0, -1, 0), raio=0.045, raio_cabo=0.003, alto=2.15,
          gira=False):
    """Estação de cabo de coluna única (ver o bloco acima): roldana com o eixo em (x, y, altura), virada pra `frente`
    (horizontal; padrão −Y), o cabo passando a `raio` m do eixo dela; trilho, carrinho, caixa da pilha de pesos e base
    ficam atrás da roldana. Devolve um Polia (raizes, direcao(), ligar()).
    gira=True (lote 3, 06/10/2026): o carrinho tem o garfo que gira (cabo saindo de lado ou na diagonal) — devolve uma
    PoliaGiratoria (ver o bloco dela, no fim do arquivo); sem isso, nada muda."""
    f = Vector(frente)
    f = Vector((f.x, f.y, 0.0)).normalized()
    cima = Vector((0.0, 0.0, 1.0))
    s = cima.cross(f)                                         # de lado (o eixo da roldana)
    giro = math.atan2(f.x, -f.y)                              # caixa com X local = s, Y local = −f
    O = Vector((x, y, 0.0))

    def P(df, ds, z):
        return O + f * df + s * ds + cima * z

    def bloco(nome_, df, ds, z, tam, mat, chanfro=0.006, aneis=False):
        o = caixa(nome + nome_, P(df, ds, z), tam, mat, rot=(0, 0, giro), pai=torre, chanfro=chanfro)
        return _em_aneis(o) if aneis else o

    def cilindro_lado(nome_, raio_, compr, df, ds, z, mat):
        return _cilindro(nome + nome_, raio_, compr, P(df, ds, z), (0, math.radians(90), giro), mat, pai=torre)

    torre = bpy.data.objects.new(nome + "_torre", None)
    bpy.context.scene.collection.objects.link(torre)
    trilho = -0.10                                            # eixo do trilho (atrás da roldana)
    bloco("_base", -0.22, 0, 0.0125, (0.56, 0.68, 0.025), mat_estrutura(), chanfro=0.004, aneis=True)
    bloco("_pilha", -0.34, 0, 0.9625, (0.44, 0.36, 1.875), mat_carenagem(), chanfro=0.012)
    bloco("_trilho", trilho, 0, (0.025 + alto) / 2, (0.05, 0.05, alto - 0.025), mat_estrutura(), aneis=True)
    for k, z in enumerate((0.10, alto - 0.20)):
        bloco("_suporte%d" % k, -0.1425, 0, z, (0.04, 0.035, 0.05), mat_estrutura(), chanfro=0.003)
    bloco("_viga", -0.31, 0, alto - 0.03, (0.08, 0.42, 0.06), mat_estrutura(), aneis=True)
    bloco("_roldana_alta", -0.06, 0, alto - 0.11, (0.06, 0.10, 0.10), mat_estrutura(), chanfro=0.004)
    # carrinho no trilho: luva, pino de regulagem, garfo e roldana (flanges + miolo + eixo)
    bloco("_carrinho", trilho, 0, altura, (0.085, 0.085, 0.16), mat_estrutura(), chanfro=0.005)
    cilindro_lado("_pino", 0.007, 0.035, trilho, 0.0425 + 0.0175, altura, mat_aco())
    cilindro_lado("_pino_bola", 0.012, 0.016, trilho, 0.0425 + 0.035 + 0.008, altura, mat_borracha())
    for k in (-1, 1):
        bloco("_garfo%+d" % k, -0.015, k * 0.017, altura, (0.004, 0.09, 0.11), mat_estrutura(), chanfro=0.0015)
        cilindro_lado("_flange%+d" % k, raio + 0.007, 0.004, 0, k * 0.0095, altura, mat_aco())
    cilindro_lado("_miolo", raio - 0.0025, 0.015, 0, 0, altura, mat_aco())
    cilindro_lado("_eixo", 0.007, 0.042, 0, 0, altura, mat_aco())
    # cabo parado: sobe da roldana pelo lado da torre até a roldana de cima (dentro da caixinha no alto do trilho)
    _em_aneis(tubo(nome + "_cabo_trilho", P(-raio, 0, altura), P(-raio, 0, alto - 0.16), raio_cabo, mat_aco(), pai=torre,
                   vertices=12))
    # cabo que mexe: cilindro de 1 m no Z local, a `raio` do eixo no Y local (a origem fica no eixo da roldana)
    bpy.ops.mesh.primitive_cylinder_add(radius=raio_cabo, depth=1.0, location=(0, raio, 0.5), vertices=12)
    cabo = bpy.context.active_object
    cabo.name = nome + "_cabo"
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.ops.object.shade_smooth()
    cabo.data.materials.append(mat_aco())
    _em_aneis(cabo)
    cabo["anima_escala"] = True                               # exportar_exercicio.py: grava a escala só deste objeto
    if gira:                                                  # carrinho com o garfo que gira (PoliaGiratoria, abaixo)
        roldana = _garfo_giratorio(nome, torre, P, giro, raio, altura)
        pol = PoliaGiratoria(torre, roldana, cabo, P(-raio, 0, altura), raio, f)
        pol.ligar(P(0.6, 0, altura + 0.3))
        return pol
    pol = Polia(torre, cabo, P(0, 0, altura), raio, f)
    pol.ligar(P(0.6, 0, altura + 0.3))                        # pose de repouso (a cena põe o certo a cada quadro)
    return pol


def barra_polia(nome="barra_polia", comprimento=0.508, raio=0.01524, engate=ENGATE_BARRA_POLIA):
    """Barra reta curta de polia com o engate no meio (lote 3, 05/10/2026): 20" (0,508 m) com pegada de borracha de 1,2"
    (30,5 mm) — Synergee Straight Bar Cable Attachment: lengths "20"", Rubber Grip Diameters "1.2"", "a 360-degree
    swivel", "a universal attachment point that will fit on most cable machine carabiner clips". Eixo da barra no X local
    e o engate no +Y local (luva giratória no meio → orelha → mosquetão → ponteira e bola de borracha do cabo), com o cabo
    começando a `engate` m do eixo. Devolve a raiz (vazio no eixo, no meio): use por_acessorio() pra pôr no quadro."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    rot = (0, math.radians(90), 0)
    meio = comprimento / 2
    _em_aneis(_cilindro(nome + "_nucleo", 0.0125, comprimento, (0, 0, 0), rot, mat_aco(), pai=raiz))
    for s in (-1, 1):
        _cilindro(nome + "_pegada%+d" % s, raio, meio - 0.064, (s * (0.045 + (meio - 0.064) / 2), 0, 0), rot,
                  mat_borracha(), pai=raiz)
        _cilindro(nome + "_ponta%+d" % s, raio + 0.0012, 0.018, (s * (meio - 0.009), 0, 0), rot, mat_aco(), pai=raiz)
    _cilindro(nome + "_luva", 0.020, 0.07, (0, 0, 0), rot, mat_aco(), pai=raiz)
    caixa(nome + "_orelha", (0, 0.034, 0), (0.008, 0.032, 0.022), mat_aco(), pai=raiz, chanfro=0.003)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.016, minor_radius=0.0035, major_segments=24, minor_segments=8,
                                     location=(0, 0.072, 0))
    mosq = bpy.context.active_object
    mosq.name = nome + "_mosquetao"
    mosq.scale = (1.0, 1.6, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    mosq.data.materials.append(mat_aco())
    mosq.parent = raiz
    _cilindro(nome + "_ponteira", 0.0045, 0.03, (0, 0.11, 0), (math.radians(-90), 0, 0), mat_aco(), vertices=16, pai=raiz)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, segments=16, ring_count=8, location=(0, engate + 0.007, 0))
    bola = bpy.context.active_object
    bola.name = nome + "_bola"
    bpy.ops.object.shade_smooth()
    bola.data.materials.append(mat_borracha())
    bola.parent = raiz
    return raiz


def por_acessorio(raiz, centro, eixo, para_cabo):
    """Põe o acessório da polia no quadro: origem em `centro` (eixo da pegada), X local ao longo de `eixo` e o engate (+Y
    local) virado pra `para_cabo` (polia.direcao(centro)); o gancho gira livre em volta da pegada, como o de verdade."""
    x = Vector(eixo).normalized()
    y = Vector(para_cabo) - x * Vector(para_cabo).dot(x)
    y.normalize()
    raiz.matrix_world = Matrix.Translation(Vector(centro)) @ Matrix((x, y, x.cross(y))).transposed().to_4x4()


# ── CORDA de polia (Tríceps Testa na Polia Alta em Pé, lote 3, 05/10/2026; serve também pra Rosca Martelo na Polia) ──────
# Corda de tríceps comum: 27" de ponta a ponta com o engate no meio, corda trançada e batentes de borracha maciça nas
# pontas (CAP Barbell MB-ROPE: "Rope Length: 27 inches (end to end) with center attachment"; "Heavy duty braided
# Polypropylene rope and solid rubber stoppers at each end"); grossura de 28 mm (pedido do Weslley: ~25–30 mm). A corda
# dobra no meio dentro de uma luva de aço presa num olhal; o mosquetão do cabo prende no olhal (como na barra_polia).
# As peças mexem uma em relação à outra (a distância entre as mãos muda), então cada uma é uma raiz (a checagem de
# rigidez é por raiz) e todas entram em Cena.equipamentos junto com polia.raizes:
#   gancho  — luva + olhal + mosquetão + ponteira e bola do cabo; origem no ponto onde as 2 pernas se juntam (dentro da
#             luva), engate (+Y local) virado pro cabo;
#   perna±1 — a corda do gancho até a entrada na mão: comprimento FIXO (a corda não estica) — é a posição do gancho que
#             sai das 2 mãos (as 2 pernas esticadas, o gancho na linha do cabo). Sem escala no GLB;
#   ponta±1 — a corda dentro da mão + o batente logo depois dela; origem no vão da mão, X local ao longo da corda, do
#             lado do gancho (entrada) pro batente: checagem3d.Barra(ponta, raio, meia_pegada) mede a pegada.
# Uso numa cena (polia alta atrás, mãos em pegada neutra; a mão +1 é a de +X):
#   corda = e3.corda_polia("corda")
#   no pose(t): eng = corda.por({1: (vao_E, eixo_E), -1: (vao_D, eixo_D)}, pol.direcao)   # eixo: entrada → batente
#               pol.ligar(eng)
#   Cena(pose, corda.raizes + pol.raizes, pegadas=[("Left", ck.Barra(corda.pontas[1], corda.raio, corda.meia)), ...])
ENGATE_CORDA = 0.143               # do ponto onde as pernas se juntam até onde o cabo começa (dentro da bola do cabo)
CORDA = (0.045, 0.045, 0.05, 1)


def mat_corda():
    return b3.material_liso("Corda", CORDA, rug=0.85)


class Corda:
    """Corda da polia pronta na cena (corda_polia()): raizes = [gancho, perna+1, perna−1, ponta+1, ponta−1]."""

    def __init__(self, gancho, pernas, pontas, perna, meia, raio, engate):
        self.gancho, self.pernas, self.pontas = gancho, pernas, pontas
        self.raizes = [gancho, pernas[1], pernas[-1], pontas[1], pontas[-1]]
        self.perna = perna                # comprimento de cada perna (junção → entrada na mão), m
        self.meia = meia                  # vão da mão → entrada (e → saída) da corda na mão, m
        self.raio = raio                  # raio da corda, m
        self.engate = engate
        self.juncao = None                # onde as pernas se juntam no último por()
        self.entradas = {}                # onde cada perna entra na mão no último por()

    def por(self, pegadas, direcao):
        """Põe a corda no quadro e devolve o engate (onde o cabo começa: polia.ligar(engate)). pegadas = {+1: (vão,
        eixo), −1: (vão, eixo)}: vão = ponto do eixo da corda no meio da mão (o da pegada3d) e eixo = direção da corda
        dentro da mão, do lado por onde ela entra (o do gancho) pro lado do batente. direcao = polia.direcao (ponto →
        direção unitária do cabo, pra roldana). As 2 pernas ficam esticadas no comprimento delas: o gancho fica a igual
        distância das 2 entradas, na reta que sai do meio delas na direção do cabo (o equilíbrio das 3 forças)."""
        E = {s: Vector(c) - Vector(e).normalized() * self.meia for s, (c, e) in pegadas.items()}
        M = (E[1] + E[-1]) / 2
        w = E[1] - E[-1]
        if w.length / 2 >= self.perna * 0.98:
            raise ValueError("corda: mãos longe demais pras pernas (%.3f m entre as entradas)" % w.length)
        h = math.sqrt(self.perna ** 2 - (w.length / 2) ** 2)
        wn = w.normalized()
        u = Vector(direcao(M))
        for _ in range(5):
            up = (u - wn * u.dot(wn)).normalized()
            J = M + up * h
            u = Vector(direcao(J + u * self.engate))
        por_acessorio(self.gancho, J, wn, u)
        for s in (1, -1):
            c, e = Vector(pegadas[s][0]), Vector(pegadas[s][1]).normalized()
            z = (E[s] - J).normalized()               # perna: Z local da junção até a entrada na mão
            x = wn - z * wn.dot(z)
            x = x.normalized() if x.length > 1e-6 else z.orthogonal().normalized()
            self.pernas[s].matrix_world = Matrix.Translation(J) @ Matrix((x, z.cross(x), z)).transposed().to_4x4()
            y = (J - E[s]) - e * (J - E[s]).dot(e)    # ponta: X local ao longo da corda, Y pro lado do gancho
            y = y.normalized() if y.length > 1e-6 else e.orthogonal().normalized()
            self.pontas[s].matrix_world = Matrix.Translation(c) @ Matrix((e, y, e.cross(y))).transposed().to_4x4()
        self.juncao, self.entradas = J, E
        return J + u * self.engate


def corda_polia(nome="corda", raio=0.014, perna=0.18, meia=0.05, raio_batente=0.021, compr_batente=0.045,
                folga_batente=0.003, engate=ENGATE_CORDA):
    """Corda de tríceps da polia (ver o bloco acima): corda de `raio` m, cada perna com `perna` m da junção até a entrada
    na mão, `meia` m do vão da mão até a entrada/saída dela na mão, batente de borracha (`raio_batente`, `compr_batente`)
    `folga_batente` m depois da saída. Medidas: 27" (0,686 m) de ponta a ponta ≈ 2 × (perna + 2 × meia + folga + batente
    + ~1,5 cm dobrados dentro da luva) = 2 × 0,343 m. Devolve um Corda (raizes, pontas, por())."""
    def raiz_nova(n):
        r = bpy.data.objects.new(n, None)
        bpy.context.scene.collection.objects.link(r)
        return r

    # gancho: luva (ao longo do +Y local, cobrindo a dobra), olhal, mosquetão, ponteira e bola do cabo
    gancho = raiz_nova(nome + "_gancho")
    rot_y = (math.radians(-90), 0, 0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=raio, segments=16, ring_count=8, location=(0, 0, 0))
    no = bpy.context.active_object
    no.name = nome + "_dobra"
    bpy.ops.object.shade_smooth()
    no.data.materials.append(mat_corda())
    no.parent = gancho
    _cilindro(nome + "_luva", 0.020, 0.06, (0, 0.005, 0), rot_y, mat_aco(), pai=gancho)
    caixa(nome + "_olhal", (0, 0.047, 0), (0.008, 0.026, 0.022), mat_aco(), pai=gancho, chanfro=0.003)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.016, minor_radius=0.0035, major_segments=24, minor_segments=8,
                                     location=(0, 0.085, 0))
    mosq = bpy.context.active_object
    mosq.name = nome + "_mosquetao"
    mosq.scale = (1.0, 1.6, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    mosq.data.materials.append(mat_aco())
    mosq.parent = gancho
    _cilindro(nome + "_ponteira", 0.0045, 0.03, (0, 0.123, 0), rot_y, mat_aco(), vertices=16, pai=gancho)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, segments=16, ring_count=8, location=(0, engate + 0.007, 0))
    bola = bpy.context.active_object
    bola.name = nome + "_bola"
    bpy.ops.object.shade_smooth()
    bola.data.materials.append(mat_borracha())
    bola.parent = gancho
    pernas, pontas = {}, {}
    for s in (1, -1):
        # perna: cilindro de 0 a `perna` no Z local (origem na junção)
        bpy.ops.mesh.primitive_cylinder_add(radius=raio, depth=perna, location=(0, 0, perna / 2), vertices=16)
        p = bpy.context.active_object
        p.name = nome + "_perna%+d" % s
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
        bpy.ops.object.shade_smooth()
        p.data.materials.append(mat_corda())
        pernas[s] = p
        # ponta: corda dentro da mão (de −meia até o meio do batente), dobra na entrada e o batente com as bordas
        # arredondadas
        r = pontas[s] = raiz_nova(nome + "_ponta%+d" % s)
        x1 = meia + folga_batente
        x2 = x1 + compr_batente
        rot_x = (0, math.radians(90), 0)
        _cilindro(nome + "_pegada%+d" % s, raio, x1 + compr_batente / 2 + meia, ((x1 + compr_batente / 2 - meia) / 2, 0, 0),
                  rot_x, mat_corda(), vertices=16, pai=r)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=raio, segments=16, ring_count=8, location=(-meia, 0, 0))
        d = bpy.context.active_object
        d.name = nome + "_entrada%+d" % s
        bpy.ops.object.shade_smooth()
        d.data.materials.append(mat_corda())
        d.parent = r
        b = _cilindro(nome + "_batente%+d" % s, raio_batente, compr_batente, ((x1 + x2) / 2, 0, 0), rot_x, mat_borracha(),
                      vertices=32, pai=r)
        m = b.modifiers.new("chanfro", "BEVEL")
        m.width = 0.006
        m.segments = 3
    return Corda(gancho, pernas, pontas, perna, meia, raio, engate)


# ── POLIA COM O GARFO QUE GIRA (Tríceps Francês Unilateral na Polia Baixa, lote 3, 06/10/2026; serve também pra Elevação
# Lateral na Polia, em que o cabo sai na diagonal) ────────────────────────────────────────────────────────────────────────
# polia(..., gira=True): o carrinho continua parado no trilho, mas a roldana fica num garfo que gira em volta de um eixo
# VERTICAL — o do cabo que desce pelo trilho (ele não sai do lugar), como no carrinho giratório das estações de cabo — e
# a roldana fica sempre virada pro cabo que sai dela: o cabo nunca sai de lado da roldana. O suporte do giro (fixo, em
# cima do carrinho, com o rolamento) prende o garfo pelo pino; o garfo = 2 chapas em volta da roldana + a ponte em cima.
# Com isso o carrinho fica mais raso na frente (2,5 cm atrás do cabo que desce) e o garfo gira até ±90° da `frente` sem
# encostar nele (folga medida ≥ 3,3 mm, na ponte, a ~58°; 4 mm a 90°); a 95° o eixo da roldana já chega a 0,6 mm do
# carrinho e a 100° entra nele — a cena vira a `frente` da polia pro lado em que o cabo sai. Uso igual ao da polia de
# hoje (direcao, ligar); raizes = [torre, roldana, cabo]: a "<nome>_roldana" gira (só rotação no GLB, a origem fica no
# eixo do giro) e o cabo gira e estica. Com gira=False (o padrão) a polia sai igual à de antes (conferido: mesmos
# objetos, vértices, direção e comprimento do cabo).
class PoliaGiratoria(Polia):
    """Polia com o garfo que gira (polia(..., gira=True)): a cada direcao()/ligar() a roldana se vira pro ponto pedido
    (o centro dela anda num círculo de raio `raio` em volta do eixo do giro) e o cabo sai no plano dela."""

    def __init__(self, torre, roldana, cabo, eixo_giro, raio, frente):
        f = Vector(frente)
        Polia.__init__(self, torre, cabo, Vector(eixo_giro) + f * raio, raio, f)
        self.roldana = roldana
        self.raizes = [torre, roldana, cabo]
        self.eixo_giro = Vector(eixo_giro)    # ponto do eixo vertical do giro, na altura do eixo da roldana
        self.giro = 0.0                       # giro do garfo em relação à `frente` no último ligar() (graus, + = anti-horário)
        self._M0 = roldana.matrix_world.copy()

    def _virar(self, p):
        """Vira a roldana pra p (o centro dela vai pra frente nova): devolve a frente nova (horizontal, unitária)."""
        v = Vector(p) - self.eixo_giro
        f = Vector((v.x, v.y, 0.0))
        f = f.normalized() if f.length > 1e-6 else self.frente.copy()
        self.centro = self.eixo_giro + f * self.raio
        return f

    def tangente(self, p):
        self._virar(p)
        return Polia.tangente(self, p)

    def ligar(self, engate):
        f = self._virar(engate)
        L = Polia.ligar(self, engate)
        ang = math.atan2(self.frente.cross(f).z, self.frente.dot(f))
        A = self.eixo_giro
        self.roldana.matrix_world = (Matrix.Translation(A) @ Matrix.Rotation(ang, 4, "Z") @ Matrix.Translation(-A)
                                     @ self._M0)
        self.giro = math.degrees(ang)
        return L


def _garfo_giratorio(nome, torre, P, giro, raio, altura):
    """Troca o garfo fixo da polia() pelo giratório (gira=True): carrinho mais raso na frente, suporte e rolamento fixos em
    cima dele e, numa raiz nova "<nome>_roldana" com a origem no eixo do giro, o pino, a ponte, as 2 chapas e a roldana de
    hoje (flanges, miolo e eixo). P(df, ds, z) = ponto no referencial da polia (frente, lado, altura). Devolve a raiz."""
    for sufixo in ("_carrinho", "_garfo+1", "_garfo-1"):
        o = bpy.data.objects.get(nome + sufixo)
        if o is not None:
            bpy.data.objects.remove(o, do_unlink=True)
    rot = (0, 0, giro)
    # carrinho no trilho (eixo do trilho em df = −0,10), com a frente a 2,5 cm atrás do cabo que desce (df = −raio)
    frente_carrinho = -raio - 0.025
    caixa(nome + "_carrinho", P((frente_carrinho - 0.1425) / 2, 0, altura), (0.085, 0.1425 + frente_carrinho, 0.16),
          mat_estrutura(), rot=rot, pai=torre, chanfro=0.005)
    # suporte do giro (fixo): em cima do carrinho, avançando até passar do eixo do giro, com o rolamento embaixo
    caixa(nome + "_suporte_giro", P(-raio - 0.015, 0, altura + 0.09), (0.04, 0.06, 0.02), mat_estrutura(), rot=rot,
          pai=torre, chanfro=0.003)
    _cilindro(nome + "_rolamento", 0.013, 0.012, P(-raio, 0, altura + 0.074), (0, 0, 0), mat_aco(), pai=torre)
    # raiz que gira: origem no eixo do giro (na altura do eixo da roldana), sem rotação no repouso
    A = P(-raio, 0, altura)
    raiz = bpy.data.objects.new(nome + "_roldana", None)
    bpy.context.scene.collection.objects.link(raiz)
    raiz.location = A
    bpy.context.view_layer.update()
    inv = raiz.matrix_world.inverted()
    pecas = [_cilindro(nome + "_pino_giro", 0.007, 0.008, P(-raio, 0, altura + 0.068), (0, 0, 0), mat_aco()),
             caixa(nome + "_ponte", P(-raio + 0.033, 0, altura + 0.062), (0.038, 0.09, 0.008), mat_estrutura(), rot=rot,
                   chanfro=0.002)]
    for k in (-1, 1):                     # chapas do garfo em volta da roldana (do eixo da roldana ±3,3 cm), até a ponte
        pecas.append(caixa(nome + "_chapa%+d" % k, P(0, k * 0.017, altura + 0.0125), (0.004, 0.066, 0.095),
                           mat_estrutura(), rot=rot, chanfro=0.0015))
    pecas += [bpy.data.objects[nome + n] for n in ("_flange+1", "_flange-1", "_miolo", "_eixo")]
    for o in pecas:
        M = o.matrix_world.copy()
        o.parent = raiz
        o.matrix_parent_inverse = inv
        o.matrix_world = M
    bpy.context.view_layer.update()
    return raiz


# ── PUXADOR D da polia (Tríceps Francês Unilateral na Polia Baixa, lote 3, 06/10/2026; serve também pra Elevação Lateral
# na Polia e outros exercícios de um braço no cabo) ──────────────────────────────────────────────────────────────────────
# Puxador em "D" (estribo) de academia: pegador reto de aço e o aro em D saindo das 2 pontas dele e fechando em
# semicírculo; o mosquetão do cabo prende no topo do aro (o olhal). Medidas do Synergee Single D Handle: "Handle
# Diameter: 25mm", "Handle Knurling: 4.9"" e "Diameter: 5.7" x 5.7"" (14,5 × 14,5 cm por fora); aro de aço redondo de
# 10 mm (escolha da fábrica: 14,5 cm por fora − 12,5 cm de pegador = 2 × 1 cm). Como no de verdade, o aro gira livre em
# volta do pegador (alinha com o cabo) e o mosquetão gira no olhal. 3 raízes (a checagem de rigidez é por raiz; as
# zonas e folgas da ficha olham a raiz que quiserem — o aro sem o pegador que fica dentro da mão):
#   pegador — o cano onde a mão fecha; origem no eixo, no meio dele; X local = eixo: ck.Barra(pegador, raio, meia);
#   alca    — o aro em D (+ as cabeças dos parafusos), mesma origem e mesmo X do pegador, o olhal no +Y local;
#   engate  — mosquetão + ponteira e bola do cabo, presos no olhal e virados pro cabo (Y local ao longo dele).
# Uso numa cena (a mão segura o pegador com a linha dos nós dos dedos ao longo dele):
#   pux = e3.puxador_polia("puxador")
#   no pose(t): eng = pux.por(vao, eixo, pol.direcao)     # vao = eixo do pegador no meio da mão; eixo = ao longo dele
#               pol.ligar(eng)
#   Cena(pose, pux.raizes + pol.raizes, pegadas=[("Left", ck.Barra(pux.pegador, pux.raio, pux.meia))], ...)
class Puxador:
    """Puxador D pronto na cena (puxador_polia()): raizes = [pegador, alca, engate]."""

    def __init__(self, pegador, alca, engate, raio, meia, olhal, comprimento):
        self.pegador, self.alca, self.engate = pegador, alca, engate
        self.raizes = [pegador, alca, engate]
        self.raio = raio                  # raio do pegador (m)
        self.meia = meia                  # meio comprimento do pegador (m)
        self.olhal = olhal                # do eixo do pegador até o eixo do aro no olhal (m)
        self.comprimento = comprimento    # do olhal até onde o cabo começa (dentro da bola), m
        self.ponto_olhal = None           # olhal e começo do cabo no último por()
        self.ponto_engate = None

    def por(self, centro, eixo, direcao, voltas=5):
        """Põe o puxador no quadro e devolve onde o cabo começa (polia.ligar(engate)). centro = ponto do eixo do pegador
        no meio da mão; eixo = direção do pegador; direcao = polia.direcao (ponto → direção unitária do cabo, pra
        roldana). O aro gira em volta do pegador até o olhal ficar no plano do cabo (a força do cabo passa pelo eixo do
        pegador, sem torção) e o engate sai do olhal na direção do cabo."""
        c = Vector(centro)
        x = Vector(eixo).normalized()
        u = Vector(direcao(c))
        for _ in range(voltas):
            y = u - x * u.dot(x)
            if y.length < 1e-6:
                raise ValueError("puxador: cabo ao longo do pegador (%s)" % (tuple(u),))
            O = c + y.normalized() * self.olhal
            u = Vector(direcao(O + u * self.comprimento))
        por_acessorio(self.pegador, c, x, u)
        por_acessorio(self.alca, c, x, u)
        xe = x - u * x.dot(u)
        xe = xe.normalized() if xe.length > 1e-6 else u.orthogonal().normalized()
        self.engate.matrix_world = Matrix.Translation(O) @ Matrix((xe, u, xe.cross(u))).transposed().to_4x4()
        self.ponto_olhal, self.ponto_engate = O, O + u * self.comprimento
        return self.ponto_engate


def _tubo_caminho(nome, pontos, raio, mat, pai=None, lados=12):
    """Tubo redondo de raio `raio` seguindo a linha `pontos` (curva de Blender com bevel, virada malha), pontas fechadas."""
    cu = bpy.data.curves.new(nome, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = raio
    cu.bevel_resolution = max(1, lados // 4 - 1)
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pontos) - 1)
    for p_, q in zip(sp.points, pontos):
        p_.co = (q[0], q[1], q[2], 1.0)
    ob_c = bpy.data.objects.new(nome + "_curva", cu)
    bpy.context.scene.collection.objects.link(ob_c)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob_c.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob_c, do_unlink=True)
    bpy.data.curves.remove(cu)
    o = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(o)
    for pl in me.polygons:
        pl.use_smooth = True
    me.materials.append(mat)
    if pai is not None:
        o.parent = pai
    return o


def puxador_polia(nome="puxador", raio=0.0125, largura=0.145, altura=0.145, raio_aro=0.005):
    """Puxador D da polia (ver o bloco acima): pegador de `raio` m entre os braços do aro, aro de `raio_aro` m com
    `largura` m por fora (de lado a lado) e `altura` m por fora (do lado de fora do pegador até o topo do aro). Medidas
    do Synergee Single D Handle (25 mm, 14,5 × 14,5 cm). Devolve um Puxador (raizes, pegador, por())."""
    def raiz_nova(n):
        r = bpy.data.objects.new(n, None)
        bpy.context.scene.collection.objects.link(r)
        return r

    xa = largura / 2 - raio_aro                                # eixo dos braços do aro
    meia = xa - raio_aro                                       # o pegador vai de um braço ao outro
    ya = altura - raio - raio_aro                              # eixo do aro no topo (o olhal)
    yc = ya - xa                                               # começo do semicírculo (braços retos até aqui)
    rot_x = (0, math.radians(90), 0)
    pegador = raiz_nova(nome + "_pegador")
    _cilindro(nome + "_cano", raio, 2 * meia, (0, 0, 0), rot_x, mat_aco(), vertices=32, pai=pegador)
    alca = raiz_nova(nome + "_alca")
    caminho = [(xa, -raio * 0.6, 0), (xa, yc, 0)]
    caminho += [(xa * math.cos(a), yc + xa * math.sin(a), 0) for a in [math.pi * k / 16 for k in range(1, 16)]]
    caminho += [(-xa, yc, 0), (-xa, -raio * 0.6, 0)]
    _tubo_caminho(nome + "_aro", caminho, raio_aro, mat_aco(), pai=alca)
    for s in (-1, 1):                                          # cabeças dos parafusos do pegador, por fora do aro
        _cilindro(nome + "_parafuso%+d" % s, 0.008, 0.004, (s * (xa + raio_aro + 0.002), 0, 0), rot_x, mat_aco(),
                  vertices=16, pai=alca)
    # engate: mosquetão em volta do topo do aro (no plano ⟂ ao aro ali), ponteira e bola do cabo; origem no olhal
    engate = raiz_nova(nome + "_engate")
    bpy.ops.mesh.primitive_torus_add(major_radius=0.016, minor_radius=0.0035, major_segments=24, minor_segments=8,
                                     location=(0, 0.012, 0), rotation=(0, math.radians(90), 0))
    mosq = bpy.context.active_object
    mosq.name = nome + "_mosquetao"
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    mosq.scale = (1.0, 1.6, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    mosq.data.materials.append(mat_aco())
    mosq.parent = engate
    _cilindro(nome + "_ponteira", 0.0045, 0.03, (0, 0.055, 0), (math.radians(-90), 0, 0), mat_aco(), vertices=16,
              pai=engate)
    comprimento = 0.075                                        # do olhal até onde o cabo começa (dentro da bola)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, segments=16, ring_count=8, location=(0, comprimento + 0.007, 0))
    bola = bpy.context.active_object
    bola.name = nome + "_bola"
    bpy.ops.object.shade_smooth()
    bola.data.materials.append(mat_borracha())
    bola.parent = engate
    return Puxador(pegador, alca, engate, raio, meia, ya, comprimento)


# ── APOIO DA FLEXÃO NÓRDICA (Flexão Nórdica, lote 4, 06/10/2026) ───────────────────────────────────────────────────────────
# Prancha nórdica de chão: uma chapa de aço no chão com a almofada dos joelhos em cima e, atrás dela, um poste no meio (entre as
# pernas) que segura o eixo de 2 rolos de espuma — um em cima de cada calcanhar, prendendo a parte de trás do tornozelo enquanto
# o corpo desce; o peso de quem ajoelha em cima da almofada segura a peça no lugar. É o "piece of equipment anchoring the ankle,
# foot, and lower leg in a fixed position" da NSCA (Exercise Technique Manual for Resistance Training, 4ª ed., Nordic Hamstring
# Curl), com os dedos dos pés no chão logo atrás da almofada ("ankles flexed and toes into the floor"); a chapa passa entre os
# pés só no meio, até o poste. Medidas de banco nórdico de verdade: almofada de 3" de espessura e 18" de largura (Freak Athlete
# Nordic Mini Pro: knee padding "3″ thickness, 18″ x 24″") e rolos de 4,33" de diâmetro × 5,9" (Shogun/Mr Infinity Nord Ex:
# ankle pads "5.9″L x 4.33″D") — fichas dos 2 produtos na review do ShreddedDad. O comprimento da almofada e a posição dos
# rolos saem do corpo: a cena monta a peça em volta dele (como o banco_hiperextensao).
def apoio_nordico(nome="apoio_nordico", almofada=(-0.12, 0.38, 0.0762, 0.457), chapa=0.012, rolos=(0.40, 0.22, 0.055, 0.15, 0.15),
                  poste=0.05, chanfro=0.02):
    """Apoio da flexão nórdica (ver o bloco acima), com o boneco olhando pra −Y (os joelhos na frente da almofada, os pés atrás).
      almofada = (y0, y1, espessura, largura): a almofada vai de y0 (frente) a y1 (atrás), em cima da chapa — topo em
                 chapa + espessura; a chapa fica 2 cm maior que ela na frente e dos lados (atrás termina junto) e sai por trás
                 como uma língua de `poste` m de largura, no meio, até o poste;
      chapa    = espessura da chapa de aço no chão (m);
      rolos    = (y, z, raio, comprimento, x): eixo dos 2 rolos ao longo de X em (y, z), cada rolo centrado em ±x;
      poste    = lado do tubo quadrado do poste (sobe do fim da língua da chapa até o eixo dos rolos, em x = 0) e largura da língua.
    Devolve 3 raízes, cada uma um equipamento da cena: "almofada" e "rolos" são APOIO do corpo (encostar é o certo) e a
    "estrutura" (chapa, língua, poste, eixo de aço) não pode encostar nele."""
    def raiz_nova(sufixo):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        return r

    alm, rol, estr = (raiz_nova(n) for n in ("almofada", "rolos", "estrutura"))
    y0, y1, esp, larg = almofada
    caixa(nome + "_estofado", (0, (y0 + y1) / 2, chapa + esp / 2), (larg, y1 - y0, esp), mat_estofado(), pai=alm,
          chanfro=chanfro)
    # chapa embaixo da almofada (2 cm maior na frente e dos lados; atrás termina junto com ela, pros dedos dos pés ficarem no
    # chão) e a língua que sai por trás, no meio, até o poste
    y_r, z_r, raio, compr, x_r = rolos
    caixa(nome + "_chapa", (0, (y0 - 0.02 + y1) / 2, chapa / 2), (larg + 0.04, y1 - y0 + 0.02, chapa), mat_estrutura(),
          pai=estr, chanfro=0.003)
    fim = y_r + poste / 2
    caixa(nome + "_lingua", (0, (y1 + fim) / 2, chapa / 2), (poste, fim - y1, chapa), mat_estrutura(), pai=estr, chanfro=0.003)
    # poste (tubo quadrado) do fim da língua até o eixo, e o eixo de aço de um rolo ao outro
    _em_aneis(caixa(nome + "_poste", (0, y_r, (chapa + z_r) / 2), (poste, poste, z_r - chapa), mat_estrutura(), pai=estr,
                    chanfro=0.005))
    _em_aneis(_cilindro(nome + "_eixo", 0.012, 2 * x_r + compr - 0.02, (0, y_r, z_r), (0, math.radians(90), 0), mat_aco(),
                        pai=estr))
    for k in (-1, 1):                                         # rolos de espuma, um em cima de cada calcanhar
        _cilindro(nome + "_rolo%+d" % k, raio, compr, (k * x_r, y_r, z_r), (0, math.radians(90), 0), mat_estofado(),
                  vertices=32, pai=rol)
    return {"almofada": alm, "rolos": rol, "estrutura": estr}


# ── CADEIRA EXTENSORA / FLEXORA (Cadeira Extensora, lote 4, 06/10/2026; a MESMA peça serve à Cadeira Flexora sentada) ─────────
# Máquina de joelho sentado: assento e encosto estofados, uma torre do lado da alavanca com o EIXO de giro (horizontal, ao longo
# do X) na altura dos joelhos, a alavanca que gira em volta dele com o rolo de espuma na ponta, um pegador de cada lado do
# assento e a caixa da pilha de pesos (carenagem, parada: o app não mostra a carga). A regulagem certa é a do fabricante: o
# encosto anda até o joelho ficar no eixo ("Adjust the backrest so your knee joint aligns with the machine’s rotational axis",
# eGym M1 Leg Extension) e o rolo fica logo acima do tornozelo ("Position the roller pad just above your ankle", idem) — por isso
# a cena monta a peça EM VOLTA do corpo (como o banco_hiperextensao e o apoio_nordico): ela dá o eixo (os joelhos), o assento, o
# encosto, o rolo e os pegadores, e a peça liga tudo com a estrutura.
#   Extensora: rolo NA FRENTE da canela, logo acima do tornozelo; a alavanca sobe pra frente (girar(< 0)).
#   Flexora sentada: rolo ATRÁS da canela, em cima do calcanhar (eGym M4 Leg Curl: "between the calf and the Achilles tendon"),
#   e a almofada das coxas por cima delas, logo antes dos joelhos (almofada=(...)); a alavanca desce pra trás (girar(> 0)).
#   Body-Solid GCEC340 (Cam Series Leg Extension & Curl, a mesma máquina pros 2): "wrapping legs over the 8-inch foam rollers, and
#   press down to perform seated leg curl exercises" / "position your legs behind the oversized rollers, and lift and extend
#   legs to work the quadriceps muscles".
# Medidas de máquina de verdade: assento de 22" × 17" × 2" e rolo de 17" × 5" (Ø 12,7 cm), assento a 24"–26,5" do chão (Titan
# Fitness Leg Extension & Hamstring Curl Machine: "Seat Pad Dimensions: 22-in. x 17-in. x 2-in.", "Roller Pad Dimensions:
# 17-in. x 5-in.", "Adjustable Seat Height: 24-in. – 26.5-in."); 100° entre o assento e o encosto (Steelflex PLLE: "exact 100°
# angle between the seat and back rest pad");
# torre da pilha de 148 cm (Precor Resolute RSL0605 Leg Extension: "Weight Stack Tower Height: 58 in / 148 cm"). Tubos de 5–8 cm,
# a torre do eixo, o cubo e o braço da alavanca são escolha da fábrica. Peças compridas em anéis (_em_aneis): a checagem fica rápida.
# Uso numa cena (a pessoa olha pra −Y; o eixo passa pelos 2 joelhos):
#   cad = e3.cadeira_joelho("cadeira", eixo=(y_joelho, z_joelho), assento=(...), encosto=(...), rolo=(...), pegadores=(...))
#   no pose(t): cad.girar(graus)                    # a alavanca e o rolo giram juntos em volta do eixo, a partir da montagem
#   Cena(pose, cad.equipamentos, pegadas=[("Left", ck.Barra(cad.pegadores[1], cad.raio_pegador, cad.meia_pegador,
#        eixo=(0, 0, 1))), ...], apoios=cad.apoios)
# As raízes (cada uma um equipamento da cena, a rigidez é por raiz): "<nome>_estrutura" (parada; não encosta no corpo),
# "<nome>_assento", "<nome>_encosto" (APOIO), "<nome>_alavanca" (gira; não encosta no corpo), "<nome>_rolo" (gira; APOIO) e, com
# almofada, "<nome>_almofada" (APOIO). A alavanca e o rolo têm a origem NO EIXO e o X local AO LONGO dele (checagens.eixos).
class CadeiraJoelho:
    """Cadeira extensora/flexora pronta na cena (cadeira_joelho())."""

    def __init__(self, raizes, eixo, pegadores, raio_pegador, meia_pegador):
        self.raizes = raizes                          # {"estrutura", "assento", "encosto", "alavanca", "rolo"[, "almofada"]}
        self.equipamentos = [raizes["estrutura"], raizes["alavanca"]]
        self.apoios = [raizes[k] for k in ("assento", "encosto", "rolo", "almofada") if k in raizes]
        self.eixo = Vector(eixo)                      # ponto do eixo de giro (no cubo da alavanca); direção = X
        self.pegadores = pegadores                    # {+1: pegador do lado +X, −1: do lado −X}; eixo de cada um no Z local
        self.raio_pegador = raio_pegador
        self.meia_pegador = meia_pegador
        self.angulo = 0.0

    def girar(self, graus):
        """Alavanca e rolo girados `graus` em volta do eixo (regra da mão direita no +X), a partir da montagem: com a pessoa
        olhando pra −Y, > 0 leva o rolo pra trás e pra baixo (flexão do joelho) e < 0 pra frente e pra cima (extensão)."""
        M = Matrix.Translation(self.eixo) @ Matrix.Rotation(math.radians(graus), 4, "X")
        for k in ("alavanca", "rolo"):
            self.raizes[k].matrix_world = M
        self.angulo = graus
        bpy.context.view_layer.update()


def _reto(o):
    """Faces retas (sombreamento plano): caixa sem bisel com sombreamento suave fica com a cara de um sabonete."""
    for pl in o.data.polygons:
        pl.use_smooth = False
    return o


def _viga(nome, a, b, larg, alt, mat, pai=None, chanfro=0.0, aneis=True):
    """Tubo retangular (caixa) de a até b: seção larg × alt. Sem bisel e cortada em anéis do tamanho da seção (só as arestas
    compridas): a checagem espalha pontos triângulo por triângulo e um bisel comprido (tiras finas de 1,5 m) ou anéis finos
    demais numa seção larga multiplicavam os pontos (a cadeira inteira dava ~1 milhão por quadro, 80 s)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    rot = d.to_track_quat("Z", "Y").to_euler()
    o = caixa(nome, (a + b) / 2, (larg, alt, d.length), mat, rot=rot, pai=pai, chanfro=chanfro)
    if not chanfro:
        _reto(o)
    return _em_aneis(o, passo=max(larg, alt)) if aneis else o


def _prender(objs, raiz):
    """Põe os objetos (já no lugar, no mundo) como filhos da raiz sem tirar do lugar (a raiz pode estar fora da origem)."""
    bpy.context.view_layer.update()
    inv = raiz.matrix_world.inverted()
    for o in objs:
        M = o.matrix_world.copy()
        o.parent = raiz
        o.matrix_parent_inverse = inv
        o.matrix_world = M
    bpy.context.view_layer.update()


def cadeira_joelho(nome="cadeira", eixo=(0.0, 0.67), assento=(0.12, 0.58, 0.61, 0.43, 0.05),
                   encosto=(0.52, 10.0, 0.60, 0.36, 0.06), rolo=(-0.09, 0.32, 0.0635, 0.43),
                   pegadores=(0.30, 0.58, 0.29, 0.14, 0.0145), lado=-1, almofada=None, x_alavanca=0.245, x_torre=0.345,
                   pilha=True):
    """Cadeira extensora/flexora (ver o bloco acima). Medidas no mundo, em m, com a pessoa olhando pra −Y (lado = −1: a
    torre do eixo, a alavanca e a pilha ficam do lado −X, o direito de quem senta):
      eixo      = (y, z) do eixo de giro (paralelo ao X): passa pelo centro dos 2 joelhos;
      assento   = (y_frente, y_tras, topo, largura, espessura): estofado do assento, da borda da frente (atrás da batata da
                  perna) até y_tras, com o topo em `topo`;
      encosto   = (y_base, angulo, altura, largura, espessura): a face da frente do estofado passa por (y_base, topo do
                  assento) e sobe `angulo` graus inclinada pra trás (+Y) da vertical, por `altura` m;
      rolo      = (y, z, raio, comprimento): eixo do rolo (ao longo do X, centrado em x = 0) na montagem;
      pegadores = (y, z, x, comprimento, raio): um pegador de borracha de cada lado do assento, ao longo do Y, centrado em
                  (±x, y, z);
      almofada  = None (extensora) ou (y0, y1, z_baixo, espessura, largura) (flexora): almofada por cima das coxas, de y0 a
                  y1, com a face de baixo em z_baixo, presa num braço que sai da torre do eixo;
      x_alavanca, x_torre = |x| do plano do braço da alavanca e da torre do eixo; pilha = caixa da pilha de pesos.
    Devolve um CadeiraJoelho (raizes, equipamentos, apoios, pegadores, girar())."""
    s = -1.0 if lado < 0 else 1.0
    ye, ze = eixo
    y_f, y_t, topo, larg, esp = assento
    y_b, ang_enc, alt_enc, larg_enc, esp_enc = encosto
    y_r, z_r, raio_r, comp_r = rolo
    y_p, z_p, x_p, comp_p, raio_p = pegadores
    rot_x90 = (0, math.radians(90), 0)                       # cilindro deitado ao longo do X

    def raiz_nova(sufixo, loc=(0.0, 0.0, 0.0)):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        r.location = loc
        return r

    estr = raiz_nova("estrutura")
    ass = raiz_nova("assento")
    enc = raiz_nova("encosto")
    P = Vector((s * (x_alavanca + 0.04), ye, ze))            # ponto do eixo no cubo da alavanca
    alav = raiz_nova("alavanca", P)
    rol = raiz_nova("rolo", P)
    bpy.context.view_layer.update()

    # ── assento: estofado (APOIO) em cima de uma chapa; coluna até a base ────────────────────────────────────────────────────
    y_ass = (y_f + y_t) / 2
    caixa(nome + "_assento_estofado", (0, y_ass, topo - esp / 2), (larg, y_t - y_f, esp), mat_estofado(), pai=ass, chanfro=0.015)
    z_chapa = topo - esp - 0.012
    _em_aneis(_reto(caixa(nome + "_assento_chapa", (0, y_ass, z_chapa), (larg - 0.05, y_t - y_f - 0.04, 0.024), mat_estrutura(),
                    pai=estr, chanfro=0)), passo=0.06)
    # ── encosto: estofado inclinado (APOIO), chapa atrás dele e a viga que desce até a traseira do assento ───────────────────
    a = math.radians(ang_enc)
    u = Vector((0, math.sin(a), math.cos(a)))                # ao longo do encosto, pra cima
    n = Vector((0, -math.cos(a), math.sin(a)))               # normal da face da frente (pro corpo)
    base_enc = Vector((0, y_b, topo)) + u * 0.012            # o estofado começa 1,2 cm acima do assento
    caixa(nome + "_encosto_estofado", base_enc + u * (alt_enc / 2) - n * (esp_enc / 2), (larg_enc, esp_enc, alt_enc),
          mat_estofado(), rot=(-a, 0, 0), pai=enc, chanfro=0.015)
    meio_enc = base_enc + u * (alt_enc * 0.5) - n * (esp_enc + 0.012)
    _em_aneis(_reto(caixa(nome + "_encosto_chapa", meio_enc, (larg_enc - 0.05, 0.024, alt_enc - 0.05), mat_estrutura(),
                          rot=(-a, 0, 0), pai=estr, chanfro=0)), passo=0.06)
    y_tras_ass = y_t - 0.06
    _viga(nome + "_encosto_viga", meio_enc - n * 0.03, (0, y_tras_ass, z_chapa - 0.03), 0.06, 0.06, mat_estrutura(), pai=estr)
    # ── base no chão: viga do meio (ao longo do Y), pés da frente e de trás (ao longo do X) e a viga do lado da torre ──────────
    y0b, y1b = ye - 0.20, max(y_t, y_b + u.y * alt_enc) + 0.08
    x_pilha = x_torre + 0.22                                 # centro da pilha (|x|)
    xa, xb = -s * 0.32, s * (x_pilha + 0.17 if pilha else x_torre + 0.05)
    _em_aneis(_reto(caixa(nome + "_base_meio", (0, (y0b + y1b) / 2, 0.03), (0.08, y1b - y0b, 0.06), mat_estrutura(), pai=estr,
                          chanfro=0)), passo=0.08)
    for k, y in enumerate((y0b, y1b)):
        _em_aneis(_reto(caixa(nome + "_base_pe%d" % k, ((xa + xb) / 2, y, 0.025), (abs(xb - xa), 0.08, 0.05), mat_estrutura(),
                              pai=estr, chanfro=0)), passo=0.08)
    _em_aneis(_reto(caixa(nome + "_base_lado", (s * x_torre, (y0b + y1b) / 2, 0.03), (0.07, y1b - y0b, 0.06), mat_estrutura(),
                          pai=estr, chanfro=0)), passo=0.07)
    # coluna do assento (do meio da base até a chapa) e a viga de baixo do assento até a torre (atrás dos pés pendurados)
    _viga(nome + "_coluna_assento", (0, y_ass + 0.04, 0.06), (0, y_ass + 0.04, z_chapa - 0.012), 0.08, 0.08, mat_estrutura(),
          pai=estr)
    _viga(nome + "_viga_assento", (0, y_ass + 0.04, z_chapa - 0.05), (s * (x_torre - 0.035), y_ass + 0.04, z_chapa - 0.05), 0.06,
          0.06, mat_estrutura(), pai=estr)
    # ── torre do eixo: coluna do lado, mancal no alto e o eixo de aço (parado) que entra no cubo da alavanca ──────────────────
    _viga(nome + "_torre", (s * x_torre, ye + 0.02, 0.06), (s * x_torre, ye + 0.02, ze + 0.07), 0.07, 0.08, mat_estrutura(),
          pai=estr)
    _viga(nome + "_torre_braco", (s * x_torre, y_ass + 0.04, z_chapa - 0.05), (s * x_torre, ye + 0.06, z_chapa - 0.05), 0.06,
          0.06, mat_estrutura(), pai=estr)
    _cilindro(nome + "_mancal", 0.05, 0.08, (s * x_torre, ye, ze), rot_x90, mat_estrutura(), pai=estr)
    _em_aneis(_cilindro(nome + "_eixo", 0.02, x_torre - x_alavanca + 0.05, (s * (x_alavanca + x_torre + 0.03) / 2, ye, ze), rot_x90,
                        mat_aco(), pai=estr), passo=0.03)
    _cilindro(nome + "_eixo_tampa", 0.03, 0.012, (s * (x_torre + 0.046), ye, ze), rot_x90, mat_aco(), pai=estr)
    # ── pilha de pesos (carenagem parada) atrás da torre, ligada a ela pela caixa do cabo (perto do chão) ───────────────────
    if pilha:
        _em_aneis(_reto(caixa(nome + "_pilha", (s * x_pilha, ye + 0.30, 0.06 + 1.42 / 2), (0.26, 0.36, 1.42), mat_carenagem(),
                              pai=estr, chanfro=0)), passo=0.25)
        _viga(nome + "_caixa_cabo", (s * x_torre, ye + 0.02, 0.30), (s * x_pilha, ye + 0.07, 0.30), 0.07, 0.07,
              mat_carenagem(), pai=estr)       # embaixo: longe das mãos nos pegadores e atrás dos pés pendurados
    # ── pegadores: borracha ao longo do Y, cada um preso por um suporte em L que desce e entra embaixo do assento ────────────
    pegs = {}
    for k in (1, -1):
        x = k * x_p
        pegs[k] = _em_aneis(tubo(nome + "_pegador%+d" % k, (x, y_p + comp_p / 2, z_p), (x, y_p - comp_p / 2, z_p), raio_p,
                                 mat_borracha(), pai=estr, vertices=32), passo=0.035)
        _cilindro(nome + "_pegador_ponta%+d" % k, raio_p + 0.004, 0.012, (x, y_p - comp_p / 2 - 0.006, z_p),
                  (math.radians(90), 0, 0), mat_borracha(), pai=estr)
        y_sup = y_p + comp_p / 2 + 0.012
        tubo(nome + "_pegador_haste%+d" % k, (x, y_p + comp_p / 2 - 0.01, z_p), (x, y_sup + 0.012, z_p), 0.012, mat_aco(),
             pai=estr)
        _viga(nome + "_pegador_suporte%+d" % k, (x, y_sup, z_p + 0.012), (x, y_sup, z_chapa - 0.02), 0.03, 0.03, mat_estrutura(),
              pai=estr, chanfro=0.003)
        _viga(nome + "_pegador_braco%+d" % k, (x, y_sup, z_chapa - 0.035), (k * 0.10, y_sup, z_chapa - 0.035), 0.03, 0.03,
              mat_estrutura(), pai=estr, chanfro=0.003)
    # ── alavanca (gira em volta do eixo): cubo, braço do cubo até o rolo, luva de regulagem com o pino e o eixo do rolo ───────
    d = Vector((0, y_r - ye, z_r - ze))
    pecas = [_cilindro(nome + "_cubo", 0.085, 0.03, P, rot_x90, mat_estrutura()),
             _cilindro(nome + "_cubo_tampa", 0.035, 0.034, P, rot_x90, mat_aco())]
    xa_ = s * x_alavanca
    topo_b, ponta_b = Vector((xa_, ye, ze)), Vector((xa_, y_r, z_r))   # o braço vai do eixo até o eixo do rolo
    pecas.append(_viga(nome + "_braco", topo_b + d.normalized() * 0.02, ponta_b - d.normalized() * 0.05, 0.05,
                       0.05, mat_estrutura()))
    luva = ponta_b - d.normalized() * 0.11
    pecas.append(caixa(nome + "_luva", luva, (0.062, 0.062, 0.12), mat_estrutura(), rot=d.to_track_quat("Z", "Y").to_euler(),
                       chanfro=0.004))
    pecas.append(_cilindro(nome + "_pino", 0.007, 0.03, luva + Vector((s * 0.046, 0, 0)), rot_x90, mat_aco()))
    pecas.append(_cilindro(nome + "_pino_bola", 0.014, 0.018, luva + Vector((s * 0.068, 0, 0)), rot_x90, mat_borracha()))
    pecas.append(_cilindro(nome + "_ponta_braco", 0.034, 0.056, ponta_b, rot_x90, mat_estrutura()))   # cubo do eixo do rolo
    x_ent = s * (comp_r / 2 - 0.04)                          # o eixo entra 4 cm no rolo (o resto fica escondido dentro dele)
    x_fim = -s * (comp_r / 2 + 0.008)
    pecas.append(_em_aneis(_cilindro(nome + "_eixo_rolo", 0.0125, abs(xa_ - x_ent), ((xa_ + x_ent) / 2, y_r, z_r), rot_x90,
                                     mat_aco(), vertices=24), passo=0.04))
    pecas.append(_cilindro(nome + "_ponta_eixo_rolo", 0.0125, 0.04, (x_fim + s * 0.012, y_r, z_r), rot_x90, mat_aco(), vertices=24))
    pecas.append(_cilindro(nome + "_trava_rolo", 0.02, 0.012, (x_fim, y_r, z_r), rot_x90, mat_aco()))
    _prender(pecas, alav)
    # ── rolo de espuma (APOIO): ao longo do X, centrado em x = 0, com as tampas de borracha ──────────────────────────────────
    pecas = [_cilindro(nome + "_rolo_espuma", raio_r, comp_r, (0, y_r, z_r), rot_x90, mat_estofado(), vertices=48)]
    for k in (1, -1):
        pecas.append(_cilindro(nome + "_rolo_tampa%+d" % k, raio_r * 0.55, 0.006, (k * (comp_r / 2 + 0.001), y_r, z_r), rot_x90,
                               mat_borracha()))
    _prender(pecas, rol)
    raizes = {"estrutura": estr, "assento": ass, "encosto": enc, "alavanca": alav, "rolo": rol}
    # ── almofada das coxas (flexora): estofado por cima das coxas num braço que sai da torre do eixo ────────────────────────
    if almofada is not None:
        a0, a1, zb, esp_a, larg_a = almofada
        alm = raiz_nova("almofada")
        ym = (a0 + a1) / 2
        caixa(nome + "_almofada_estofado", (0, ym, zb + esp_a / 2), (larg_a, a1 - a0, esp_a), mat_estofado(), pai=alm,
              chanfro=0.015)
        _em_aneis(_reto(caixa(nome + "_almofada_chapa", (0, ym, zb + esp_a + 0.012), (larg_a - 0.05, a1 - a0 - 0.03, 0.024),
                              mat_estrutura(), pai=estr, chanfro=0)), passo=0.06)
        z_braco = zb + esp_a + 0.04
        _viga(nome + "_almofada_braco", (0, ym, z_braco), (s * x_torre, ym, z_braco), 0.05, 0.05, mat_estrutura(), pai=estr)
        _viga(nome + "_almofada_coluna", (s * x_torre, ym, z_braco + 0.025), (s * x_torre, ym, 0.06), 0.06, 0.06,
              mat_estrutura(), pai=estr)
        raizes["almofada"] = alm
    bpy.context.view_layer.update()
    return CadeiraJoelho(raizes, P, pegs, raio_p, comp_p / 2)


# ── CADEIRA ABDUTORA / ADUTORA (Cadeira Abdutora, lote 4, 06/10/2026; a MESMA peça serve à Cadeira Adutora) ────────────────
# Máquina de quadril sentada: assento e encosto estofados e 2 BRAÇOS que giram, cada um em volta de um EIXO VERTICAL, com a
# almofada do joelho e o apoio do pé — coxa, perna e pé andam juntos com o braço, o joelho não dobra nem estica (Hammer
# Strength Select Hip Abduction: "the kneepads and dual foot positions provide leg support around the knees"; eGym M10 Abductor:
# "Place your feet on the footrests and position the outside of your thighs or knees against the pads."; eGym M11 Adductor:
# "Place your feet on the footrests and position your inner thighs or knees against the pads."). Sentado, com o quadril dobrado
# ~90° e a coxa deitada, abrir e fechar as pernas é a coxa girando em volta da VERTICAL QUE PASSA PELA ARTICULAÇÃO DO QUADRIL:
# o eixo de cada braço fica nessa vertical (a placa da Hammer Strength marca o eixo da máquina "to help cue correct alignment";
# o encosto anda pra frente e pra trás — Titan Selectorized Hip Abductor Adductor: "Adjustable Seat Depth: 3.5-in." — até o
# quadril ficar em cima do eixo) e o braço gira o MESMO ângulo da coxa: almofada e apoio do pé não escorregam na pele. Como a
# cadeira_joelho, a cena monta a peça EM VOLTA do corpo: ela dá os 2 eixos (os 2 quadris), o assento, o encosto, as almofadas,
# os apoios dos pés, onde fica o poste de cada braço e os pegadores; a peça liga tudo com a estrutura.
#   Abdutora: almofada="fora"   — almofada no lado de FORA do joelho, presa direto no poste; girar(> 0) abre as pernas.
#   Adutora:  almofada="dentro" — almofada no lado de DENTRO do joelho, presa por um suporte em U que sai do poste (do lado de
#             fora, como na abdutora), cruza na frente do joelho e entra na ponta da frente da almofada; a cena monta com as
#             pernas abertas (o começo da adução) e girar(< 0) fecha.
# Medidas de máquina de verdade: torre da pilha de 1,40 m (Hammer Strength Select Hip Abduction: "Size (L x W x H): 61" x 26" x
# 55" (metric cm: 155 x 66 x 140)"); assento de 13" × 14" e encosto de 12" × 17,5" (Titan Selectorized Hip Abductor Adductor:
# "Seat Pad Dimensions: 13-in. x 14-in.", "Back Pad Dimensions: 12-in. x 17.5-in."). Tubos de 5–8 cm, almofada do joelho, apoio
# do pé, cubo e mancal dos eixos são escolha da fábrica. Peças compridas em anéis (_em_aneis / _viga): a checagem fica rápida.
# Uso numa cena (a pessoa olha pra −Y; s = +1 é o lado +X, o ESQUERDO de quem senta):
#   cad = e3.cadeira_quadril("abdutora", eixos={1: (x, y), -1: (x, y)}, z_eixo=..., assento=(...), encosto=(...),
#                            almofadas={1: (...), -1: (...)}, pes={1: (...), -1: (...)}, postes={1: (...), -1: (...)},
#                            pegadores=(...), almofada="fora")
#   no pose(t): cad.girar(graus)            # os 2 braços (com almofada e apoio do pé) abrem `graus` a partir da montagem
#   Cena(pose, cad.equipamentos, pegadas=[("Left", ck.Barra(cad.pegadores[1], cad.raio_pegador, cad.meia_pegador,
#        eixo=(0, 0, 1))), ...], apoios=cad.apoios)
# As raízes (cada uma um equipamento da cena, a rigidez é por raiz): "<nome>_estrutura" (parada; não encosta no corpo),
# "<nome>_assento" e "<nome>_encosto" (APOIO), "<nome>_braco_esq"/"_dir" (giram; não encostam no corpo), "<nome>_almofada_esq"/
# "_dir" e "<nome>_pe_esq"/"_dir" (giram junto com o braço do lado; APOIO). Cada braço, almofada e apoio do pé tem a origem NO
# eixo do seu lado (na altura z_eixo) e o X local AO LONGO dele (pra cima) — a regra checagens.eixos da ficha mede o quadril
# nessa reta.
_X_PRA_CIMA = Matrix.Rotation(math.radians(-90.0), 4, "Y")       # X local → +Z do mundo (o eixo vertical do braço)


class CadeiraQuadril:
    """Cadeira abdutora/adutora pronta na cena (cadeira_quadril())."""

    def __init__(self, raizes, eixos, z_eixo, pegadores, raio_pegador, meia_pegador):
        self.raizes = raizes          # {"estrutura", "assento", "encosto", "braco_esq", "braco_dir", "almofada_esq", ...}
        self.equipamentos = [raizes[k] for k in ("estrutura", "braco_esq", "braco_dir")]
        self.apoios = [raizes[k] for k in ("assento", "encosto", "almofada_esq", "almofada_dir", "pe_esq", "pe_dir")]
        self.eixos = {s: Vector((x, y, z_eixo)) for s, (x, y) in eixos.items()}   # ponto de cada eixo (no cubo do braço)
        self.pegadores = pegadores    # {+1: pegador do lado +X, −1: do lado −X}; eixo de cada um no Z local
        self.raio_pegador = raio_pegador
        self.meia_pegador = meia_pegador
        self.angulo = 0.0

    def girar(self, graus):
        """Os 2 braços (com a almofada e o apoio do pé de cada um) abertos `graus` a partir da montagem, cada um em volta do
        seu eixo vertical: > 0 abre as pernas (o braço do lado +X gira no sentido anti-horário visto de cima, o do −X no
        horário), < 0 fecha."""
        for s, lado in ((1, "esq"), (-1, "dir")):
            M = Matrix.Translation(self.eixos[s]) @ Matrix.Rotation(math.radians(s * graus), 4, "Z") @ _X_PRA_CIMA
            for k in ("braco_", "almofada_", "pe_"):
                self.raizes[k + lado].matrix_world = M
        self.angulo = graus
        bpy.context.view_layer.update()


def _girada(u):
    """Euler da caixa com o X local ao longo de `u` (horizontal), o Z local pra cima e o Y local = Z × u."""
    u = Vector((u[0], u[1], 0.0)).normalized()
    z = Vector((0.0, 0.0, 1.0))
    return Matrix((u, z.cross(u), z)).transposed().to_euler()


def cadeira_quadril(nome="abdutora", eixos=None, z_eixo=None, assento=(-0.20, 0.17, 0.54, 0.356, 0.05),
                    encosto=(0.12, 5.0, 0.445, 0.305, 0.06), almofadas=None, pes=None, postes=None,
                    pegadores=(0.06, 0.50, 0.30, 0.14, 0.0145), almofada="fora", volta_frente=0.16, pilha=True):
    """Cadeira abdutora/adutora (ver o bloco acima). Medidas no mundo, em m, com a pessoa olhando pra −Y; s = +1 é o lado +X
    (o esquerdo de quem senta) e −1 o −X. Tudo NA MONTAGEM (pernas paradas no começo do movimento):
      eixos     = {s: (x, y)}: a reta vertical em volta da qual o braço do lado s gira (passa pela articulação do quadril);
      z_eixo    = altura do cubo dos braços (embaixo do assento; None = logo embaixo da travessa dos mancais): os braços
                  correm nessa altura até o poste;
      assento   = (y_frente, y_tras, topo, largura, espessura): estofado do assento, com o topo em `topo`;
      encosto   = (y_base, angulo, altura, largura, espessura): a face da frente do estofado passa por (y_base, topo do
                  assento) e sobe `angulo` graus inclinada pra trás (+Y) da vertical, por `altura` m;
      almofadas = {s: (centro, u, n, (comprimento, altura, espessura))}: centro da FACE da almofada que encosta na perna,
                  u = direção da coxa (horizontal; o comprimento da almofada vai ao longo dela), n = normal dessa face
                  apontando PRA PERNA (pra dentro na abdutora, pra fora na adutora);
      pes       = {s: (centro, f, (comprimento, largura, espessura))}: centro da face de CIMA do apoio do pé, f = direção do pé
                  (horizontal, do calcanhar pros dedos);
      postes    = {s: (x, y)}: onde fica o poste vertical do braço, do lado de fora da perna (do apoio do pé até a almofada);
      pegadores = (y, z, x, comprimento, raio): um pegador de borracha de cada lado do assento, ao longo do Y, centrado em
                  (±x, y, z), preso por trás;
      almofada  = "fora" (abdutora: almofada presa direto no poste) ou "dentro" (adutora: suporte em U que sai do poste,
                  cruza `volta_frente` m à frente do centro da almofada, na frente do joelho, e entra na ponta da frente
                  dela — nada fica atrás da almofada, entre as pernas); pilha = caixa da pilha de pesos.
    Devolve um CadeiraQuadril (raizes, equipamentos, apoios, pegadores, girar())."""
    if almofada not in ("fora", "dentro"):
        raise ValueError("cadeira_quadril: almofada %r (use \"fora\" ou \"dentro\")" % almofada)
    y_f, y_t, topo, larg, esp = assento
    y_b, ang_enc, alt_enc, larg_enc, esp_enc = encosto
    y_p, z_p, x_p, comp_p, raio_p = pegadores
    cima = Vector((0.0, 0.0, 1.0))

    def raiz_nova(sufixo, M=None):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        if M is not None:
            r.matrix_world = M
        return r

    estr, ass, enc = raiz_nova("estrutura"), raiz_nova("assento"), raiz_nova("encosto")
    # ── assento: estofado (APOIO) em cima de uma chapa ─────────────────────────────────────────────────────────────────────
    y_ass = (y_f + y_t) / 2
    caixa(nome + "_assento_estofado", (0, y_ass, topo - esp / 2), (larg, y_t - y_f, esp), mat_estofado(), pai=ass,
          chanfro=0.015)
    z_chapa = topo - esp - 0.012
    _em_aneis(_reto(caixa(nome + "_assento_chapa", (0, y_ass, z_chapa), (larg - 0.04, y_t - y_f - 0.03, 0.024),
                          mat_estrutura(), pai=estr, chanfro=0)), passo=0.06)
    z_baixo_chapa = z_chapa - 0.012
    if z_eixo is None:                                       # cubo dos braços logo embaixo da travessa dos mancais
        z_eixo = z_baixo_chapa - 0.115
    # ── encosto: estofado inclinado (APOIO), chapa atrás dele e a viga que desce até a traseira do assento ───────────────────
    a = math.radians(ang_enc)
    u_enc = Vector((0, math.sin(a), math.cos(a)))            # ao longo do encosto, pra cima
    n_enc = Vector((0, -math.cos(a), math.sin(a)))           # normal da face da frente (pro corpo)
    base_enc = Vector((0, y_b, topo)) + u_enc * 0.012        # o estofado começa 1,2 cm acima do assento
    caixa(nome + "_encosto_estofado", base_enc + u_enc * (alt_enc / 2) - n_enc * (esp_enc / 2), (larg_enc, esp_enc, alt_enc),
          mat_estofado(), rot=(-a, 0, 0), pai=enc, chanfro=0.015)
    meio_enc = base_enc + u_enc * (alt_enc * 0.5) - n_enc * (esp_enc + 0.012)
    _em_aneis(_reto(caixa(nome + "_encosto_chapa", meio_enc, (larg_enc - 0.05, 0.024, alt_enc - 0.05), mat_estrutura(),
                          rot=(-a, 0, 0), pai=estr, chanfro=0)), passo=0.06)
    y_col = max(y_t - 0.05, y_b + 0.02)                      # coluna do assento/encosto: atrás do glúteo
    _viga(nome + "_encosto_viga", meio_enc - n_enc * 0.03, (0, y_col, z_baixo_chapa - 0.03), 0.06, 0.06, mat_estrutura(),
          pai=estr)
    # ── base no chão: viga do meio (ao longo do Y), pé de trás (embaixo da pilha) e pé da frente (embaixo dos eixos) ────────
    y_eixos = sum(y for _, y in eixos.values()) / 2
    y_pilha = y_b + u_enc.y * alt_enc + 0.26                 # centro da pilha, atrás do encosto
    y0b, y1b = y_eixos - 0.10, (y_pilha + 0.20) if pilha else (y_col + 0.12)
    _em_aneis(_reto(caixa(nome + "_base_meio", (0, (y0b + y1b) / 2, 0.03), (0.08, y1b - y0b, 0.06), mat_estrutura(), pai=estr,
                          chanfro=0)), passo=0.08)
    for k, (y, meia) in enumerate(((y0b, 0.24), (y1b - 0.04, 0.33))):
        _em_aneis(_reto(caixa(nome + "_base_pe%d" % k, (0, y, 0.025), (2 * meia, 0.08, 0.05), mat_estrutura(), pai=estr,
                              chanfro=0)), passo=0.08)
    # coluna do assento (da base até a chapa) e travessa dos mancais (embaixo do assento, de um eixo ao outro)
    _viga(nome + "_coluna", (0, y_col, 0.06), (0, y_col, z_baixo_chapa), 0.08, 0.08, mat_estrutura(), pai=estr)
    z_trav = z_eixo + 0.075
    xs = sorted(x for x, _ in eixos.values())
    _viga(nome + "_travessa_eixos", (xs[0] - 0.05, y_eixos + 0.06, z_trav), (xs[-1] + 0.05, y_eixos + 0.06, z_trav), 0.05, 0.05,
          mat_estrutura(), pai=estr)
    _viga(nome + "_travessa_chapa", (0, y_eixos + 0.06, z_trav + 0.025), (0, y_eixos + 0.06, z_baixo_chapa), 0.05, 0.05,
          mat_estrutura(), pai=estr)
    if y_col - 0.04 > y_eixos + 0.095:                       # a travessa longe da coluna: uma viga liga as duas
        _viga(nome + "_viga_coluna", (0, y_eixos + 0.085, z_trav), (0, y_col - 0.04, z_trav), 0.05, 0.05, mat_estrutura(),
              pai=estr)
    # ── mancal de cada eixo (parado): caixa na travessa e o pino de aço que desce até o cubo do braço ─────────────────────
    for s, (x, y) in eixos.items():
        caixa(nome + "_mancal%+d" % s, (x, y + 0.03, z_trav), (0.07, 0.11, 0.07), mat_estrutura(), pai=estr, chanfro=0.006)
        _cilindro(nome + "_pino%+d" % s, 0.018, 0.05, (x, y, z_eixo + 0.045), (0, 0, 0), mat_aco(), pai=estr)
    # ── pilha de pesos (carenagem parada) atrás do encosto ───────────────────────────────────────────────────────────────────
    if pilha:
        _em_aneis(_reto(caixa(nome + "_pilha", (0, y_pilha, 0.06 + 1.34 / 2), (0.42, 0.30, 1.34), mat_carenagem(), pai=estr,
                              chanfro=0)), passo=0.25)
        _viga(nome + "_pilha_braco", (0, y_col + 0.04, z_baixo_chapa - 0.06), (0, y_pilha - 0.15, z_baixo_chapa - 0.06), 0.06,
              0.06, mat_estrutura(), pai=estr)
    # ── pegadores: borracha ao longo do Y, presos por trás (suporte que vai pra trás e desce até a viga de trás do assento) ──
    pegs = {}
    y_sup = y_p + comp_p / 2 + 0.012
    z_sup = z_baixo_chapa - 0.04
    for k in (1, -1):
        x = k * x_p
        pegs[k] = _em_aneis(tubo(nome + "_pegador%+d" % k, (x, y_p + comp_p / 2, z_p), (x, y_p - comp_p / 2, z_p), raio_p,
                                 mat_borracha(), pai=estr, vertices=32), passo=0.035)
        _cilindro(nome + "_pegador_ponta%+d" % k, raio_p + 0.004, 0.012, (x, y_p - comp_p / 2 - 0.006, z_p),
                  (math.radians(90), 0, 0), mat_borracha(), pai=estr)
        tubo(nome + "_pegador_haste%+d" % k, (x, y_p + comp_p / 2 - 0.01, z_p), (x, y_sup + 0.012, z_p), 0.012, mat_aco(),
             pai=estr)
        _viga(nome + "_pegador_suporte%+d" % k, (x, y_sup, z_p + 0.012), (x, y_sup, z_sup), 0.03, 0.03, mat_estrutura(),
              pai=estr, chanfro=0.003)
        _viga(nome + "_pegador_braco%+d" % k, (x, y_sup, z_sup - 0.015), (k * 0.04, y_col, z_sup - 0.015), 0.03, 0.03,
              mat_estrutura(), pai=estr, chanfro=0.003)
    # ── os 2 braços: cubo no eixo, viga até o poste (em L: sai pra fora atrás da batata da perna e segue ao longo da coxa),
    #    poste vertical do lado de fora da perna, suporte da almofada e do apoio do pé ─────────────────────────────────────────
    raizes = {"estrutura": estr, "assento": ass, "encosto": enc}
    for s, lado in ((1, "esq"), (-1, "dir")):
        ex, ey = eixos[s]
        M0 = Matrix.Translation(Vector((ex, ey, z_eixo))) @ _X_PRA_CIMA
        bra, alm, pe = raiz_nova("braco_" + lado, M0), raiz_nova("almofada_" + lado, M0), raiz_nova("pe_" + lado, M0)
        raizes.update({"braco_" + lado: bra, "almofada_" + lado: alm, "pe_" + lado: pe})
        bpy.context.view_layer.update()
        c_alm, u, n, (comp_a, alt_a, esp_a) = almofadas[s]
        c_alm, u, n = Vector(c_alm), Vector((u[0], u[1], 0)).normalized(), Vector(n).normalized()
        c_pe, f, (comp_pe, larg_pe, esp_pe) = pes[s]
        c_pe, f = Vector(c_pe), Vector((f[0], f[1], 0)).normalized()
        Q = Vector((postes[s][0], postes[s][1], 0.0))
        fora = Vector((Q.x - ex, Q.y - ey, 0.0))
        fora = (fora - u * fora.dot(u)).normalized()           # de lado, pra fora da perna (⟂ à coxa)
        pecas_b = []
        P0 = Vector((ex, ey, z_eixo))
        pecas_b.append(_cilindro(nome + "_cubo_" + lado, 0.042, 0.06, P0, (0, 0, 0), mat_estrutura()))
        pecas_b.append(_cilindro(nome + "_cubo_tampa_" + lado, 0.022, 0.064, P0, (0, 0, 0), mat_aco()))
        C = Vector((Q.x, Q.y, z_eixo)) - u * 0.24              # dobra da viga: atrás da batata da perna
        Qb = Vector((Q.x, Q.y, z_eixo))
        pecas_b.append(_viga(nome + "_viga1_" + lado, P0 + (C - P0).normalized() * 0.03, C + (C - P0).normalized() * 0.025,
                             0.05, 0.05, mat_estrutura()))
        pecas_b.append(_viga(nome + "_viga2_" + lado, C - u * 0.025, Qb + u * 0.025, 0.05, 0.05, mat_estrutura()))
        z_pe_baixo = c_pe.z - esp_pe - 0.03                    # o poste desce até embaixo do apoio do pé
        z_alto = c_alm.z + alt_a / 2 - 0.02
        pecas_b.append(_viga(nome + "_poste_" + lado, Vector((Q.x, Q.y, z_pe_baixo - 0.02)), Vector((Q.x, Q.y, z_alto)), 0.05,
                             0.05, mat_estrutura()))
        # apoio do pé: chapa de borracha (APOIO) sobre uma chapa de aço, ligada ao poste por uma barra embaixo dela
        rot_pe = _girada(f)
        lado_pe = cima.cross(f)
        if lado_pe.dot(fora) < 0:
            lado_pe = -lado_pe
        _prender([caixa(nome + "_pe_borracha_" + lado, c_pe - cima * (esp_pe / 2), (comp_pe, larg_pe, esp_pe), mat_borracha(),
                        rot=rot_pe, chanfro=0.004),
                  caixa(nome + "_pe_chapa_" + lado, c_pe - cima * (esp_pe + 0.005), (comp_pe - 0.02, larg_pe - 0.02, 0.01),
                        mat_aco(), rot=rot_pe, chanfro=0.002)], pe)
        z_barra_pe = c_pe.z - esp_pe - 0.025
        q_u = (Qb - c_pe).dot(f)                               # onde o poste fica ao longo do pé
        q_u = max(-comp_pe / 2 + 0.03, min(comp_pe / 2 - 0.03, q_u))
        borda = c_pe + f * q_u + lado_pe * (larg_pe / 2 - 0.04)
        pecas_b.append(_viga(nome + "_barra_pe_" + lado, Vector((borda.x, borda.y, z_barra_pe)),
                             Vector((Q.x, Q.y, z_barra_pe)) + lado_pe * 0.025, 0.04, 0.03, mat_estrutura()))
        # almofada do joelho (APOIO): estofado + chapa atrás dele
        rot_a = _girada(u)
        costas_a = c_alm - n * (esp_a + 0.006)                 # centro da chapa atrás do estofado
        _prender([caixa(nome + "_almofada_estofado_" + lado, c_alm - n * (esp_a / 2), (comp_a, esp_a, alt_a), mat_estofado(),
                        rot=rot_a, chanfro=0.018),
                  caixa(nome + "_almofada_chapa_" + lado, costas_a, (comp_a - 0.03, 0.012, alt_a - 0.03), mat_estrutura(),
                        rot=rot_a, chanfro=0.003)], alm)
        tras_a = costas_a - n * 0.006                          # onde o suporte encosta atrás da chapa
        Qa = Vector((Q.x, Q.y, c_alm.z))
        if almofada == "fora":                                  # suporte reto do poste até a chapa (o poste fica atrás dela)
            pecas_b.append(_viga(nome + "_suporte_almofada_" + lado, Qa, tras_a, 0.04, 0.04, mat_estrutura()))
        else:                                                   # em U: pra frente, cruza na frente do joelho e entra na
            meio_a = c_alm - n * (esp_a / 2)                    # ponta da frente da almofada (nada atrás dela: as 2
            F1 = Qa + u * (volta_frente + (c_alm - Qa).dot(u))  # almofadas podem se encostar no meio com as pernas fechadas)
            F2 = F1 + fora * (meio_a - F1).dot(fora)
            ponta_a = meio_a + u * (comp_a / 2 - 0.01)
            for k, (A, B) in enumerate(((Qa, F1), (F1, F2), (F2, ponta_a))):
                d = (B - A).normalized()
                pecas_b.append(_viga(nome + "_suporte_almofada%d_" % k + lado, A - d * (0.02 if k else 0.0),
                                     B + d * (0.02 if k < 2 else 0.0), 0.04, 0.04, mat_estrutura()))
        _prender(pecas_b, bra)
    bpy.context.view_layer.update()
    return CadeiraQuadril(raizes, eixos, z_eixo, pegs, raio_p, comp_p / 2)
