# SIMA-SP · backend

API do SIMA-SP (Sistema Inteligente de Monitoramento de Alagamentos em São Paulo), TCC.
Recebe os sensores, guarda leituras e previsões e serve o app e o site.

- Java 21, Spring Boot, Spring Data JPA, Spring Security
- MySQL 8, com o esquema versionado pelo Flyway (`src/main/resources/db/migration`)
- Serviço de IA à parte: pasta [`ia/`](../ia) deste repositório

## Rodar

1. Um MySQL 8 com um banco vazio. Com Docker:

   ```
   docker run -d --name sima-mysql -p 3306:3306 \
     -e MYSQL_DATABASE=simasp_db -e MYSQL_USER=simasp_user \
     -e MYSQL_PASSWORD=simasp_password -e MYSQL_ROOT_PASSWORD=root mysql:8.4
   ```

2. Copie `.env.example` para `.env` e preencha. O `JWT_SECRET` precisa estar em Base64 e ter pelo
   menos 32 bytes: `openssl rand -base64 48`. O `.env` não vai para o git.
   Para ter um administrador (as rotas `/admin/**` e o modo de demonstração exigem), defina
   `ADMIN_EMAIL` e `ADMIN_SENHA` (8 caracteres ou mais): ele é criado ao subir, se o e-mail ainda
   não existir.
3. `./mvnw spring-boot:run` (porta 8080).

## Acesso

| Rota | Quem |
|---|---|
| `POST /auth/login`, `POST /usuarios/cadastro` | Qualquer um |
| `GET /previsoes/**`, `GET /sensores/**` | Qualquer um (o mapa do app é público) |
| `/usuarios/me/**`, `/leituras/**`, `/alertas/**` | Quem entrou (`Authorization: Bearer <token>`) |
| `/admin/**`, `POST /previsoes/**` | Perfil ADMIN |
| Qualquer outra | Ninguém (403) |

O login devolve `{ token, tipo: "Bearer", expiraEmSegundos }`; o token traz `sub` (e-mail),
`usuarioId` e `perfil`. Os dados do usuário vêm de `GET /usuarios/me`. Sair = o app apaga o token.

## Testes

`./mvnw verify`. Os testes que sobem o backend (contexto e `AutenticacaoIntegracaoTest`) precisam do
MySQL do passo 1 e das variáveis do `.env`.

## Como o grupo trabalha

- Ninguém envia direto para a `main`: cada mudança vai numa branch (`feat/...`, `fix/...`) e entra
  por pull request.
- O PR só pode ser juntado com o CI passando (job `ci`: build e testes com MySQL de teste).
- O merge é sempre *squash* (um commit por PR) e a branch é apagada depois.
- Mudou uma entidade ou tabela? Crie uma migração nova (`V<n>__descricao.sql`). Uma migração que já
  está na `main` nunca é editada.
- O Dependabot abre, às segundas, um PR com as atualizações menores de dependências.
