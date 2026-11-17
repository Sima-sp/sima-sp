package br.com.back_end.simasp.sensor.service;

import br.com.back_end.simasp.exception.LocalizacaoSensorDuplicadaException;
import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.sensor.dto.AlterarLocalizacaoSensor;
import br.com.back_end.simasp.sensor.dto.AlterarStatusSensor;
import br.com.back_end.simasp.sensor.dto.SensorRequest;
import br.com.back_end.simasp.sensor.dto.SensorResponse;
import br.com.back_end.simasp.sensor.entity.Sensor;
import br.com.back_end.simasp.sensor.mapper.SensorMapper;
import br.com.back_end.simasp.sensor.repository.SensorRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
public class SensorAdminService {

    @Autowired
    private SensorRepository repository;

    @Autowired
    private SensorMapper mapper;


    // Cadastra um sensor
    public SensorResponse cadastrarSensor(SensorRequest request) {

        // Dois sensores no mesmo ponto não fazem sentido (e o banco recusa: UQ_LOCALIZACAO_SENSOR).
        // Vários sensores no mesmo bairro são normais: os pontos do modelo de IA têm vários por bairro.
        if (repository.existsByLatitudeAndLongitude(request.latitude(), request.longitude()))
        {
            throw new LocalizacaoSensorDuplicadaException("Já existe um sensor na latitude " + request.latitude() + " e longitude " + request.longitude() + ".");
        }

        Sensor sensor = repository.save(mapper.requestParaSensorEntidade(request));

        return mapper.paraSensorResponse(sensor);
    }

    // Traz sensores em manutenção que estão dentro de um alcance máximo em metros num local específico
    public Page<SensorResponse> buscarSensoresEmManutencaoProximos(BigDecimal longitude, BigDecimal latitude, Integer distanciaMetros, Pageable paginacao)
    {
        var sensores = repository.sensoresManutencaoProximosDistancia(longitude, latitude, distanciaMetros, paginacao);

        return sensores.map(mapper::paraSensorResponse);
    }

    // Traz sensores inativos que estão dentro de um alcance máximo em metros num local específico
    public Page<SensorResponse> buscarSensoresInativosProximos(BigDecimal longitude, BigDecimal latitude, Integer distanciaMetros, Pageable paginacao)
    {
        var sensores = repository.sensoresInativosProximosDistancia(longitude, latitude, distanciaMetros, paginacao);

        return sensores.map(mapper::paraSensorResponse);
    }

    @Transactional
    public void atualizarLocalizacaoSensor(Long id, AlterarLocalizacaoSensor request)
    {
        var sensor = repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Sensor com id: " + id + "."));

        sensor.setLatitude(request.latitude());
        sensor.setLongitude(request.longitude());
        sensor.setVizinhanca(request.vizinhanca());
    }

    @Transactional
    public void atualizarStatusSensor(Long id, AlterarStatusSensor request)
    {
        var sensor = repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Sensor com id: " + id + "."));

        sensor.setStatus(request.status());
    }



}
