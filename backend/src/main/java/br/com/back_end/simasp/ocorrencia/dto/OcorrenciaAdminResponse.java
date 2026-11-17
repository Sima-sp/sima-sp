package br.com.back_end.simasp.ocorrencia.dto;

import br.com.back_end.simasp.ocorrencia.enums.SituacaoOcorrenciaEnum;
import br.com.back_end.simasp.ocorrencia.enums.TipoOcorrenciaEnum;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Fila de análise do admin. O e-mail do autor ajuda a ver abuso; nulo se a conta foi excluída. */
public record OcorrenciaAdminResponse(
        Long id,
        TipoOcorrenciaEnum tipo,
        String descricao,
        BigDecimal latitude,
        BigDecimal longitude,
        SituacaoOcorrenciaEnum situacao,
        String motivoRecusa,
        String emailAutor,
        OffsetDateTime dataCriacao,
        OffsetDateTime dataAnalise,
        String fotoUrl
) {
}
