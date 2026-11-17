package br.com.back_end.simasp.previsao.dto;

import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;
import br.com.back_end.simasp.previsao.enums.OrigemPrevisaoEnum;
import br.com.back_end.simasp.previsao.enums.StatusPrevisaoEnum;

import br.com.back_end.simasp.sensor.enums.StatusSensor;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Previsão como o app e o site recebem.
 *
 * <p>{@code status} evita o ponto sumir do mapa quando a previsão envelhece: o app mostra o
 * sensor com o aviso "desatualizada" em vez de nada. Quando
 * {@code medicaoTransbordando = true}, o app deve trocar a porcentagem por "Transbordando
 * agora (medido)" — a probabilidade continua sendo a do modelo (R5).</p>
 *
 * <p>{@code simulada = true} indica previsão feita com chuva de um cenário do modo de
 * demonstração, não com a chuva real. O app deve avisar isso na tela.</p>
 *
 * <p>As datas vão com o fuso ({@code 2026-11-16T14:20:00-03:00}, #9).</p>
 *
 * <p>Os cinco últimos campos são do sensor e da última leitura dele (#11). A leitura vai mesmo
 * que seja velha: o app decide o que mostrar pela {@code dataLeitura}. Sem leitura (ou sem
 * profundidade cadastrada), {@code nivelAgua}, {@code distanciaCm} e {@code dataLeitura} vêm
 * nulos; {@code statusSensor} vem sempre.</p>
 */
public record PrevisaoResponse(
        Long sensorId,
        Double latitude,
        Double longitude,
        String vizinhanca,
        StatusPrevisaoEnum status,
        Double probabilidadeAlagamento,
        NivelRiscoEnum nivelRisco,
        NivelRiscoEnum nivelRiscoModelo,
        Integer janelaHoras,
        OffsetDateTime geradaEm,
        OffsetDateTime validaAte,
        OffsetDateTime horaReferencia,
        Boolean medicaoTransbordando,
        Boolean ajusteSensorAplicado,
        Boolean semLeituraSensor,
        List<String> motivosAjuste,
        Double chuvaRecente3hMm,
        Double chuvaPrevista3hMm,
        OrigemPrevisaoEnum origem,
        String modeloVersao,
        Boolean simulada,
        Double nivelAgua,
        Double distanciaCm,
        OffsetDateTime dataLeitura,
        StatusSensor statusSensor,
        String codigo
) {
}
