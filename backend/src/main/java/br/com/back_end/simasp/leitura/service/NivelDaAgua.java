package br.com.back_end.simasp.leitura.service;

import br.com.back_end.simasp.leitura.config.NivelSensorProperties;
import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;
import org.springframework.stereotype.Component;

/**
 * Do centímetro ao nível (#10).
 *
 * <pre>nível (%) = (profundidade − distância) ÷ (profundidade − distância de cheio) × 100</pre>
 *
 * limitado entre 0 e 100. Água em 100 % é "transbordando agora": medição, não previsão. O nível
 * medido sai dos limites em % de {@code sensor.nivel.*} — a única regra do sensor no sistema.
 */
@Component
public class NivelDaAgua {

    private final NivelSensorProperties.Nivel limites;

    public NivelDaAgua(NivelSensorProperties propriedades) {
        this.limites = propriedades.nivel();
    }

    /** Nível em %, ou nulo quando falta a profundidade ou a distância de cheio (ou são incoerentes). */
    public Double percentual(double distanciaCm, Double profundidadeCm, Double distanciaCheioCm) {
        if (profundidadeCm == null || distanciaCheioCm == null || profundidadeCm <= distanciaCheioCm) {
            return null;
        }
        double nivel = (profundidadeCm - distanciaCm) / (profundidadeCm - distanciaCheioCm) * 100.0;
        double limitado = Math.max(0.0, Math.min(100.0, nivel));
        return Math.round(limitado * 10.0) / 10.0;
    }

    /** Nível medido a partir do %, ou nulo sem %. */
    public NivelRiscoEnum nivelRisco(Double percentual) {
        if (percentual == null) {
            return null;
        }
        if (percentual >= limites.critico()) {
            return NivelRiscoEnum.CRITICO;
        }
        if (percentual >= limites.alto()) {
            return NivelRiscoEnum.ALTO;
        }
        if (percentual >= limites.medio()) {
            return NivelRiscoEnum.MEDIO;
        }
        return NivelRiscoEnum.BAIXO;
    }

    public boolean transbordando(Double percentual) {
        return percentual != null && percentual >= 100.0;
    }
}
