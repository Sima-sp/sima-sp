package br.com.back_end.simasp.push.repository;

import br.com.back_end.simasp.push.entity.InscricaoPush;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InscricaoPushRepository extends JpaRepository<InscricaoPush, Long> {

    Optional<InscricaoPush> findByEndpoint(String endpoint);

    List<InscricaoPush> findByUsuarioIdAndAtivaTrue(Long usuarioId);

    Optional<InscricaoPush> findByIdAndUsuarioId(Long id, Long usuarioId);
}
