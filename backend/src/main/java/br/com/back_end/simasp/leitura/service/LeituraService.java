package br.com.back_end.simasp.leitura.service;

import br.com.back_end.simasp.config.FusoHorario;
import br.com.back_end.simasp.exception.ChaveSensorInvalidaException;
import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.exception.SensorIndisponivelException;
import br.com.back_end.simasp.leitura.dto.LeituraSensorRequest;
import br.com.back_end.simasp.leitura.dto.LeituraSensorResponse;
import br.com.back_end.simasp.leitura.entity.Leitura;
import br.com.back_end.simasp.leitura.evento.LeituraRecebidaEvent;
import br.com.back_end.simasp.leitura.repository.LeituraRepository;
import br.com.back_end.simasp.sensor.entity.Sensor;
import br.com.back_end.simasp.sensor.enums.StatusSensor;
import br.com.back_end.simasp.sensor.repository.SensorRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/**
 * Recebe as leituras do servidor do sensor (#10).
 *
 * <p>Ordem das verificações: chave ausente (401), código desconhecido (404), chave errada (401),
 * sensor inativo ou em manutenção (409). Depois de gravar, publica {@link LeituraRecebidaEvent}:
 * o recálculo da previsão e o alerta ouvem o evento depois do commit, sem atrasar a resposta.</p>
 */
@Service
public class LeituraService {

    private final LeituraRepository repository;
    private final SensorRepository sensorRepository;
    private final PasswordEncoder passwordEncoder;
    private final NivelDaAgua nivelDaAgua;
    private final ApplicationEventPublisher eventos;
    private final Clock relogio;

    public LeituraService(LeituraRepository repository, SensorRepository sensorRepository,
                          PasswordEncoder passwordEncoder, NivelDaAgua nivelDaAgua,
                          ApplicationEventPublisher eventos, Clock relogio) {
        this.repository = repository;
        this.sensorRepository = sensorRepository;
        this.passwordEncoder = passwordEncoder;
        this.nivelDaAgua = nivelDaAgua;
        this.eventos = eventos;
        this.relogio = relogio;
    }

    @Transactional
    public LeituraSensorResponse registrar(String chave, LeituraSensorRequest request) {
        if (chave == null || chave.isBlank()) {
            throw new ChaveSensorInvalidaException("Informe a chave do sensor no cabeçalho X-Sensor-Chave.");
        }
        Sensor sensor = sensorRepository.findByCodigo(request.codigo().trim()).orElseThrow(
                () -> new RecursoNaoEncontradoException("Não há sensor com o código " + request.codigo() + "."));
        if (sensor.getChaveHash() == null || !passwordEncoder.matches(chave, sensor.getChaveHash())) {
            throw new ChaveSensorInvalidaException("Chave do sensor inválida.");
        }
        if (sensor.getStatus() != StatusSensor.ATIVO) {
            throw new SensorIndisponivelException("O sensor " + sensor.getCodigo() + " está " + sensor.getStatus() + ".");
        }

        Double percentual = nivelDaAgua.percentual(request.distanciaCm(), sensor.getProfundidadeCm(), sensor.getDistanciaCheioCm());

        Leitura leitura = new Leitura();
        leitura.setSensor(sensor);
        leitura.setDistanciaCm(request.distanciaCm());
        leitura.setNivelAgua(percentual);
        leitura.setNivelRisco(nivelDaAgua.nivelRisco(percentual));
        leitura.setDataLeitura(request.medidaEm() == null
                ? LocalDateTime.now(relogio)
                : FusoHorario.paraLocal(request.medidaEm()));
        Leitura salva = repository.save(leitura);

        eventos.publishEvent(new LeituraRecebidaEvent(salva.getId(), sensor.getId(), salva.getNivelAgua(), salva.getNivelRisco()));

        return new LeituraSensorResponse(
                salva.getId(), sensor.getId(), sensor.getCodigo(), salva.getDistanciaCm(),
                salva.getNivelAgua(), salva.getNivelRisco(), nivelDaAgua.transbordando(salva.getNivelAgua()),
                FusoHorario.comFuso(salva.getDataLeitura()));
    }
}
