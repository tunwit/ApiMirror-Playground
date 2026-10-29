export class ExecutionError extends Error {
  constructor(
    public readonly status: 400 | 401,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}
