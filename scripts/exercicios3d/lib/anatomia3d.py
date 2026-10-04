# Anatomia do boneco (Physiq · exercícios 3D):
#  1) corpo atlético: alvos de músculo do MakeHuman (peito, dorsal, V, braços, pernas, panturrilha);
#  2) músculos desenhados numa TEXTURA do corpo (anatomia_tex.py: linhas/sombra/fibras + altura) e relevo de
#     verdade (Displace pela textura de altura) — visual v4 "suave", escolhido pelo Weslley em 03/10/2026;
#  3) músculo alvo em vermelho e auxiliares em vermelho claro (máscaras geradas pelo anatomia_tex.py).
# Uso (dentro do Blender, depois de b3.Boneco()):
#     import anatomia3d as an
#     an.corpo_atletico(bon); an.visual_v4(bon, alvos=["quadriceps", "gluteo"], secundarios=["adutores"])
# Coordenadas de repouso: chão z=0, frente = -Y, esquerda do boneco = +X.
import bpy
import boneco3d as b3

from bl_ext.user_default.mpfb.services.targetservice import TargetService

# ── 1. corpo atlético ─────────────────────────────────────────────────────────────────────────────
ALVOS_CORPO = {   # v2 (03/10 20:30, "mais músculo"): só alvos locais — medidas/escala mexem nas juntas e o rig não acompanha
    "torso-muscle-pectoral-incr": 1.0, "torso-muscle-dorsi-incr": 0.9, "torso-vshape-incr": 0.7,
    "l-upperarm-muscle-incr": 1.0, "r-upperarm-muscle-incr": 1.0,
    "l-upperarm-shoulder-muscle-incr": 1.0, "r-upperarm-shoulder-muscle-incr": 1.0,
    "l-lowerarm-muscle-incr": 0.8, "r-lowerarm-muscle-incr": 0.8,
    "l-upperleg-muscle-incr": 0.9, "r-upperleg-muscle-incr": 0.9,
    "l-lowerleg-muscle-incr": 0.8, "r-lowerleg-muscle-incr": 0.8,
    "measure-calf-circ-incr": 0.5, "measure-upperarm-circ-incr": 0.3, "measure-thigh-circ-incr": 0.2,
    "measure-neck-circ-incr": 0.4, "buttocks-volume-incr": 0.3, "stomach-tone-incr": 0.6,
}


def corpo_atletico(bon, alvos=ALVOS_CORPO):
    """Carrega os alvos de músculo do MakeHuman no corpo (chaves de forma). Chamar ANTES do visual_v4()."""
    for nome, peso in alvos.items():
        caminho = TargetService.target_full_path(nome)
        if caminho:
            TargetService.load_target(bon.corpo, caminho, weight=peso)
        else:
            print("ANATOMIA: alvo não achado", nome)
    b3.bpy.context.view_layer.update()


# ── 2. anatomia por textura no UV (anatomia_tex.py) ─────────────────────────────────────────────────
import os, subprocess

import config
TEX = config.TEX
PELE = (0.40, 0.40, 0.41, 1)


def garantir_alvo(alvos):
    """Caminho da máscara do músculo alvo (gera com o .venv se ainda não existe)."""
    nome = "+".join(sorted(alvos)) or "nenhum"
    caminho = os.path.join(TEX, "alvo_%s.png" % nome)
    if not os.path.exists(caminho):
        subprocess.run([config.VENV_PY, os.path.join(config.LIB, "anatomia_tex.py"), "alvo", ",".join(alvos)], check=True)
    return caminho


VERMELHO_CLARO = (0.93, 0.42, 0.38, 1)   # músculos que ajudam (pedido dele 04/10: "faz em um vermelho mais claro")


