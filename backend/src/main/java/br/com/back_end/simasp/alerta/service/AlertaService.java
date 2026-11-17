package br.com.back_end.simasp.alerta.service;

import br.com.back_end.simasp.alerta.config.AlertaProperties;
import br.com.back_end.simasp.alerta.dto.AlertaResponse;
import br.com.back_end.simasp.alerta.entity.Alerta;
import br.com.back_end.simasp.alerta.enums.StatusAlertaEnum;
import br.com.back_end.simasp.alerta.evento.AlertaCriadoEvent;
import br.com.back_end.simasp.alerta.repository.AlertaRepository;
import br.com.back_end.simasp.config.FusoHorario;
import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.leitura.entity.Leitura;
import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;
import br.com.back_end.simasp.leitura.evento.LeituraRecebidaEvent;
import br.com.back_end.simasp.leitura.repository.LeituraRepository;
import br.com.back_end.simasp.sensor.entity.Sensor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Alertas a partir da leitura do sensor (#13). Regra do grupo: o alerta nasce da medição
 * (crítico ou transbordando), nunca da previsão da IA.
 *
 * <ul>
 *   <li>Leitura crítica e sensor sem alerta ativo → cria o alerta e publica {@link AlertaCriadoEvent}.</li>
 *   <li>Leitura crítica com alerta ativo → só atualiza a hora da última leitura crítica.</li>
 *   <li>Leitura abaixo do crítico com alerta ativo → resolve sozinho se a última crítica foi há
 *       mais que {@code alerta.resolver-apos}.</li>
 * </ul>
 *
 * <p>Um alerta ativo por sensor é garantido pelo banco (V5). Se duas leituras críticas
 * chegarem juntas, a segunda bate no índice único e é descartada.</p>
 */
@Service
public class AlertaService {

    private static final Logger log = LoggerFactory.getLogger(AlertaService.class);

    private final AlertaRepository repository;
    private final LeituraRepository leituraRepository;
    private final ApplicationEventPublisher eventos;
    private final Clock relogio;
    private final Duration resolverApos;

    public AlertaService(AlertaRepository repository, LeituraRepository leituraRepository,
                         ApplicationEventPublisher eventos, Clock relogio, AlertaProperties propriedades) {
        this.repository = repository;
        this.leituraRepository = leituraRepository;
        this.eventos = eventos;
        this.relogio = relogio;
        this.resolverApos = propriedades.resolverApos() == null ? Duration.ofMinutes(5) : propriedades.resolverApos();
    }

    /** Roda depois do commit da leitura, numa transação própria. */
    @TransactionalEventListener(fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void aoReceberLeitura(LeituraRecebidaEvent evento) {
        LocalDateTime agora = LocalDateTime.now(relogio);
        Optional<Alerta> ativo = repository.findFirstBySensorIdAndStatus(evento.sensorId(), StatusAlertaEnum.ATIVO);

        if (!critica(evento)) {
            ativo.ifPresent(alerta -> {
                LocalDateTime base = alerta.getUltimaCritica() != null ? alerta.getUltimaCritica() : alerta.getDataAlerta();
                if (!agora.isBefore(base.plus(resolverApos))) {
                    resolver(alerta, agora);
                    log.info("Alerta {} do sensor {} resolvido: a água baixou", alerta.getId(), evento.sensorId());
                }
            });
            return;
        }

        if (ativo.isPresent()) {
            ativo.get().setUltimaCritica(agora);
            return;
        }

        Leitura leitura = leituraRepository.findById(evento.leituraId()).orElse(null);
        if (leitura == null) {
            return;
        }
        Sensor sensor = leitura.getSensor();

        Alerta alerta = new Alerta();
        alerta.setLeitura(leitura);
        alerta.setSensor(sensor);
        alerta.setStatus(StatusAlertaEnum.ATIVO);
        alerta.setNivelRisco(NivelRiscoEnum.CRITICO);
        alerta.setMensagem(mensagem(sensor, evento));
        alerta.setDataAlerta(agora);
        alerta.setUltimaCritica(agora);
        try {
            repository.saveAndFlush(alerta);
        } catch (DataIntegrityViolationException jaExiste) {
            // Outra leitura crítica do mesmo sensor criou o alerta ao mesmo tempo: fica aquele.
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return;
        }
        log.info("Alerta {} criado para o sensor {}", alerta.getId(), sensor.getId());
        eventos.publishEvent(new AlertaCriadoEvent(alerta.getId(), sensor.getId(), alerta.getNivelRisco()));
    }

    @Transactional(readOnly = true)
    public List<AlertaResponse> listar(StatusAlertaEnum status, Long sensorId) {
        return repository.buscar(status, sensorId).stream().map(this::paraResposta).toList();
    }

    /** Pelo admin. Resolver um alerta já resolvido não muda nada. */
    @Transactional
    public AlertaResponse resolverPeloAdmin(Long id) {
        Alerta alerta = repository.findById(id).orElseThrow(
                () -> new RecursoNaoEncontradoException("O alerta com ID " + id + " não foi encontrado."));
        if (alerta.getStatus() == StatusAlertaEnum.ATIVO) {
            resolver(alerta, LocalDateTime.now(relogio));
        }
        return paraResposta(alerta);
    }

    private void resolver(Alerta alerta, LocalDateTime agora) {
        alerta.setStatus(StatusAlertaEnum.RESOLVIDO);
        alerta.setDataResolucao(agora);
    }

    private static boolean critica(LeituraRecebidaEvent evento) {
        return evento.nivelRisco() == NivelRiscoEnum.CRITICO
                || (evento.nivelAgua() != null && evento.nivelAgua() >= 100.0);
    }

    private static String mensagem(Sensor sensor, LeituraRecebidaEvent evento) {
        String nome = sensor.getVizinhanca() != null ? sensor.getVizinhanca()
                : sensor.getCodigo() != null ? sensor.getCodigo() : "sensor " + sensor.getId();
        boolean transbordando = evento.nivelAgua() != null && evento.nivelAgua() >= 100.0;
        String texto = (transbordando ? "Bueiro transbordando: " : "Bueiro em nível crítico: ") + nome;
        return texto.length() > 255 ? texto.substring(0, 255) : texto;
    }

    private AlertaResponse paraResposta(Alerta alerta) {
        Sensor sensor = alerta.getSensor();
        return new AlertaResponse(
                alerta.getId(),
                sensor == null ? null : sensor.getId(),
                sensor == null ? null : sensor.getCodigo(),
                sensor == null ? null : sensor.getVizinhanca(),
                sensor == null ? null : paraDouble(sensor.getLatitude()),
                sensor == null ? null : paraDouble(sensor.getLongitude()),
                alerta.getNivelRisco(),
                alerta.getStatus(),
                alerta.getMensagem(),
                FusoHorario.comFuso(alerta.getDataAlerta()),
                FusoHorario.comFuso(alerta.getDataResolucao()));
    }

    private static Double paraDouble(BigDecimal valor) {
        return valor == null ? null : valor.doubleValue();
    }
}
