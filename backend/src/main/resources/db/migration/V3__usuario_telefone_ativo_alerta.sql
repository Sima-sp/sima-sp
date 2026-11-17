-- V3: usuário com telefone, conta ativa/desativada e permissão de alerta como booleano
-- (feat/usuario, issues #7 e #8).
--
-- Antes: TX_PERMISSAO_LOCALIZACAO e TX_PERMISSAO_ALERTA eram texto 'SIM'/'NAO'.
-- Agora: a localização é sempre pedida no cadastro (não há mais a permissão separada) e a
-- permissão de alerta vira FL_PERMISSAO_ALERTA (BOOLEAN). Os valores existentes são convertidos.

ALTER TABLE TBL_USUARIO
    ADD COLUMN TX_TELEFONE          VARCHAR(11)     NULL,
    ADD COLUMN FL_PERMISSAO_ALERTA  BOOLEAN         NOT NULL    DEFAULT FALSE,
    ADD COLUMN FL_ATIVO             BOOLEAN         NOT NULL    DEFAULT TRUE;

UPDATE TBL_USUARIO SET FL_PERMISSAO_ALERTA = (TX_PERMISSAO_ALERTA = 'SIM');

ALTER TABLE TBL_USUARIO
    DROP CHECK CHK_PER_LOC,
    DROP CHECK CHK_PER_ALE;

ALTER TABLE TBL_USUARIO
    DROP COLUMN TX_PERMISSAO_LOCALIZACAO,
    DROP COLUMN TX_PERMISSAO_ALERTA,
    ADD CONSTRAINT UQ_TELEFONE UNIQUE (TX_TELEFONE);