def material_tex(bon, alvos=(), pele=PELE, vermelho=None, linhas=0.85, sombra=0.45, fibras=0.35,
                 relevo=1.0, distancia=0.018, sulco=0.25, debug=False, fibra_relevo=0.0, rugosidade=0.5,
                 secundarios=()):
    """Pele cinza + linhas/sombra/fibras das texturas + alvo em vermelho + relevo por bump (altura - sulco*linha)."""
    vermelho = vermelho or b3.VERMELHO
    mat = bpy.data.materials.new("BonecoAnatomia2")
    mat.use_nodes = True
    N, L = mat.node_tree.nodes, mat.node_tree.links
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rugosidade
    uv = N.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"

    def imagem(caminho):
        t = N.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(caminho, check_existing=True)
        t.image.colorspace_settings.name = "Non-Color"
        t.interpolation = "Cubic"
        L.new(uv.outputs["UV"], t.inputs["Vector"])
        return t

    def mat_op(op, a, b=None, c=None):
        m = N.new("ShaderNodeMath")
        m.operation = op
        for k, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[k].default_value = v
            else:
                L.new(v, m.inputs[k])
        return m.outputs["Value"]

    tl = imagem(os.path.join(TEX, "anat_linhas.png"))
    ta = imagem(os.path.join(TEX, "anat_altura.png"))
    tv = imagem(garantir_alvo(alvos))
    sep = N.new("ShaderNodeSeparateColor")
    L.new(tl.outputs["Color"], sep.inputs["Color"])
    lin, som, fib = sep.outputs["Red"], sep.outputs["Green"], sep.outputs["Blue"]
    alvo = mat_op("MULTIPLY", tv.outputs["Color"], 1.0)

    cor = N.new("ShaderNodeMix")
    cor.data_type = "RGBA"
    cor.inputs["A"].default_value = pele
    cor.inputs["B"].default_value = vermelho
    L.new(alvo, cor.inputs["Factor"])
    if secundarios:                             # pele → vermelho claro (ajudam) → vermelho (principal) por cima
        ts = imagem(garantir_alvo(secundarios))
        claro = N.new("ShaderNodeMix")
        claro.data_type = "RGBA"
        claro.inputs["A"].default_value = pele
        claro.inputs["B"].default_value = VERMELHO_CLARO
        L.new(ts.outputs["Color"], claro.inputs["Factor"])
        L.new(claro.outputs["Result"], cor.inputs["A"])
    if debug:                                   # uma cor por músculo (tex/anat_debug.png)
        td = imagem(os.path.join(TEX, "anat_debug.png"))
        L.new(td.outputs["Color"], cor.inputs["A"])
        cor.inputs["Factor"].default_value = 0.0
        for lk in list(cor.inputs["Factor"].links):
            L.remove(lk)
    m1 = mat_op("MULTIPLY_ADD", lin, -linhas, 1.0)
    m2 = mat_op("MULTIPLY_ADD", som, -sombra, 1.0)
    m3 = mat_op("MULTIPLY_ADD", mat_op("MULTIPLY", fib, alvo), -fibras, 1.0)
    mult = mat_op("MULTIPLY", mat_op("MULTIPLY", m1, m2), m3)
    esc = N.new("ShaderNodeVectorMath")
    esc.operation = "SCALE"
    L.new(cor.outputs["Result"], esc.inputs["Vector"])
    L.new(mult, esc.inputs["Scale"])
    L.new(esc.outputs["Vector"], bsdf.inputs["Base Color"])

    alt = mat_op("MULTIPLY_ADD", lin, -sulco, ta.outputs["Color"])
    if fibra_relevo:                            # estrias das fibras em TODOS os músculos (só no relevo)
        alt = mat_op("MULTIPLY_ADD", fib, -fibra_relevo, alt)
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = relevo
    bump.inputs["Distance"].default_value = distancia
    L.new(alt, bump.inputs["Height"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    bon.corpo.data.materials.clear()
    bon.corpo.data.materials.append(mat)
    escuro = b3.material_liso("Olho2", (0.05, 0.05, 0.055, 1), rug=0.25)
    for o in getattr(bon, "olhos", []):
        o.data.materials.clear()
        o.data.materials.append(escuro)
    return mat


def relevo_real(bon, forca=0.016, meio=0.25, niveis=2, textura="anat_altura.png"):
    """Músculo saltando DE VERDADE (silhueta e sombra): Displace pela textura de altura (UV) depois da
    subdivisão. meio = nível da pele (0,25 na textura) → rosto, mãos e pés não mexem."""
    sub = bon.corpo.modifiers["Suave"]
    sub.render_levels = niveis
    img = bpy.data.images.load(os.path.join(TEX, textura), check_existing=True)
    img.colorspace_settings.name = "Non-Color"
    tx = bpy.data.textures.new("anat_altura", type="IMAGE")
    tx.image = img
    tx.extension = "EXTEND"
    d = bon.corpo.modifiers.new("Relevo", "DISPLACE")
    d.texture = tx
    d.texture_coords = "UV"
    d.uv_layer = "UVMap"
    d.mid_level = meio
    d.strength = forca
    return d


def oclusao(mat, forca=0.6, distancia=0.04):
    """Escurece os vãos entre os músculos (Ambient Occlusion do Cycles) multiplicando a cor base."""
    N, L = mat.node_tree.nodes, mat.node_tree.links
    bsdf = N["Principled BSDF"]
    origem = bsdf.inputs["Base Color"].links[0].from_socket
    ao = N.new("ShaderNodeAmbientOcclusion")
    ao.only_local = True
    ao.samples = 8
    ao.inputs["Distance"].default_value = distancia
    mix = N.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs["Factor"].default_value = forca
    mix.inputs[2].default_value = 1.0          # A (float)
    L.new(ao.outputs["AO"], mix.inputs[3])     # B (float)
    esc = N.new("ShaderNodeVectorMath")
    esc.operation = "SCALE"
    L.new(origem, esc.inputs["Vector"])
    L.new(mix.outputs[0], esc.inputs["Scale"])
    L.new(esc.outputs["Vector"], bsdf.inputs["Base Color"])
    return ao




def visual_v4(bon, alvos=(), forca=0.017, niveis=3, secundarios=()):
    """Músculo mais natural (pedido dele 03/10 21:35: "os músculos estão um pouco artificiais… acho que é
    o relevo"; escolhido por ele 03/10 22:42: "O 2 é o suave", força 0,017): domo que sobe devagar da borda e
    vale largo e raso entre os músculos (tex/anat_altura_nat.png),
    relevo menor, estrias leves das fibras em todos os músculos, oclusão mais fraca e brilho mais suave."""
    relevo_real(bon, forca=forca, niveis=niveis, textura="anat_altura_nat.png")
    mat = material_tex(bon, alvos=alvos, distancia=0.003, linhas=0.0, sombra=0.16, sulco=0.0,
                       fibras=0.25, fibra_relevo=0.015, rugosidade=0.55, secundarios=secundarios)
    oclusao(mat, forca=0.9, distancia=0.05)
    return mat
