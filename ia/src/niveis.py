"""Escala única de risco do SIMA-SP: BAIXO < MEDIO < ALTO < CRITICO.

A **previsão** vai no máximo até ALTO (``NIVEL_MAXIMO_PREVISAO``). CRITICO é reservado para a
**medição** do sensor (bueiro transbordando), ver ``src/sensor_adjust.py`` e a ADR 0006. Os
arquivos de limiares continuam com o valor de CRITICO, só como histórico do treino.

No JSON os valores vão **sem acento** (``MEDIO``, ``CRITICO``), iguais aos nomes do enum
``RiskLevel`` do backend Java (o documento de contexto usa "ALTO ou CRITICO"). O acento fica só
no texto exibido ao usuário (``rotulo_exibicao``). Se o backend usar acento, ligue
``NIVEL_RISCO_COM_ACENTO=true`` no serviço — ver docs/recomendacoes.md (R6).
"""

from __future__ import annotations

import json
from enum import Enum
from pathlib import Path

from src.config import LIMIARES_NIVEIS_PADRAO, NIVEL_MAXIMO_PREVISAO


class NivelRisco(str, Enum):
    BAIXO = "BAIXO"
    MEDIO = "MEDIO"
    ALTO = "ALTO"
    CRITICO = "CRITICO"

    @property
    def ordem(self) -> int:
        return ORDEM_NIVEIS.index(self)


ORDEM_NIVEIS = [NivelRisco.BAIXO, NivelRisco.MEDIO, NivelRisco.ALTO, NivelRisco.CRITICO]
ROTULOS = {"BAIXO": "Baixo", "MEDIO": "Médio", "ALTO": "Alto", "CRITICO": "Crítico"}
COM_ACENTO = {"BAIXO": "BAIXO", "MEDIO": "MÉDIO", "ALTO": "ALTO", "CRITICO": "CRÍTICO"}


def validar_limiares(limiares: dict) -> dict:
    """Confere se existem MEDIO, ALTO e CRITICO em ordem crescente dentro de (0, 1)."""
    try:
        m, a, c = float(limiares["MEDIO"]), float(limiares["ALTO"]), float(limiares["CRITICO"])
    except KeyError as erro:
        raise ValueError(f"Limiar ausente: {erro}") from erro
    if not 0 < m < a < c < 1:
        raise ValueError(f"Limiares devem ser 0 < MEDIO < ALTO < CRITICO < 1: {limiares}")
    return {"MEDIO": m, "ALTO": a, "CRITICO": c}


def nivel_por_probabilidade(p: float, limiares: dict = LIMIARES_NIVEIS_PADRAO) -> NivelRisco:
    """Nível pela probabilidade. O limiar pertence ao nível de cima (``p == 0.40`` -> ALTO)."""
    if p >= limiares["CRITICO"]:
        return NivelRisco.CRITICO
    if p >= limiares["ALTO"]:
        return NivelRisco.ALTO
    if p >= limiares["MEDIO"]:
        return NivelRisco.MEDIO
    return NivelRisco.BAIXO


def nivel_previsto(p: float, limiares: dict = LIMIARES_NIVEIS_PADRAO) -> NivelRisco:
    """Nível de uma PREVISÃO: como :func:`nivel_por_probabilidade`, com teto em ALTO.

    Uma chance acima do limiar CRITICO continua ALTO: crítico só sai de medição do sensor.
    """
    return menor_nivel(nivel_por_probabilidade(p, limiares), NIVEL_MAXIMO)


def limiares_em_uso(limiares: dict) -> dict:
    """Os limiares que o serviço usa de fato (sem o CRITICO, que ficou só como histórico)."""
    return {k: v for k, v in limiares.items() if NivelRisco(k).ordem <= NIVEL_MAXIMO.ordem}


def nota_nivel_critico() -> dict:
    """Registro gravado nos metadados e nos limiares: o CRITICO do arquivo não é usado."""
    return {
        "nivel_maximo_previsao": NIVEL_MAXIMO.value,
        "critico": "limiar mantido só como histórico do treino; o serviço não o usa. "
                   "CRITICO só sai de medição do sensor (água em 100 %). Ver ADR 0006.",
    }


def niveis_por_probabilidade(probs, limiares: dict = LIMIARES_NIVEIS_PADRAO):
    """Versão vetorizada: devolve um array de inteiros 0..3 (ordem dos níveis)."""
    import numpy as np

    probs = np.asarray(probs, dtype="float64")
    return (probs >= limiares["MEDIO"]).astype(int) + (probs >= limiares["ALTO"]) + (probs >= limiares["CRITICO"])


def subir_nivel(nivel: NivelRisco, passos: int = 1) -> NivelRisco:
    """Sobe ``passos`` níveis, com teto em CRITICO."""
    return ORDEM_NIVEIS[min(nivel.ordem + passos, len(ORDEM_NIVEIS) - 1)]


def maior_nivel(*niveis: NivelRisco) -> NivelRisco:
    return max(niveis, key=lambda n: n.ordem)


def menor_nivel(*niveis: NivelRisco) -> NivelRisco:
    return min(niveis, key=lambda n: n.ordem)


NIVEL_MAXIMO = NivelRisco(NIVEL_MAXIMO_PREVISAO)


def rotulo_exibicao(nivel: NivelRisco) -> str:
    """Texto para a interface: "Médio", "Crítico"..."""
    return ROTULOS[nivel.value]


def valor_contrato(nivel: NivelRisco, com_acento: bool = False) -> str:
    """Valor que vai no JSON de resposta."""
    return COM_ACENTO[nivel.value] if com_acento else nivel.value


def salvar_limiares(limiares: dict, caminho: Path, extras: dict | None = None) -> None:
    conteudo = {"limiares": validar_limiares(limiares), **(extras or {})}
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(conteudo, indent=2, ensure_ascii=False), encoding="utf-8")


def carregar_limiares(caminho: Path) -> dict:
    conteudo = json.loads(Path(caminho).read_text(encoding="utf-8"))
    return validar_limiares(conteudo.get("limiares", conteudo))
