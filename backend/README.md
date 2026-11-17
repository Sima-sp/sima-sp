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

## Rodar com Docker

```
docker build -t sima-backend .
docker run --env-file .env -p 8080:8080 sima-backend
```

A imagem roda com o perfil `prod`, em `America/Sao_Paulo` e com um usuário sem privilégio. O
banco precisa estar acessível a partir do contêiner: num MySQL do próprio computador, troque
`localhost` por `host.docker.internal` no `DB_URL`. O Docker Compose com MySQL, backend e serviço
de IA fica na pasta [`infra/`](../infra) (#60).

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Para quê |
|---|---|---|---|
| `DB_URL` | sim | — | JDBC do MySQL, com `serverTimezone=America/Sao_Paulo` |
| `DB_USERNAME`, `DB_PASSWORD` | sim | — | Usuário do banco |
| `JWT_SECRET` | sim | — | Chave do token, em Base64, 32 bytes ou mais (`openssl rand -base64 48`) |
| `CORS_ALLOWED_ORIGINS` | não | dev: `http://localhost:5173,https://sima-sp.github.io`; prod: `https://sima-sp.github.io` | Origens que podem chamar a API pelo navegador, separadas por vírgula |
| `IA_HABILITADA` | não | `true` | Desligada, o backend não chama o serviço de IA |
| `IA_URL` | não | `http://localhost:5000` | Endereço do serviço de IA |
| `IA_DEMONSTRACAO` | não | `false` | Permite o modo de demonstração (chuva simulada) |
| `ADMIN_EMAIL`, `ADMIN_SENHA` | não | vazio | Primeiro administrador, criado ao subir se ainda não existir |
| `FOTOS_DIR` | não | `./dados/fotos` (`/dados/fotos` no contêiner) | Pasta das fotos dos relatos; em produção, um volume |
| `OCORRENCIA_VALIDADE` | não | `PT24H` | Quanto tempo um relato aprovado fica no mapa |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | para o push | vazio | Chaves do Web Push (base64url) |
| `VAPID_CONTATO` | não | `mailto:contato@simasp.local` | Contato enviado aos serviços de push |
| `PUSH_RAIO_METROS` | não | `1000` | Distância máxima do bueiro para receber o aviso |
| `SPRING_PROFILES_ACTIVE` | não | `dev` (`prod` na imagem) | `dev` mostra o SQL no log |

## Pontos da capital como sensores

`docs/sensores-capital.sql` cadastra os 136 pontos monitorados da capital (os do modelo de IA)
como sensores, para o mapa inteiro mostrar a previsão real, e marca o sensor de bancada como
`bueiro_01`. Não é migração: rode à mão no banco de demonstração ou no hospedado
(`mysql -u root -p simasp_db < docs/sensores-capital.sql`). Pode rodar de novo sem duplicar.

## Acesso

A documentação completa das rotas fica no **Swagger**: `http://localhost:8080/swagger-ui.html`.
Para as rotas com login, entre em `POST /auth/login` e cole o `token` em **Authorize**. Na banca,
o Swagger serve de tela do admin (cadastrar sensor, gerar a chave, resolver alerta).

| Rota | Quem |
|---|---|
| `POST /auth/login`, `POST /usuarios` (criar conta) | Qualquer um |
| `POST /leituras` | O servidor do sensor, com a chave do sensor em `X-Sensor-Chave` |
| `GET /previsoes/**`, `GET /sensores/**`, `GET /alertas`, `GET /ocorrencias` | Qualquer um (o mapa do app é público) |
| `GET /swagger-ui.html`, `GET /v3/api-docs`, `GET /push/chave-publica` | Qualquer um |
| `GET`, `PATCH` e `DELETE /usuarios/me`, `PUT /usuarios/me/senha`, `POST /ocorrencias` | Quem entrou (`Authorization: Bearer <token>`) |
| `/admin/**`, `POST /previsoes/**` | Perfil ADMIN |
| Qualquer outra | Ninguém (403) |

O login devolve `{ token, tipo: "Bearer", expiraEmSegundos }`; o token traz `sub` (e-mail),
`usuarioId` e `perfil`. Os dados do usuário vêm de `GET /usuarios/me`. Sair = o app apaga o token.

Privacidade e abuso (#19):

- O cadastro exige `"aceiteTermos": true` (a pessoa leu para que cada dado serve); a data fica guardada.
- A localização de referência é guardada com 3 casas decimais (uns 100 m), no cadastro e no `PATCH`.
- Toda requisição com token confere se a conta ainda existe e está ativa: desativada pelo admin
  ou excluída, o token para de valer na hora (401), sem esperar vencer.
- `DELETE /usuarios/me` apaga a conta (o admin não se apaga por aqui).
- Login: 5 senhas erradas para o mesmo e-mail, ou 20 do mesmo IP, em 15 minutos → `429` com
  `Retry-After` (segundos). Um login certo zera o contador do e-mail. Ajuste em
  `auth.tentativas.*`. Em produção o IP vem do proxy (`server.forward-headers-strategy=framework`).
- Telefone: continua obrigatório e único no cadastro; se ele sai fica para o grupo decidir (#19).

Os nomes seguem uma regra só (#20): substantivo no caminho e o verbo HTTP dizendo a ação.

| Para quê | Rota |
|---|---|
| Criar conta | `POST /usuarios` |
| Ver e mudar o perfil (só os campos enviados) | `GET` e `PATCH /usuarios/me` |
| Trocar a senha | `PUT /usuarios/me/senha` |
| Excluir a própria conta | `DELETE /usuarios/me` |
| Sensores (filtros opcionais) | `GET /sensores?latitude=&longitude=&raio=&status=` |
| Um sensor; os de um bairro | `GET /sensores/{id}`; `GET /sensores/vizinhanca/{nome}` |
| Cadastrar sensor | `POST /admin/sensores` |
| Mudar status, local, código, profundidade… (só os campos enviados) | `PATCH /admin/sensores/{id}` |
| Gerar ou trocar a chave do sensor | `POST /admin/sensores/{id}/chave` |
| Ativar ou desativar conta | `PATCH /admin/usuarios/{email}` com `{ "ativo": false }` |
| Alertas | `GET /alertas?status=ATIVO`; `GET /admin/alertas`; `PATCH /admin/alertas/{id}/resolver` |
| Relatar um problema (multipart) | `POST /ocorrencias` |
| Relatos no mapa; foto | `GET /ocorrencias`; `GET /ocorrencias/{id}/foto` |
| Meus relatos | `GET /usuarios/me/ocorrencias` |
| Chave para o app se inscrever no push | `GET /push/chave-publica` |
| Inscrever ou remover o aparelho | `POST /usuarios/me/push`; `DELETE /usuarios/me/push/{id}` |
| Fila do admin; aprovar ou recusar; foto | `GET /admin/ocorrencias?situacao=PENDENTE`; `PATCH /admin/ocorrencias/{id}`; `GET /admin/ocorrencias/{id}/foto` |

## Notificação no celular (#14)

- Web Push com chaves VAPID, sem Firebase. Gere as chaves uma vez (`npx web-push generate-vapid-keys`)
  e passe em `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`. Sem elas, o push fica desligado e
  `GET /push/chave-publica` responde `503`.
- O app pega a chave pública, chama `pushManager.subscribe(...)` e manda o resultado de
  `subscription.toJSON()` para `POST /usuarios/me/push` como veio.
- Alerta criado → avisa quem tem conta ativa, `permissaoAlerta` ligada e localização de referência
  a até `PUSH_RAIO_METROS` (padrão 1000 m) do bueiro. Uma vez por alerta e pessoa (`TBL_ENVIO_PUSH`).
- Inscrição que o serviço de push diz não existir mais (404/410) fica inativa.
- Só aceita endereços dos serviços de push dos navegadores (Google, Mozilla, Apple, Microsoft).
- A cifra (RFC 8291) é feita só com o JDK; o teste confere com o exemplo da própria RFC.
- Limites: sem https o navegador não deixa inscrever; no iPhone só com o app instalado na tela
  de início (iOS 16.4 ou mais novo).
- A busca de usuários por proximidade saiu da API (`GET /admin/usuarios`): agora é só por dentro.

## Relatos do cidadão (#15)

- `POST /ocorrencias` (logado, `multipart/form-data`): `tipo` (`BUEIRO_ENTUPIDO`, `ALAGAMENTO`,
  `LIXO_NA_VIA`, `OUTRO`), `descricao` (até 500), `latitude`, `longitude` e, opcional, `foto`.
- Todo relato nasce `PENDENTE`. O admin aprova (`{"situacao":"APROVADA"}`) ou recusa com motivo
  (`{"situacao":"RECUSADA","motivo":"..."}`). Na banca, a análise é feita pelo Swagger.
- O mapa (`GET /ocorrencias`) mostra só os aprovados há menos de `OCORRENCIA_VALIDADE` (padrão 24 h),
  sem nada de quem relatou. O autor acompanha os dele em `GET /usuarios/me/ocorrencias`.
- Foto: só JPEG ou PNG de verdade (conferido pelos primeiros bytes), até 5 MB (`413` acima).
  É aberta e gravada de novo, o que apaga o EXIF (pode ter a posição de quem tirou), e reduzida
  para no máximo 1600 px. Fica em `FOTOS_DIR` (`/dados/fotos` no contêiner: monte um volume).
- Limite: 5 relatos por conta por hora (`429`).
- Conta excluída: os relatos ficam, sem autor.


## Leituras do sensor

O servidor do sensor (pasta [`iot/`](../iot)) manda cada leitura assim:

```
POST /leituras
X-Sensor-Chave: <chave do sensor>
{ "codigo": "bueiro_01", "distanciaCm": 32.4, "medidaEm": "2026-11-19T14:20:00-03:00" }
```

`medidaEm` é opcional (ausente = agora). Respostas: 201 gravou; 401 chave ausente ou errada;
404 código desconhecido; 409 sensor inativo ou em manutenção; 400 distância fora de 0–2000 cm
ou campo faltando.

Para ligar um sensor, um ADMIN:

1. cadastra o código, a profundidade (sensor até o fundo) e a distância de cheio (sensor até a
   água com o bueiro cheio) em `PATCH /admin/sensores/{id}` (ou já no cadastro do sensor);
2. gera a chave em `POST /admin/sensores/{id}/chave`. Ela aparece **só nessa resposta** (o banco
   guarda o hash); chamar de novo troca a chave.

O backend calcula o nível: `(profundidade − distância) ÷ (profundidade − cheio) × 100`, entre 0
e 100 %. 100 % é "transbordando agora". O nível medido (BAIXO a CRITICO) sai dos limites em %
de `sensor.nivel.*` no `application.properties` (hoje 50, 80 e 100). Sem profundidade, a leitura
grava só a distância.

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
