// Expected rule rejections carry the existing public error code and message.
export class DomainError extends Error {
  /** @param {import('../../../shared/protocol.js').LobbyErrorCode} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
