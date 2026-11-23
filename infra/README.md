# SIMA-SP · infraestrutura

Sobe o SIMA-SP completo com um comando: MySQL, serviço de IA ([`ia/`](../ia)) e backend
([`backend/`](../backend)) (#60). É a base da hospedagem (#61) e o **plano B da banca**: tudo no
notebook, sem depender da nuvem.

| Serviço | De onde vem | Porta no computador |
|---|---|---|
| `mysql` | `mysql:8.4`, dados num volume | nenhuma (só o backend fala com ele) |
| `ia` | imagem gerada de `ia/` | nenhuma (o serviço não tem login) |
| `backend` | imagem gerada de `backend/`, fotos dos relatos num volume | `8080` |
| `dados` | roda `backend/docs/sensores-capital.sql` depois que o backend criou as tabelas, e sai | — |

Todos em `America/Sao_Paulo`. O backend só sobe depois do banco e da IA ficarem prontos.

Fica de fora: o **servidor do sensor** (Node, [`iot/servidor-sensor`](../iot)), que roda ao lado
do ESP32, e o **app** e a **página do projeto**, que ficam no GitHub Pages.

## Subir

Precisa de Docker (no Windows e no Mac, o Docker Desktop).

```
cd infra
./gerar-env.sh admin@exemplo.com     # cria o .env com senhas novas; ou copie .env.example e preencha
docker compose up -d --build
docker compose ps                    # mysql, ia e backend "healthy"; dados "exited (0)"
```

A primeira vez baixa as imagens e compila o backend e a IA (uns 10 minutos, com internet). Depois
disso tudo fica no computador e sobe em menos de 1 minuto.

- Swagger: http://localhost:8080/swagger-ui.html
- Previsões: http://localhost:8080/previsoes
- `docker compose logs -f backend` mostra o log; `docker compose down` para tudo e guarda os
  dados; `docker compose down -v` apaga o banco e as fotos.

O `.env` não vai para o git. Para gerar à mão: `openssl rand -base64 48` para o `JWT_SECRET` e
`npx web-push generate-vapid-keys` para as chaves do push. O `gerar-env.sh` precisa de bash (no
Windows, o Git Bash).

## Plano B no notebook da banca

Ensaiar **no notebook que vai à banca**, com tudo já baixado antes do dia.

1. **Sistema:** `docker compose up -d` nesta pasta.
2. **Sensor de bancada:** no Swagger, entre com o admin do `.env` (`POST /auth/login`, cole o
   token em **Authorize**) e:
   - ache o id do `bueiro_01` em `GET /sensores?size=200` (procure `"codigo": "bueiro_01"`);
   - cadastre as medidas do balde (#55): `PATCH /admin/sensores/{id}` com
     `{"profundidadeCm": <fundo>, "distanciaCheioCm": <cheio>}`;
   - gere a chave: `POST /admin/sensores/{id}/chave`.
3. **Servidor do sensor:** em `iot/servidor-sensor/.env`, `BACKEND_URL=http://localhost:8080` e a
   chave em `SENSOR_CHAVE`; depois `npm start`. Em `http://localhost:3000/api/estado` deve aparecer
   `"backend": "ligado"`.
4. **App:** o app do GitHub Pages abre em https e o navegador não deixa ele chamar um backend em
   http no notebook. Na banca, rode o app no próprio notebook, que repassa `/api` ao backend:

   ```
   cd app
   echo VITE_API_URL=/api > .env.local
   npm run dev:rede        # http://localhost:5173, e pelo celular na mesma rede: http://<ip do notebook>:5173
   ```

   A notificação no celular precisa de https, então ela não funciona neste modo: o alerta aparece
   dentro do app.
5. **Sem chuva real ou sem internet:** ligue a chuva de teste no Swagger,
   `POST /admin/demonstracao/iniciar` com `{"cenario": "CHUVA_FORTE", "minutos": 60}`. O mapa
   precisa de internet para as imagens (use o celular roteando).

## Testado no CI

O job `infra` do CI sobe este Compose do zero a cada mudança nesta pasta e confere: os 136 pontos
cadastrados com os nomes certos, o login do admin e `GET /previsoes` respondendo.
