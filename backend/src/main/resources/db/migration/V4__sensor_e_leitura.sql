-- V4: o sensor de verdade (#10).
--
-- O sensor mede só a distância até a água. Ele passa a ter um código (o "device" do firmware),
-- a profundidade e a distância de "cheio" (para virar %), e o hash da chave que o servidor do
-- sensor manda no cabeçalho X-Sensor-Chave.
--
-- A leitura guarda a distância (obrigatória) e, quando dá para calcular, o nível em % e o nível
-- medido. Saem lixo, chuva e previsão: o sensor não mede lixo, a chuva é do serviço de IA e a
-- previsão tem tabela própria desde a V2.

ALTER TABLE TBL_SENSOR
    ADD COLUMN TX_CODIGO                VARCHAR(40)     NULL,
    ADD COLUMN NR_PROFUNDIDADE_CM       DOUBLE          NULL,
    ADD COLUMN NR_DISTANCIA_CHEIO_CM    DOUBLE          NULL,
    ADD COLUMN TX_CHAVE_HASH            VARCHAR(100)    NULL,
    ADD CONSTRAINT UQ_CODIGO_SENSOR UNIQUE (TX_CODIGO);

ALTER TABLE TBL_LEITURA
    DROP CHECK CK_PORCENTAGEM_DESPERDICIO,
    DROP CHECK CK_CHUVA_MM,
    DROP CHECK CK_PROBABILIDADE_ALAGAMENTO;

ALTER TABLE TBL_LEITURA
    DROP COLUMN NR_PORCENTAGEM_DESPERDICIO,
    DROP COLUMN NR_CHUVA_MM,
    DROP COLUMN NR_PROBABILIDADE_ALAGAMENTO,
    DROP COLUMN TX_PREVISAO_NIVEL_RISCO,
    MODIFY COLUMN NR_NIVEL_AGUA     DOUBLE          NULL,
    MODIFY COLUMN TX_NIVEL_RISCO    VARCHAR(20)     NULL,
    ADD COLUMN NR_DISTANCIA_CM      DOUBLE          NOT NULL    DEFAULT 0;

-- O DEFAULT só existiu para as linhas antigas; daqui em diante a distância vem sempre do sensor.
ALTER TABLE TBL_LEITURA ALTER COLUMN NR_DISTANCIA_CM DROP DEFAULT;

ALTER TABLE TBL_LEITURA
    ADD CONSTRAINT CK_DISTANCIA_CM CHECK (NR_DISTANCIA_CM >= 0);
