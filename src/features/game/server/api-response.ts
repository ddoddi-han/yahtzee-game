import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { GameError } from '../domain/errors';

export function jsonError(error: unknown) {
  if (error instanceof GameError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request', issues: error.issues }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
