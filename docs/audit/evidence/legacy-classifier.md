# Classificação das 13 capturas anteriores

Comando executado contra os artefactos do commit `b0d1426971b0ab0159abd22fe1b42b837f0d7c3a`:

`node tests/audit/check-visual-evidence.mjs --report <diretório-baseline-b0d1426>`

Critério composto: rejeitar quando `uniform >= 45%`, ou quando `uniform > 40%` e `low-detail > 64%` ou `< 58%`. Ambas as métricas participam na decisão. As duas imagens `viewport` são áreas visíveis, não páginas inteiras, e permanecem aceites; as 11 capturas antigas de página inteira são rejeitadas.

| Ficheiro anterior | Uniform | Low-detail | Resultado |
|---|---:|---:|---|
| crm-gestao-desktop.jpg | 57,5% | 59,4% | REJECT |
| crm-gestao-mobile.jpg | 46,3% | 71,3% | REJECT |
| crm-gestao-tablet.jpg | 48,1% | 55,6% | REJECT |
| home-1024x768.jpg | 51,9% | 58,8% | REJECT |
| home-1440x900-viewport.jpg | 5,6% | 33,8% | ACCEPT |
| home-1440x900.jpg | 50,0% | 60,0% | REJECT |
| home-360x800.jpg | 45,0% | 61,9% | REJECT |
| home-390x844-viewport.jpg | 9,4% | 34,4% | ACCEPT |
| home-390x844.jpg | 43,1% | 64,4% | REJECT |
| home-768x1024.jpg | 40,6% | 56,9% | REJECT |
| website-premium-desktop.jpg | 42,5% | 65,0% | REJECT |
| website-premium-mobile.jpg | 46,3% | 66,3% | REJECT |
| website-premium-tablet.jpg | 48,1% | 66,3% | REJECT |

O controlo negativo permanente é a captura antiga `home-390x844.jpg`, preservada como `fixtures/audit/invalid-home-390x844.jpg` com SHA-256 fixo. O CI exige simultaneamente 13/13 imagens atuais aceites e este controlo rejeitado.
