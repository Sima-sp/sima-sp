package br.com.back_end.simasp.sensor.repository;

import br.com.back_end.simasp.sensor.entity.Sensor;
import br.com.back_end.simasp.sensor.enums.StatusSensor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface SensorRepository extends JpaRepository<Sensor, Long> {

    /** Os tipos têm que ser os mesmos da entidade (BigDecimal), senão o Spring Data recusa o método. */
    boolean existsByLatitudeAndLongitude(BigDecimal latitude, BigDecimal longitude);

    /** Sensor pelo código que o firmware manda (ex.: "bueiro_01"). */
    Optional<Sensor> findByCodigo(String codigo);

    boolean existsByCodigo(String codigo);

    /** Todos os sensores de uma vizinhança (pode haver vários no mesmo bairro). */
    List<Sensor> findByVizinhancaIgnoreCase(String vizinhanca);

    Page<Sensor> findByStatus(StatusSensor status, Pageable pageable);

    /**
     * Sensores com um status, a até {@code distanciaMetros} de um ponto, paginados.
     *
     * <p>Consulta nativa: {@code ST_Distance_Sphere} e {@code POINT} são funções do MySQL e não
     * existem em JPQL (o Hibernate recusaria a consulta ao subir).</p>
     */
    @Query(value = """
            SELECT *
            FROM TBL_SENSOR s
            WHERE s.TX_STATUS_SENSOR = :status
              AND ST_Distance_Sphere(POINT(s.NR_LONGITUDE, s.NR_LATITUDE), POINT(:longitude, :latitude)) <= :distanciaMetros
            """,
            countQuery = """
            SELECT COUNT(*)
            FROM TBL_SENSOR s
            WHERE s.TX_STATUS_SENSOR = :status
              AND ST_Distance_Sphere(POINT(s.NR_LONGITUDE, s.NR_LATITUDE), POINT(:longitude, :latitude)) <= :distanciaMetros
            """,
            nativeQuery = true)
    Page<Sensor> sensoresProximosPorStatus(@Param("status") String status,
                                           @Param("longitude") BigDecimal longitude,
                                           @Param("latitude") BigDecimal latitude,
                                           @Param("distanciaMetros") Integer distanciaMetros,
                                           Pageable pageable);
}
