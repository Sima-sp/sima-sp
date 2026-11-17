package br.com.back_end.simasp.alerta.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * {@code alerta.resolver-apos}: o alerta se resolve sozinho quando chega uma leitura abaixo do
 * crítico e a última leitura crítica foi há mais que isso. O admin pode resolver antes.
 */
@ConfigurationProperties(prefix = "alerta")
public record AlertaProperties(Duration resolverApos) {
}
