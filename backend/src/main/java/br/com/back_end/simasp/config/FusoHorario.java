package br.com.back_end.simasp.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.TimeZone;

/**
 * O backend inteiro trabalha no horário de São Paulo, qualquer que seja o relógio do servidor
 * (num contêiner ou na nuvem ele costuma estar em UTC). Issue #9.
 *
 * <ul>
 *   <li>a JVM usa {@code America/Sao_Paulo} (também em {@code SimaspApplication.main});</li>
 *   <li>quem decide algo pelo horário recebe o {@link Clock} deste arquivo, e não chama
 *       {@code LocalDateTime.now()} direto — assim o teste consegue fixar o relógio;</li>
 *   <li>o banco guarda {@code DATETIME} sem fuso, sempre no horário de São Paulo; a API devolve
 *       as datas com o fuso ({@code 2026-11-16T14:20:00-03:00}).</li>
 * </ul>
 */
@Configuration
@EnableAsync
public class FusoHorario {

    public static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    static {
        TimeZone.setDefault(TimeZone.getTimeZone(FUSO));
    }

    @Bean
    public Clock relogio() {
        return Clock.system(FUSO);
    }

    /** Data do banco (horário de São Paulo, sem fuso) → data com fuso, para a API. */
    public static OffsetDateTime comFuso(LocalDateTime local) {
        return local == null ? null : local.atZone(FUSO).toOffsetDateTime();
    }

    /** Data com fuso (vinda de fora) → horário de São Paulo, para o banco. */
    public static LocalDateTime paraLocal(OffsetDateTime instante) {
        return instante == null ? null : instante.atZoneSameInstant(FUSO).toLocalDateTime();
    }
}
