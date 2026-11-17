package br.com.back_end.simasp.previsao.mapper;

import br.com.back_end.simasp.config.FusoHorario;
import br.com.back_end.simasp.leitura.entity.Leitura;
import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;
import br.com.back_end.simasp.previsao.client.dto.PrevisaoIaResponse;
import br.com.back_end.simasp.previsao.dto.PrevisaoResponse;
import br.com.back_end.simasp.previsao.entity.Previsao;
import br.com.back_end.simasp.previsao.enums.OrigemPrevisaoEnum;
import br.com.back_end.simasp.previsao.enums.StatusPrevisaoEnum;
import br.com.back_end.simasp.sensor.entity.Sensor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;

/**
 * Conversões entre a resposta do serviço de IA, a entidade e o DTO do app.
 *
 * <p>Escrito à mão (e não com MapStruct) porque tem conversão de fuso, texto para enum e
 * junção de lista em uma coluna — regras que ficam mais claras explícitas.</p>
 */
@Component
public class PrevisaoMapper {

    private static final Logger log = LoggerFactory.getLogger(PrevisaoMapper.class);
    private static final String SEPARADOR_MOTIVOS = ";";
    private static final String FONTE_CHUVA_SIMULADA = "INFORMADA";

    /** Relógio de São Paulo (#9): decide se a previsão ainda vale, mesmo num servidor em UTC. */
    private final Clock relogio;

    public PrevisaoMapper(Clock relogio) {
        this.relogio = relogio;
    }

    /** Resposta do serviço de IA → entidade pronta para salvar. */
    public Previsao paraEntidade(PrevisaoIaResponse resposta, Sensor sensor, Duration validadePadrao) {
        Previsao previsao = new Previsao();
        previsao.setSensor(sensor);
        previsao.setProbabilidadeAlagamento(resposta.probabilidadeAlagamento());
        previsao.setNivelRisco(paraNivel(resposta.nivelRisco()));
        previsao.setNivelRiscoModelo(paraNivel(resposta.nivelRiscoModelo()));
        previsao.setJanelaHoras(resposta.janelaHoras() == null ? 3 : resposta.janelaHoras());

        LocalDateTime geradaEm = paraLocal(resposta.geradaEm());
        previsao.setGeradaEm(geradaEm == null ? LocalDateTime.now(relogio) : geradaEm);
        LocalDateTime validaAte = paraLocal(resposta.validaAte());
        previsao.setValidaAte(validaAte == null ? previsao.getGeradaEm().plus(validadePadrao) : validaAte);
        previsao.setHoraReferencia(paraLocal(resposta.horaReferencia()));

        previsao.setOrigem(paraOrigem(resposta.origem()));
        previsao.setModeloVersao(resposta.modeloVersao());
        previsao.setChuvaRecente3hMm(resposta.chuvaRecente3hMm());
        previsao.setChuvaPrevista3hMm(resposta.chuvaPrevista3hMm());
        previsao.setFonteChuva(resposta.fonteChuva());
        previsao.setMedicaoTransbordando(Boolean.TRUE.equals(resposta.medicaoTransbordando()));
        previsao.setAjusteSensorAplicado(Boolean.TRUE.equals(resposta.ajusteSensorAplicado()));
        previsao.setSemLeituraSensor(Boolean.TRUE.equals(resposta.semLeituraSensor()));
        previsao.setMotivosAjuste(juntarMotivos(resposta.motivosAjuste()));
        previsao.setPontoId(resposta.pontoId());
        previsao.setDistanciaPontoM(resposta.distanciaPontoM());
        return previsao;
    }

    /** Entidade → DTO do app, com o {@code status} calculado na hora da consulta. */
    public PrevisaoResponse paraResposta(Previsao previsao) {
        return paraResposta(previsao, null);
    }

