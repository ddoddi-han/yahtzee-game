export class GameError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export class ForbiddenGameActionError extends GameError {
  constructor(message = 'This action is not allowed.') {
    super(message, 403);
  }
}

export class NotFoundGameError extends GameError {
  constructor(message = 'Room was not found.') {
    super(message, 404);
  }
}
