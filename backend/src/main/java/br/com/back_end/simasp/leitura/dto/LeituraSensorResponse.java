package br.com.back_end.simasp.leitura.dto;

import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;

import java.time.OffsetDateTime;

/**
 * Leitura gravada. {@code nivelAgua} e {@code nivelRisco} vêm nulos quando o sensor não tem a
 * profundidade e a distância de cheio cadastradas.
 */
public record LeituraSensorResponse(
        Long id,
        Long sensorId,
        String codigo,
        Double distanciaCm,
        Double nivelAgua,
        NivelRiscoEnum nivelRisco,
        Boolean transbordando,
        OffsetDateTime medidaEm
) {
}
