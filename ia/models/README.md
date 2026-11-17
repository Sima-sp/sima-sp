# models/

Artefatos do modelo, gerados por `python -m src.train --dataset v1 --versao v1`:

| Arquivo | Conteúdo |
|---|---|
| `flood_lgbm_v1.joblib` | estimador + calibrador + lista de features |
| `thresholds_v1.json` | limiares MEDIO/ALTO/CRITICO + estratégia e diagnóstico. O CRITICO fica só como histórico: o serviço não o usa (`uso_no_servico`, ADR 0006) |
| `thresholds_regiao_v1.json` | limiares do alerta por subprefeitura (ADR 0005); o CRITICO também fica só como histórico |
| `metadata_v1.json` | período, divisão, fonte da chuva, métricas, versões das bibliotecas |
| `pontos_v1.csv` | características fixas dos pontos (usadas ao vivo) |

O serviço carrega a versão de `VERSAO_MODELO` (padrão `v1`). **Sem esses arquivos, ele sobe em
modo regras** (ADR 0004).

Os arquivos são pequenos (poucos MB) e podem ser versionados para o Docker. Os artefatos
sintéticos (`*_sintetico.*`, de `make sintetico`) **não** devem ser commitados.
