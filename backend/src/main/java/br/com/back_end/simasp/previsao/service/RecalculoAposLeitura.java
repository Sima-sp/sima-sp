package br.com.back_end.simasp.previsao.service;

import br.com.back_end.simasp.leitura.config.NivelSensorProperties;
import br.com.back_end.simasp.leitura.evento.LeituraRecebidaEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Leitura nova → previsão daquele sensor recalculada (#10), no máximo uma vez por
 * {@code sensor.intervalo-recalculo} por sensor. Roda depois do commit e fora da requisição:
 * o servidor do sensor recebe o 201 sem esperar o serviço de IA.
 */
@Component
public class RecalculoAposLeitura {

    private static final Logger log = LoggerFactory.getLogger(RecalculoAposLeitura.class);

    private final PrevisaoService previsao;
    private final Clock relogio;
    private final Duration intervalo;
    private final Map<Long, Instant> ultimoRecalculo = new ConcurrentHashMap<>();

    public RecalculoAposLeitura(PrevisaoService previsao, Clock relogio, NivelSensorProperties propriedades) {
        this.previsao = previsao;
        this.relogio = relogio;
        this.intervalo = propriedades.intervaloRecalculo() == null ? Duration.ofMinutes(1) : propriedades.intervaloRecalculo();
    }

    @Async
    @TransactionalEventListener(fallbackExecution = true)
    public void aoReceberLeitura(LeituraRecebidaEvent evento) {
        if (!deveRecalcular(evento.sensorId())) {
            return;
        }
        try {
            previsao.atualizarSensor(evento.sensorId());
        } catch (RuntimeException erro) {
            log.warn("Recálculo da previsão do sensor {} falhou: {}", evento.sensorId(), erro.getMessage());
        }
    }

    /** True e marca a hora quando o último recálculo deste sensor foi há mais de um intervalo. */
    public boolean deveRecalcular(Long sensorId) {
        Instant agora = relogio.instant();
        boolean[] liberado = {false};
        ultimoRecalculo.compute(sensorId, (id, anterior) -> {
            if (anterior == null || !agora.isBefore(anterior.plus(intervalo))) {
                liberado[0] = true;
                return agora;
            }
            return anterior;
        });
        return liberado[0];
    }
}
