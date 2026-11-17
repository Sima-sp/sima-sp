package br.com.back_end.simasp.usuario.config;

import br.com.back_end.simasp.usuario.entity.Usuario;
import br.com.back_end.simasp.usuario.enums.TipoUsuarioEnum;
import br.com.back_end.simasp.usuario.repository.UsuarioRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Locale;

/**
 * Cria o primeiro administrador ao subir o backend.
 *
 * <p>O cadastro público ({@code POST /usuarios/cadastro}) sempre cria CIDADAO, então sem isto
 * ninguém consegue usar as rotas {@code /admin/**} (inclusive o modo de demonstração). Só age se
 * {@code ADMIN_EMAIL} e {@code ADMIN_SENHA} estiverem definidos e o e-mail ainda não existir: não
 * muda senha nem perfil de quem já está no banco.</p>
 */
@Component
public class AdministradorInicial implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdministradorInicial.class);

    /** Centro de São Paulo (Praça da Sé): o administrador não precisa de localização real. */
    private static final BigDecimal LATITUDE_PADRAO = new BigDecimal("-23.550520");
    private static final BigDecimal LONGITUDE_PADRAO = new BigDecimal("-46.633308");

    private final UsuarioRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String senha;

    public AdministradorInicial(UsuarioRepository repository, PasswordEncoder passwordEncoder,
                                @Value("${admin.email:}") String email,
                                @Value("${admin.senha:}") String senha) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.email = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        this.senha = senha == null ? "" : senha;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (email.isBlank() || senha.isBlank()) {
            return;
        }
        if (senha.length() < 8) {
            log.warn("ADMIN_SENHA tem menos de 8 caracteres: administrador inicial não criado.");
            return;
        }
        if (repository.existsByEmailIgnoreCase(email)) {
            return;
        }
        Usuario admin = new Usuario();
        admin.setEmail(email);
        admin.setSenhaHash(passwordEncoder.encode(senha));
        admin.setLatitude(LATITUDE_PADRAO);
        admin.setLongitude(LONGITUDE_PADRAO);
        admin.setPermissaoAlerta(false);
        admin.setTipoUsuario(TipoUsuarioEnum.ADMIN);
        admin.setAtivo(true);
        repository.save(admin);
        log.info("Administrador inicial criado: {}", email);
    }
}
