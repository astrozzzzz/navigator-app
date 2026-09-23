import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations';

export const DATABASE_NAME = 'markers.db';

/**
 * Открывает соединение с базой данных, включает поддержку внешних ключей
 * и применяет все ещё не применённые миграции
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
	let db: SQLite.SQLiteDatabase;
	try {
		db = await SQLite.openDatabaseAsync(DATABASE_NAME);
	} catch (error) {
		throw new Error(`Не удалось открыть базу данных: ${(error as Error).message}`);
	}

	try {
		await db.execAsync('PRAGMA foreign_keys = ON;');
		await runMigrations(db);
	} catch (error) {
		throw new Error(`Не удалось инициализировать базу данных: ${(error as Error).message}`);
	}

	return db;
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
	const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
	let currentVersion = row?.user_version ?? 0;

	const pending = migrations.filter(migration => migration.version > currentVersion);

	for (const migration of pending) {
		try {
			await db.execAsync(migration.up);
			currentVersion = migration.version;
			await db.execAsync(`PRAGMA user_version = ${currentVersion};`);
			if (__DEV__) {
				console.log(`[database] применена миграция v${migration.version}`);
			}
		} catch (error) {
			throw new Error(`Не удалось применить миграцию v${migration.version}: ${(error as Error).message}`);
		}
	}
}
