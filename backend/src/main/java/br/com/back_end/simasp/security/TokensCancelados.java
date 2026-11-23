package br.com.back_end.simasp.security;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Tokens que saíram pelo logout antes de vencer (#6).
 *
 * <p>Guarda o {@code jti} de cada token cancelado até o horário em que ele venceria; depois
 * disso o próprio token já é recusado pela validade e o registro sai na limpeza.
 *
 * <p>Fica em memória: ao reiniciar o backend a lista some, e um token que saiu pelo logout
 * volta a valer até vencer (no máximo {@code security.jwt.expiration-seconds}, 1 h). Para um
 * backend só, como o da banca, basta; com mais de uma instância, a lista teria de ir para o banco.
 */
@Component
public class TokensCancelados {

    private final Map<String, Instant> cancelados = new ConcurrentHashMap<>();

    public void cancelar(String jti, Instant expiraEm)
    {
        if(jti == null || jti.isBlank())
        {
            return;
        }

        cancelados.put(jti, expiraEm != null ? expiraEm : Instant.now());
    }

    public boolean estaCancelado(String jti)
    {
        return jti != null && cancelados.containsKey(jti);
    }

    /** Tira da lista os que já venceram. */
    @Scheduled(fixedDelayString = "PT10M")
    public void limpar()
    {
        Instant agora = Instant.now();
        cancelados.values().removeIf(expiraEm -> expiraEm.isBefore(agora));
    }

    int tamanho()
    {
        return cancelados.size();
    }
}
