package br.com.back_end.simasp.ocorrencia.repository;

import br.com.back_end.simasp.ocorrencia.entity.Ocorrencia;
import br.com.back_end.simasp.ocorrencia.enums.SituacaoOcorrenciaEnum;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface OcorrenciaRepository extends JpaRepository<Ocorrencia, Long> {

    /** Aprovadas depois de {@code desde}: as que ainda valem no mapa. */
    List<Ocorrencia> findBySituacaoAndDataAnaliseAfterOrderByDataAnaliseDesc(SituacaoOcorrenciaEnum situacao, LocalDateTime desde);

    List<Ocorrencia> findByAutorIdOrderByDataCriacaoDesc(Long autorId);

    long countByAutorIdAndDataCriacaoAfter(Long autorId, LocalDateTime desde);

    @Query("""
            SELECT o FROM Ocorrencia o LEFT JOIN FETCH o.autor
            WHERE (:situacao IS NULL OR o.situacao = :situacao)
            ORDER BY o.dataCriacao DESC
            """)
    List<Ocorrencia> buscarParaAnalise(@Param("situacao") SituacaoOcorrenciaEnum situacao);
}
