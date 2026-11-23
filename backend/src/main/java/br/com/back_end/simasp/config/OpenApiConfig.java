package br.com.back_end.simasp.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger (#20): {@code /swagger-ui.html}. O botão "Authorize" recebe o token de
 * {@code POST /auth/login}; na banca, serve de tela do admin (cadastrar sensor, gerar chave,
 * resolver alerta).
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI documentacao() {
        return new OpenAPI()
                .info(new Info()
                        .title("SIMA-SP")
                        .version("1")
                        .description("Sistema Inteligente de Monitoramento de Alagamentos em São Paulo (TCC). "
                                + "Entre em POST /auth/login e cole o token em Authorize. "
                                + "O servidor do sensor usa o cabeçalho X-Sensor-Chave em POST /leituras."))
                .components(new Components().addSecuritySchemes("token",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("token"));
    }
}
