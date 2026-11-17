package br.com.back_end.simasp.usuario.mapper;

import br.com.back_end.simasp.usuario.dto.CriarUsuarioRequest;
import br.com.back_end.simasp.usuario.dto.UsuarioResponse;
import br.com.back_end.simasp.usuario.entity.Usuario;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface UsuarioMapper {

   @Mapping(target = "tipoUsuario", ignore = true)
   @Mapping(target = "senhaHash", ignore = true) // a senha é guardada só como hash, no UsuarioService
   @Mapping(target = "id", ignore = true)
   @Mapping(target = "ativo", ignore = true)
   Usuario paraEntidadeUsuario(CriarUsuarioRequest request);

   UsuarioResponse paraUsuarioResponse(Usuario entidade);
}
