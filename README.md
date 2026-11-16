# SIMA-SP

Sistema Inteligente de Monitoramento de Alagamentos em São Paulo. TCC.

Um sensor mede a água no bueiro, um modelo de IA estima a chance de alagamento a partir da chuva
e do lugar, o backend junta tudo e avisa, e o app mostra o mapa de risco para quem vai sair.

```
ESP32 + sensor ──▶ servidor do sensor ──▶ backend ◀──▶ serviço de IA
     iot/               iot/               backend/        ia/
                                              │
                                              ▼
                                    app (mapa)  ·  página do projeto
                                      app/            site/
```

## O que tem em cada pasta

| Pasta | O que é | Tecnologia | Como rodar |
|---|---|---|---|
| [`backend/`](backend) | API: usuários, sensores, leituras, previsões e alertas | Java 21, Spring Boot, MySQL, Flyway | [README](backend/README.md) |
| [`ia/`](ia) | Serviço que estima a chance de alagamento | Python, FastAPI, LightGBM | [README](ia/README.md) |
| [`app/`](app) | O app: mapa de risco, rotas e painel do sensor (PWA) | React, Vite, MapLibre | [README](app/README.md) |
| [`site/`](site) | Página de apresentação do projeto | Next.js (site estático) | [README](site/README.md) |
| [`iot/`](iot) | Firmware do ESP32 e servidor do sensor | Arduino (C++), Node | [README](iot/README.md) |
| [`infra/`](infra) | Docker Compose e hospedagem | Docker | [README](infra/README.md) |

Até 16/11/2026 cada pasta era um repositório separado na organização (`backend-core`,
`ml-service`, `mobile-app`, `frontend-web`, `iot-firmware` e `infra-devops`, hoje arquivados). O
histórico de commits de cada um veio junto: `git log -- app/` mostra o do app.

## No ar

- Página do projeto: https://sima-sp.github.io/sima-sp/
- App (demonstração): https://sima-sp.github.io/sima-sp/app/

Cada merge na `main` que mexe em `app/` ou `site/` publica os dois de novo
(`.github/workflows/publicar.yml`).

## Como o grupo trabalha

- Ninguém envia direto para a `main`: cada mudança vai numa branch e entra por pull request.
- Nome da branch com a área na frente ajuda a achar: `backend/login`, `app/relatos`, `ia/regra-sensor`.
- Um PR pode mexer em mais de uma pasta quando a mudança é uma só (por exemplo, um campo novo
  que o backend manda e o app mostra). É a vantagem de estar tudo junto.
- O PR só pode ser juntado com o check `ci` verde. O CI roda só as partes cujas pastas mudaram.
- O merge é sempre *squash* (um commit por PR) e a branch é apagada depois.
- Senhas e chaves ficam no `.env` de cada pasta, que nunca vai para o git; o repositório guarda
  só o `.env.example`.
- Mudou uma entidade ou tabela do backend? Migração nova em `backend/src/main/resources/db/migration`
  (nunca editar uma que já foi para a `main`).
- O Dependabot abre, às segundas, PRs com as atualizações menores de dependências.

## Tarefas

As issues ficam aqui, com uma etiqueta por área (`backend`, `ia`, `app`, `site`, `iot`, `infra`)
e uma por prioridade:

- `P1 bloqueia`: sem isso, a demonstração da banca não funciona.
- `P2 banca`: precisa estar pronto para a banca.
- `P3 depois`: depois da banca, ou trabalho futuro no TCC.

O marco "Banca 03/12 (código congela em 27/11)" reúne o que precisa entrar até o congelamento.
