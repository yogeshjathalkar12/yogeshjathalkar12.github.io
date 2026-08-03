export class UnauthorizedError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'UnauthorizedError';
  }
}

export class OutOfCreditsError extends Error {
  constructor() {
    super('Out of credits');
    this.name = 'OutOfCreditsError';
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
