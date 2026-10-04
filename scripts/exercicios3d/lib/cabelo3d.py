# Cabelo e sobrancelhas do boneco: assets CC0 do pacote "makehuman_system_assets" (MPFB), em cinza-escuro.
# Decisão do Weslley (03/10/2026): "Só com cabelo. Sem short. Fundo branco mesmo."
# Uso (dentro do Blender, DEPOIS de an.corpo_atletico(bon), porque o cabelo é ajustado ao formato atual do corpo):
#     import cabelo3d as cb
#     cb.por_cabelo(bon, "short02"); cb.por_sobrancelhas(bon)
import bpy, os
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService


def _media_linear(caminho):
    """Brilho médio (linear) da parte opaca da textura — pra acertar o tom de cinza de qualquer estilo."""
    img = bpy.data.images.load(caminho, check_existing=True)
    px = list(img.pixels)  # RGBA linear (float), já convertido do sRGB
    soma, n = 0.0, 0
    for i in range(0, len(px), 4 * 37):  # amostra 1 a cada 37 pixels: basta pra média
        if px[i + 3] > 0.5:
            soma += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
            n += 1
    return img, (soma / n if n else 0.05)


def material_com_alfa(nome, textura, alvo=0.045, normal=None, rug=0.6):
    """Cinza (sem cor) com a transparência da textura; o desenho dos fios fica, o tom vai pra `alvo` (linear)."""
    img, media = _media_linear(textura)
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    b = N["Principled BSDF"]
    b.inputs["Roughness"].default_value = rug
    tex = N.new("ShaderNodeTexImage")
    tex.image = img
    cinza = N.new("ShaderNodeRGBToBW")
    L.new(tex.outputs["Color"], cinza.inputs["Color"])
    ganho = N.new("ShaderNodeMath")
    ganho.operation = "MULTIPLY"
    ganho.inputs[1].default_value = alvo / max(media, 1e-4)
    L.new(cinza.outputs["Val"], ganho.inputs[0])
    L.new(ganho.outputs["Value"], b.inputs["Base Color"])
    L.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    if normal and os.path.exists(normal):
        tn = N.new("ShaderNodeTexImage")
        tn.image = bpy.data.images.load(normal, check_existing=True)
        tn.image.colorspace_settings.name = "Non-Color"
        nm = N.new("ShaderNodeNormalMap")
        L.new(tn.outputs["Color"], nm.inputs["Color"])
        L.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def _asset(bon, tipo, pasta, estilo, alvo, subdiv=1):
    base = LocationService.get_user_data(os.path.join(pasta, estilo))
    obj = HumanService.add_mhclo_asset(os.path.join(base, estilo + ".mhclo"), bon.corpo, asset_type=tipo,
                                       subdiv_levels=subdiv, material_type="NONE")
    dif = os.path.join(base, estilo + "_diffuse.png")
    if not os.path.exists(dif):  # sobrancelha usa <estilo>.png
        dif = os.path.join(base, estilo + ".png")
    mat = material_com_alfa("%s_%s" % (tipo, estilo), dif, alvo=alvo, normal=os.path.join(base, estilo + "_normal.png"))
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def por_cabelo(bon, estilo="short02", alvo=0.045):
    bon.cabelo = _asset(bon, "Hair", "hair", estilo, alvo)
    return bon.cabelo


def por_sobrancelhas(bon, estilo="eyebrow001", alvo=0.03):
    bon.sobrancelhas = _asset(bon, "Eyebrows", "eyebrows", estilo, alvo, subdiv=0)
    return bon.sobrancelhas
