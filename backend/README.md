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
| `POST /leituras` | O servidor do sensor, com a chave do sensor em `X-Sensor-Chave` |
| `GET /previsoes/**`, `GET /sensores/**` | Qualquer um (o mapa do app é público) |
| `/usuarios/me/**`, `/leituras/**`, `/alertas/**` | Quem entrou (`Authorization: Bearer <token>`) |
| `/admin/**`, `POST /previsoes/**` | Perfil ADMIN |
| Qualquer outra | Ninguém (403) |

O login devolve `{ token, tipo: "Bearer", expiraEmSegundos }`; o token traz `sub` (e-mail),
`usuarioId` e `perfil`. Os dados do usuário vêm de `GET /usuarios/me`. Sair = o app apaga o token.

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
   água com o bueiro cheio) em `PATCH /admin/sensores/modificar-sensor/{id}/bancada` (ou já no
   cadastro do sensor);
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
