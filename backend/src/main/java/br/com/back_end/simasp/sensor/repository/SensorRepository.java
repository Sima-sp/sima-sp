package br.com.back_end.simasp.sensor.repository;

import br.com.back_end.simasp.sensor.entity.Sensor;
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

public interface SensorRepository extends JpaRepository <Sensor, Long> {

    boolean existsByLatitudeAndLongitude(BigDecimal latitude, BigDecimal longitude);
    boolean existsByVizinhanca(String vizinhanca);



    // Busca sensores filtrando pelos ativos e por uma distância máxima em metros.
    @Query(value = "SELECT s FROM Sensor s WHERE ST_Distance_Sphere(POINT(s.longitude, s.latitude), POINT(:longitude_usuario, :latitude_usuario)) <= :distancia_metros AND s.status = 'ATIVO'",
            countQuery = "SELECT COUNT(*) FROM Sensor s WHERE ST_Distance_Sphere(POINT(s.longitude, s.latitude), POINT(:longitude_usuario, :latitude_usuario)) <= :distancia_metros AND s.status = 'ATIVO'")
    Page<Sensor> sensoresAtivosProximosDistancia(@Param("longitude_usuario") BigDecimal longitude, @Param("latitude_usuario") BigDecimal latitude, @Param("distancia_metros") Integer distanciaMetros, Pageable pageable);

    // Busca sensores filtrando por status de sensor em MANUTENÇÃO
    @Query(value = "SELECT s FROM Sensor s WHERE ST_Distance_Sphere(POINT(s.longitude, s.latitude), POINT(:longitude_usuario, :latitude_usuario)) <= :distancia_metros AND s.status = 'MANUTENCAO'",
            countQuery = "SELECT COUNT(*) FROM Sensor s WHERE ST_Distance_Sphere(POINT(s.longitude, s.latitude), POINT(:longitude_usuario, :latitude_usuario)) <= :distancia_metros AND s.status = 'MANUTENCAO'")
    Page<Sensor> sensoresManutencaoProximosDistancia(@Param("longitude_usuario") BigDecimal longitude, @Param("latitude_usuario") BigDecimal latitude, @Param("distancia_metros") Integer distanciaMetros, Pageable pageable);

    // Busca sensores filtrando por status de sensor em INATIVO
    @Query(value = "SELECT s FROM Sensor s WHERE ST_Distance_Sphere(POINT(s.longitude, s.latitude), POINT(:longitude_usuario, :latitude_usuario)) <= :distancia_metros AND s.status = 'INATIVO'",
    countQuery = "SELECT COUNT(*) FROM Sensor s WHERE ST_Distance_Sphere(POINT(s.longitude, s.latitude), POINT(:longitude_usuario, :latitude_usuario)) <= :distancia_metros AND s.status = 'INATIVO'")
    Page<Sensor> sensoresInativosProximosDistancia(@Param("longitude_usuario") BigDecimal longitude, @Param("latitude_usuario") BigDecimal latitude, @Param("distancia_metros") Integer distanciaMetros, Pageable pageable);

    @Query(value = "SELECT s FROM Sensor s WHERE s.vizinhanca = :vizinhanca")
    Optional<Sensor> buscarSensorPorVizinhanca(@Param("vizinhanca") String vizinhanca);

}
