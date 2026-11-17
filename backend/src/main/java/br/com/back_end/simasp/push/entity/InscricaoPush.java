package br.com.back_end.simasp.push.entity;

import br.com.back_end.simasp.usuario.entity.Usuario;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/** Um aparelho inscrito para receber avisos (#14). */
@Table(name = "TBL_INSCRICAO_PUSH")
@Entity
@Getter
@Setter
public class InscricaoPush {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ID_INSCRICAO")
    private Long id;

    @JoinColumn(name = "ID_USUARIO")
    @ManyToOne(fetch = FetchType.LAZY)
    private Usuario usuario;

    /** Endereço do serviço de push do navegador (Google, Mozilla, Apple, Microsoft). */
    @Column(name = "TX_ENDPOINT")
    private String endpoint;

    @Column(name = "TX_CHAVE_P256DH")
    private String p256dh;

    @Column(name = "TX_CHAVE_AUTH")
    private String auth;

    @Column(name = "FL_ATIVA")
    private Boolean ativa;

    @Column(name = "DT_DATA_CRIACAO")
    private LocalDateTime dataCriacao;
}
