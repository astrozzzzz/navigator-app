import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import ImageList from '../../components/ImageList';
import { useDatabase } from '../../contexts/DatabaseContext';
import { Marker, MarkerDetailParams, MarkerImage } from '../../types';

export default function MarkerDetailScreen() {
  const params = useLocalSearchParams<MarkerDetailParams>();
  const markerId = Number(params.id);
  const router = useRouter();
  const { getMarkerById, getMarkerImages, addImage, deleteImage, deleteMarker } = useDatabase();

  const [marker, setMarker] = useState<Marker | null>(null);
  const [images, setImages] = useState<MarkerImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!Number.isFinite(markerId)) {
      setLoadError('Некорректный идентификатор метки.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const [foundMarker, markerImages] = await Promise.all([
        getMarkerById(markerId),
        getMarkerImages(markerId),
      ]);
      setMarker(foundMarker);
      setImages(markerImages);
    } catch (err) {
      setLoadError('Не удалось загрузить данные метки из базы данных.');
    } finally {
      setIsLoading(false);
    }
  }, [markerId, getMarkerById, getMarkerImages]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddImage = useCallback(async () => {
    if (!marker) return;
    setActionError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setActionError('Нет доступа к галерее. Разрешите доступ в настройках устройства.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        await addImage(marker.id, asset.uri);
        await loadData();
      }
    } catch (err) {
      setActionError('Не удалось выбрать или сохранить изображение. Попробуйте ещё раз.');
    }
  }, [marker, addImage, loadData]);

  const handleDeleteImage = useCallback(
    (imageId: number) => {
      Alert.alert('Удалить изображение?', 'Это действие нельзя отменить.', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setActionError(null);
            try {
              await deleteImage(imageId);
              await loadData();
            } catch (err) {
              setActionError('Не удалось удалить изображение.');
            }
          },
        },
      ]);
    },
    [deleteImage, loadData]
  );

  const handleBack = useCallback(() => {
    try {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch (err) {
      router.replace('/');
    }
  }, [router]);

  const handleDeleteMarker = useCallback(() => {
    if (!marker) return;
    Alert.alert('Удалить метку?', 'Метка и все её изображения будут удалены безвозвратно.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMarker(marker.id);
            handleBack();
          } catch (err) {
            setActionError('Не удалось удалить метку.');
          }
        },
      },
    ]);
  }, [marker, deleteMarker, handleBack]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Загрузка…' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (loadError || !marker) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Метка не найдена' }} />
        <Text style={styles.errorText}>{loadError ?? 'Метка не найдена.'}</Text>
        {loadError && (
          <Pressable style={styles.button} onPress={loadData}>
            <Text style={styles.buttonText}>Повторить</Text>
          </Pressable>
        )}
        <Pressable style={styles.button} onPress={handleBack}>
          <Text style={styles.buttonText}>Назад к карте</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Метка #${marker.id}` }} />
      <View style={styles.header}>
        <Text style={styles.title}>Метка #{marker.id}</Text>
        <Text style={styles.coordinates}>
          {marker.latitude.toFixed(5)}, {marker.longitude.toFixed(5)}
        </Text>
        <Text style={styles.createdAt}>
          Создана: {new Date(marker.created_at).toLocaleString()}
        </Text>
      </View>

      <Pressable style={styles.button} onPress={handleAddImage}>
        <Text style={styles.buttonText}>Добавить изображение</Text>
      </Pressable>

      <Pressable style={[styles.button, styles.dangerButton]} onPress={handleDeleteMarker}>
        <Text style={styles.buttonText}>Удалить метку</Text>
      </Pressable>

      {actionError && <Text style={styles.errorText}>{actionError}</Text>}

      <ImageList images={images} onDelete={handleDeleteImage} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
  header: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  coordinates: {
    marginTop: 4,
    color: '#666',
  },
  createdAt: {
    marginTop: 2,
    color: '#999',
    fontSize: 13,
  },
  button: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#B00020',
    marginBottom: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  errorText: {
    color: '#B00020',
    textAlign: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
});
