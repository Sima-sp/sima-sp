package br.com.back_end.simasp.alerta.evento;

import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;

/** Publicado quando um alerta é criado (#13). Quem ouve: a notificação push (#14). */
public record AlertaCriadoEvent(Long alertaId, Long sensorId, NivelRiscoEnum nivelRisco) {
}
