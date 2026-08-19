# Horta with César

Website oficial de Horta with César, com walking tours, trilhos no Faial, formulário de reserva, integração com Google Calendar e tracking de cliques no WhatsApp.

## Estrutura principal

- `index.html` - site completo, estilos e JavaScript inline.
- `img/` - imagens e vídeos usados pelo site.
- `tests/` - testes de segurança, integridade e smoke test.
- `docs/audit-status.md` - estado da auditoria P0/P1/P2/P3/P4.
- `docs/p4-assets-audit.md` - relatório P4 de assets, sem apagar nem otimizar ficheiros.
- `.github/workflows/static.yml` - testes e deploy para GitHub Pages.
- `.github/workflows/production-smoke.yml` - smoke test de produção pós-deploy.

## Comandos

```bash
npm test
npm run test:p0
npm run test:p1
npm run test:p2
npm run test:p3
npm run smoke:production
```

O `npm test` corre P0, P1, P2 e P3. O deploy do GitHub Pages falha se algum destes testes falhar.

O `npm run smoke:production` valida a página publicada em `https://hortawithcesar.com/`. Este teste também corre no workflow separado `Production smoke test`, depois de um deploy concluído com sucesso.

## Regras críticas

- Não duplicar a tag Google/GA4; reutilizar sempre a implementação existente.
- Não alterar mensagens, URLs ou comportamento dos links de WhatsApp sem validação explícita.
- Qualquer clique real em WhatsApp deve manter o evento GA4 `whatsapp_click`.
- Reservas diretas só devem avançar depois do recheck final de disponibilidade.
- Disponibilidade desconhecida ou falha da API deve falhar em modo seguro.
- A regra de antecedência mínima é `agora + 48h`.
- Grupos até 7 pessoas podem reservar/pagar diretamente quando as restantes regras passam.
- Grupos de 8+ pessoas devem seguir por pedido manual, sem pagamento direto.
- Trilhos escondidos ou desativados nunca podem validar para reserva.
- Reservas vindas de WhatsApp, agência, GetYourGuide, Viator ou outro canal devem ser registadas no Google Calendar.

## Deploy

O deploy é feito pelo GitHub Actions para GitHub Pages quando há push para `main`.

Fluxo esperado:

1. Fazer as alterações localmente.
2. Correr `npm test`.
3. Rever `git diff`.
4. Fazer commit e push para `main`.
5. Confirmar que o workflow `Deploy static content to Pages` passou.
6. Confirmar o workflow separado `Production smoke test`.

## Produção

URL principal: https://hortawithcesar.com/

O smoke test de produção valida:

- resposta HTTP 200;
- conteúdo HTML;
- presença de `Horta with César`;
- presença do formulário de reserva;
- presença de `whatsapp_click`;
- ausência da referência legada de end-date;
- canonical URL correto.
