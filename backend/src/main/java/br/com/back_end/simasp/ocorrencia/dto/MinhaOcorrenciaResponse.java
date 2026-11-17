package br.com.back_end.simasp.ocorrencia.dto;

import br.com.back_end.simasp.ocorrencia.enums.SituacaoOcorrenciaEnum;
import br.com.back_end.simasp.ocorrencia.enums.TipoOcorrenciaEnum;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Para o autor acompanhar o próprio relato. */
public record MinhaOcorrenciaResponse(
        Long id,
        TipoOcorrenciaEnum tipo,
        String descricao,
        BigDecimal latitude,
        BigDecimal longitude,
        SituacaoOcorrenciaEnum situacao,
        String motivoRecusa,
        OffsetDateTime dataCriacao,
        OffsetDateTime dataAnalise,
        boolean temFoto
) {
}
