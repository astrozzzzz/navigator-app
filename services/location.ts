import * as Location from 'expo-location';

export interface LocationConfig {
	accuracy: Location.Accuracy;
	timeInterval: number; // Как часто обновлять местоположение (мс)
	distanceInterval: number; // Минимальное расстояние (в метрах) между обновлениями
}

export interface LocationState {
	location: Location.LocationObject | null;
	errorMsg: string | null;
}

export const DEFAULT_LOCATION_CONFIG: LocationConfig = {
	// High — чтобы использовался GPS
	accuracy: Location.Accuracy.High,
	timeInterval: 5000,
	distanceInterval: 5,
};

/**
 * Запрашивает разрешение на доступ к местоположению на переднем плане.
 * Бросает ошибку, если пользователь отказал или службы геолокации отключены.
 */
export async function requestLocationPermissions(): Promise<void> {
	const servicesEnabled = await Location.hasServicesEnabledAsync();
	if (!servicesEnabled) {
		throw new Error('Службы геолокации отключены на устройстве.');
	}

	const { status } = await Location.requestForegroundPermissionsAsync();
	if (status !== Location.PermissionStatus.GRANTED) {
		throw new Error('Доступ к местоположению не разрешён.');
	}
}

/**
 * Подписывается на обновления местоположения в реальном времени.
 * `onError` вызывается, если обновления прервались уже после подписки.
 * Возвращает подписку, которую нужно отменить через `.remove()`.
 */
export async function startLocationUpdates(
	onLocation: (location: Location.LocationObject) => void,
	onError?: (message: string) => void,
	config: LocationConfig = DEFAULT_LOCATION_CONFIG,
): Promise<Location.LocationSubscription> {
	const lastKnown = await Location.getLastKnownPositionAsync();
	if (lastKnown) {
		onLocation(lastKnown);
	}

	return Location.watchPositionAsync(
		{
			accuracy: config.accuracy,
			timeInterval: config.timeInterval,
			distanceInterval: config.distanceInterval,
		},
		onLocation,
		// Вызывается, если геолокация перестала работать уже после подписки
		// (например, пользователь выключил GPS, пока приложение открыто).
		reason => onError?.(`Не удалось получить местоположение: ${reason}`),
	);
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/**
 * Расстояние между двумя точками по формуле Хаверсина, в метрах.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const dLat = toRadians(lat2 - lat1);
	const dLon = toRadians(lon2 - lon1);

	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return EARTH_RADIUS_METERS * c;
}
