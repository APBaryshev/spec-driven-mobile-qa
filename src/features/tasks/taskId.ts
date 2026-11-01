import { uuid } from 'expo';

export function generateTaskId(): string {
  return uuid.v4();
}
