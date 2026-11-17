-- V5: alerta nasce da leitura do sensor (#13).
--
-- O alerta passa a apontar para o sensor, guarda o nível que o disparou, a última leitura crítica
-- (para resolver sozinho quando a água baixa) e quando foi resolvido.
--
-- No máximo UM alerta ATIVO por sensor: o MySQL não tem índice único parcial, então uma coluna
-- gerada vale o id do sensor enquanto o alerta está ativo e nulo depois de resolvido, com índice
-- único nela (vários nulos são permitidos).

ALTER TABLE TBL_ALERTA
    ADD COLUMN ID_SENSOR                BIGINT          NULL,
    ADD COLUMN TX_NIVEL_RISCO           VARCHAR(20)     NULL,
    ADD COLUMN DT_ULTIMA_CRITICA        DATETIME(2)     NULL,
    ADD COLUMN DT_DATA_RESOLUCAO        DATETIME(2)     NULL;

UPDATE TBL_ALERTA a
    JOIN TBL_LEITURA l ON l.ID_LEITURA = a.ID_LEITURA
SET a.ID_SENSOR = l.ID_SENSOR;

ALTER TABLE TBL_ALERTA
    ADD COLUMN ID_SENSOR_ATIVO BIGINT
        GENERATED ALWAYS AS (CASE WHEN TX_STATUS = 'ATIVO' THEN ID_SENSOR ELSE NULL END) STORED,
    ADD CONSTRAINT SEN_FK_ALE FOREIGN KEY (ID_SENSOR) REFERENCES TBL_SENSOR (ID_SENSOR),
    ADD CONSTRAINT UQ_ALERTA_ATIVO_POR_SENSOR UNIQUE (ID_SENSOR_ATIVO),
    ADD CONSTRAINT CHK_ALE_NIVEL CHECK (TX_NIVEL_RISCO IS NULL OR TX_NIVEL_RISCO IN ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO'));

CREATE INDEX IDX_ALE_STATUS_DATA ON TBL_ALERTA (TX_STATUS, DT_DATA_ALERTA DESC);
