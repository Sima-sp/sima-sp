package br.com.back_end.simasp.alerta.entity;

import br.com.back_end.simasp.alerta.enums.StatusAlertaEnum;
import br.com.back_end.simasp.leitura.entity.Leitura;
import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;
import br.com.back_end.simasp.sensor.entity.Sensor;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Alerta de bueiro, criado pela leitura do sensor (#13). A previsão da IA não gera alerta.
 * No máximo um ativo por sensor (índice único na coluna gerada ID_SENSOR_ATIVO, V5).
 */
@Table(name = "TBL_ALERTA")
@Entity
@Getter
@Setter

public class Alerta {

    @Id
    @GeneratedValue (strategy = GenerationType.IDENTITY)
    @Column (name = "ID_ALERTA")
    private Long id;

    /** A leitura que disparou o alerta. */
    @JoinColumn(name = "ID_LEITURA")
    @ManyToOne(fetch = FetchType.LAZY)
    private Leitura leitura;

    @JoinColumn(name = "ID_SENSOR")
    @ManyToOne
    private Sensor sensor;

    @Column(name = "TX_MENSAGEM")
    private String mensagem;

    @Column(name = "TX_STATUS")
    @Enumerated(EnumType.STRING)
    private StatusAlertaEnum status;

    @Column(name = "TX_NIVEL_RISCO")
    @Enumerated(EnumType.STRING)
    private NivelRiscoEnum nivelRisco;

    @Column(name = "DT_DATA_ALERTA")
    private LocalDateTime dataAlerta = LocalDateTime.now();

    /** Última leitura crítica enquanto o alerta está ativo: base para resolver sozinho. */
    @Column(name = "DT_ULTIMA_CRITICA")
    private LocalDateTime ultimaCritica;

    @Column(name = "DT_DATA_RESOLUCAO")
    private LocalDateTime dataResolucao;

}
