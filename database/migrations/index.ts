import * as m001Initial from './001_initial';

export interface Migration {
  version: number;
  up: string;
}

export const migrations: Migration[] = [m001Initial].sort((a, b) => a.version - b.version);
