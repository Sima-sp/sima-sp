-- V6: privacidade (#19).
--
-- Aceite no cadastro: quando a pessoa confirmou que leu para que cada dado serve.
-- Localização de referência com cerca de 100 m de precisão (3 casas decimais): basta para o
-- aviso por proximidade e expõe menos a casa da pessoa. As existentes são arredondadas.

ALTER TABLE TBL_USUARIO
    ADD COLUMN DT_ACEITE_TERMOS DATETIME(2) NULL;

UPDATE TBL_USUARIO
SET NR_LATITUDE  = ROUND(NR_LATITUDE, 3),
    NR_LONGITUDE = ROUND(NR_LONGITUDE, 3);
