"""Baseline de regras — a "régua" que o modelo precisa superar (seção 7.2, item 1).

Deve reproduzir o ``RiskClassificationService`` do backend Java na parte de **chuva
acumulada**. ⚠️ Os limiares abaixo são PROVISÓRIOS: substituir pelos valores reais do código
Java (``reading/application/RiskClassificationService.java``) para que a comparação no TCC seja
com a regra que o sistema realmente usa. A parte do sensor (água) não entra no baseline
histórico porque não há histórico de sensores; ela é aplicada igualmente a todos os modelos via
``src/sensor_adjust.py`` (sem probabilidade, no modo regras a água a partir de 80 % sobe um
nível, até ALTO, e a medição de transbordamento dá CRITICO).

O baseline também é o "modo regras" do serviço quando ainda não existe modelo treinado.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.niveis import NIVEL_MAXIMO, ORDEM_NIVEIS, NivelRisco, menor_nivel

# mm acumulados: nível mínimo MEDIO / ALTO / CRITICO — SUBSTITUIR pelos valores do backend
LIMIARES_BASELINE = {
    "chuva_1h": (5.0, 15.0, 30.0),
    "chuva_3h": (10.0, 30.0, 50.0),
    "chuva_24h": (30.0, 60.0, 100.0),
}


class BaselineRegras:
    """Classificador por limiares de chuva acumulada (maior nível entre as janelas)."""

    nome = "baseline_regras"

    def __init__(self, limiares: dict | None = None):
        self.limiares = limiares or LIMIARES_BASELINE

    def niveis(self, df: pd.DataFrame) -> np.ndarray:
        """Nível (0..3) para cada linha."""
        nivel = np.zeros(len(df), dtype=int)
        for coluna, (medio, alto, critico) in self.limiares.items():
            v = df[coluna].to_numpy(dtype="float64")
            n = (v >= medio).astype(int) + (v >= alto) + (v >= critico)
            nivel = np.maximum(nivel, n)
        return nivel

    def pontuacao(self, df: pd.DataFrame) -> np.ndarray:
        """Nível escalado para [0, 1] — permite calcular PR-AUC/ROC-AUC na mesma régua dos modelos.

        Não é uma probabilidade calibrada; por isso o Brier do baseline não é comparável.
        """
        return self.niveis(df) / 3.0

    def nivel(self, valores: dict) -> NivelRisco:
        """Nível para um único registro (usado pelo serviço em modo regras).

        Como a previsão do modelo, vai no máximo até ALTO: CRITICO só sai de medição do sensor
        (ADR 0006). ``niveis()`` continua com a escala de 4 níveis porque é a régua das
        comparações já publicadas em ``reports/``.
        """
        linha = pd.DataFrame([{k: valores.get(k, 0.0) or 0.0 for k in self.limiares}])
        return menor_nivel(ORDEM_NIVEIS[int(self.niveis(linha)[0])], NIVEL_MAXIMO)