    /** Entidade + última leitura do sensor (pode ser nula) → DTO do app (#11). */
    public PrevisaoResponse paraResposta(Previsao previsao, Leitura leitura) {
        Sensor sensor = previsao.getSensor();
        return new PrevisaoResponse(
                sensor == null ? null : sensor.getId(),
                sensor == null ? null : paraDouble(sensor.getLatitude()),
                sensor == null ? null : paraDouble(sensor.getLongitude()),
                sensor == null ? null : sensor.getVizinhanca(),
                statusDe(previsao),
                previsao.getProbabilidadeAlagamento(),
                previsao.getNivelRisco(),
                previsao.getNivelRiscoModelo(),
                previsao.getJanelaHoras(),
                FusoHorario.comFuso(previsao.getGeradaEm()),
                FusoHorario.comFuso(previsao.getValidaAte()),
                FusoHorario.comFuso(previsao.getHoraReferencia()),
                previsao.getMedicaoTransbordando(),
                previsao.getAjusteSensorAplicado(),
                previsao.getSemLeituraSensor(),
                separarMotivos(previsao.getMotivosAjuste()),
                previsao.getChuvaRecente3hMm(),
                previsao.getChuvaPrevista3hMm(),
                previsao.getOrigem(),
                previsao.getModeloVersao(),
                simulada(previsao.getFonteChuva()),
                leitura == null ? null : leitura.getNivelAgua(),
                leitura == null ? null : leitura.getDistanciaCm(),
                leitura == null ? null : FusoHorario.comFuso(leitura.getDataLeitura()),
                sensor == null ? null : sensor.getStatus(),
                sensor == null ? null : sensor.getCodigo());
    }

    /** Sensor sem nenhuma previsão: o mapa mostra o ponto assim mesmo. */
    public PrevisaoResponse semPrevisao(Sensor sensor) {
        return semPrevisao(sensor, null);
    }

    /** Sensor sem previsão, com a última leitura (pode ser nula). */
    public PrevisaoResponse semPrevisao(Sensor sensor, Leitura leitura) {
        return new PrevisaoResponse(
                sensor.getId(), paraDouble(sensor.getLatitude()), paraDouble(sensor.getLongitude()),
                sensor.getVizinhanca(), StatusPrevisaoEnum.SEM_PREVISAO,
                null, null, null, null, null, null, null,
                false, false, true, List.of(), null, null, null, null, false,
                leitura == null ? null : leitura.getNivelAgua(),
                leitura == null ? null : leitura.getDistanciaCm(),
                leitura == null ? null : FusoHorario.comFuso(leitura.getDataLeitura()),
                sensor.getStatus(),
                sensor.getCodigo());
    }

    /**
     * A chuva veio no pedido, e não do Open-Meteo: é um cenário do modo de demonstração.
     * ("INFORMADA_LEGADO" não conta — é a chuva real da leitura, usada quando o Open-Meteo cai.)
     */
    public boolean simulada(String fonteChuva) {
        return FONTE_CHUVA_SIMULADA.equals(fonteChuva);
    }

    public StatusPrevisaoEnum statusDe(Previsao previsao) {
        if (previsao.getValidaAte() == null || previsao.getValidaAte().isBefore(LocalDateTime.now(relogio))) {
            return StatusPrevisaoEnum.DESATUALIZADA;
        }
        return StatusPrevisaoEnum.VALIDA;
    }

    /** "BAIXO"/"MEDIO"/"ALTO"/"CRITICO" (sem acento, como o enum do backend). */
    public NivelRiscoEnum paraNivel(String texto) {
        if (texto == null || texto.isBlank()) {
            return null;
        }
        try {
            return NivelRiscoEnum.valueOf(texto.trim().toUpperCase());
        } catch (IllegalArgumentException erro) {
            log.warn("Nível de risco desconhecido vindo do serviço de IA: {}", texto);
            return null;
        }
    }

    private OrigemPrevisaoEnum paraOrigem(String texto) {
        if (texto == null) {
            return OrigemPrevisaoEnum.REGRAS;
        }
        try {
            return OrigemPrevisaoEnum.valueOf(texto.trim().toUpperCase());
        } catch (IllegalArgumentException erro) {
            log.warn("Origem desconhecida vinda do serviço de IA: {}", texto);
            return OrigemPrevisaoEnum.REGRAS;
        }
    }

    private LocalDateTime paraLocal(OffsetDateTime instante) {
        return FusoHorario.paraLocal(instante);
    }

    private Double paraDouble(BigDecimal valor) {
        return valor == null ? null : valor.doubleValue();
    }

    private String juntarMotivos(List<String> motivos) {
        if (motivos == null || motivos.isEmpty()) {
            return null;
        }
        String texto = String.join(SEPARADOR_MOTIVOS, motivos);
        return texto.length() > 500 ? texto.substring(0, 500) : texto;
    }

    private List<String> separarMotivos(String texto) {
        if (texto == null || texto.isBlank()) {
            return List.of();
        }
        return Arrays.stream(texto.split(SEPARADOR_MOTIVOS)).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}
