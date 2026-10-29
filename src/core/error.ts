export class DomainError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends DomainError {
  constructor(message = "Bad request.") {
    super(400, message);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Sign in to continue.") {
    super(401, message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Access denied.") {
    super(403, message);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Resource not found.") {
    super(404, message);
  }
}
