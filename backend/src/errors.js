export class AppError extends Error {
  constructor(status, message, code = 'ERROR', details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const assert = (condition, status, message, code) => { if (!condition) throw new AppError(status, message, code); };
