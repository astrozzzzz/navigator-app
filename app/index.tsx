import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Map from '../components/Map';
import MarkerList from '../components/MarkerList';
import { useDatabase } from '../contexts/DatabaseContext';
import {
  calculateDistance,
  requestLocationPermissions,
  startLocationUpdates,
} from '../services/location';
import {
  configureNotificationHandler,
  notificationManager,
  requestNotificationPermissions,
} from '../services/notifications';
import { Marker } from '../types';

const PROXIMITY_THRESHOLD_METERS = 100;

/**
 * Показывает уведомления для меток в радиусе PROXIMITY_THRESHOLD_METERS и снимает
 * уведомления для всех остальных (включая удалённые метки).
 */
function checkProximity(coords: Location.LocationObjectCoords, currentMarkers: Marker[]) {
  const nearbyIds = new Set<number>();

  currentMarkers.forEach((marker) => {
    const distance = calculateDistance(
      coords.latitude,
      coords.longitude,
      marker.latitude,
      marker.longitude
    );

    if (distance <= PROXIMITY_THRESHOLD_METERS) {
      nearbyIds.add(marker.id);
      notificationManager.showNotification(marker).catch((err) => {
        if (__DEV__) console.warn('Не удалось показать уведомление', err);
      });
    }
  });

  notificationManager.pruneExcept(nearbyIds).catch((err) => {
    if (__DEV__) console.warn('Не удалось очистить уведомления', err);
  });
}

export default function MapScreen() {
  const router = useRouter();
  const { markers, addMarker, isLoading, error, retry } = useDatabase();
  const [showList, setShowList] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const markersRef = useRef<Marker[]>(markers);
  const lastCoordsRef = useRef<Location.LocationObjectCoords | null>(null);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  // Уведомления: настраиваем поведение и запрашиваем разрешение один раз при монтировании.
  useEffect(() => {
    configureNotificationHandler()
      .then(() => requestNotificationPermissions())
      .catch((err) => {
        setNotificationsError(
          err instanceof Error ? err.message : 'Не удалось получить доступ к уведомлениям.'
        );
      });
  }, []);

  // Геолокация: запрашиваем разрешение и подписываемся на обновления координат.
  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    const setupLocation = async () => {
      try {
        await requestLocationPermissions();
        subscription = await startLocationUpdates(
          (location) => {
            if (cancelled) return;
            lastCoordsRef.current = location.coords;
            setUserLocation(location.coords);
            setLocationError(null);
            checkProximity(location.coords, markersRef.current);
          },
          (message) => {
            if (cancelled) return;
            setLocationError(message);
          }
        );
      } catch (err) {
        if (cancelled) return;
        setLocationError(
          err instanceof Error ? err.message : 'Не удалось получить местоположение.'
        );
      }
    };

    setupLocation();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  // Список меток изменился: перепроверяем расстояния по последним координатам, чтобы
  // метка, поставленная рядом с пользователем, сразу дала уведомление, а у удалённой
  // метки уведомление снялось. Пока координат нет — только снимаем уведомления удалённых меток.
  useEffect(() => {
    if (lastCoordsRef.current) {
      checkProximity(lastCoordsRef.current, markers);
      return;
    }
    const existingIds = new Set(markers.map((marker) => marker.id));
    notificationManager.pruneExcept(existingIds).catch(() => undefined);
  }, [markers]);

  const handleLongPress = useCallback(
    async (latitude: number, longitude: number) => {
      setActionError(null);
      try {
        await addMarker(latitude, longitude);
      } catch (err) {
        setActionError('Не удалось сохранить метку в базе данных.');
      }
    },
    [addMarker]
  );

  const handleMarkerPress = useCallback(
    (id: number) => {
      try {
        router.push(`/marker/${id}`);
      } catch (err) {
        console.warn('Ошибка навигации к деталям метки', err);
      }
    },
    [router]
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Инициализация базы данных…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          Не удалось инициализировать базу данных: {error.message}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => retry()}>
          <Text style={styles.retryButtonText}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Map
        markers={markers}
        userLocation={userLocation}
        onLongPress={handleLongPress}
        onMarkerPress={handleMarkerPress}
      />
      {(actionError || locationError || notificationsError) && (
        <View style={styles.bannerContainer}>
          {actionError && <Text style={styles.actionErrorText}>{actionError}</Text>}
          {locationError && <Text style={styles.actionErrorText}>{locationError}</Text>}
          {notificationsError && (
            <Text style={styles.actionErrorText}>{notificationsError}</Text>
          )}
        </View>
      )}
      <Pressable style={styles.toggleButton} onPress={() => setShowList((prev) => !prev)}>
        <Text style={styles.toggleButtonText}>
          {showList ? 'Скрыть список меток' : `Список меток (${markers.length})`}
        </Text>
      </Pressable>
      {showList && <MarkerList markers={markers} onSelect={handleMarkerPress} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    color: '#666',
  },
  toggleButton: {
    backgroundColor: '#1a73e8',
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  errorText: {
    color: '#B00020',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  bannerContainer: {
    backgroundColor: '#fdecea',
    paddingVertical: 4,
  },
  actionErrorText: {
    color: '#B00020',
    textAlign: 'center',
    paddingVertical: 4,
  },
});
