package br.com.back_end.simasp.previsao.client.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Corpo de {@code POST /predict} do serviço de IA.
 *
 * <p>O backend manda só o que conhece: onde o sensor está e o que ele mediu. A chuva é
 * responsabilidade do serviço de IA, que usa a mesma fonte e o mesmo código do treino
 * (ver ia/docs/recomendacoes.md, R8). O sensor mede só a água: lixo e {@code chuvaMm} saíram do
 * pedido (ADR 0006 da IA).</p>
 *
 * <p>{@code chuvaHoraria} é a exceção: fica nula sempre, menos no modo de demonstração, quando
 * leva o cenário de chuva simulada (72 valores horários, o último é a hora atual). Campos nulos
 * não são enviados.</p>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PrevisaoIaRequest(
        Long sensorId,
        double latitude,
        double longitude,
        OffsetDateTime timestamp,
        Double nivelAgua,
        List<Double> chuvaHoraria
) {
}
