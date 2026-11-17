package br.com.back_end.simasp.ocorrencia.dto;

import br.com.back_end.simasp.ocorrencia.enums.TipoOcorrenciaEnum;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** O que o mapa mostra: nada sobre quem relatou (#15). */
public record OcorrenciaPublicaResponse(
        Long id,
        TipoOcorrenciaEnum tipo,
        String descricao,
        BigDecimal latitude,
        BigDecimal longitude,
        OffsetDateTime dataCriacao,
        OffsetDateTime validaAte,
        String fotoUrl
) {
}
