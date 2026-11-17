package br.com.back_end.simasp.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.web.config.EnableSpringDataWebSupport;

/**
 * Páginas ({@code Page}) saem num JSON estável: {@code content} e {@code page} (número, tamanho,
 * total). Sem isto, o Spring Data serializa o objeto interno e avisa que o formato pode mudar.
 */
@Configuration
@EnableSpringDataWebSupport(pageSerializationMode = EnableSpringDataWebSupport.PageSerializationMode.VIA_DTO)
public class WebConfig {
}
