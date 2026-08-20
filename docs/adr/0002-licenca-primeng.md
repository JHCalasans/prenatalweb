# ADR 0002 — Permanecer na última versão MIT do PrimeNG (21.x)

## Status

Aceito — 2026-08-20, durante a finalização da W0 (tokens do tema Aconchego).

## Contexto

- O [ADR 0001](0001-decisao-de-stack-web.md) escolheu PrimeNG como biblioteca de UI assumindo open source (MIT).
- Em 2026 a PrimeTek unificou PrimeNG/PrimeReact/PrimeVue sob a **licença PrimeUI**: a partir das majors **PrimeNG 22**, PrimeReact 11 e PrimeVue 5, os pacotes npm deixam de ser distribuídos como open source e passam a exigir chave de licença (verificação offline, aviso em runtime quando ausente).
  - **Community (gratuita)**: exige receita anual < US$ 1M, < 5 devs, < 10 funcionários e < US$ 3M de VC; renovação anual da chave.
  - **Commercial**: US$ 599/dev (ano de atualizações; US$ 799 a partir de 2027).
  - O repositório github.com/primefaces/primeng foi arquivado em jun/2026.
  - `primeicons@8` segue a mesma licença nova; a 7.0.0 é a última MIT.
- Versões já publicadas sob MIT **permanecem MIT para sempre** (não retroativo).
- O scaffold web estava no Angular 22; o PrimeNG 21 (última linha MIT) tem peer range `@angular/* ^21`, incompatível com o Angular 22 sem forçar peers.

## Decisão

**Fixar a stack na última geração 100% MIT** enquanto não houver uma decisão explícita de licenciamento:

| Pacote            | Versão  | Motivo                                |
| ----------------- | ------- | ------------------------------------- |
| `@angular/*`      | ^21.2.0 | Par com PrimeNG 21; LTS até ~mai/2027 |
| `primeng`         | 21.1.9  | Última major MIT                      |
| `@primeng/themes` | 21.0.4  | Theming da linha 21 (MIT)             |
| `primeicons`      | 7.0.0   | Última versão MIT                     |

O custo do downgrade Angular 22 → 21 foi ~zero (scaffold sem features). TypeScript baixou para ~5.9 (peer do `@angular/build@21`).

**Gatilhos para revisitar** este ADR:

1. A clínica decidir aceitar a licença PrimeUI (community ou commercial) → upgrade para PrimeNG 22+ com chave de licença.
2. Ou decidir migrar de biblioteca de UI (ex.: Spartan/ng-zorro/Kobalte-based) → novo ADR.
3. Angular 21 saindo do LTS (~mai/2027) sem decisão tomada → escolha forçada entre 1 e 2.

## Consequências

**Positivas**

- Zero exposição legal/produto sem decisão de licença; pipeline e preview não dependem de chave.
- Paridade de features necessária para W1–W6 existe inteira na 21 (tabela densa, upload, agenda, formulários).

**Negativas / trade-offs**

- Travado em Angular 21 até a decisão — sem receber majors novas do framework no período.
- Bugs corrigidos só no 22+ não chegam via upgrade direto.
- A janela de decisão é limitada pelo LTS do Angular 21 (~mai/2027); registrar lembrete na W1.
