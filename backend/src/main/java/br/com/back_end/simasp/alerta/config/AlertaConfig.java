package br.com.back_end.simasp.alerta.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(AlertaProperties.class)
public class AlertaConfig {
}
