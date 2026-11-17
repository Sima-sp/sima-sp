package br.com.back_end.simasp.ocorrencia.dto;

import br.com.back_end.simasp.ocorrencia.enums.TipoOcorrenciaEnum;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

/** Campos de texto do {@code POST /ocorrencias} (multipart); a foto vem na parte {@code foto}. */
public record NovaOcorrenciaRequest(
        @NotNull(message = "Escolha o tipo da ocorrência.")
        TipoOcorrenciaEnum tipo,

        @NotBlank(message = "Descreva o que está acontecendo.")
        @Size(max = 500, message = "A descrição pode ter até 500 caracteres.")
        String descricao,

        @NotNull(message = "A latitude deve ser inserida.")
        @DecimalMin(value = "-90.0", message = "Latitude inválida.")
        @DecimalMax(value = "90.0", message = "Latitude inválida.")
        BigDecimal latitude,

        @NotNull(message = "A longitude deve ser inserida.")
        @DecimalMin(value = "-180.0", message = "Longitude inválida.")
        @DecimalMax(value = "180.0", message = "Longitude inválida.")
        BigDecimal longitude
) {
}
