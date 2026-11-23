package br.com.back_end.simasp.sensor.service;

import br.com.back_end.simasp.exception.AlteracaoInvalidaException;
import br.com.back_end.simasp.exception.LocalizacaoSensorDuplicadaException;
import br.com.back_end.simasp.exception.RecursoExistenteException;
import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.sensor.dto.AtualizarSensorRequest;
import br.com.back_end.simasp.sensor.dto.ChaveSensorResponse;
import br.com.back_end.simasp.sensor.dto.SensorRequest;
import br.com.back_end.simasp.sensor.dto.SensorResponse;
import br.com.back_end.simasp.sensor.entity.Sensor;
import br.com.back_end.simasp.sensor.mapper.SensorMapper;
import br.com.back_end.simasp.sensor.repository.SensorRepository;
import org.springframework.beans.factory.annotation.Autowired;
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

    /** {@code PATCH /admin/sensores/{id}}: só os campos enviados mudam (#20). */
    @Transactional
    public SensorResponse atualizarSensor(Long id, AtualizarSensorRequest request)
    {
        var sensor = repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Sensor com id: " + id + "."));

        if ((request.latitude() == null) != (request.longitude() == null))
        {
            throw new AlteracaoInvalidaException("Envie a latitude e a longitude juntas.");
        }
        if (request.latitude() != null
                && !(request.latitude().compareTo(sensor.getLatitude()) == 0 && request.longitude().compareTo(sensor.getLongitude()) == 0))
        {
            if (repository.existsByLatitudeAndLongitude(request.latitude(), request.longitude()))
            {
                throw new LocalizacaoSensorDuplicadaException("Já existe um sensor na latitude " + request.latitude() + " e longitude " + request.longitude() + ".");
            }
            sensor.setLatitude(request.latitude());
            sensor.setLongitude(request.longitude());
        }
        if (request.vizinhanca() != null)
        {
            sensor.setVizinhanca(request.vizinhanca());
        }
        if (request.status() != null)
        {
            sensor.setStatus(request.status());
        }
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
