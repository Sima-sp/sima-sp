package br.com.back_end.simasp.alerta.repository;

import br.com.back_end.simasp.alerta.entity.Alerta;
import br.com.back_end.simasp.alerta.enums.StatusAlertaEnum;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AlertaRepository extends JpaRepository<Alerta, Long> {

    Optional<Alerta> findFirstBySensorIdAndStatus(Long sensorId, StatusAlertaEnum status);

    /** Alertas com o sensor junto (uma consulta), do mais novo para o mais antigo. Filtros nulos = todos. */
    @Query("""
            SELECT a FROM Alerta a
            JOIN FETCH a.sensor s
            WHERE (:status IS NULL OR a.status = :status)
              AND (:sensorId IS NULL OR s.id = :sensorId)
            ORDER BY a.dataAlerta DESC
            """)
    List<Alerta> buscar(@Param("status") StatusAlertaEnum status, @Param("sensorId") Long sensorId);
}
