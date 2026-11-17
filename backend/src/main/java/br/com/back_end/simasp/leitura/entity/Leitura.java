package br.com.back_end.simasp.leitura.entity;


import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;
import br.com.back_end.simasp.sensor.entity.Sensor;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Uma medida do sensor (#10). O sensor mede só a distância até a água; o nível em % e o nível
 * medido (BAIXO a CRITICO) são calculados pelo backend quando o sensor tem a profundidade e a
 * distância de cheio cadastradas.
 */
@Table(name = "TBL_LEITURA")
@Entity
@Getter
@Setter
public class Leitura {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ID_LEITURA")
    private Long id;

    @JoinColumn(name = "ID_SENSOR")
    @ManyToOne
    private Sensor sensor;

    /** Distância do sensor até a água, em cm, como o sensor mediu. */
    @Column(name = "NR_DISTANCIA_CM")
    private Double distanciaCm;

    /** Quanto do bueiro está cheio, em %. Nulo quando o sensor não tem profundidade cadastrada. */
    @Column(name = "NR_NIVEL_AGUA")
    private Double nivelAgua;

    /** Horário de São Paulo (#9). */
    @Column(name = "DT_DATA_LEITURA")
    private LocalDateTime dataLeitura = LocalDateTime.now();

    /** Nível medido. Nulo junto com o nivelAgua. */
    @Column(name = "TX_NIVEL_RISCO")
    @Enumerated(EnumType.STRING)
    private NivelRiscoEnum nivelRisco;
}
