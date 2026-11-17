package br.com.back_end.simasp.sensor.service;

import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.sensor.dto.SensorResponse;
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

    // Todos os sensores de uma vizinhança (um bairro pode ter vários)
    public List<SensorResponse> buscarSensoresPorVizinhanca(String vizinhanca)
    {
        var sensores = repository.findByVizinhancaIgnoreCase(vizinhanca.trim());

        if (sensores.isEmpty())
        {
            throw new RecursoNaoEncontradoException("Nenhum sensor na vizinhança " + vizinhanca + ".");
        }

        return sensores.stream().map(mapper::paraSensorResponse).toList();
    }
}
