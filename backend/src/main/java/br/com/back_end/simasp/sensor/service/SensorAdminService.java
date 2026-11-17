package br.com.back_end.simasp.sensor.service;

import br.com.back_end.simasp.exception.AlteracaoInvalidaException;
import br.com.back_end.simasp.exception.LocalizacaoSensorDuplicadaException;
import br.com.back_end.simasp.exception.RecursoExistenteException;
import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.sensor.dto.AlterarBancadaSensor;
import br.com.back_end.simasp.sensor.dto.AlterarLocalizacaoSensor;
import br.com.back_end.simasp.sensor.dto.ChaveSensorResponse;
import br.com.back_end.simasp.sensor.dto.AlterarStatusSensor;
import br.com.back_end.simasp.sensor.dto.SensorRequest;
import br.com.back_end.simasp.sensor.dto.SensorResponse;
import br.com.back_end.simasp.sensor.entity.Sensor;
import br.com.back_end.simasp.sensor.mapper.SensorMapper;
import br.com.back_end.simasp.sensor.repository.SensorRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.util.Base64;

@Service
public class SensorAdminService {

    @Autowired
    private SensorRepository repository;

    @Autowired
    private SensorMapper mapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final SecureRandom aleatorio = new SecureRandom();


    // Cadastra um sensor
    public SensorResponse cadastrarSensor(SensorRequest request) {

        // Dois sensores no mesmo ponto não fazem sentido (e o banco recusa: UQ_LOCALIZACAO_SENSOR).
        // Vários sensores no mesmo bairro são normais: os pontos do modelo de IA têm vários por bairro.
        if (repository.existsByLatitudeAndLongitude(request.latitude(), request.longitude()))
        {
            throw new LocalizacaoSensorDuplicadaException("Já existe um sensor na latitude " + request.latitude() + " e longitude " + request.longitude() + ".");
        }

        if (request.codigo() != null && repository.existsByCodigo(request.codigo()))
        {
            throw new RecursoExistenteException("Já existe um sensor com o código " + request.codigo() + ".");
        }
        validarBancada(request.profundidadeCm(), request.distanciaCheioCm());

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




    /** Código, profundidade e distância de cheio (#10). Campo nulo não muda. */
    @Transactional
    public SensorResponse atualizarBancada(Long id, AlterarBancadaSensor request)
    {
        var sensor = repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Sensor com id: " + id + "."));

        if (request.codigo() != null && !request.codigo().equals(sensor.getCodigo()))
        {
            if (repository.existsByCodigo(request.codigo()))
            {
                throw new RecursoExistenteException("Já existe um sensor com o código " + request.codigo() + ".");
            }
            sensor.setCodigo(request.codigo());
        }
        Double profundidade = request.profundidadeCm() != null ? request.profundidadeCm() : sensor.getProfundidadeCm();
        Double cheio = request.distanciaCheioCm() != null ? request.distanciaCheioCm() : sensor.getDistanciaCheioCm();
        validarBancada(profundidade, cheio);
        sensor.setProfundidadeCm(profundidade);
        sensor.setDistanciaCheioCm(cheio);

        return mapper.paraSensorResponse(sensor);
    }

    /**
     * Gera a chave do sensor para o {@code X-Sensor-Chave} (#10). Devolve a chave uma vez e guarda
     * só o hash; chamar de novo troca a chave (a anterior para de valer).
     */
    @Transactional
    public ChaveSensorResponse gerarChave(Long id)
    {
        var sensor = repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Sensor com id: " + id + "."));
        if (sensor.getCodigo() == null)
        {
            throw new AlteracaoInvalidaException("Cadastre o código do sensor antes de gerar a chave.");
        }

        byte[] bytes = new byte[24];
        aleatorio.nextBytes(bytes);
        String chave = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sensor.setChaveHash(passwordEncoder.encode(chave));

        return new ChaveSensorResponse(sensor.getId(), sensor.getCodigo(), chave);
    }

    private void validarBancada(Double profundidadeCm, Double distanciaCheioCm)
    {
        if (profundidadeCm != null && distanciaCheioCm != null && distanciaCheioCm >= profundidadeCm)
        {
            throw new AlteracaoInvalidaException("A distância de cheio precisa ser menor que a profundidade.");
        }
    }
}
