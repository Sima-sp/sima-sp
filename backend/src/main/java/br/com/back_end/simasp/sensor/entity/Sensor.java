package br.com.back_end.simasp.sensor.entity;

import br.com.back_end.simasp.sensor.enums.StatusSensor;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Table(name = "TBL_SENSOR")
@Entity
@Getter
@Setter

public class Sensor {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column (name = "ID_SENSOR")
    private Long id;

    @Column (name = "NR_LATITUDE")
    private BigDecimal latitude;

    @Column (name = "NR_LONGITUDE")
    private BigDecimal longitude;

    @Column (name = "TX_VIZINHANCA")
    private String vizinhanca;

    @Column (name = "TX_STATUS_SENSOR")
    @Enumerated(EnumType.STRING)
    private StatusSensor status = StatusSensor.ATIVO;

    /** Código que o firmware manda (ex.: "bueiro_01"). Único; nulo nos sensores sem placa. */
    @Column (name = "TX_CODIGO")
    private String codigo;

    /** Distância do sensor até o fundo, em cm (água em 0 %). */
    @Column (name = "NR_PROFUNDIDADE_CM")
    private Double profundidadeCm;

    /** Distância do sensor até a água com o bueiro cheio, em cm (água em 100 %). */
    @Column (name = "NR_DISTANCIA_CHEIO_CM")
    private Double distanciaCheioCm;

    /** Hash da chave do sensor ({@code X-Sensor-Chave}). A chave em si nunca é guardada. */
    @Column (name = "TX_CHAVE_HASH")
    private String chaveHash;

    @Column (name = "DT_DATA_INSTALACAO")
    private LocalDateTime dataInstalacao = LocalDateTime.now();
}


