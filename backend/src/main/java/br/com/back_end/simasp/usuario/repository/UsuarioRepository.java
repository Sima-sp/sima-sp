package br.com.back_end.simasp.usuario.repository;

import br.com.back_end.simasp.usuario.entity.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {

    boolean existsByEmailIgnoreCase(String email);
    boolean existsByTelefone(String telefone);
    Optional<Usuario> findByEmailIgnoreCase(String email);

    /**
     * Quem recebe o aviso de um alerta (#14): conta ativa, permissão de alerta ligada e
     * localização de referência a até {@code distancia_metros} do bueiro.
     */
    @Query(value = "SELECT u.ID_USUARIO FROM TBL_USUARIO u WHERE u.FL_ATIVO = TRUE AND u.FL_PERMISSAO_ALERTA = TRUE " +
            "AND ST_Distance_Sphere(POINT(u.NR_LONGITUDE, u.NR_LATITUDE), POINT(:longitude, :latitude)) <= :distancia_metros",
            nativeQuery = true)
    List<Long> buscarQuemAvisar(@Param("longitude") BigDecimal longitude, @Param("latitude") BigDecimal latitude, @Param("distancia_metros") Integer distanciaMetros);

    /** A conta existe e está ativa? (conferido em toda requisição com token, #19) */
    boolean existsByIdAndAtivoTrue(Long id);

    // Busca usuarios filtrando pelos ativos e por uma distância máxima em metros.



}
