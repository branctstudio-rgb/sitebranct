export const P0_D2_RESULTS = Object.freeze([
  "resposta",
  "recusa_seguranca",
  "entrada_inconclusiva",
  "timeout",
  "falha_provedor",
  "cancelado",
  "replay",
]);

const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, milliseconds);
  const cancel = () => {
    clearTimeout(timer);
    reject(new DOMException("Operação cancelada", "AbortError"));
  };
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
});

export function createMockGatewayAdapter({ latencyMs = 240, fail = false } = {}) {
  return Object.freeze({
    kind: "mock-local-only",
    async send({ text, history = [], locale = "pt-BR", signal } = {}) {
      if (typeof text !== "string" || !text.trim()) throw new TypeError("text is required");
      await wait(latencyMs, signal);
      if (fail) throw new Error("Falha sintética do adaptador local");
      const request = {
        tenant_id: "branct-dev-synthetic",
        conversation_id: "session-memory-only",
        mensagem_id: `mock-message-${history.length + 1}`,
        locale,
        mensagem: { texto: text, autor: "visitante" },
        historico: history.map(({ text: texto, author: autor }) => ({ texto, autor })),
      };
      return Object.freeze({
        request_id: `mock-${request.mensagem_id}`,
        resultado: "resposta",
        resposta: {
          texto: "Resposta sintética do Edi em ambiente DEV. Nenhum sistema externo foi contactado.",
          autor: "chat_ia",
          locale,
        },
        consumo_sintetico: { entrada: text.length, saida: 79 },
      });
    },
  });
}
