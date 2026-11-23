package br.com.back_end.simasp.sensor.dto;

/**
 * Chave nova do sensor. Aparece só nesta resposta: o banco guarda apenas o hash. Configure-a no
 * servidor do sensor ({@code SENSOR_CHAVE}); para trocar, gere outra.
 */
public record ChaveSensorResponse(Long sensorId, String codigo, String chave) {
}
