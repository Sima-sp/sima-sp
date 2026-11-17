package br.com.back_end.simasp.push.repository;

import br.com.back_end.simasp.push.entity.EnvioPush;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EnvioPushRepository extends JpaRepository<EnvioPush, Long> {

    boolean existsByAlertaIdAndUsuarioId(Long alertaId, Long usuarioId);

    List<EnvioPush> findByAlertaId(Long alertaId);
}
