package br.com.back_end.simasp.alerta.dto;

import br.com.back_end.simasp.alerta.enums.StatusAlertaEnum;
import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;

import java.time.OffsetDateTime;

/** Alerta como o app e o admin recebem. Só dados do sensor: nenhum dado de usuário. */
public record AlertaResponse(
        Long id,
        Long sensorId,
        String codigo,
        String vizinhanca,
        Double latitude,
        Double longitude,
        NivelRiscoEnum nivelRisco,
        StatusAlertaEnum status,
        String mensagem,
        OffsetDateTime criadoEm,
        OffsetDateTime resolvidoEm
) {
}
