package br.com.back_end.simasp.ocorrencia.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.time.Duration;

/**
 * Regras dos relatos (#15).
 *
 * @param pastaFotos   onde as fotos ficam; em produção, um volume que sobrevive a uma nova versão
 * @param validade     quanto tempo um relato aprovado fica no mapa, contado da aprovação
 * @param limitePorHora quantos relatos uma conta pode mandar por hora
 */
@ConfigurationProperties(prefix = "ocorrencia")
public record OcorrenciaProperties(Path pastaFotos, Duration validade, int limitePorHora) {
}
