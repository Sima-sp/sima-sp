package br.com.back_end.simasp.sensor.service;

import br.com.back_end.simasp.exception.LocalizacaoSensorDuplicadaException;
import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.sensor.dto.SensorRequest;
import br.com.back_end.simasp.sensor.dto.SensorResponse;
import br.com.back_end.simasp.sensor.entity.Sensor;
import br.com.back_end.simasp.sensor.mapper.SensorMapper;
import br.com.back_end.simasp.sensor.repository.SensorRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Service

public class SensorService {
    @Autowired
    private SensorRepository repository;

    @Autowired
    private SensorMapper mapper;

    // Busca todos os sensores
    /*
    public List<SensorResponse> buscarSensores()
    {
        return repository.findAll().stream().map(mapper::paraSensorResponse).toList();
    }
    */

    // Busca sensor por ID
    public SensorResponse buscarSensorPorId(Long id)
    {
        var sensor = repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Não há sensor com o id: " + id));
        return mapper.paraSensorResponse(sensor);
    }

    // Traz sensores ativos que estão dentro de um alcance máximo em metros num local específico
    public Page<SensorResponse> buscarSensoresAtivosProximos(BigDecimal longitude, BigDecimal latitude, Integer distanciaMetros, Pageable paginacao)
    {
        var sensores = repository.sensoresAtivosProximosDistancia(longitude, latitude, distanciaMetros, paginacao);

        return sensores.map(mapper::paraSensorResponse);
    }

    public SensorResponse buscarSensorPorVizinhanca(String vizinhanca)
    {
        var sensor = repository.buscarSensorPorVizinhanca(vizinhanca).orElseThrow(() -> new RecursoNaoEncontradoException("Sensor com a vizinhança " + vizinhanca + " não encontrado."));

        return mapper.paraSensorResponse(sensor);
    }

}
