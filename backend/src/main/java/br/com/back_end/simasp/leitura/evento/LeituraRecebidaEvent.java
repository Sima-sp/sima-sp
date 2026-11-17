package br.com.back_end.simasp.leitura.evento;

import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;

/**
 * Publicado depois de gravar uma leitura (#10). Quem precisa reagir (recalcular a previsão, criar
 * um alerta) ouve este evento, sem atrasar a resposta ao servidor do sensor.
 */
public record LeituraRecebidaEvent(Long leituraId, Long sensorId, Double nivelAgua, NivelRiscoEnum nivelRisco) {
}
