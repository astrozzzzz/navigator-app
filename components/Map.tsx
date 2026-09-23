import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import MapView, { LongPressEvent, Marker as MapMarker, Region } from 'react-native-maps';
import { Marker } from '../types';

interface UserCoordinates {
  latitude: number;
  longitude: number;
}

interface MapProps {
  markers: Marker[];
  userLocation: UserCoordinates | null;
  onLongPress: (latitude: number, longitude: number) => void;
  onMarkerPress: (id: number) => void;
}

// Если за это время карта так и не сообщила о готовности (нет сети, неверный ключ
// Google Maps, нет Google Play Services), показываем ошибку с возможностью повторить.
const MAP_LOAD_TIMEOUT_MS = 15000;

const INITIAL_REGION = {
  latitude: 55.751244,
  longitude: 37.618423,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

function markersIdsKey(markers: Marker[]): string {
  return markers
    .map((marker) => marker.id)
    .sort((a, b) => a - b)
    .join(',');
}

export default function Map({ markers, userLocation, onLongPress, onMarkerPress }: MapProps) {
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const hasCenteredRef = useRef(false);
  const regionRef = useRef<Region>(INITIAL_REGION);
  const isFocused = useIsFocused();
  const [isMapReady, setIsMapReady] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  // На Android нативная карта, скрытая под другим экраном (например, деталями метки),
  // отсоединяется от окна и теряет синхронизацию со списком маркеров: удалённая в это
  // время метка остаётся на карте «призраком». Поэтому пока карта не в фокусе, маркеры
  // не меняем, а если при возврате набор меток изменился — пересоздаём MapView.
  const [shownMarkers, setShownMarkers] = useState(markers);
  const [mapKey, setMapKey] = useState(0);
  const wasFocusedRef = useRef(isFocused);

  const remountMap = () => {
    setIsMapReady(false);
    setLoadTimedOut(false);
    setMapKey((key) => key + 1);
  };

  useEffect(() => {
    if (!isFocused) {
      wasFocusedRef.current = false;
      return;
    }
    if (markers !== shownMarkers) {
      if (!wasFocusedRef.current && markersIdsKey(markers) !== markersIdsKey(shownMarkers)) {
        remountMap();
      }
      setShownMarkers(markers);
    }
    wasFocusedRef.current = true;
  }, [isFocused, markers, shownMarkers]);

  // Кроме того, при вставке маркера по индексу react-native-maps на Android заменяет
  // элемент (features.set), а не сдвигает список. Поэтому отдаём маркеры в порядке
  // создания — новые всегда добавляются в конец.
  const orderedMarkers = useMemo(
    () => [...shownMarkers].sort((a, b) => a.id - b.id),
    [shownMarkers]
  );

  useEffect(() => {
    if (isMapReady) return;
    const timer = setTimeout(() => setLoadTimedOut(true), MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isMapReady, mapKey]);

  useEffect(() => {
    if (userLocation && isMapReady && !hasCenteredRef.current && mapRef.current) {
      hasCenteredRef.current = true;
      mapRef.current.animateToRegion(
        {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    }
  }, [userLocation, isMapReady]);

  const handleLongPress = (event: LongPressEvent) => {
    try {
      const { latitude, longitude } = event.nativeEvent.coordinate;
      onLongPress(latitude, longitude);
    } catch (error) {
      setMapError('Не удалось добавить метку. Попробуйте ещё раз.');
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        key={mapKey}
        ref={mapRef}
        style={styles.map}
        initialRegion={regionRef.current}
        onMapReady={() => {
          setIsMapReady(true);
          setLoadTimedOut(false);
        }}
        onRegionChangeComplete={(region) => {
          regionRef.current = region;
        }}
        onLongPress={handleLongPress}
        showsUserLocation={!!userLocation}
        showsMyLocationButton
      >
        {orderedMarkers.map((marker) => (
          <MapMarker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={`Метка #${marker.id}`}
            description={`Изображений: ${marker.image_count}`}
            onPress={() => onMarkerPress(marker.id)}
          />
        ))}
      </MapView>
      {!isMapReady && !loadTimedOut && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" />
          <Text style={styles.overlayText}>Загрузка карты…</Text>
        </View>
      )}
      {loadTimedOut && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>
            Не удалось загрузить карту. Проверьте подключение к интернету и попробуйте ещё раз.
          </Text>
          <Pressable style={styles.retryButton} onPress={remountMap}>
            <Text style={styles.retryButtonText}>Повторить</Text>
          </Pressable>
        </View>
      )}
      {mapError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{mapError}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  overlayText: {
    color: '#333',
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
  errorBanner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: '#B00020',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#fff',
    textAlign: 'center',
  },
});
