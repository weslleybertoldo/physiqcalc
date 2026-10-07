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
#   A almofada das coxas pode ser um ROLO (rolo_coxa=(...), Cadeira Flexora, 06/10/2026): na coxa musculosa o topo sobe ~28°
#   logo acima do joelho e a almofada reta só encostava no fim dela; o rolo encosta na subida ("Secure the upper roller pad
#   firmly on your thighs", eGym M4 Leg Curl).
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
                   pilha=True, rolo_coxa=None):
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
      x_alavanca, x_torre = |x| do plano do braço da alavanca e da torre do eixo; pilha = caixa da pilha de pesos;
      rolo_coxa = None (padrão) ou (y, z, raio, comprimento) (flexora, no lugar da almofada reta): rolo de espuma por cima das
                  coxas, com o eixo ao longo do X centrado em (0, y, z), preso por um eixo de aço num mancal do lado da torre,
                  ligado ao alto da torre do eixo por um braço curto (raiz "<nome>_almofada", APOIO, como a almofada).
    Devolve um CadeiraJoelho (raizes, equipamentos, apoios, pegadores, girar())."""
    if almofada is not None and rolo_coxa is not None:
        raise ValueError("cadeira_joelho: use almofada OU rolo_coxa, não os dois")
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
    # ── rolo das coxas (flexora, no lugar da almofada reta): espuma (APOIO) e o eixo de aço até o mancal do lado da torre ──────
    if rolo_coxa is not None:
        yc, zc, rc, cc = rolo_coxa
        alm = raiz_nova("almofada")
        pecas = [_cilindro(nome + "_almofada_espuma", rc, cc, (0, yc, zc), rot_x90, mat_estofado(), vertices=48)]
        for k in (1, -1):
            pecas.append(_cilindro(nome + "_almofada_tampa%+d" % k, rc * 0.55, 0.006, (k * (cc / 2 + 0.001), yc, zc), rot_x90,
                                   mat_borracha()))
        _prender(pecas, alm)
        x_col = s * x_torre
        x_ent = s * (cc / 2 - 0.04)                          # o eixo entra 4 cm no rolo (o resto fica escondido dentro dele)
        x_fim = -s * (cc / 2 + 0.008)
        _em_aneis(_cilindro(nome + "_almofada_eixo", 0.0125, abs(x_col - x_ent), ((x_col + x_ent) / 2, yc, zc), rot_x90,
                            mat_aco(), vertices=24, pai=estr), passo=0.04)
        _cilindro(nome + "_almofada_ponta_eixo", 0.0125, 0.04, (x_fim + s * 0.012, yc, zc), rot_x90, mat_aco(), vertices=24,
                  pai=estr)
        _cilindro(nome + "_almofada_trava", 0.02, 0.012, (x_fim, yc, zc), rot_x90, mat_aco(), pai=estr)
        _cilindro(nome + "_almofada_mancal", 0.035, 0.07, (x_col, yc, zc), rot_x90, mat_estrutura(), pai=estr)
        # braço do mancal até o alto da torre do eixo (sem coluna até o chão: não tampa a mão no pegador vista da frente)
        _viga(nome + "_almofada_braco", (x_col, yc, zc), (x_col, ye + 0.02, ze + 0.05), 0.05, 0.05, mat_estrutura(), pai=estr)
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
#             pernas abertas (o começo da adução) e girar(< 0) fecha. Com as coxas abertas na montagem, poste_alinhado=True
#             vira o poste junto com a coxa (Cadeira Adutora, 06/10/2026).
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
                    pegadores=(0.06, 0.50, 0.30, 0.14, 0.0145), almofada="fora", volta_frente=0.16, pilha=True,
                    poste_alinhado=False):
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
                  dela — nada fica atrás da almofada, entre as pernas); pilha = caixa da pilha de pesos;
      poste_alinhado = False (padrão: o poste com as faces nos eixos X/Y do mundo na montagem — a abdutora monta com as coxas
                  a 3°, quase paralelas a eles) ou True (Cadeira Adutora, 06/10/2026: o poste com as faces viradas pra coxa, ao
                  longo de `u`, como as vigas do braço — a adutora monta com as coxas abertas a 40° e o poste ficava 40° torto em
                  relação ao braço, com a quina virada pra perna).
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
        a_poste, b_poste = Vector((Q.x, Q.y, z_pe_baixo - 0.02)), Vector((Q.x, Q.y, z_alto))
        if poste_alinhado:                                     # faces viradas pra coxa (ao longo de u), como as vigas do braço
            pecas_b.append(_em_aneis(_reto(caixa(nome + "_poste_" + lado, (a_poste + b_poste) / 2,
                                                 (0.05, 0.05, (b_poste - a_poste).length), mat_estrutura(), rot=_girada(u),
                                                 chanfro=0)), passo=0.05))
        else:
            pecas_b.append(_viga(nome + "_poste_" + lado, a_poste, b_poste, 0.05, 0.05, mat_estrutura()))
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


# ── LEG PRESS 45° (Leg Press 45°, lote 4, 06/10/2026) ──────────────────────────────────────────────────────────────────────────
# Máquina de empurrar com as pernas, deitado: 2 TRILHOS a 45° do chão (Hammer Strength Plate Loaded Linear Leg Press: "Featuring a
# 45-degree angle"; Precor DPL0601 Angled Leg Press: "a 45 degree angled carriage sled"), o CARRINHO que corre neles (as 2 luvas de
# rolamento, o chassi, a PLATAFORMA dos pés na frente, ⟂ ao trilho, e 2 suportes de anilha de cada lado — anilhas=True põe uma
# anilha de 20 kg nos de baixo), o ASSENTO e o ENCOSTO reclinado (com o apoio lombar), os PEGADORES dos 2 lados do assento, as
# TRAVAS de segurança nos trilhos (o batente onde o carrinho para, 3 cm abaixo do fim do curso), a base no chão e os postes que
# seguram as 2 pontas dos trilhos (cada trilho em cima de uma viga inclinada). A cena monta a peça EM VOLTA do corpo (como a
# cadeira_joelho e a cadeira_quadril): ela dá a plataforma (onde as solas encostam), o assento e o encosto (onde o glúteo, a
# lombar, as costas e a cabeça encostam), os pegadores (onde as mãos fecham) e o curso do carrinho; a peça liga tudo com a
# estrutura. Outro exercício na mesma máquina (leg press unilateral, panturrilha no leg press) monta com outra plataforma/curso:
# nada da peça é do Leg Press 45° em si.
# Medidas de máquina de verdade: trilho a 45°; encosto a 15°–30° da horizontal (Golparian, Anbarian e Golparian, J Adv Sport
# Technol 2021: "the backrest of leg-press machine was adjusted at 15°, 20°, 25°, and 30° angles relative to the horizon");
# plataforma de 28,35" × 19,92" = 72 × 51 cm (BodyKore G277 45 Degree Leg Press: "Platform Size : 28.35 X 19.92"); pino de anilha
# de 49 mm com 11,25" de luva (Titan Leg Press Hack Squat Machine: "Weight Post Diameter: 49 mm", "Weight Post Sleeve: 11.25-in.");
# máquina de ~2,4 m × 1,45 m de altura (Hammer Strength: "95 in x 65 in x 57 in (241 cm x 165 cm x 145 cm)"; Precor DPL0601:
# "244 x 145 x 145 cm"); tubo de 50 × 100 mm e estofado de 60 mm (Gym Gear Sterling Series 45 Degree Leg Press: "2.5-3mm by 50 x
# 100 square tubing", "60mm thick pads"). Luvas, chassi, postes, travas, o desenho dos pegadores e a anilha (20 kg, Ø 450 mm) são
# escolha da fábrica; a plataforma fica ⟂ ao trilho (a chapa presa reta no carrinho, escolha da fábrica). Peças compridas em anéis
# (_em_aneis / _viga): a checagem fica rápida.
# Uso numa cena (a pessoa olha pra −Y; a plataforma fica na frente, em cima):
#   lp = e3.leg_press_45("leg_press", plataforma=(...), trilhos=(...), curso=(...), assento=(...), encosto=(...),
#                        lombar=(...), pegadores=(...))
#   no pose(t): lp.mover(metros)               # carrinho e plataforma andam no trilho a partir da montagem (< 0 = descem)
#   Cena(pose, lp.equipamentos, pegadas=[("Left", ck.Barra(lp.pegadores[1], lp.raio_pegador, lp.meia_pegador,
#        eixo=(0, 0, 1))), ...], apoios=lp.apoios)
# As raízes (cada uma um equipamento da cena, a rigidez é por raiz): "<nome>_estrutura" (parada; não encosta no corpo, fora as
# mãos nos pegadores), "<nome>_assento" e "<nome>_encosto" (APOIO), "<nome>_carrinho" (anda; não encosta no corpo) e
# "<nome>_plataforma" (anda junto com o carrinho; APOIO: as solas encostam nela). As luvas do carrinho abraçam os trilhos (o
# trilho passa por dentro delas): a checagem do corpo não mede peça × peça.
class LegPress:
    """Leg press 45° pronto na cena (leg_press_45())."""

    def __init__(self, raizes, direcao, pegadores, raio_pegador, meia_pegador):
        self.raizes = raizes              # {"estrutura", "assento", "encosto", "carrinho", "plataforma"}
        self.equipamentos = [raizes["estrutura"], raizes["carrinho"]]
        self.apoios = [raizes[k] for k in ("assento", "encosto", "plataforma")]
        self.direcao = Vector(direcao)    # ao longo do trilho, subindo (unitário)
        self.pegadores = pegadores        # {+1: pegador do lado +X, −1: do lado −X}; eixo de cada um no Z local
        self.raio_pegador = raio_pegador
        self.meia_pegador = meia_pegador
        self.deslocamento = 0.0
        self._M0 = {k: raizes[k].matrix_world.copy() for k in ("carrinho", "plataforma")}

    def mover(self, metros):
        """Carrinho e plataforma `metros` ao longo do trilho a partir da montagem (> 0 sobe, < 0 desce pra quem empurra)."""
        T = Matrix.Translation(self.direcao * metros)
        for k, M in self._M0.items():
            self.raizes[k].matrix_world = T @ M
        self.deslocamento = metros
        bpy.context.view_layer.update()


def _rot_de(x, y, z):
    """Euler de uma caixa com os eixos locais X, Y, Z ao longo de x, y, z (base ortonormal)."""
    return Matrix((Vector(x), Vector(y), Vector(z))).transposed().to_euler()


def leg_press_45(nome="leg_press", angulo=45.0, plataforma=None, trilhos=(0.26, 0.30, 0.025), curso=(-0.30, 0.0),
                 assento=None, encosto=None, lombar=None, pegadores=None, anilhas=False):
    """Leg press 45° (ver o bloco acima). Medidas no mundo, em m, com a pessoa olhando pra −Y, tudo NA MONTAGEM:
      angulo     = ângulo do trilho com o chão (graus): o carrinho sobe na direção D = (0, −cos, sen);
      plataforma = (centro, largura, altura, espessura): centro da FACE da plataforma (onde as solas encostam), ⟂ a D; largura
                   ao longo do X, altura ao longo de E (na face, pra cima: E = (0, sen, cos));
      trilhos    = (x, recuo, raio): os 2 trilhos (barras redondas) em x = ±x, passando `recuo` m abaixo do centro da
                   plataforma (ao longo de −E), paralelos a D;
      curso      = (d_min, d_max): até onde o carrinho anda no trilho a partir da montagem (m, ao longo de D; < 0 = desce):
                   os trilhos cobrem as luvas nas 2 pontas e a trava fica logo abaixo de d_min;
      assento    = (centro, angulo, comprimento, largura, espessura): centro da face de CIMA do assento (onde o glúteo
                   encosta), subindo `angulo` graus pra frente (−Y);
      encosto    = (base, angulo, comprimento, largura, espessura): base = ponto da FACE na ponta de baixo (no meio), a face
                   sobe pra trás (+Y) a `angulo` graus da horizontal por `comprimento` m;
      lombar     = None ou (s, a, b, saliencia): apoio lombar — rolo de espuma achatado (elipse de semieixos a ao longo do
                   encosto e b ⟂ a ele, eixo ao longo do X) embutido no encosto a `s` m da base ao longo dele, saindo `saliencia`
                   m da face (encaixa na curva da lombar);
      pegadores  = (centros, eixos, comprimento, raio): {s: centro} e {s: eixo} de cada pegador de borracha (s = +1 lado +X),
                   em cima de um poste que desce até a base;
      anilhas    = True põe uma anilha de 20 kg em cada suporte de baixo do carrinho (padrão: sem anilha, a visão das pernas e dos
                   pés fica livre).
    Devolve um LegPress (raizes, equipamentos, apoios, pegadores, mover())."""
    a = math.radians(angulo)
    D = Vector((0.0, -math.cos(a), math.sin(a)))              # ao longo do trilho, subindo
    E = Vector((0.0, math.sin(a), math.cos(a)))               # na face da plataforma, pra cima (pros dedos)
    X = Vector((1.0, 0.0, 0.0))
    cima = Vector((0.0, 0.0, 1.0))

    def raiz_nova(sufixo):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        return r

    estr, ass, enc, car, pla = (raiz_nova(k) for k in ("estrutura", "assento", "encosto", "carrinho", "plataforma"))
    rot_p = _rot_de(X, E, D)                                  # caixa: X local = X, Y local = E, Z local = D

    # ── plataforma (APOIO): chapa ⟂ ao trilho, a face na frente (pra quem empurra) ─────────────────────────────────────────────
    c_p, larg_p, alt_p, esp_p = plataforma
    c_p = Vector(c_p)
    caixa(nome + "_plataforma_chapa", c_p + D * (esp_p / 2), (larg_p, alt_p, esp_p), mat_aco(), rot=rot_p, pai=pla,
          chanfro=0.004)

    # ── carrinho (anda): luvas nos trilhos, chassi atrás da plataforma, suportes de anilha e anilhas ───────────────────────────
    x_t, recuo, raio_t = trilhos
    d0, d1 = curso
    L_luva = 0.30
    atras = esp_p + 0.012                                     # o chassi começa logo atrás da chapa
    base_t = c_p - E * recuo                                  # ponto do eixo dos trilhos na altura da plataforma (montagem)
    pecas = []
    for s in (1, -1):
        eixo_s = base_t + X * (s * x_t)
        c_luva = eixo_s + D * (atras + L_luva / 2)
        pecas.append(_em_aneis(_cilindro(nome + "_luva%+d" % s, raio_t + 0.022, L_luva, c_luva,
                                         D.to_track_quat("Z", "Y").to_euler(), mat_estrutura(), vertices=32), passo=0.05))
        for k in (-1, 1):                                     # tampas das luvas (raspadores)
            pecas.append(_cilindro(nome + "_luva_tampa%+d%+d" % (s, k), raio_t + 0.026, 0.014,
                                   c_luva + D * (k * (L_luva / 2 + 0.007)), D.to_track_quat("Z", "Y").to_euler(), mat_borracha(),
                                   vertices=32))
        # coluna do chassi: da luva sobe (ao longo de E) por trás da chapa até perto da borda de cima
        topo_e = alt_p / 2 - 0.06
        pecas.append(_viga(nome + "_chassi_lado%+d" % s, eixo_s + D * (atras + 0.03) + E * (raio_t + 0.01),
                           c_p + X * (s * x_t) + D * (atras + 0.03) + E * topo_e, 0.06, 0.06, mat_estrutura()))
        # braço que liga a coluna à luva por trás (triângulo do chassi)
        pecas.append(_viga(nome + "_chassi_diag%+d" % s, c_p + X * (s * x_t) + D * (atras + 0.05) + E * (topo_e - 0.10),
                           eixo_s + D * (atras + L_luva - 0.03) + E * (raio_t + 0.035), 0.05, 0.05, mat_estrutura()))
    # travessas do chassi (de um lado ao outro, atrás da chapa): embaixo (nas luvas) e em cima
    for k, e_ in enumerate((-recuo + raio_t + 0.05, alt_p / 2 - 0.09)):
        pecas.append(_em_aneis(_reto(caixa(nome + "_chassi_trav%d" % k, c_p + D * (atras + 0.03) + E * e_,
                                           (2 * (x_t + 0.03), 0.06, 0.06), mat_estrutura(), rot=rot_p, chanfro=0)), passo=0.06))
    # suportes de anilha: 2 de cada lado, pra fora (±X), na altura da luva e mais acima; colar de encosto da anilha na base
    R_x = (0, math.radians(90), 0)
    comp_pino, raio_pino = 0.286, 0.0245
    for s in (1, -1):
        e_d = (-recuo + raio_t + 0.015 + alt_p / 2 - 0.06 - 0.10) / 2       # meio do braço diagonal do chassi
        d_d = (atras + 0.05 + atras + L_luva - 0.03) / 2
        for k, (e_, d_) in enumerate(((-recuo + 0.03, atras + L_luva - 0.04), (e_d, d_d))):
            c0 = c_p + D * d_ + E * e_ + X * (s * (x_t + 0.03))
            x_ini = raio_t + 0.006 if k == 0 else 0.0           # a de baixo encosta na parede da luva, longe do trilho
            pecas.append(_reto(caixa(nome + "_pino_base%+d%d" % (s, k), c0 + X * (s * ((x_ini + 0.09) / 2 - 0.03)),
                                     (0.09 - x_ini, 0.07, 0.07), mat_estrutura(), rot=rot_p, chanfro=0)))
            x0 = s * (x_t + 0.08)
            pecas.append(_em_aneis(_cilindro(nome + "_pino%+d%d" % (s, k), raio_pino, comp_pino,
                                             Vector((x0 + s * comp_pino / 2, c0.y, c0.z)), R_x, mat_aco(), vertices=24), passo=0.04))
            pecas.append(_cilindro(nome + "_pino_colar%+d%d" % (s, k), 0.06, 0.016, Vector((x0 + s * 0.008, c0.y, c0.z)), R_x,
                                   mat_aco(), vertices=32))
            if anilhas and k == 0:                            # anilha de 20 kg (Ø 450 mm) no suporte de baixo
                xa = x0 + s * (0.016 + 0.028)
                an = _cilindro(nome + "_anilha%+d" % s, 0.225, 0.054, Vector((xa, c0.y, c0.z)), R_x, mat_borracha(), vertices=48)
                pecas.append(_em_aneis(an, passo=0.05))
                pecas.append(_cilindro(nome + "_anilha_miolo%+d" % s, 0.045, 0.058, Vector((xa, c0.y, c0.z)), R_x,
                                       mat_aco(), vertices=32))
    _prender(pecas, car)

    # ── trilhos (parados) e as travas: barras redondas paralelas a D, das travas (embaixo do curso) até o pórtico ──────────────
    d_baixo = d0 + atras - 0.13                               # ponta de baixo do trilho (ao longo de D, a partir da montagem)
    d_cima = d1 + atras + L_luva + 0.28                       # ponta de cima (passa da luva no topo do curso)
    pts = {}
    for s in (1, -1):
        eixo_s = base_t + X * (s * x_t)
        A_t, B_t = eixo_s + D * d_baixo, eixo_s + D * d_cima
        pts[s] = (A_t, B_t)
        _em_aneis(tubo(nome + "_trilho%+d" % s, A_t, B_t, raio_t, mat_aco(), pai=estr, vertices=24), passo=0.05)
        # trava de segurança: colar no trilho logo abaixo da luva no fim do curso, com a alavanca pra fora
        c_tr = eixo_s + D * (d0 + atras - 0.014 - 0.03 - 0.02)   # 3 cm abaixo da tampa da luva no fim do curso
        _cilindro(nome + "_trava%+d" % s, raio_t + 0.024, 0.04, c_tr, D.to_track_quat("Z", "Y").to_euler(), mat_estrutura(),
                  vertices=32, pai=estr)
        caixa(nome + "_trava_alavanca%+d" % s, c_tr + X * (s * (raio_t + 0.05)), (0.07, 0.022, 0.03), mat_estrutura(), pai=estr,
              chanfro=0.003)
        _cilindro(nome + "_trava_bola%+d" % s, 0.016, 0.03, c_tr + X * (s * (raio_t + 0.10)), R_x, mat_borracha(), pai=estr)
    # ── pórtico: postes da ponta de baixo e da de cima dos trilhos até o chão, travessas e base no chão ──────────────────────────
    for s in (1, -1):
        A_t, B_t = pts[s]
        _viga(nome + "_poste_baixo%+d" % s, A_t - E * 0.15, Vector((A_t.x, (A_t - E * 0.15).y, 0.06)), 0.07, 0.07, mat_estrutura(),
              pai=estr)
        _viga(nome + "_poste_cima%+d" % s, B_t + cima * 0.03, Vector((B_t.x, B_t.y, 0.06)), 0.08, 0.08, mat_estrutura(), pai=estr)
        _viga(nome + "_base_lado%+d" % s, Vector((A_t.x, A_t.y + 0.04, 0.03)), Vector((B_t.x, B_t.y - 0.05, 0.03)), 0.08, 0.06,
              mat_estrutura(), pai=estr)
    for s in (1, -1):                                         # viga inclinada embaixo do trilho, de um poste ao outro
        A_t, B_t = pts[s]
        _viga(nome + "_viga_trilho%+d" % s, A_t - E * 0.12 - D * 0.02, B_t - E * 0.12 + D * 0.02, 0.08, 0.10, mat_estrutura(),
              pai=estr)                                      # 4,5 cm abaixo do trilho: a luva passa por cima com folga
        for P_, k in ((A_t, 0), (B_t, 1)):                     # mãos do trilho, nas 2 pontas (do trilho até a viga)
            caixa(nome + "_trilho_suporte%+d%d" % (s, k), P_ - E * 0.05 + D * (0.02 if k == 0 else -0.02), (0.05, 0.06, 0.04),
                  mat_estrutura(), rot=rot_p, pai=estr, chanfro=0.003)
    A1, A2 = pts[1][0], pts[-1][0]
    B1, B2 = pts[1][1], pts[-1][1]
    _em_aneis(_reto(caixa(nome + "_trav_baixo", (A1 + A2) / 2 - E * 0.12 + D * 0.03, (2 * x_t - 0.08, 0.07, 0.07),
                          mat_estrutura(), rot=rot_p, pai=estr, chanfro=0)), passo=0.07)
    _viga(nome + "_trav_cima", B1 + X * 0.04 + cima * 0.07, B2 - X * 0.04 + cima * 0.07, 0.08, 0.08, mat_estrutura(), pai=estr)
    for s in (1, -1):                                         # suporte do trilho no alto: cantoneira do trilho à travessa
        caixa(nome + "_trilho_mao%+d" % s, pts[s][1] + cima * 0.035, (0.07, 0.07, 0.07), mat_estrutura(), pai=estr, chanfro=0.004)
    _viga(nome + "_base_frente", Vector((A1.x + 0.04, A1.y, 0.03)), Vector((A2.x - 0.04, A2.y, 0.03)), 0.08, 0.06, mat_estrutura(),
          pai=estr)
    _viga(nome + "_base_fundo", Vector((B1.x + 0.04, B1.y, 0.03)), Vector((B2.x - 0.04, B2.y, 0.03)), 0.08, 0.06, mat_estrutura(),
          pai=estr)

    # ── encosto (APOIO): estofado reclinado, com o apoio lombar embutido; chapa e viga embaixo dele ───────────────────────────────
    b_e, ang_e, comp_e, larg_e, esp_e = encosto
    b_e = Vector(b_e)
    ae = math.radians(ang_e)
    u_e = Vector((0.0, math.cos(ae), math.sin(ae)))           # ao longo do encosto, subindo pra trás
    n_e = Vector((0.0, -math.sin(ae), math.cos(ae)))          # normal da face (pro corpo)
    rot_e = _rot_de(X, u_e, n_e)
    caixa(nome + "_encosto_estofado", b_e + u_e * (comp_e / 2) - n_e * (esp_e / 2), (larg_e, comp_e, esp_e), mat_estofado(),
          rot=rot_e, pai=enc, chanfro=0.018)
    if lombar is not None:                                    # rolo achatado (elipse), todo dentro do estofado + o que sai
        s_l, a_l, b_l, sai_l = lombar
        bpy.ops.mesh.primitive_cylinder_add(radius=1.0, depth=larg_e - 0.03, vertices=64)
        lo_ = bpy.context.active_object
        lo_.name = nome + "_encosto_lombar"
        lo_.scale = (b_l, a_l, 1.0)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        lo_.matrix_world = (Matrix.Translation(b_e + u_e * s_l + n_e * (sai_l - b_l))
                            @ Matrix((n_e, u_e, -X)).transposed().to_4x4())
        bpy.ops.object.shade_smooth()
        lo_.data.materials.append(mat_estofado())
        _prender([lo_], enc)
    _em_aneis(_reto(caixa(nome + "_encosto_chapa", b_e + u_e * (comp_e / 2) - n_e * (esp_e + 0.012),
                          (larg_e - 0.05, comp_e - 0.05, 0.024), mat_estrutura(), rot=rot_e, pai=estr, chanfro=0)), passo=0.06)
    z_viga = -n_e * (esp_e + 0.024 + 0.035)
    e_a, e_b = b_e + u_e * 0.06 + z_viga, b_e + u_e * (comp_e - 0.10) + z_viga
    _viga(nome + "_encosto_viga", e_a, e_b, 0.07, 0.07, mat_estrutura(), pai=estr)
    _viga(nome + "_encosto_pe", e_b - cima * 0.035, Vector((e_b.x, e_b.y, 0.06)), 0.07, 0.07, mat_estrutura(), pai=estr)

    # ── assento (APOIO): estofado subindo pra frente, na ponta de baixo do encosto; chapa e coluna até a base ──────────────────
    c_s, ang_s, comp_s, larg_s, esp_s = assento
    c_s = Vector(c_s)
    as_ = math.radians(ang_s)
    v_s = Vector((0.0, -math.cos(as_), math.sin(as_)))        # ao longo do assento, pra frente (subindo)
    n_s = Vector((0.0, math.sin(as_), math.cos(as_)))         # normal da face (pro corpo)
    rot_s = _rot_de(X, -v_s, n_s)
    caixa(nome + "_assento_estofado", c_s - n_s * (esp_s / 2), (larg_s, comp_s, esp_s), mat_estofado(), rot=rot_s, pai=ass,
          chanfro=0.018)
    _em_aneis(_reto(caixa(nome + "_assento_chapa", c_s - n_s * (esp_s + 0.012), (larg_s - 0.05, comp_s - 0.04, 0.024),
                          mat_estrutura(), rot=rot_s, pai=estr, chanfro=0)), passo=0.06)
    p_col = c_s - n_s * (esp_s + 0.024 + 0.03)
    _viga(nome + "_assento_coluna", p_col, Vector((p_col.x, p_col.y, 0.06)), 0.08, 0.08, mat_estrutura(), pai=estr)
    _viga(nome + "_assento_braco", p_col + cima * 0.01, e_a + u_e * 0.02, 0.06, 0.06, mat_estrutura(), pai=estr)
    # base do meio no chão: da coluna do assento até o pé do encosto e até a travessa da frente
    y_tras = e_b.y + 0.06
    _viga(nome + "_base_meio", Vector((0.0, y_tras, 0.03)), Vector((0.0, A1.y + 0.04, 0.03)), 0.08, 0.06, mat_estrutura(),
          pai=estr)
    _viga(nome + "_base_pe_tras", Vector((0.32, y_tras - 0.04, 0.025)), Vector((-0.32, y_tras - 0.04, 0.025)), 0.08, 0.05,
          mat_estrutura(), pai=estr)

    # ── pegadores: borracha em cima de um poste que desce até a base, dos 2 lados do assento ─────────────────────────────────
    centros, eixos_p, comp_g, raio_g = pegadores
    pegs = {}
    for s in (1, -1):
        c_g, u_g = Vector(centros[s]), Vector(eixos_p[s]).normalized()
        a_g, b_g = c_g - u_g * (comp_g / 2), c_g + u_g * (comp_g / 2)
        pegs[s] = _em_aneis(tubo(nome + "_pegador%+d" % s, a_g, b_g, raio_g, mat_borracha(), pai=estr, vertices=32),
                            passo=0.035)
        _cilindro(nome + "_pegador_ponta%+d" % s, raio_g + 0.004, 0.012, b_g + u_g * 0.006,
                  u_g.to_track_quat("Z", "Y").to_euler(), mat_borracha(), pai=estr)
        tubo(nome + "_pegador_haste%+d" % s, a_g + u_g * 0.01, a_g - u_g * 0.05, 0.013, mat_aco(), pai=estr)
        pe_g = a_g - u_g * 0.05
        _viga(nome + "_pegador_poste%+d" % s, pe_g, Vector((pe_g.x, pe_g.y, 0.06)), 0.04, 0.04, mat_estrutura(), pai=estr)
        _viga(nome + "_pegador_base%+d" % s, Vector((pe_g.x, pe_g.y, 0.025)), Vector((0.0, pe_g.y, 0.025)), 0.05, 0.05,
              mat_estrutura(), pai=estr)
    bpy.context.view_layer.update()
    raizes = {"estrutura": estr, "assento": ass, "encosto": enc, "carrinho": car, "plataforma": pla}
    return LegPress(raizes, D, pegs, raio_g, comp_g / 2)


# ── SMITH (Agachamento no Smith, lote 4, 06/10/2026) ──────────────────────────────────────────────────────────────────────────
# Máquina de barra GUIADA: a barra corre presa em 2 TRILHOS verticais e só sobe e desce (Cotterman, Darby e Skelly, J Strength
# Cond Res 2005: "The Smith machine (SM) (vertical motion of bar on fixed path; fixed-form exercise)"; Gutierrez e Bahamonde, ISBS
# 2009: "It consists of a barbell that is fixed within rails, so that it can only move vertically"; Gym Gear Elite Series Smith
# Machine: "The linear bearings provide an exceptionally smooth, fluid vertical bar movement"). Peças: a BASE no chão (uma viga
# embaixo de cada coluna, ao longo do Y, e a travessa de trás), as 2 COLUNAS com a travessa de cima, os 2 TRILHOS (barras redondas
# de aço na frente das colunas, presas nelas por um suporte embaixo e outro em cima), a BARRA com os 2 CARRINHOS (luvas dos
# rolamentos lineares que abraçam o trilho; a barra da pegada fica entre eles e a luva das anilhas, por fora), os GANCHOS (um em
# cada carrinho, virado pros pinos da coluna: girar a barra engata o gancho num pino — Titan Smith Machine: "Just twist to rack and
# unrack the bar."; ExRx, Smith Squat: "Disengage bar by rotating bar back."; os pinos a cada 10 cm, como os 16 encaixes da Precor
# DPL0802: "16 Hook positions at 4 in / 10 cm spacing"), as ANILHAS nas luvas e as TRAVAS de segurança (um colar em cada trilho,
# embaixo do curso da barra, preso na coluna; Titan: "Two adjustable safety catches").
# Medidas de máquina de verdade: barra de 87" = 2,21 m, com 30 mm na pegada e luvas de anilha de 12,5" × 49 mm (Titan Smith
# Machine: "Barbell Length: 87-in.", "Barbell Shaft Diameter: 30mm", "Barbell Sleeve Length: 12.5-in.", "Barbell Sleeve Diameter:
# 49mm"); máquina de 86" = 2,18 m de altura e 54" = 1,37 m de fundo (Titan: "Overall Height: 86-in.", "Overall Depth: 54-in.");
# trilho de 32 mm (Precor DPL0802 Smith Machine: "Shafting: 1.25 in / 32 mm case hardened, ground turned and polished linear
# shafting"), com 2 rolamentos lineares de cada lado ("Qty. four (4) industrial grade linear bearings ... (2 per side)": o carrinho
# tem 16 cm, a altura de 2 rolamentos); coluna de tubo 50 × 100 mm (Gym Gear Elite Series Smith Machine: "2.5-3mm by 50 x 100 oval
# tubing"). Os trilhos ficam bem nas pontas da barra da pegada (entre ela e a luva das anilhas): com a barra de 2,21 m e luvas de
# 0,3175 m, x = ±0,75 m. A anilha (20 kg, Ø 450 mm), o desenho do carrinho, do gancho, dos pinos, da trava e da base são escolha
# da fábrica.
# A cena monta a peça EM VOLTA do corpo (como as cadeiras e o leg press): ela dá a linha da barra (o y dos trilhos; a barra fica
# centrada em x = 0), a altura da barra na montagem e o curso (até onde ela desce e sobe no exercício: as travas ficam 3 cm abaixo
# do carrinho no fim do curso); a peça liga tudo com a estrutura. Outro exercício no Smith (afundo, panturrilha, supino) monta com
# outra linha e outro curso: nada da peça é do agachamento em si.
#   sm = e3.smith("smith", y=..., z=..., curso=(z_min, z_max))
#   no pose(t): sm.mover(z)                  # a barra (com os carrinhos, os ganchos e as anilhas) na altura z — só na vertical
#   Cena(pose, sm.equipamentos, pegadas=[("Left", ck.Barra(sm.barra, sm.raio, sm.meia)), ("Right", ...)], apoios=sm.apoios)
# As raízes (cada uma um equipamento da cena, a rigidez é por raiz): "<nome>_estrutura" (parada: base, colunas, trilhos, pinos e
# travas; não encosta no corpo) e "<nome>_barra" (anda só na vertical; origem no eixo da barra, no meio, X local ao longo dela).
# A barra apoiada no trapézio é APOIO do corpo (como o estofado: encostar é o certo, afundar até o afunda_apoio_mm da cena), e
# assim a estrutura continua com a folga de sempre (3 mm) do corpo. Os carrinhos e as travas abraçam os trilhos (o trilho passa
# por dentro deles, com folga): a checagem do corpo não mede peça × peça — a cena mede à parte. Peças compridas em anéis
# (_em_aneis / _viga): a checagem fica rápida.
class Smith:
    """Smith pronto na cena (smith())."""

    def __init__(self, raizes, raio, meia, z0, curso):
        self.raizes = raizes                  # {"estrutura", "barra"}
        self.equipamentos = [raizes["estrutura"]]
        self.apoios = [raizes["barra"]]
        self.barra = raizes["barra"]          # origem no eixo da barra (no meio), X local ao longo dela (pegada: ck.Barra)
        self.raio = raio                      # raio da barra da pegada
        self.meia = meia                      # do meio da barra até a borda do carrinho (onde a mão pode fechar)
        self.curso = tuple(curso)             # (z_min, z_max) do eixo da barra no exercício
        self.z = z0
        self._z0 = z0
        self._M0 = raizes["barra"].matrix_world.copy()

    def mover(self, z):
        """Barra (com os carrinhos, os ganchos e as anilhas) com o eixo na altura z: só anda na vertical, presa nos trilhos, e não
        passa do curso (embaixo dele ficam as travas)."""
        if not self.curso[0] - 1e-6 <= z <= self.curso[1] + 1e-6:
            raise ValueError("smith: barra em z = %.4f fora do curso %s (as travas ficam embaixo dele)" % (z, self.curso))
        self.raizes["barra"].matrix_world = Matrix.Translation(Vector((0.0, 0.0, z - self._z0))) @ self._M0
        self.z = z
        bpy.context.view_layer.update()


def _tubo_oco(nome, centro, raio_ext, raio_int, altura, mat, vertices=32, pai=None):
    """Luva (tubo de parede grossa) em pé, ao longo do Z, centrada em `centro`: o furo do meio fica aberto (o trilho passa por
    dentro dela com folga). Paredes com sombreamento suave, topo e fundo retos."""
    import bmesh
    bm = bmesh.new()
    aneis = []
    for r, z in ((raio_ext, -altura / 2), (raio_ext, altura / 2), (raio_int, altura / 2), (raio_int, -altura / 2)):
        aneis.append([bm.verts.new((r * math.cos(2 * math.pi * k / vertices), r * math.sin(2 * math.pi * k / vertices), z))
                      for k in range(vertices)])
    for a, b in zip(aneis, aneis[1:] + aneis[:1]):          # parede de fora, topo, parede de dentro e fundo
        for k in range(vertices):
            k2 = (k + 1) % vertices
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for pl in me.polygons:
        pl.use_smooth = abs(pl.normal.z) < 0.5
    o = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = centro
    o.data.materials.append(mat)
    if pai is not None:
        o.parent = pai
    return o


def smith(nome="smith", y=0.0, z=1.40, curso=(0.90, 1.50), x_trilho=0.75, raio_trilho=0.016, altura=2.18, fundo=1.37,
          barra=(2.21, 0.015, 0.3175, 0.0245), anilha=(0.225, 0.054), coluna=(0.16, 0.05, 0.10),
          carrinho=(0.0375, 0.0195, 0.16)):
    """Smith (ver o bloco acima). Medidas no mundo, em m, com a pessoa olhando pra −Y, tudo NA MONTAGEM:
      y, z      = linha da barra: os 2 trilhos ficam em (±x_trilho, y) e o eixo da barra, ao longo do X e centrado em x = 0, na
                  altura z;
      curso     = (z_min, z_max): até onde o eixo da barra desce e sobe no exercício (mover() não deixa passar; as travas ficam
                  3 cm abaixo do carrinho com a barra em z_min);
      x_trilho, raio_trilho = meia distância entre os trilhos e o raio deles;
      altura, fundo = altura das colunas (a travessa de cima fica no alto delas) e o comprimento da base no chão (ao longo do Y);
      barra     = (comprimento, raio, luva, raio_luva): barra inteira de ponta a ponta, raio da pegada e a luva das anilhas
                  (comprimento e raio) em cada ponta;
      anilha    = None ou (raio, espessura): uma anilha em cada luva, encostada no colar;
      coluna    = (recuo, x, y): a coluna (tubo retangular x × y) fica atrás do trilho, com o centro `recuo` m atrás dele (+Y);
      carrinho  = (raio_ext, raio_int, altura): a luva dos rolamentos que abraça o trilho (raio_int > raio do trilho: folga).
    Devolve um Smith (raizes, equipamentos, apoios, barra, raio, meia, mover())."""
    comp_b, raio_b, luva_b, raio_luva = barra
    recuo, cx, cy = coluna
    r_ext, r_int, alt_c = carrinho
    if r_int <= raio_trilho:
        raise ValueError("smith: o furo do carrinho (%.4f) tem que ser maior que o trilho (%.4f)" % (r_int, raio_trilho))
    if not curso[0] <= z <= curso[1]:
        raise ValueError("smith: a barra na montagem (z = %.4f) fora do curso %s" % (z, tuple(curso)))
    rot_x90 = (0, math.radians(90), 0)                      # cilindro deitado ao longo do X
    rot_y90 = (math.radians(90), 0, 0)                      # cilindro deitado ao longo do Y
    y_col = y + recuo
    face_col = y_col - cy / 2                               # face da frente da coluna (de frente pro trilho)

    def raiz_nova(sufixo, loc=(0.0, 0.0, 0.0)):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        r.location = loc
        return r

    estr = raiz_nova("estrutura")
    bar = raiz_nova("barra", (0.0, y, z))
    bpy.context.view_layer.update()

    # ── base no chão: uma viga embaixo de cada coluna (ao longo do Y) e a travessa de trás ──────────────────────────────────────
    y0b, y1b = y_col - fundo / 2, y_col + fundo / 2
    for s in (1, -1):
        _em_aneis(_reto(caixa(nome + "_base%+d" % s, (s * x_trilho, (y0b + y1b) / 2, 0.03), (0.10, y1b - y0b, 0.06),
                              mat_estrutura(), pai=estr, chanfro=0)), passo=0.10)
    _em_aneis(_reto(caixa(nome + "_base_tras", (0, y1b - 0.05, 0.03), (2 * x_trilho - 0.10, 0.08, 0.06), mat_estrutura(),
                          pai=estr, chanfro=0)), passo=0.08)
    # ── colunas (tubo 50 × 100: cx de lado, cy de frente pra trás) e a travessa de cima ───────────────────────────────────────
    for s in (1, -1):
        _em_aneis(_reto(caixa(nome + "_coluna%+d" % s, (s * x_trilho, y_col, (0.06 + altura) / 2), (cx, cy, altura - 0.06),
                              mat_estrutura(), pai=estr, chanfro=0)), passo=max(cx, cy))
    _em_aneis(_reto(caixa(nome + "_travessa", (0, y_col, altura - 0.04), (2 * x_trilho + cx, cy, 0.08), mat_estrutura(),
                          pai=estr, chanfro=0)), passo=0.10)
    # ── trilhos: barra redonda de aço na frente de cada coluna, presa por um suporte embaixo (na base) e outro em cima ──────────
    z_t0, z_t1 = 0.10, altura - 0.14
    for s in (1, -1):
        x = s * x_trilho
        _em_aneis(tubo(nome + "_trilho%+d" % s, (x, y, z_t0), (x, y, z_t1), raio_trilho, mat_aco(), pai=estr, vertices=24),
                  passo=0.04)
        for k, (zb, zc) in enumerate(((0.06, z_t0 + 0.03), (z_t1 - 0.03, z_t1 + 0.05))):   # o trilho entra 3 cm em cada bloco
            caixa(nome + "_trilho_bloco%+d%d" % (s, k), (x, y, (zb + zc) / 2), (0.07, 0.07, zc - zb), mat_estrutura(), pai=estr,
                  chanfro=0.004)
            caixa(nome + "_trilho_suporte%+d%d" % (s, k), (x, (y + 0.035 + face_col) / 2, (zb + zc) / 2),
                  (0.05, face_col - y - 0.035 + 0.004, zc - zb - 0.01), mat_estrutura(), pai=estr, chanfro=0.003)
    # ── pinos dos ganchos na frente da coluna, a cada 10 cm (o gancho da barra engata num deles quando a barra gira) ─────────────
    for s in (1, -1):
        for k in range(int(round((altura - 0.60) / 0.10))):
            zp = 0.40 + 0.10 * k
            _cilindro(nome + "_pino%+d_%02d" % (s, k), 0.008, 0.026, (s * x_trilho, face_col - 0.012, zp), rot_y90, mat_aco(),
                      vertices=16, pai=estr)
    # ── travas de segurança: colar no trilho 3 cm abaixo do carrinho com a barra no fim do curso, preso na coluna ──────────────
    z_trava = curso[0] - alt_c / 2 - 0.03 - 0.025               # centro do colar (5 cm de altura)
    for s in (1, -1):
        x = s * x_trilho
        _tubo_oco(nome + "_trava%+d" % s, (x, y, z_trava), r_int + 0.012, r_int, 0.05, mat_estrutura(), pai=estr)
        caixa(nome + "_trava_braco%+d" % s, (x, (y + r_int + 0.010 + face_col) / 2, z_trava),
              (0.03, face_col - y - r_int - 0.010 + 0.004, 0.03), mat_estrutura(), pai=estr, chanfro=0.003)
        # pino de regulagem com a bola, virado pra DENTRO (por fora fica a anilha, que desce até perto da trava)
        _cilindro(nome + "_trava_pino%+d" % s, 0.007, 0.05, (x - s * 0.035, face_col - 0.02, z_trava), rot_x90, mat_aco(),
                  vertices=16, pai=estr)
        _cilindro(nome + "_trava_bola%+d" % s, 0.014, 0.02, (x - s * 0.065, face_col - 0.02, z_trava), rot_x90, mat_borracha(),
                  vertices=24, pai=estr)

    # ── barra (anda): pegada entre os carrinhos, carrinhos nos trilhos, ganchos, luvas, colares e anilhas ─────────────────────────
    pecas = []
    meia = x_trilho - r_ext                                  # a pegada vai do meio até a borda de dentro do carrinho
    pecas.append(_em_aneis(_cilindro(nome + "_barra_pegada", raio_b, 2 * meia + 0.004, (0, y, z), rot_x90, mat_aco(),
                                     vertices=32), passo=0.04))
    for s in (1, -1):
        x = s * x_trilho
        pecas.append(_tubo_oco(nome + "_carrinho%+d" % s, (x, y, z), r_ext, r_int, alt_c, mat_estrutura()))
        for k in (-1, 1):                                    # tampas dos rolamentos (raspadores) em cima e embaixo
            pecas.append(_tubo_oco(nome + "_carrinho_tampa%+d%+d" % (s, k), (x, y, z + k * (alt_c / 2 + 0.004)), r_ext - 0.004,
                                   r_int, 0.008, mat_borracha()))
        # gancho: braço do carrinho pra trás (pra coluna) e a ponta virada pra baixo; para 1,5 cm antes dos pinos
        y_g0, y_g1 = y + r_ext - 0.004, face_col - 0.026 - 0.015
        pecas.append(caixa(nome + "_gancho%+d" % s, (x, (y_g0 + y_g1) / 2, z + 0.01), (0.010, y_g1 - y_g0, 0.028), mat_aco(),
                           chanfro=0.002))
        pecas.append(caixa(nome + "_gancho_ponta%+d" % s, (x, y_g1 - 0.006, z - 0.012), (0.010, 0.012, 0.036), mat_aco(),
                           chanfro=0.002))
        # luva das anilhas (por fora do carrinho, até a ponta da barra), colar e anilha
        x_l0, x_l1 = x_trilho + r_ext, comp_b / 2
        pecas.append(_cilindro(nome + "_luva%+d" % s, raio_luva, x_l1 - x_l0 + 0.004, (s * (x_l0 + x_l1) / 2, y, z), rot_x90,
                               mat_aco(), vertices=32))
        pecas.append(_cilindro(nome + "_colar%+d" % s, 0.035, 0.012, (s * (x_l0 + 0.006), y, z), rot_x90, mat_aco(),
                               vertices=32))
        if anilha is not None:
            r_a, e_a = anilha
            xa = x_l0 + 0.012 + 0.002 + e_a / 2
            pecas.append(_em_aneis(_cilindro(nome + "_anilha%+d" % s, r_a, e_a, (s * xa, y, z), rot_x90, mat_borracha(),
                                             vertices=48), passo=0.05))
            pecas.append(_cilindro(nome + "_anilha_miolo%+d" % s, 0.045, e_a + 0.004, (s * xa, y, z), rot_x90, mat_aco(),
                                   vertices=32))
            pecas.append(_cilindro(nome + "_presilha%+d" % s, 0.034, 0.02, (s * (xa + e_a / 2 + 0.012), y, z), rot_x90,
                                   mat_aco(), vertices=32))
    _prender(pecas, bar)
    bpy.context.view_layer.update()
    return Smith({"estrutura": estr, "barra": bar}, raio_b, meia, z, curso)


# ===== Voador (crucifixo na máquina) ================================================================================================
# ── VOADOR / PEC DECK (Crucifixo na Máquina, lote 5, 07/10/2026; a MESMA peça serve ao Crucifixo Invertido na Máquina) ──────────────
# Máquina de crucifixo sentado com 2 BRAÇOS que giram, cada um em volta de um EIXO VERTICAL, pendurados em 2 mancais no alto da
# máquina e com um PEGADOR vertical na ponta de baixo; o ASSENTO e o ENCOSTO estofados; a estrutura (base no chão, coluna do
# assento, coluna principal do outro lado do encosto, o suporte do encosto, a viga de cima e a travessa dos mancais) e a pilha de
# pesos (carenagem parada: o app não mostra a carga). É a "Lever Seated Fly" do ExRx ("Sit on machine with back on pad. Grasp
# handles to both sides, shoulder height."; "The starting position of levers can be adjusted on many apparatuses, allowing for both
# rear delt and chest to be exercised.") e a "Pec Fly/Rear Delt" dos fabricantes (Hoist HD-3900: "Sit facing away from the machine
# with your back in an upright position against the pad" no crucifixo e "Sit facing the machine in an upright position with your
# chest against the pad" no crucifixo invertido; "Located directly above the seat and between each of the swing arms you will find
# the ROM (Range Of Motion) Adjustment"; Life Fitness Insignia Series Pectoral Fly/Rear Deltoid: "a two-in-one machine"). Abrir e
# fechar os braços na altura dos ombros é o úmero girando em volta da VERTICAL QUE PASSA PELA ARTICULAÇÃO DO OMBRO (adução/abdução
# horizontal): o eixo de cada braço da máquina fica nessa vertical e o braço gira o MESMO ângulo do braço da pessoa — o pegador não
# escorrega na mão (Precor, patente US4840373A de pec deck: "a pair of offset rigid counter-rotating assemblies which rotate on axes
# which are approximately common with the vertical axes through the operator's shoulder joints"; "When the machine's rotational axis
# aligns reasonably well with the user's shoulder area, the movement tends to feel fluid. When the pivot sits too high, too low, or too
# far behind the user, the handles may pull the arms through an unnatural path.", Skelcore, fabricante). Como as outras máquinas, a
# cena monta a peça EM VOLTA do corpo: ela dá os 2 eixos (os 2 ombros),
# os 2 pegadores (onde as mãos fecham), o assento e o encosto; a peça liga tudo com a estrutura.
#   Crucifixo (tras=+1): de costas no encosto, a coluna atrás (+Y); a cena monta com os braços abertos e girar(> 0) fecha.
#   Crucifixo invertido (tras=−1): de frente pro encosto, o peito nele, e a coluna na frente (−Y), depois do encosto; a cena monta
#   com os braços na frente e girar(< 0) abre pros lados e pra trás. Embaixo do encosto, até a coluna (`fundo`), fica livre: no
#   crucifixo invertido as coxas passam por ali (o encosto pode começar mais alto: z_baixo) e, com as mãos juntas na frente no
#   começo, o `fundo` tem que levar a coluna (no meio, em x = 0) pra além dos pegadores (~0,6 m: teste de 07/10/2026).
# Medidas de máquina de verdade: ~2 m de altura (Life Fitness Insignia Series Pectoral Fly/Rear Deltoid: "Dimensions (L x W x H):
# 79.9" x 77.6" x 80.1" (203 cm x 197 cm x 203 cm)"); estofado de 60 mm, como o do leg press 45 e do supino sentado (acima). Os
# braços (viga de 50 mm: horizontal no alto, dobra a 45° e desce até o pegador), cubos, mancais, colunas, base, pilha e o pegador de
# borracha (29 mm, o cilindro da mão de referência) são escolha da fábrica. Peças compridas em anéis (_em_aneis / _viga): a checagem
# fica rápida.
# Uso numa cena (a pessoa olha pra −Y; s = +1 é o lado +X, o ESQUERDO dela):
#   vd = e3.voador("voador", eixos={1: (x, y), -1: (x, y)}, pegadores={1: (x, y, z), -1: (x, y, z)}, assento=(...),
#                  encosto=(...), tras=1)
#   no pose(t): vd.girar(graus)            # os 2 braços (com os pegadores) giram `graus` em volta dos eixos, a partir da montagem
#               c, u = vd.pegada(s)         # centro e eixo do pegador do lado s agora (onde a mão fecha)
#   Cena(pose, vd.equipamentos, pegadas=[("Left", ck.Barra(vd.pegadores[1], vd.raio_pegador, vd.meia_pegador, eixo=(0, 0, 1))),
#        ...], apoios=vd.apoios)
# As raízes (cada uma um equipamento da cena, a rigidez é por raiz): "<nome>_estrutura" (parada; não encosta no corpo),
# "<nome>_assento" e "<nome>_encosto" (APOIO) e "<nome>_braco_esq"/"_dir" (giram; não encostam no corpo, fora as mãos nos
# pegadores). Cada braço tem a origem NO EIXO (no cubo, em z_eixo) e o X local AO LONGO dele (pra cima): a regra checagens.eixos da
# ficha mede o ombro nessa reta. O cubo de cada braço fica 5 mm abaixo do mancal (nada passa de um pro outro) e os braços giram
# embaixo da travessa: a regra checagens.folgas mede braço × estrutura sem peça atravessando a outra de propósito.
class Voador:
    """Voador (crucifixo / crucifixo invertido na máquina) pronto na cena (voador())."""

    def __init__(self, raizes, eixos, z_eixo, pegadores, raio_pegador, meia_pegador):
        self.raizes = raizes                  # {"estrutura", "assento", "encosto", "braco_esq", "braco_dir"}
        self.equipamentos = [raizes[k] for k in ("estrutura", "braco_esq", "braco_dir")]
        self.apoios = [raizes[k] for k in ("assento", "encosto")]
        self.eixos = {s: Vector((x, y, z_eixo)) for s, (x, y) in eixos.items()}   # ponto de cada eixo (no cubo do braço)
        self.pegadores = pegadores            # {+1: pegador do lado +X, −1: do lado −X}; eixo de cada um no Z local (vertical)
        self.raio_pegador = raio_pegador
        self.meia_pegador = meia_pegador
        self.angulo = 0.0
        self._M0 = {s: raizes["braco_" + lado].matrix_world.copy() for s, lado in ((1, "esq"), (-1, "dir"))}

    def _giro(self, s, graus):
        P = self.eixos[s]
        return Matrix.Translation(P) @ Matrix.Rotation(math.radians(-s * graus), 4, "Z") @ Matrix.Translation(-P)

    def girar(self, graus):
        """Os 2 braços (com os pegadores) girados `graus` a partir da montagem, cada um em volta do seu eixo vertical: > 0 leva os
        pegadores pra frente de quem senta (−Y) e pro meio (fecha: o crucifixo); < 0 leva pros lados e pra trás (+Y; abre: o
        crucifixo invertido). O braço do lado +X gira no sentido horário visto de cima quando fecha, o do −X no anti-horário."""
        for s, lado in ((1, "esq"), (-1, "dir")):
            self.raizes["braco_" + lado].matrix_world = self._giro(s, graus) @ self._M0[s]
        self.angulo = graus
        bpy.context.view_layer.update()

    def pegada(self, s, graus=None):
        """Centro e eixo (mundo, unitário) do pegador do lado s com os braços em `graus` (None = como estão agora)."""
        M = self.pegadores[s].matrix_world
        if graus is not None:
            M = self._giro(s, graus - self.angulo) @ M
        return M.to_translation(), (M.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()


def _caixa_ao_longo(nome, a, b, larg, alt, ex, mat, aneis=True):
    """Viga reta (caixa sem bisel) de a até b com a face de largura `larg` virada pra `ex` (⟂ a b − a): os braços do voador
    descem no plano vertical do eixo e as faces ficam alinhadas com ele, sem girar em volta da viga."""
    a, b = Vector(a), Vector(b)
    ez = (b - a).normalized()
    ex = (Vector(ex) - ez * Vector(ex).dot(ez)).normalized()
    o = _reto(caixa(nome, (a + b) / 2, (larg, alt, (b - a).length), mat, rot=_rot_de(ex, ez.cross(ex), ez), chanfro=0))
    return _em_aneis(o, passo=max(larg, alt)) if aneis else o


def voador(nome="voador", eixos=None, pegadores=None, assento=None, encosto=None, z_eixo=None, tras=1, fundo=0.42,
           pegador=(0.16, 0.0145), queda=0.50, pilha=True, viga=0.05):
    """Voador (ver o bloco acima). Medidas no mundo, em m, com a pessoa olhando pra −Y, tudo NA MONTAGEM; s = +1 é o lado +X:
      eixos     = {s: (x, y)}: a vertical em volta da qual o braço do lado s gira (passa pela articulação do ombro do mesmo lado);
      pegadores = {s: (x, y, z)}: centro do pegador (vertical) do lado s, onde a mão fecha; o braço da máquina sai do cubo no alto
                  do eixo, vai na horizontal pro lado do pegador, dobra a 45° e desce até a ponta de cima dele;
      assento   = (y0, y1, topo, largura, espessura): estofado do assento de y0 a y1 (em qualquer ordem), com o topo em `topo`;
      encosto   = (y_face, angulo, z_baixo, altura, largura, espessura): a face do estofado que encosta no corpo passa por
                  (y_face, z_baixo) e sobe `altura` m inclinada `angulo` graus da vertical pro lado da coluna;
      z_eixo    = altura do cubo dos braços (None = `queda` m acima da ponta de cima do pegador mais alto);
      tras      = +1: a coluna fica em +Y do encosto (de costas pro encosto: o crucifixo); −1: em −Y (de frente pro encosto: o
                  crucifixo invertido);
      fundo     = m entre a face do encosto (embaixo) e a frente da coluna principal: o vão embaixo do encosto;
      pegador   = (comprimento, raio) do pegador de borracha; pilha = caixa da pilha de pesos atrás da coluna;
      viga      = seção (m) da viga quadrada de cada braço.
    Devolve um Voador (raizes, equipamentos, apoios, pegadores, girar(), pegada())."""
    if not eixos or not pegadores or assento is None or encosto is None:
        raise ValueError("voador: eixos, pegadores, assento e encosto vêm da cena (a peça é montada em volta do corpo)")
    tr = 1.0 if tras > 0 else -1.0
    comp_p, raio_p = pegador
    ya0, ya1, topo, larg, esp = assento
    y_face, ang_enc, z_baixo, alt_enc, larg_enc, esp_enc = encosto
    if z_eixo is None:
        z_eixo = max(p[2] for p in pegadores.values()) + comp_p / 2 + queda
    cima = Vector((0.0, 0.0, 1.0))

    def raiz_nova(sufixo, M=None):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        if M is not None:
            r.matrix_world = M
        return r

    estr, ass, enc = raiz_nova("estrutura"), raiz_nova("assento"), raiz_nova("encosto")
    bpy.context.view_layer.update()
    # ── assento: estofado (APOIO) em cima de uma chapa ─────────────────────────────────────────────────────────────────────
    y_ass, prof = (ya0 + ya1) / 2, abs(ya1 - ya0)
    caixa(nome + "_assento_estofado", (0, y_ass, topo - esp / 2), (larg, prof, esp), mat_estofado(), pai=ass, chanfro=0.015)
    z_chapa = topo - esp - 0.012
    _em_aneis(_reto(caixa(nome + "_assento_chapa", (0, y_ass, z_chapa), (larg - 0.05, prof - 0.04, 0.024), mat_estrutura(),
                          pai=estr, chanfro=0)), passo=0.06)
    # ── encosto: estofado (APOIO) inclinado pro lado da coluna e a chapa atrás dele ──────────────────────────────────────────────
    a = math.radians(ang_enc)
    u_e = Vector((0, tr * math.sin(a), math.cos(a)))         # ao longo do encosto, pra cima
    n_e = Vector((0, -tr * math.cos(a), math.sin(a)))        # normal da face (pro corpo)
    base_e = Vector((0, y_face, z_baixo))
    rot_e = (-tr * a, 0, 0)                                  # Z local ao longo de u_e, Y local ao longo da espessura
    caixa(nome + "_encosto_estofado", base_e + u_e * (alt_enc / 2) - n_e * (esp_enc / 2), (larg_enc, esp_enc, alt_enc),
          mat_estofado(), rot=rot_e, pai=enc, chanfro=0.015)
    meio_e = base_e + u_e * (alt_enc / 2) - n_e * (esp_enc + 0.012)
    _em_aneis(_reto(caixa(nome + "_encosto_chapa", meio_e, (larg_enc - 0.05, 0.024, alt_enc - 0.05), mat_estrutura(), rot=rot_e,
                          pai=estr, chanfro=0)), passo=0.06)
    # ── coluna principal do outro lado do encosto (deixa o vão `fundo` embaixo dele) e o suporte do encosto ─────────────────────
    costas_e = max(tr * (base_e - n_e * (esp_enc + 0.024)).y, tr * (base_e + u_e * alt_enc - n_e * (esp_enc + 0.024)).y)
    y_col = tr * max(tr * y_face + fundo, costas_e + 0.06) + tr * 0.04
    xs = [x for x, _ in eixos.values()]
    y_e = sum(y for _, y in eixos.values()) / len(eixos)
    z_trav = z_eixo + 0.14                                    # travessa dos mancais (os braços giram embaixo dela)
    z_alto = z_trav + 0.035
    _viga(nome + "_coluna", (0, y_col, 0.06), (0, y_col, z_alto), 0.08, 0.08, mat_estrutura(), pai=estr)
    p_sup = meio_e - n_e * 0.012                              # atrás da chapa, no meio da altura do encosto
    _viga(nome + "_encosto_suporte", p_sup, (0, y_col - tr * 0.04, p_sup.z), 0.06, 0.06, mat_estrutura(), pai=estr)
    # ── pilha de pesos (carenagem parada) depois da coluna e a caixa do cabo até a viga de cima ─────────────────────────────────
    y_pilha = y_col + tr * (0.04 + 0.02 + 0.16)
    y_fim = (y_pilha + tr * 0.16) if pilha else (y_col + tr * 0.04)
    if pilha:
        _em_aneis(_reto(caixa(nome + "_pilha", (0, y_pilha, 0.06 + 1.40 / 2), (0.40, 0.32, 1.40), mat_carenagem(), pai=estr,
                              chanfro=0)), passo=0.25)
        if z_trav - 0.035 > 1.50:
            _viga(nome + "_caixa_cabo", (0, y_pilha, 1.46), (0, y_pilha, z_trav - 0.035), 0.12, 0.12, mat_carenagem(), pai=estr)
    # ── viga de cima (da coluna até a travessa) e a travessa dos 2 mancais ──────────────────────────────────────────────────────
    _viga(nome + "_viga_cima", (0, y_fim, z_trav), (0, y_e - tr * 0.035, z_trav), 0.08, 0.07, mat_estrutura(), pai=estr)
    _viga(nome + "_travessa", (min(xs) - 0.06, y_e, z_trav), (max(xs) + 0.06, y_e, z_trav), 0.07, 0.07, mat_estrutura(), pai=estr)
    # ── mancal de cada eixo (parado): da travessa até 5 mm acima do cubo do braço ───────────────────────────────────────────────
    for s, (x, y) in eixos.items():
        z0, z1 = z_eixo + 0.046, z_trav - 0.035
        _cilindro(nome + "_mancal%+d" % s, 0.045, z1 - z0, (x, y, (z0 + z1) / 2), (0, 0, 0), mat_estrutura(), pai=estr)
        if abs(y - y_e) > 0.04:                              # eixos fora da linha da travessa: um braço curto liga os dois
            _viga(nome + "_mancal_braco%+d" % s, (x, y, z1 - 0.02), (x, y_e, z1 - 0.02), 0.05, 0.04, mat_estrutura(), pai=estr)
    # ── base no chão: viga do meio (ao longo do Y, da coluna do assento até depois da pilha), pé do assento e pé de trás ────────
    y0b, y1b = sorted((y_ass - tr * 0.12, y_fim + tr * 0.02))
    _em_aneis(_reto(caixa(nome + "_base_meio", (0, (y0b + y1b) / 2, 0.03), (0.08, y1b - y0b, 0.06), mat_estrutura(), pai=estr,
                          chanfro=0)), passo=0.08)
    for k, (y, meia) in enumerate(((y_ass - tr * 0.08, 0.26), (y_fim - tr * 0.06, 0.32))):
        _em_aneis(_reto(caixa(nome + "_base_pe%d" % k, (0, y, 0.025), (2 * meia, 0.08, 0.05), mat_estrutura(), pai=estr,
                              chanfro=0)), passo=0.08)
    _viga(nome + "_coluna_assento", (0, y_ass, 0.06), (0, y_ass, z_chapa - 0.012), 0.08, 0.08, mat_estrutura(), pai=estr)
    # ── os 2 braços (giram): cubo no eixo, viga horizontal até perto do pegador, dobra a 45°, desce até o colar de aço e o
    #    pegador de borracha vertical (com a ponta de borracha embaixo) ──────────────────────────────────────────────────────────
    raizes = {"estrutura": estr, "assento": ass, "encosto": enc}
    pegs = {}
    for s, lado in ((1, "esq"), (-1, "dir")):
        ex, ey = eixos[s]
        P0 = Vector((ex, ey, z_eixo))
        bra = raiz_nova("braco_" + lado, Matrix.Translation(P0) @ _X_PRA_CIMA)
        raizes["braco_" + lado] = bra
        bpy.context.view_layer.update()
        c = Vector(pegadores[s])
        rd = Vector((c.x - ex, c.y - ey, 0.0))
        R = rd.length
        rd.normalize()
        lado_v = cima.cross(rd)                              # ⟂ ao plano do braço (horizontal)
        z_peg = c.z + comp_p / 2                             # ponta de cima do pegador
        dobra = min(0.10, max(R - 0.12, 0.02), (z_eixo - z_peg - 0.10) / 2)
        K1 = P0 + rd * (R - dobra)
        K2 = Vector((c.x, c.y, z_eixo - dobra))
        K3 = Vector((c.x, c.y, z_peg + 0.035))               # ponta de baixo da viga, em cima do colar de aço
        pecas = [_cilindro(nome + "_cubo_" + lado, 0.05, 0.07, P0, (0, 0, 0), mat_estrutura()),
                 _cilindro(nome + "_cubo_tampa_" + lado, 0.026, 0.006, P0 + cima * 0.038, (0, 0, 0), mat_aco())]
        pontos = [P0 + rd * 0.03, K1, K2, K3]
        for i, (p, q) in enumerate(zip(pontos, pontos[1:])):
            d = (q - p).normalized()
            pecas.append(_caixa_ao_longo(nome + "_braco%d_" % i + lado, p - d * (0.0 if i == 0 else viga / 2), q + d * (
                viga / 2 if i < 2 else 0.0), viga, viga, lado_v, mat_estrutura()))
        for k, K in enumerate((K1, K2)):                      # junta de cada dobra (cobre o canto das 2 vigas)
            pecas.append(_reto(caixa(nome + "_dobra%d_" % k + lado, K, (viga + 0.004, viga + 0.004, viga + 0.004), mat_estrutura(),
                                     rot=_rot_de(rd, lado_v, cima), chanfro=0)))
        pecas.append(_cilindro(nome + "_colar_" + lado, 0.017, 0.035, (c.x, c.y, z_peg + 0.0175), (0, 0, 0), mat_aco()))
        peg = _em_aneis(tubo(nome + "_pegador_" + lado, (c.x, c.y, z_peg), (c.x, c.y, c.z - comp_p / 2), raio_p, mat_borracha(),
                             vertices=32), passo=0.035)
        pecas.append(peg)
        pecas.append(_cilindro(nome + "_pegador_ponta_" + lado, raio_p + 0.004, 0.012, (c.x, c.y, c.z - comp_p / 2 - 0.006),
                               (0, 0, 0), mat_borracha()))
        _prender(pecas, bra)
        pegs[s] = peg
    bpy.context.view_layer.update()
    return Voador(raizes, eixos, z_eixo, pegs, raio_p, comp_p / 2)


# ===== Supino sentado na máquina =====================================================================================================
# ── MÁQUINA DE SUPINO SENTADO (Supino Reto na Máquina Sentado, lote 4, 07/10/2026; a MESMA peça serve ao Desenvolvimento na
# Máquina, empurrando pra cima) ──────────────────────────────────────────────────────────────────────────────────────────────────────
# Máquina de empurrar sentado com 2 BRAÇOS DE ALAVANCA independentes que giram em volta do MESMO eixo horizontal (ao longo do X),
# cada um com o PEGADOR na ponta, o ASSENTO e o ENCOSTO estofados, a estrutura (base no chão, o mancal de cada braço num pedestal,
# a coluna do assento, a viga do encosto) e a torre da pilha de pesos (carenagem parada: o app não mostra a carga). É a "Lever
# Chest Press" do ExRx (alavanca que sobe da parte de baixo da máquina, pegadores horizontais: "Sit on seat with chest
# approximately height of horizontal handles", "Grasp handles with wide overhand grip"), como a Hammer Strength Select Chest
# Press (braços de pressão que sobem de um eixo baixo, na frente, até os pegadores; "The pressing arm adjusts in five positions
# for multiple ranges of motion"; placa com o "Axis of rotation marked with red indicator to help cue correct alignment") e a
# Precor Resolute RSL0414 ("independent moving arms"; "The movement arm handles ... can be angled to keep wrists in correct
# alignment"). A regulagem certa é a do fabricante: o assento sobe ou desce até os pegadores ficarem na linha do meio do peito
# (ACE, Seated Chest Press: "Adjust the seat height so that the handles are level with your mid-chest (around nipple level)") —
# por isso a cena monta a peça EM VOLTA do corpo (como as cadeiras e o leg press): ela dá o eixo dos braços, os pegadores, o
# assento e o encosto, e a peça liga tudo com a estrutura. Os pés ficam no chão entre os 2 trilhos da base (nada passa na frente
# das canelas). Outro exercício na mesma máquina (Desenvolvimento na Máquina: pegadores na altura dos ombros, braços empurrando
# pra cima) monta com outro eixo (atrás/acima), outro caminho dos braços (`caminho`), outro encosto: nada da peça é do supino em si
# (a Spirit CSD-CPSP é uma máquina só pros 2: "The Chest Press and Shoulder Press machine offers various grip options for both
# chest and shoulder exercises").
# Medidas de máquina de verdade: torre da pilha de 148 cm (Precor Resolute RSL0414 Converging Chest Press: "Weight Stack Tower
# Height: 58 in / 148 cm"); máquina de ~1,0–1,1 m × 1,4–1,45 m × 1,5–1,6 m (Hammer Strength Select Chest Press: "41" x 57" x
# 64" (metric cm: 104 x 145 x 163)"; Life Fitness Insignia Series Chest Press: "43.2" x 55.3" x 58.1" (110 cm x 140 cm x 148
# cm)"); estofado de 60 mm, como o do leg press 45 (acima). Os braços (viga de 60 × 60 mm), o cubo, o mancal, o pedestal, a base e
# o desenho do pegador (borracha com a ponta de aço, preso numa barra de aço que sai do braço) são escolha da fábrica. Peças
# compridas em anéis (_em_aneis / _viga): a checagem fica rápida.
# Uso numa cena (a pessoa olha pra −Y; s = +1 é o lado +X, o ESQUERDO de quem senta):
#   mq = e3.supino_sentado("supino", eixo=(y, z), x_braco=..., pegadores=(y, z, x, comprimento, raio), giro_pegador=...,
#                          assento=(...), encosto=(...))
#   no pose(t): mq.girar(graus)            # os 2 braços (com os pegadores) giram juntos em volta do eixo, a partir da montagem
#               c, u = mq.pegada(s)         # centro e eixo do pegador do lado s agora (onde a mão fecha)
#   Cena(pose, mq.equipamentos, pegadas=[("Left", ck.Barra(mq.pegadores[1], mq.raio_pegador, mq.meia_pegador,
#        eixo=(0, 0, 1))), ...], apoios=mq.apoios)
# As raízes (cada uma um equipamento da cena, a rigidez é por raiz): "<nome>_estrutura" (parada; não encosta no corpo),
# "<nome>_assento" e "<nome>_encosto" (APOIO) e "<nome>_braco_esq"/"_dir" (giram; não encostam no corpo, fora as mãos nos
# pegadores). Cada braço tem a origem NO EIXO (no cubo do seu lado) e o X local AO LONGO dele (a regra checagens.eixos da ficha
# pode medir uma junta nessa reta, se o exercício tiver uma). O pegador de cada lado é um tubo de borracha com o Z local ao longo
# dele e a origem no meio (ck.Barra(..., eixo=(0, 0, 1))).
class MaquinaSupino:
    """Máquina de supino sentado pronta na cena (supino_sentado())."""

    def __init__(self, raizes, eixo, pegadores, raio_pegador, meia_pegador):
        self.raizes = raizes                  # {"estrutura", "assento", "encosto", "braco_esq", "braco_dir"}
        self.equipamentos = [raizes[k] for k in ("estrutura", "braco_esq", "braco_dir")]
        self.apoios = [raizes[k] for k in ("assento", "encosto")]
        self.eixo = Vector(eixo)              # ponto do eixo de giro dos braços (em x = 0); direção = X
        self.pegadores = pegadores            # {+1: pegador do lado +X, −1: do lado −X}; eixo de cada um no Z local
        self.raio_pegador = raio_pegador
        self.meia_pegador = meia_pegador
        self.angulo = 0.0
        self._M0 = {k: raizes[k].matrix_world.copy() for k in ("braco_esq", "braco_dir")}

    def _giro(self, graus):
        return (Matrix.Translation(self.eixo) @ Matrix.Rotation(math.radians(graus), 4, "X")
                @ Matrix.Translation(-self.eixo))

    def girar(self, graus):
        """Os 2 braços (com os pegadores) girados `graus` em volta do eixo (regra da mão direita no +X), a partir da montagem:
        com a pessoa olhando pra −Y, > 0 leva pra frente (−Y) a ponta de cima de um braço que sobe do eixo — empurrar no supino."""
        R = self._giro(graus)
        for k, M in self._M0.items():
            self.raizes[k].matrix_world = R @ M
        self.angulo = graus
        bpy.context.view_layer.update()

    def pegada(self, s, graus=None):
        """Centro e eixo (mundo, unitário) do pegador do lado s com os braços em `graus` (None = como estão agora)."""
        M = self.pegadores[s].matrix_world
        if graus is not None:
            M = self._giro(graus - self.angulo) @ M
        return M.to_translation(), (M.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()


def supino_sentado(nome="supino", eixo=(-0.40, 0.13), x_braco=0.50, pegadores=(-0.17, 0.84, 0.39, 0.15, 0.0145),
                   giro_pegador=0.0, caminho=None, assento=(-0.30, 0.10, 0.42, 0.36, 0.06),
                   encosto=(0.06, 10.0, 0.66, 0.30, 0.06), lado=-1, pilha=True, viga_braco=0.06):
    """Máquina de supino sentado (ver o bloco acima). Medidas no mundo, em m, com a pessoa olhando pra −Y, tudo NA MONTAGEM:
      eixo         = (y, z) do eixo de giro dos 2 braços (paralelo ao X); cada braço gira num cubo em x = ±x_braco, preso num
                     mancal em cima de um pedestal que sai do trilho da base (x = ±(x_braco + 0,085));
      x_braco      = |x| do plano dos braços (por fora das mãos e dos cotovelos);
      pegadores    = (y, z, x, comprimento, raio): centro do pegador de borracha do lado +X em (x, y, z) (o do −X em (−x, y, z)),
                     onde a mão fecha; o pegador vai pra dentro, ao longo do X, e uma barra de aço liga a ponta de fora dele ao
                     braço;
      giro_pegador = graus: a ponta de DENTRO de cada pegador vai pra frente (−Y) girando no plano do chão (pegador angulado, como
                     na Precor RSL0414); 0 = pegadores ao longo do X;
      caminho      = None (braço reto do cubo até a barra do pegador) ou [(y, z), ...]: pontos do braço, no plano dele, entre o
                     cubo e a barra do pegador (braço com dobras: o Desenvolvimento na Máquina passa por cima dos ombros);
      assento      = (y_frente, y_tras, topo, largura, espessura): estofado do assento, da borda da frente até y_tras, com o topo
                     em `topo`;
      encosto      = (y_base, angulo, altura, largura, espessura): a face da frente do estofado passa por (y_base, topo do
                     assento) e sobe `angulo` graus inclinada pra trás (+Y) da vertical, por `altura` m;
      lado         = lado da torre da pilha (−1 = −X, o direito de quem senta); pilha = caixa da pilha de pesos;
      viga_braco   = seção (m) da viga quadrada de cada braço.
    Devolve um MaquinaSupino (raizes, equipamentos, apoios, pegadores, girar(), pegada())."""
    ye, ze = eixo
    y_p, z_p, x_p, comp_p, raio_p = pegadores
    y_f, y_t, topo, larg, esp = assento
    y_b, ang_enc, alt_enc, larg_enc, esp_enc = encosto
    sl = -1.0 if lado < 0 else 1.0
    x_m = x_braco + 0.085                                    # trilho da base, pedestal e mancal de cada braço (|x|)
    rot_x90 = (0, math.radians(90), 0)                       # cilindro deitado ao longo do X
    g = math.radians(giro_pegador)

    def raiz_nova(sufixo, loc=(0.0, 0.0, 0.0)):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        r.location = loc
        return r

    estr, ass, enc = raiz_nova("estrutura"), raiz_nova("assento"), raiz_nova("encosto")
    bpy.context.view_layer.update()

    # ── assento: estofado (APOIO) em cima de uma chapa ─────────────────────────────────────────────────────────────────────
    y_ass = (y_f + y_t) / 2
    caixa(nome + "_assento_estofado", (0, y_ass, topo - esp / 2), (larg, y_t - y_f, esp), mat_estofado(), pai=ass, chanfro=0.015)
    z_chapa = topo - esp - 0.012
    _em_aneis(_reto(caixa(nome + "_assento_chapa", (0, y_ass, z_chapa), (larg - 0.05, y_t - y_f - 0.04, 0.024), mat_estrutura(),
                          pai=estr, chanfro=0)), passo=0.06)
    # ── encosto: estofado inclinado (APOIO), chapa atrás dele e a viga que desce até a coluna do assento ─────────────────────────
    a = math.radians(ang_enc)
    u_e = Vector((0, math.sin(a), math.cos(a)))              # ao longo do encosto, pra cima
    n_e = Vector((0, -math.cos(a), math.sin(a)))             # normal da face da frente (pro corpo)
    base_enc = Vector((0, y_b, topo)) + u_e * 0.012          # o estofado começa 1,2 cm acima do assento
    caixa(nome + "_encosto_estofado", base_enc + u_e * (alt_enc / 2) - n_e * (esp_enc / 2), (larg_enc, esp_enc, alt_enc),
          mat_estofado(), rot=(-a, 0, 0), pai=enc, chanfro=0.015)
    meio_enc = base_enc + u_e * (alt_enc * 0.5) - n_e * (esp_enc + 0.012)
    _em_aneis(_reto(caixa(nome + "_encosto_chapa", meio_enc, (larg_enc - 0.05, 0.024, alt_enc - 0.05), mat_estrutura(),
                          rot=(-a, 0, 0), pai=estr, chanfro=0)), passo=0.06)
    y_col = max(y_t - 0.05, y_b + 0.03)                      # coluna do assento: embaixo da traseira dele
    caixa(nome + "_encosto_suporte", meio_enc - n_e * 0.032, (0.12, 0.04, 0.12), mat_estrutura(), rot=(-a, 0, 0), pai=estr,
          chanfro=0.004)                                     # chapa de fixação atrás do encosto: a viga entra nela
    _viga(nome + "_encosto_viga", meio_enc - n_e * 0.03, (0, y_col + 0.03, z_chapa - 0.04), 0.06, 0.06, mat_estrutura(), pai=estr)
    # ── base no chão: 2 trilhos ao longo do Y (por fora dos pés), a travessa de trás e a viga do meio até a coluna do assento ──────
    topo_enc_y = (base_enc + u_e * alt_enc - n_e * esp_enc).y
    y_tras_b = max(y_t, topo_enc_y, y_col, ye) + 0.10
    y_frente_b = min(ye, y_f) - 0.10
    for s in (1, -1):
        _em_aneis(_reto(caixa(nome + "_base_trilho%+d" % s, (s * x_m, (y_frente_b + y_tras_b) / 2, 0.03),
                              (0.08, y_tras_b - y_frente_b, 0.06), mat_estrutura(), pai=estr, chanfro=0)), passo=0.08)
    _em_aneis(_reto(caixa(nome + "_base_tras", (0, y_tras_b - 0.04, 0.03), (2 * x_m - 0.08, 0.08, 0.06), mat_estrutura(),
                          pai=estr, chanfro=0)), passo=0.08)    # entre os trilhos (sem face no mesmo plano que eles)
    _em_aneis(_reto(caixa(nome + "_base_meio", (0, (y_col - 0.04 + y_tras_b - 0.08) / 2, 0.03), (0.08, y_tras_b - 0.08 - y_col + 0.04,
                          0.06), mat_estrutura(), pai=estr, chanfro=0)), passo=0.08)   # da coluna do assento até a travessa
    _viga(nome + "_coluna_assento", (0, y_col, 0.06), (0, y_col, z_chapa - 0.012), 0.08, 0.08, mat_estrutura(), pai=estr)
    # ── mancal de cada braço: pedestal do trilho até o eixo, caixa do mancal e o eixo de aço (parado) que entra no cubo ────────────
    for s in (1, -1):
        if ze > 0.12:
            _viga(nome + "_pedestal%+d" % s, (s * x_m, ye, 0.06), (s * x_m, ye, ze), 0.07, 0.07, mat_estrutura(), pai=estr)
        _cilindro(nome + "_mancal%+d" % s, 0.05, 0.07, (s * x_m, ye, ze), rot_x90, mat_estrutura(), pai=estr)
        _cilindro(nome + "_eixo%+d" % s, 0.02, x_m - x_braco + 0.06, (s * (x_braco + x_m + 0.01) / 2, ye, ze), rot_x90, mat_aco(),
                  pai=estr)
        _cilindro(nome + "_eixo_tampa%+d" % s, 0.03, 0.012, (s * (x_m + 0.041), ye, ze), rot_x90, mat_aco(), pai=estr)
    # ── torre da pilha de pesos (carenagem parada) do lado `lado`, ao lado do encosto, presa no trilho da base ────────────────────
    if pilha:
        x_t = sl * (x_m + 0.24)
        y_tc = (y_col + topo_enc_y) / 2
        _em_aneis(_reto(caixa(nome + "_pilha", (x_t, y_tc, 0.06 + 1.42 / 2), (0.30, 0.38, 1.42), mat_carenagem(), pai=estr,
                              chanfro=0)), passo=0.25)
        _em_aneis(_reto(caixa(nome + "_pilha_base", (x_t, y_tc, 0.03), (0.40, 0.48, 0.06), mat_estrutura(), pai=estr, chanfro=0)),
                  passo=0.08)                                # a base da torre encosta no trilho de fora
        # caixa do cabo: do mancal do braço desse lado, por fora do trilho, até a torre (perto do chão)
        _viga(nome + "_caixa_cabo", (sl * (x_m + 0.075), ye, 0.09), (sl * (x_m + 0.075), y_tc - 0.19, 0.09), 0.07, 0.07,
              mat_carenagem(), pai=estr)
    # ── os 2 braços (giram): cubo no eixo, viga do cubo até a barra do pegador, barra de aço e o pegador de borracha ──────────────
    raizes = {"estrutura": estr, "assento": ass, "encosto": enc}
    pegs = {}
    for s, lado_n in ((1, "esq"), (-1, "dir")):
        P0 = Vector((s * x_braco, ye, ze))
        bra = raiz_nova("braco_" + lado_n, P0)
        raizes["braco_" + lado_n] = bra
        bpy.context.view_layer.update()
        d = Vector((-s * math.cos(g), -math.sin(g), 0.0))   # ao longo do pegador, de fora pra dentro
        c = Vector((s * x_p, y_p, z_p))
        fora = c - d * (comp_p / 2)                           # ponta de fora da borracha
        k = (s * x_braco - fora.x) / d.x                      # a barra de aço vai da borracha até o plano do braço
        A = fora + d * k                                      # (k < 0: anda pra fora, contra o d)
        pecas = [_cilindro(nome + "_cubo_" + lado_n, 0.06, 0.06, P0, rot_x90, mat_estrutura()),
                 _cilindro(nome + "_cubo_tampa_" + lado_n, 0.03, 0.064, P0, rot_x90, mat_aco())]
        pts = [P0] + [Vector((s * x_braco, yy, zz)) for yy, zz in (caminho or [])] + [A]
        for i, (p, q) in enumerate(zip(pts, pts[1:])):
            dd = (q - p).normalized()
            pecas.append(_viga(nome + "_braco%d_" % i + lado_n, p + dd * (0.04 if i == 0 else -viga_braco / 2),
                               q + dd * (viga_braco / 2), viga_braco, viga_braco, mat_estrutura()))
        pecas.append(caixa(nome + "_ponta_braco_" + lado_n, A, (viga_braco + 0.01, viga_braco + 0.01, viga_braco + 0.01),
                           mat_estrutura(), chanfro=0.004))
        pecas.append(_em_aneis(tubo(nome + "_barra_pegador_" + lado_n, A, fora + d * 0.006, 0.016, mat_aco(), vertices=24),
                               passo=0.035))
        peg = _em_aneis(tubo(nome + "_pegador_" + lado_n, fora, c + d * (comp_p / 2), raio_p, mat_borracha(), vertices=32),
                        passo=0.035)
        pecas.append(peg)
        pecas.append(_cilindro(nome + "_pegador_ponta_" + lado_n, raio_p + 0.004, 0.012, c + d * (comp_p / 2 + 0.006),
                               d.to_track_quat("Z", "Y").to_euler(), mat_aco()))
        pecas.append(_cilindro(nome + "_pegador_colar_" + lado_n, raio_p + 0.004, 0.010, fora - d * 0.005,
                               d.to_track_quat("Z", "Y").to_euler(), mat_aco()))
        _prender(pecas, bra)
        pegs[s] = peg
    bpy.context.view_layer.update()
    return MaquinaSupino(raizes, (0.0, ye, ze), pegs, raio_p, comp_p / 2)


# ===== Panturrilha sentado na máquina ===============================================================================================
# ── MÁQUINA DE PANTURRILHA SENTADO (Panturrilha Sentado na Máquina, lote 5, 07/10/2026) ───────────────────────────────────────────
# Máquina de panturrilha sentado com o ASSENTO FIXO (sem encosto): o DEGRAU dos pés na frente — chapa estreita com a borracha em
# cima, onde só a ponta dos pés apoia, os calcanhares pra fora, atrás da borda (ExRx, Lever Seated Calf Raise: "Place forefeet on
# platform with heels extending off.") —, o BRAÇO que gira em volta de um eixo horizontal (ao longo do X) com a ALMOFADA por cima
# das coxas logo acima dos joelhos ("Position lower thighs under lever pads.", idem), os 2 PEGADORES em pé em cima da almofada
# ("Place hands on top of thigh pads.", idem: aqui uma barra por cima da almofada, com 2 luvas de borracha de 31,8 mm — a medida
# dos 2 tubos do quadro da almofada da Body-Solid GSCR349, a máquina sentada do estudo de Kinoshita et al., Front Physiol 2023,
# fechados com a tampa "ø31.8 round end cap" no desenho do manual), o PINO
# de anilha na ponta do braço e a estrutura (base no chão, coluna do assento, poste do degrau, torre do eixo com o mancal).
# O EIXO: sentado, com a ponta do pé presa no degrau e o glúteo no assento, quando o calcanhar sobe o tornozelo sobe e o joelho sobe
# junto — a coxa gira em volta do QUADRIL. A cena põe o eixo do braço na reta das 2 articulações do quadril: a almofada gira o MESMO
# ângulo da coxa e fica encostada nela sem escorregar, como o eixo no joelho da cadeira extensora/flexora e no quadril da abdutora.
# (Escolha da fábrica: nas máquinas de anilha comerciais o assento costuma girar junto com o braço — Hammer Strength PL-CALF, "the
# pivoting seat ... moves with them throughout the range of motion" —; aqui o assento é fixo e só o braço gira.) A cena monta a
# peça EM VOLTA do corpo (como as cadeiras, o leg press e o Smith): ela dá o eixo, o assento, o degrau, a almofada e onde ficam os
# pegadores; a peça liga tudo com a estrutura. Outro exercício na mesma máquina (unilateral, ou com outra altura de degrau) monta
# com outros números: nada da peça é do exercício em si.
# Medidas de máquina de verdade: assento de 10" × 13" (Titan Seated Calf Raise Machine: "Seat Dimensions: 10-in. x 13-in.") com
# estofado de 3" (Body-Solid GSCR349: "ultra-thick 3" DuraFirm™ padding on the seat and knee pads"); almofada de 16,5" de
# comprimento (Titan: "Adjustable Knee Pad Length: 16.5-in.") a 28,25"–32" do chão (Titan: "Adjustable Knee Pad Height:
# 28.25-in. - 32-in."); degrau de 20" × 4" (Life Fitness Signature Series Plate-Loaded Seated Calf Raise: "Footplate: Textured,
# non-slip steel (20"L x 4"W)"); pino de anilha de 49 mm × 9,5" (Titan: "Weight Post Diameter: 49 mm", "Weight Post Length:
# 9.5-in."); pegadores de 31,8 mm (GSCR349, acima); tubo de 2" × 3" (Titan: "2 x 3-in. 11-Ga Steel"; GSCR349: "2" x 3" 11-gauge
# high-tensile strength steel"). O desenho do braço, do cubo, da torre, do mancal, da base e a anilha (20 kg, Ø 450 mm) são
# escolha da fábrica. Peças compridas em anéis (_em_aneis / _viga): a checagem fica rápida.
# Uso numa cena (a pessoa olha pra −Y; s = +1 é o lado +X, o ESQUERDO de quem senta):
#   mq = e3.panturrilha_sentado("panturrilha", eixo=(y, z), assento=(...), degrau=(...), almofada=(centro, u, (...)),
#                               pegadores=(x, altura, comprimento, raio), lado=-1)
#   no pose(t): mq.girar(graus)            # o braço (com a almofada e os pegadores) gira em volta do eixo; > 0 = a almofada SOBE
#               c, u = mq.pegada(s)         # centro e eixo do pegador do lado s agora (onde a mão fecha)
#   Cena(pose, mq.equipamentos, pegadas=[("Left", ck.Barra(mq.pegadores[1], mq.raio_pegador, mq.meia_pegador,
#        eixo=(0, 0, 1))), ...], apoios=mq.apoios)
# As raízes (cada uma um equipamento da cena, a rigidez é por raiz): "<nome>_estrutura" (parada; não encosta no corpo),
# "<nome>_assento" e "<nome>_degrau" (APOIO), "<nome>_braco" (gira; não encosta no corpo, fora as mãos nos pegadores) e
# "<nome>_almofada" (gira junto com o braço; APOIO). O braço e a almofada têm a origem NO EIXO e o X local AO LONGO dele (a regra
# checagens.eixos da ficha mede as articulações do quadril nessa reta). O pegador de cada lado é um tubo de borracha com o Z local
# ao longo dele e a origem no meio (ck.Barra(..., eixo=(0, 0, 1))).
class MaquinaPanturrilha:
    """Máquina de panturrilha sentado pronta na cena (panturrilha_sentado())."""

    def __init__(self, raizes, eixo, pegadores, raio_pegador, meia_pegador):
        self.raizes = raizes                  # {"estrutura", "assento", "degrau", "braco", "almofada"}
        self.equipamentos = [raizes["estrutura"], raizes["braco"]]
        self.apoios = [raizes[k] for k in ("assento", "degrau", "almofada")]
        self.eixo = Vector(eixo)              # ponto do eixo de giro do braço (no cubo); direção = X
        self.pegadores = pegadores            # {+1: pegador do lado +X, −1: do lado −X}; eixo de cada um no Z local
        self.raio_pegador = raio_pegador
        self.meia_pegador = meia_pegador
        self.angulo = 0.0
        self._M0 = {k: raizes[k].matrix_world.copy() for k in ("braco", "almofada")}

    def _giro(self, graus):
        return (Matrix.Translation(self.eixo) @ Matrix.Rotation(math.radians(-graus), 4, "X")
                @ Matrix.Translation(-self.eixo))

    def girar(self, graus):
        """O braço (com a almofada, os pegadores e o pino) girado `graus` em volta do eixo, a partir da montagem: com a pessoa
        olhando pra −Y, > 0 SOBE a almofada (a frente do braço vai pra cima, como a coxa quando o calcanhar sobe)."""
        R = self._giro(graus)
        for k, M in self._M0.items():
            self.raizes[k].matrix_world = R @ M
        self.angulo = graus
        bpy.context.view_layer.update()

    def pegada(self, s, graus=None):
        """Centro e eixo (mundo, unitário) do pegador do lado s com o braço em `graus` (None = como está agora)."""
        M = self.pegadores[s].matrix_world
        if graus is not None:
            M = self._giro(graus - self.angulo) @ M
        return M.to_translation(), (M.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()


def panturrilha_sentado(nome="panturrilha", eixo=(0.0, 0.69), assento=(-0.13, 0.124, 0.59, 0.33, 0.076),
                        degrau=(-0.56, 0.18, 0.102, 0.508), almofada=None, pegadores=(0.17, 0.055, 0.13, 0.0159), lado=-1,
                        x_braco=0.27, x_torre=0.36, pino=(0.241, 0.0245), frente_pino=0.13, anilha=None, secao=(0.05, 0.075)):
    """Máquina de panturrilha sentado (ver o bloco acima). Medidas no mundo, em m, com a pessoa olhando pra −Y, tudo NA MONTAGEM:
      eixo       = (y, z) do eixo de giro do braço (paralelo ao X): a reta das 2 articulações do quadril; o cubo do braço fica em
                   x = lado·x_braco, preso no mancal da torre (x = lado·x_torre);
      assento    = (y_frente, y_tras, topo, largura, espessura): estofado do assento (APOIO), da borda da frente até y_tras, com o
                   topo em `topo`, em cima de uma chapa e de uma coluna até a base;
      degrau     = (y_borda, topo, profundidade, largura): borracha do degrau (APOIO) com o topo em `topo`, da borda de trás
                   (y_borda: a ponta dos pés apoia logo à frente dela e os calcanhares ficam pra fora, atrás) até y_borda −
                   profundidade, centrada em x = 0, em cima da chapa de aço e do poste até a base;
      almofada   = (centro, u, (comprimento, profundidade, espessura)): centro da face de BAIXO da almofada (a que encosta nas coxas,
                   em x = 0), u = direção ao longo das coxas pro joelho (no plano YZ); a face de cima tem a chapa de aço e, por
                   cima dela, a travessa (ao longo do X) que sai do braço;
      pegadores  = (x, altura, comprimento, raio): a barra dos pegadores (aço, ao longo do X) fica `altura` m acima do topo da
                   travessa (⟂ à almofada), em 2 postes por fora das mãos; um pegador de borracha (luva) de cada lado, centrado em
                   x = ±x, onde a mão fecha por cima (pegada pronada);
      lado       = lado do braço e da torre (−1 = −X, o direito de quem senta);
      x_braco, x_torre = |x| do plano do braço (por fora da coxa e do quadril) e da torre do eixo;
      pino       = (comprimento, raio): pino de anilha na ponta do braço, `frente_pino` m à frente da travessa, virado pra fora;
      anilha     = None ou (raio, espessura): uma anilha no pino;
      secao      = (lado menor, lado maior) do tubo retangular da estrutura e do braço.
    Devolve um MaquinaPanturrilha (raizes, equipamentos, apoios, pegadores, girar(), pegada())."""
    if almofada is None:
        raise ValueError("panturrilha_sentado: falta a almofada (centro, u, (comprimento, profundidade, espessura))")
    sl = -1.0 if lado < 0 else 1.0
    ye, ze = eixo
    y_f, y_t, topo, larg, esp = assento
    y_bd, z_d, prof_d, larg_d = degrau
    c_a, u_a, (comp_a, prof_a, esp_a) = almofada
    x_p, alt_p, comp_p, raio_p = pegadores
    t0, t1 = secao
    X = Vector((1.0, 0.0, 0.0))
    rot_x90 = (0, math.radians(90), 0)                      # cilindro deitado ao longo do X
    c_a = Vector((0.0, c_a[1], c_a[2]))
    u_a = Vector((0.0, u_a[1], u_a[2])).normalized()
    w_a = u_a.cross(X)                                      # pra cima da almofada (⟂ a ela, no plano YZ)
    if w_a.z < 0:
        w_a = -w_a
    P0 = Vector((sl * x_braco, ye, ze))                     # cubo do braço, no eixo

    def raiz_nova(sufixo, loc=(0.0, 0.0, 0.0)):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        r.location = loc
        return r

    estr, ass, deg = raiz_nova("estrutura"), raiz_nova("assento"), raiz_nova("degrau")
    bra, alm = raiz_nova("braco", (0.0, ye, ze)), raiz_nova("almofada", (0.0, ye, ze))
    bpy.context.view_layer.update()

    # ── assento: estofado (APOIO) em cima de uma chapa; coluna até a base ─────────────────────────────────────────────────────────
    y_ass = (y_f + y_t) / 2
    caixa(nome + "_assento_estofado", (0, y_ass, topo - esp / 2), (larg, y_t - y_f, esp), mat_estofado(), pai=ass, chanfro=0.02)
    z_chapa = topo - esp - 0.006
    _em_aneis(_reto(caixa(nome + "_assento_chapa", (0, y_ass, z_chapa), (larg - 0.04, y_t - y_f - 0.03, 0.012), mat_estrutura(),
                          pai=estr, chanfro=0)), passo=0.06)
    _viga(nome + "_coluna_assento", (0, y_ass, 0.05), (0, y_ass, z_chapa - 0.006), t1, t0, mat_estrutura(), pai=estr)
    # ── degrau: borracha (APOIO) em cima da chapa de aço, num poste que sobe da base embaixo da frente dela ─────────────────────────
    y_dm = y_bd - prof_d / 2
    caixa(nome + "_degrau_borracha", (0, y_dm, z_d - 0.003), (larg_d, prof_d, 0.006), mat_borracha(), pai=deg, chanfro=0.002)
    # chapa de aço embaixo da borracha (a borracha passa 8 mm dela atrás: bico de borracha); quinas chanfradas como as da borracha —
    # a zona de apoio da checagem mede o sinal pela normal da face mais perto e, na quina viva, a normal fica ⟂ à pele e o sinal sai
    # errado (a pele 2 cm acima da quina dava "−20 mm")
    caixa(nome + "_degrau_chapa", (0, y_dm - 0.004, z_d - 0.006 - 0.005), (larg_d - 0.004, prof_d - 0.008, 0.010), mat_aco(), pai=deg,
          chanfro=0.002)
    z_baixo_d = z_d - 0.016                                 # embaixo da chapa do degrau
    y_poste = y_bd - prof_d + t0 / 2 + 0.004                # o poste fica embaixo da frente do degrau (o calcanhar desce atrás)
    _viga(nome + "_poste_degrau", (0, y_poste, 0.05), (0, y_poste, z_baixo_d - 0.012), t1, t0, mat_estrutura(), pai=estr)
    _em_aneis(_reto(caixa(nome + "_degrau_suporte", (0, y_bd - prof_d / 2 - 0.012, z_baixo_d - 0.006),
                          (larg_d - 0.06, prof_d - 0.04, 0.012), mat_estrutura(), pai=estr, chanfro=0)), passo=0.05)
    # ── base no chão: viga do meio ao longo do Y (do assento ao degrau), pés de trás e da frente, braço até a torre ──────────────────
    y0b, y1b = y_bd - prof_d - 0.08, y_t + 0.06
    _em_aneis(_reto(caixa(nome + "_base_meio", (0, (y0b + y1b) / 2, 0.025), (t1, y1b - y0b, 0.05), mat_estrutura(), pai=estr,
                          chanfro=0)), passo=0.08)
    for k, (y, meia) in enumerate(((y0b + 0.04, 0.27), (y1b - 0.04, 0.27))):
        _em_aneis(_reto(caixa(nome + "_base_pe%d" % k, (0, y, 0.025), (2 * meia, t1, 0.05), mat_estrutura(), pai=estr, chanfro=0)),
                  passo=0.08)
    x_t = sl * x_torre
    _viga(nome + "_base_torre", (0, ye, 0.025), (x_t + sl * t0 / 2, ye, 0.025), t1, 0.05, mat_estrutura(), pai=estr)
    _em_aneis(_reto(caixa(nome + "_base_pe_torre", (x_t, ye, 0.025), (t1, 0.40, 0.05), mat_estrutura(), pai=estr, chanfro=0)),
              passo=0.08)
    # ── torre do eixo (parada): coluna do lado, mancal no alto e o eixo de aço que entra no cubo do braço ─────────────────────────────
    _viga(nome + "_torre", (x_t, ye, 0.05), (x_t, ye, ze + 0.065), t0, t1, mat_estrutura(), pai=estr)
    _cilindro(nome + "_mancal", 0.05, 0.08, (x_t, ye, ze), rot_x90, mat_estrutura(), pai=estr)
    _em_aneis(_cilindro(nome + "_eixo", 0.02, abs(x_t - P0.x) + 0.05, ((x_t + P0.x) / 2 + sl * 0.01, ye, ze), rot_x90, mat_aco(),
                        pai=estr), passo=0.03)
    _cilindro(nome + "_eixo_tampa", 0.03, 0.012, (x_t + sl * 0.046, ye, ze), rot_x90, mat_aco(), pai=estr)
    # ── braço (gira): cubo no eixo, viga do cubo até a travessa, travessa por cima da almofada, pegadores, ponta com o pino ──────────
    h_chapa = esp_a + 0.006                                 # meio da chapa de aço em cima do estofado (a partir da face de baixo)
    h_trav = esp_a + 0.012 + t0 / 2                         # meio da travessa
    Q = c_a + w_a * h_trav                                  # meio da travessa (x = 0)
    Qb = Vector((P0.x, Q.y, Q.z))                           # onde a travessa encontra o braço
    pecas = [_cilindro(nome + "_cubo", 0.06, 0.06, P0, rot_x90, mat_estrutura()),
             _cilindro(nome + "_cubo_tampa", 0.03, 0.064, P0, rot_x90, mat_aco())]
    d = (Qb - P0).normalized()
    pecas.append(_viga(nome + "_braco_viga", P0 + d * 0.04, Qb + d * (t1 / 2), t0, t1, mat_estrutura()))
    F = Qb + u_a * frente_pino                              # ponta do braço, com o pino
    pecas.append(_viga(nome + "_braco_ponta", Qb - u_a * (t1 / 2), F + u_a * (t1 / 2), t0, t1, mat_estrutura()))
    x_fim = -sl * (comp_a / 2 - 0.03)                       # a travessa vai do braço até perto da ponta de lá da almofada
    pecas.append(_em_aneis(_reto(caixa(nome + "_travessa", Vector(((P0.x + x_fim) / 2, Q.y, Q.z)),
                                       (abs(P0.x - x_fim) + t0, t0, t0), mat_estrutura(), rot=_rot_de(X, -u_a, w_a), chanfro=0)),
                           passo=t0))
    pecas.append(caixa(nome + "_travessa_tampa", Vector((x_fim - sl * (t0 / 2 + 0.003), Q.y, Q.z)), (0.006, t0 + 0.004, t0 + 0.004),
                       mat_borracha(), rot=_rot_de(X, -u_a, w_a), chanfro=0.001))
    # chapa de aço em cima do estofado da almofada (presa na travessa)
    pecas.append(_em_aneis(_reto(caixa(nome + "_almofada_chapa", c_a + w_a * h_chapa, (comp_a - 0.03, prof_a - 0.02, 0.012),
                                       mat_aco(), rot=_rot_de(X, -u_a, w_a), chanfro=0)), passo=0.06))
    # barra dos pegadores (aço, ao longo do X) em 2 postes em cima da travessa, por fora das mãos, com as 2 luvas de borracha (os
    # pegadores) onde as mãos fecham por cima (pegada pronada)
    pegs = {}
    topo_trav = Q + w_a * (t0 / 2)
    x_ext = x_p + comp_p / 2 + 0.02                         # pontas da barra (e os postes), por fora das luvas
    c_bar = Vector((0.0, topo_trav.y, topo_trav.z)) + w_a * alt_p   # eixo da barra, no meio
    pecas.append(_em_aneis(_cilindro(nome + "_barra_pegador", 0.0125, 2 * x_ext + 0.03, c_bar, rot_x90, mat_aco(), vertices=24),
                           passo=0.04))
    for s in (1, -1):
        topo_b = Vector((s * x_ext, c_bar.y, c_bar.z))
        pecas.append(tubo(nome + "_poste_pegador%+d" % s, Vector((s * x_ext, topo_trav.y, topo_trav.z)) - w_a * 0.005,
                          topo_b + w_a * 0.012, 0.013, mat_aco()))
        a_peg, b_peg = Vector((s * (x_p + comp_p / 2), c_bar.y, c_bar.z)), Vector((s * (x_p - comp_p / 2), c_bar.y, c_bar.z))
        pegs[s] = _em_aneis(tubo(nome + "_pegador%+d" % s, a_peg, b_peg, raio_p, mat_borracha(), vertices=32), passo=0.035)
        pecas.append(pegs[s])
        for k, xx in enumerate((x_p + comp_p / 2 + 0.005, x_p - comp_p / 2 - 0.005)):   # bordas da luva
            pecas.append(_cilindro(nome + "_pegador_borda%+d%d" % (s, k), raio_p + 0.003, 0.01, Vector((s * xx, c_bar.y, c_bar.z)),
                                   rot_x90, mat_borracha()))
    # pino de anilha na ponta do braço, virado pra fora (lado), com o colar de encosto da anilha
    x_p0 = F.x + sl * (t0 / 2)
    c_pino = Vector((x_p0 + sl * pino[0] / 2, F.y, F.z))
    pecas.append(_em_aneis(_cilindro(nome + "_pino", pino[1], pino[0], c_pino, rot_x90, mat_aco(), vertices=32), passo=0.04))
    pecas.append(_cilindro(nome + "_pino_colar", 0.045, 0.014, Vector((x_p0 + sl * 0.007, F.y, F.z)), rot_x90, mat_aco()))
    if anilha is not None:
        r_an, e_an = anilha
        xa = x_p0 + sl * (0.014 + 0.002 + e_an / 2)
        pecas.append(_em_aneis(_cilindro(nome + "_anilha", r_an, e_an, Vector((xa, F.y, F.z)), rot_x90, mat_borracha(), vertices=48),
                               passo=0.05))
        pecas.append(_cilindro(nome + "_anilha_miolo", 0.045, e_an + 0.004, Vector((xa, F.y, F.z)), rot_x90, mat_aco()))
    _prender(pecas, bra)
    # ── almofada das coxas (APOIO, gira junto com o braço): estofado com a face de baixo em c_a ─────────────────────────────────────
    _prender([caixa(nome + "_almofada_estofado", c_a + w_a * (esp_a / 2), (comp_a, prof_a, esp_a), mat_estofado(),
                    rot=_rot_de(X, -u_a, w_a), chanfro=0.02)], alm)
    bpy.context.view_layer.update()
    raizes = {"estrutura": estr, "assento": ass, "degrau": deg, "braco": bra, "almofada": alm}
    return MaquinaPanturrilha(raizes, (0.0, ye, ze), pegs, raio_p, comp_p / 2)
