package br.com.back_end.simasp.push.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/** Um aviso de um alerta para uma pessoa (#14). Único por alerta e pessoa. */
@Table(name = "TBL_ENVIO_PUSH")
@Entity
@Getter
@Setter
public class EnvioPush {

    public static final String ENVIANDO = "ENVIANDO";
    public static final String ENVIADO = "ENVIADO";
    public static final String FALHOU = "FALHOU";
    public static final String SEM_APARELHO = "SEM_APARELHO";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ID_ENVIO")
    private Long id;

    @Column(name = "ID_ALERTA")
    private Long alertaId;

    @Column(name = "ID_USUARIO")
    private Long usuarioId;

    @Column(name = "TX_RESULTADO")
    private String resultado;

    @Column(name = "DT_DATA_ENVIO")
    private LocalDateTime dataEnvio;
}
