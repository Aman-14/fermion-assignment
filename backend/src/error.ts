type ErrorCode = "WAITING_FOR_PEERS";

export class BadRequestError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "BadRequestError";
    this.code = code;
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
    };
  }
}
