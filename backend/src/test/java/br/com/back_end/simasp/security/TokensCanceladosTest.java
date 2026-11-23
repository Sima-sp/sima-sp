package br.com.back_end.simasp.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class TokensCanceladosTest {

    @Test
    void cancelaAteVencerELimpaOsVencidos() {
        TokensCancelados lista = new TokensCancelados();

        lista.cancelar("vencido", Instant.now().minusSeconds(1));
        lista.cancelar("valendo", Instant.now().plusSeconds(3600));
        lista.cancelar(null, Instant.now().plusSeconds(3600));
        lista.cancelar(" ", Instant.now().plusSeconds(3600));

        assertThat(lista.estaCancelado("valendo")).isTrue();
        assertThat(lista.estaCancelado("outro")).isFalse();
        assertThat(lista.estaCancelado(null)).isFalse();
        assertThat(lista.tamanho()).isEqualTo(2);

        lista.limpar();

        assertThat(lista.tamanho()).isEqualTo(1);
        assertThat(lista.estaCancelado("vencido")).isFalse();
        assertThat(lista.estaCancelado("valendo")).isTrue();
    }
}
