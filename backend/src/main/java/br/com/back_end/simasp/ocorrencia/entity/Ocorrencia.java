package br.com.back_end.simasp.ocorrencia.entity;

import br.com.back_end.simasp.ocorrencia.enums.SituacaoOcorrenciaEnum;
import br.com.back_end.simasp.ocorrencia.enums.TipoOcorrenciaEnum;
import br.com.back_end.simasp.usuario.entity.Usuario;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Relato do cidadão (#15). Só os aprovados e ainda válidos aparecem no mapa. */
@Table(name = "TBL_OCORRENCIA")
@Entity
@Getter
@Setter
public class Ocorrencia {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ID_OCORRENCIA")
    private Long id;

    @Column(name = "TX_TIPO")
    @Enumerated(EnumType.STRING)
    private TipoOcorrenciaEnum tipo;

    @Column(name = "TX_DESCRICAO")
    private String descricao;

    /** Nome do arquivo na pasta de fotos (sem caminho). Nulo se veio sem foto. */
    @Column(name = "TX_FOTO")
    private String foto;

    @Column(name = "NR_LATITUDE")
    private BigDecimal latitude;

    @Column(name = "NR_LONGITUDE")
    private BigDecimal longitude;

    /** Nulo se a conta foi excluída. */
    @JoinColumn(name = "ID_USUARIO")
    @ManyToOne(fetch = FetchType.LAZY)
    private Usuario autor;

    @Column(name = "TX_SITUACAO")
    @Enumerated(EnumType.STRING)
    private SituacaoOcorrenciaEnum situacao;

    @JoinColumn(name = "ID_ANALISTA")
    @ManyToOne(fetch = FetchType.LAZY)
    private Usuario analista;

    @Column(name = "DT_DATA_ANALISE")
    private LocalDateTime dataAnalise;

    @Column(name = "TX_MOTIVO_RECUSA")
    private String motivoRecusa;

    @Column(name = "DT_DATA_CRIACAO")
    private LocalDateTime dataCriacao;
}
