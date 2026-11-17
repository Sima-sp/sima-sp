package br.com.back_end.simasp.ocorrencia.service;

import br.com.back_end.simasp.config.FusoHorario;
import br.com.back_end.simasp.exception.AlteracaoInvalidaException;
import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.exception.TentativasExcedidasException;
import br.com.back_end.simasp.ocorrencia.config.OcorrenciaProperties;
import br.com.back_end.simasp.ocorrencia.dto.*;
import br.com.back_end.simasp.ocorrencia.entity.Ocorrencia;
import br.com.back_end.simasp.ocorrencia.enums.SituacaoOcorrenciaEnum;
import br.com.back_end.simasp.ocorrencia.repository.OcorrenciaRepository;
import br.com.back_end.simasp.usuario.repository.UsuarioRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/** Relatos do cidadão (#15): enviar, acompanhar, mapa público e análise do admin. */
@Service
public class OcorrenciaService {

    private final OcorrenciaRepository repository;
    private final UsuarioRepository usuarioRepository;
    private final FotoService fotos;
    private final OcorrenciaProperties propriedades;
    private final Clock relogio;

    public OcorrenciaService(OcorrenciaRepository repository, UsuarioRepository usuarioRepository,
                             FotoService fotos, OcorrenciaProperties propriedades, Clock relogio)
    {
        this.repository = repository;
        this.usuarioRepository = usuarioRepository;
        this.fotos = fotos;
        this.propriedades = propriedades;
        this.relogio = relogio;
    }

    @Transactional
    public MinhaOcorrenciaResponse registrar(Long autorId, NovaOcorrenciaRequest request, MultipartFile foto)
    {
        LocalDateTime agora = LocalDateTime.now(relogio);

        long naUltimaHora = repository.countByAutorIdAndDataCriacaoAfter(autorId, agora.minusHours(1));
        if(naUltimaHora >= propriedades.limitePorHora())
        {
            throw new TentativasExcedidasException(
                    "Você já mandou " + naUltimaHora + " relatos na última hora. Tente mais tarde.", 3600);
        }

        Ocorrencia ocorrencia = new Ocorrencia();
        ocorrencia.setAutor(usuarioRepository.getReferenceById(autorId));
        ocorrencia.setTipo(request.tipo());
        ocorrencia.setDescricao(request.descricao().trim());
        ocorrencia.setLatitude(request.latitude());
        ocorrencia.setLongitude(request.longitude());
        ocorrencia.setSituacao(SituacaoOcorrenciaEnum.PENDENTE);
        ocorrencia.setDataCriacao(agora);

        if(foto != null && !foto.isEmpty())
        {
            ocorrencia.setFoto(fotos.salvar(foto));
        }

        return paraAutor(repository.save(ocorrencia));
    }

    @Transactional(readOnly = true)
    public List<MinhaOcorrenciaResponse> minhas(Long autorId)
    {
        return repository.findByAutorIdOrderByDataCriacaoDesc(autorId).stream().map(this::paraAutor).toList();
    }

    /** Mapa: aprovadas há menos de {@code ocorrencia.validade}. */
    @Transactional(readOnly = true)
    public List<OcorrenciaPublicaResponse> publicas()
    {
        LocalDateTime desde = LocalDateTime.now(relogio).minus(propriedades.validade());
        return repository.findBySituacaoAndDataAnaliseAfterOrderByDataAnaliseDesc(SituacaoOcorrenciaEnum.APROVADA, desde)
                .stream().map(this::paraPublico).toList();
    }

    @Transactional(readOnly = true)
    public List<OcorrenciaAdminResponse> paraAnalise(SituacaoOcorrenciaEnum situacao)
    {
        return repository.buscarParaAnalise(situacao).stream().map(this::paraAdmin).toList();
    }

    @Transactional
    public OcorrenciaAdminResponse analisar(Long id, Long analistaId, AnalisarOcorrenciaRequest request)
    {
        Ocorrencia ocorrencia = buscar(id);

        if(request.situacao() == SituacaoOcorrenciaEnum.PENDENTE)
        {
            throw new AlteracaoInvalidaException("Escolha APROVADA ou RECUSADA.");
        }

        String motivo = request.motivo() == null ? null : request.motivo().trim();
        if(request.situacao() == SituacaoOcorrenciaEnum.RECUSADA && (motivo == null || motivo.isEmpty()))
        {
            throw new AlteracaoInvalidaException("Informe o motivo da recusa.");
        }

        ocorrencia.setSituacao(request.situacao());
        ocorrencia.setMotivoRecusa(request.situacao() == SituacaoOcorrenciaEnum.RECUSADA ? motivo : null);
        ocorrencia.setAnalista(usuarioRepository.getReferenceById(analistaId));
        ocorrencia.setDataAnalise(LocalDateTime.now(relogio));

        return paraAdmin(ocorrencia);
    }

    /** Foto para o público: só de relato aprovado e ainda válido. */
    @Transactional(readOnly = true)
    public Optional<Path> fotoPublica(Long id)
    {
        LocalDateTime desde = LocalDateTime.now(relogio).minus(propriedades.validade());
        return repository.findById(id)
                .filter(o -> o.getSituacao() == SituacaoOcorrenciaEnum.APROVADA)
                .filter(o -> o.getDataAnalise() != null && o.getDataAnalise().isAfter(desde))
                .flatMap(o -> fotos.abrir(o.getFoto()));
    }

    @Transactional(readOnly = true)
    public Optional<Path> fotoParaAdmin(Long id)
    {
        return fotos.abrir(buscar(id).getFoto());
    }

    private Ocorrencia buscar(Long id)
    {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Ocorrência não encontrada."));
    }

    private OcorrenciaPublicaResponse paraPublico(Ocorrencia o)
    {
        return new OcorrenciaPublicaResponse(o.getId(), o.getTipo(), o.getDescricao(), o.getLatitude(), o.getLongitude(),
                FusoHorario.comFuso(o.getDataCriacao()),
                FusoHorario.comFuso(o.getDataAnalise().plus(propriedades.validade())),
                o.getFoto() == null ? null : "/ocorrencias/" + o.getId() + "/foto");
    }

    private MinhaOcorrenciaResponse paraAutor(Ocorrencia o)
    {
        return new MinhaOcorrenciaResponse(o.getId(), o.getTipo(), o.getDescricao(), o.getLatitude(), o.getLongitude(),
                o.getSituacao(), o.getMotivoRecusa(),
                FusoHorario.comFuso(o.getDataCriacao()), FusoHorario.comFuso(o.getDataAnalise()),
                o.getFoto() != null);
    }

    private OcorrenciaAdminResponse paraAdmin(Ocorrencia o)
    {
        return new OcorrenciaAdminResponse(o.getId(), o.getTipo(), o.getDescricao(), o.getLatitude(), o.getLongitude(),
                o.getSituacao(), o.getMotivoRecusa(),
                o.getAutor() == null ? null : o.getAutor().getEmail(),
                FusoHorario.comFuso(o.getDataCriacao()), FusoHorario.comFuso(o.getDataAnalise()),
                o.getFoto() == null ? null : "/admin/ocorrencias/" + o.getId() + "/foto");
    }
}
