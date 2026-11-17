package br.com.back_end.simasp.security;

import br.com.back_end.simasp.exception.TentativasExcedidasException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limite de tentativas de login erradas (#19), para dificultar adivinhar senha.
 *
 * <p>Conta por e-mail (padrão 5 erros) e por IP (padrão 20 erros) dentro de uma janela
 * (padrão 15 minutos). Passou do limite, o login responde 429 até a janela acabar, mesmo
 * com a senha certa. Um login certo zera o contador daquele e-mail.
 *
 * <p>Fica em memória: basta para um servidor só (o caso do projeto) e zera quando reinicia.
 * Atrás de proxy, o IP certo depende de {@code server.forward-headers-strategy=framework}.
 */
@Component
public class LimiteDeTentativas {

    private static final int LIMPAR_ACIMA_DE = 10_000;

    private final Clock relogio;
    private final int maximoPorConta;
    private final int maximoPorIp;
    private final Duration janela;

    private final Map<String, Contador> porConta = new ConcurrentHashMap<>();
    private final Map<String, Contador> porIp = new ConcurrentHashMap<>();

    public LimiteDeTentativas(Clock relogio,
                              @Value("${auth.tentativas.por-conta:5}") int maximoPorConta,
                              @Value("${auth.tentativas.por-ip:20}") int maximoPorIp,
                              @Value("${auth.tentativas.janela:PT15M}") Duration janela)
    {
        this.relogio = relogio;
        this.maximoPorConta = maximoPorConta;
        this.maximoPorIp = maximoPorIp;
        this.janela = janela;
    }

    /** Antes de conferir a senha: lança 429 se o e-mail ou o IP já passaram do limite. */
    public void verificar(String email, String ip)
    {
        Instant agora = relogio.instant();
        long espera = Math.max(
                restante(porConta.get(chave(email)), maximoPorConta, agora),
                restante(porIp.get(ip), maximoPorIp, agora));

        if(espera > 0)
        {
            throw new TentativasExcedidasException(
                    "Muitas tentativas de login. Tente de novo em alguns minutos.", espera);
        }
    }

    public void registrarFalha(String email, String ip)
    {
        Instant agora = relogio.instant();
        limparSePreciso(agora);
        somar(porConta, chave(email), agora);
        somar(porIp, ip, agora);
    }

    public void registrarSucesso(String email)
    {
        porConta.remove(chave(email));
    }

    private void somar(Map<String, Contador> mapa, String chave, Instant agora)
    {
        if(chave == null)
        {
            return;
        }

        mapa.compute(chave, (k, atual) ->
                atual == null || atual.venceu(agora, janela) ? new Contador(agora, 1) : new Contador(atual.inicio(), atual.falhas() + 1));
    }

    /** Segundos até liberar (0 se está liberado). */
    private long restante(Contador contador, int maximo, Instant agora)
    {
        if(contador == null || contador.venceu(agora, janela) || contador.falhas() < maximo)
        {
            return 0;
        }

        return Math.max(1, Duration.between(agora, contador.inicio().plus(janela)).toSeconds());
    }

    private void limparSePreciso(Instant agora)
    {
        if(porConta.size() + porIp.size() > LIMPAR_ACIMA_DE)
        {
            porConta.values().removeIf(c -> c.venceu(agora, janela));
            porIp.values().removeIf(c -> c.venceu(agora, janela));
        }
    }

    private static String chave(String email)
    {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    private record Contador(Instant inicio, int falhas) {
        boolean venceu(Instant agora, Duration janela)
        {
            return !agora.isBefore(inicio.plus(janela));
        }
    }
}
