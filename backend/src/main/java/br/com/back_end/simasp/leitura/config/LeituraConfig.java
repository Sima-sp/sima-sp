package br.com.back_end.simasp.leitura.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(NivelSensorProperties.class)
public class LeituraConfig {
}
