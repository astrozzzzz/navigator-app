import type { SQLiteDatabase } from 'expo-sqlite';
import { Marker, MarkerImage } from '../types';

const MARKERS_WITH_IMAGE_COUNT = `
  SELECT
    m.id,
    m.latitude,
    m.longitude,
    m.created_at,
    COUNT(mi.id) AS image_count
  FROM markers m
  LEFT JOIN marker_images mi ON mi.marker_id = m.id
`;

export async function createMarker(db: SQLiteDatabase, latitude: number, longitude: number): Promise<number> {
	try {
		const result = await db.runAsync('INSERT INTO markers (latitude, longitude) VALUES (?, ?);', latitude, longitude);
		return result.lastInsertRowId;
	} catch (error) {
		throw new Error(`Не удалось создать маркер: ${(error as Error).message}`);
	}
}

export async function deleteMarker(db: SQLiteDatabase, id: number): Promise<void> {
	try {
		// Маркер и его изображения затрагивают две таблицы, поэтому удаляем в транзакции
		await db.withTransactionAsync(async () => {
			await db.runAsync('DELETE FROM marker_images WHERE marker_id = ?;', id);
			const result = await db.runAsync('DELETE FROM markers WHERE id = ?;', id);
			if (result.changes === 0) {
				throw new Error(`Маркер с id=${id} не найден`);
			}
		});
	} catch (error) {
		throw new Error(`Не удалось удалить маркер: ${(error as Error).message}`);
	}
}

export async function getMarkers(db: SQLiteDatabase): Promise<Marker[]> {
	try {
		return await db.getAllAsync<Marker>(`${MARKERS_WITH_IMAGE_COUNT} GROUP BY m.id ORDER BY m.created_at DESC;`);
	} catch (error) {
		throw new Error(`Не удалось получить список маркеров: ${(error as Error).message}`);
	}
}

export async function getMarkerById(db: SQLiteDatabase, id: number): Promise<Marker | null> {
	try {
		const marker = await db.getFirstAsync<Marker>(`${MARKERS_WITH_IMAGE_COUNT} WHERE m.id = ? GROUP BY m.id;`, id);
		return marker ?? null;
	} catch (error) {
		throw new Error(`Не удалось получить маркер: ${(error as Error).message}`);
	}
}

export async function addImage(db: SQLiteDatabase, markerId: number, uri: string): Promise<number> {
	try {
		const result = await db.runAsync('INSERT INTO marker_images (marker_id, uri) VALUES (?, ?);', markerId, uri);
		return result.lastInsertRowId;
	} catch (error) {
		throw new Error(`Не удалось добавить изображение: ${(error as Error).message}`);
	}
}

export async function deleteImage(db: SQLiteDatabase, id: number): Promise<void> {
	try {
		const result = await db.runAsync('DELETE FROM marker_images WHERE id = ?;', id);
		if (result.changes === 0) {
			throw new Error(`Изображение с id=${id} не найдено`);
		}
	} catch (error) {
		throw new Error(`Не удалось удалить изображение: ${(error as Error).message}`);
	}
}

export async function getMarkerImages(db: SQLiteDatabase, markerId: number): Promise<MarkerImage[]> {
	try {
		return await db.getAllAsync<MarkerImage>(
			'SELECT * FROM marker_images WHERE marker_id = ? ORDER BY created_at ASC;',
			markerId,
		);
	} catch (error) {
		throw new Error(`Не удалось получить изображения маркера: ${(error as Error).message}`);
	}
}
