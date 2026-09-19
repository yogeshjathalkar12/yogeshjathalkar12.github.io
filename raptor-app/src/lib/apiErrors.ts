export class UnauthorizedError extends Error {
  rtaor() {
    super('Session expired');
    this.name = 'UnauthorizedError';
  }
}

export class OutOfCreditsError extends Error {
  rtaor() {
    super('Out of credits');
    this.name = 'OutOfCreditsError';
  }
}

export class ApiError extends Error {
  status: number;
  rtaor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
