package br.com.back_end.simasp.sensor.service;

import br.com.back_end.simasp.exception.AlteracaoInvalidaException;
import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.sensor.dto.SensorResponse;
import br.com.back_end.simasp.sensor.enums.StatusSensor;
import br.com.back_end.simasp.sensor.mapper.SensorMapper;
import br.com.back_end.simasp.sensor.repository.SensorRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Service
public class SensorService {

    private final SensorRepository repository;
    private final SensorMapper mapper;

    public SensorService(SensorRepository repository, SensorMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    public SensorResponse buscarSensorPorId(Long id)
    {
        var sensor = repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Não há sensor com o id: " + id));
        return mapper.paraSensorResponse(sensor);
    }

    /**
     * Sensores com um status (padrão ATIVO). Com latitude e longitude, só os que estão a até
     * {@code raio} metros (padrão 2 km).
     */
    public Page<SensorResponse> buscar(BigDecimal latitude, BigDecimal longitude, Integer raio, StatusSensor status, Pageable paginacao)
    {
        StatusSensor situacao = status == null ? StatusSensor.ATIVO : status;
        if ((latitude == null) != (longitude == null))
        {
            throw new AlteracaoInvalidaException("Envie a latitude e a longitude juntas.");
        }
        if (latitude == null)
        {
            return repository.findByStatus(situacao, paginacao).map(mapper::paraSensorResponse);
        }
        int metros = raio == null ? 2000 : raio;
        return repository.sensoresProximosPorStatus(situacao.name(), longitude, latitude, metros, paginacao)
                .map(mapper::paraSensorResponse);
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
