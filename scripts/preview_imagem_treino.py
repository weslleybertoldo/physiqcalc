#!/usr/bin/env python3
"""Gera a imagem de compartilhar (modo Com foto e Só dados) via o dev server e salva PNGs.

Usa o Vite pra servir src/lib/gerarImagemTreino.ts transformado e chama a função no
navegador com um resumo de exemplo + foto sintética. Serve pra conferir layout do rodapé
("Acomp: @bertoldoperformance" na linha da data) sem precisar concluir um treino.

  python3 scripts/preview_imagem_treino.py [saida_dir]
"""
import base64
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "http://localhost:8080")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"

JS = """
async () => {
  const mod = await import('/src/lib/gerarImagemTreino.ts');
  // foto sintética 1080x1920 (gradiente) pra simular o modo "Com foto"
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1920);
  grad.addColorStop(0, '#5b6b7a'); grad.addColorStop(1, '#1c2229');
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1920);
  const foto = c.toDataURL('image/png');
  const resumo = {
    nome_treino: 'Peito + tríceps',
    iniciado_em: '2026-08-25T23:09:00.000Z',
    concluido_em: '2026-08-25T23:52:00.000Z',
    duracao_segundos: 42 * 60,
    academia_nome: 'Gaviões',
    volumeTotal: 6450,
    mediaPesoRep: 43.0,
    exercicios: [
      { nome: 'Supino Reto', series_concluidas: 3, mediaPesoRep: 52, series: [
        { numero_serie: 1, peso: 52, reps: 10 }, { numero_serie: 2, peso: 52, reps: 10 }, { numero_serie: 3, peso: 52, reps: 10 } ] },
      { nome: 'Tríceps Corda', series_concluidas: 3, mediaPesoRep: 33, series: [
        { numero_serie: 1, peso: 33, reps: 10 }, { numero_serie: 2, peso: 33, reps: 10 }, { numero_serie: 3, peso: 33, reps: 10 } ] },
    ],
  };
  const comFoto = await mod.gerarImagemTreino(resumo, { fotoDataUrl: foto });
  const soDados = await mod.gerarImagemTreino(resumo, {});
  return { comFoto, soDados };
}
"""

with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--disable-dev-shm-usage"])
    pg = nav.new_page()
    pg.goto(f"{BASE}/privacidade", wait_until="domcontentloaded")
    res = pg.evaluate(JS)
    for nome, url in res.items():
        dados = base64.b64decode(url.split(",", 1)[1])
        caminho = os.path.join(OUT, f"preview-{nome}.png")
        with open(caminho, "wb") as f:
            f.write(dados)
        print("salvo", caminho, len(dados), "bytes")
    nav.close()
