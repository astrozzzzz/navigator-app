import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { Marker } from '../types';

export interface ActiveNotification {
  markerId: number;
  notificationId: string;
  timestamp: number;
}

type NotificationsModule = typeof import('expo-notifications');

/**
 * Начиная с Expo SDK 53 сам модуль `expo-notifications` бросает исключение
 * при импорте на Android внутри Expo Go (даже если используются только
 * локальные уведомления) — он пытается зарегистрировать push-токен на
 * уровне модуля. Поэтому подключаем модуль лениво и только если это
 * безопасно; в Expo Go на Android функциональность недоступна и требует
 * development build.
 */
function isNotificationsUnsupported(): boolean {
  return Platform.OS === 'android' && isRunningInExpoGo();
}

let modulePromise: Promise<NotificationsModule> | null = null;

/** Android-канал для уведомлений о приближении к меткам. */
const PROXIMITY_CHANNEL_ID = 'proximity';

async function loadNotifications(): Promise<NotificationsModule> {
  if (isNotificationsUnsupported()) {
    throw new Error(
      'Локальные уведомления недоступны в Expo Go на Android (ограничение Expo SDK 53+). ' +
        'Соберите development build, чтобы протестировать эту функцию.'
    );
  }
  if (!modulePromise) {
    modulePromise = import('expo-notifications');
  }
  return modulePromise;
}

/**
 * Настраивает, как приложение показывает уведомления, пока оно активно
 * (без этого локальные уведомления по умолчанию не отображаются на экране).
 */
export async function configureNotificationHandler(): Promise<void> {
  if (isNotificationsUnsupported()) return;

  const Notifications = await loadNotifications();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Запрашивает разрешение на отправку уведомлений.
 * Бросает ошибку, если пользователь отказал или функция недоступна в среде запуска.
 */
export async function requestNotificationPermissions(): Promise<void> {
  const Notifications = await loadNotifications();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    throw new Error('Доступ к уведомлениям не разрешён.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PROXIMITY_CHANNEL_ID, {
      name: 'Приближение к меткам',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

/**
 * Хранит активные уведомления в памяти (markerId -> уведомление), чтобы
 * не отправлять дубликаты, пока пользователь остаётся рядом с меткой,
 * и снимать уведомление, когда он выходит из зоны действия метки.
 */
export class NotificationManager {
  private activeNotifications: Map<number, ActiveNotification> = new Map();
  // Метки, для которых уведомление уже отправляется, но ещё не попало в реестр:
  // защищает от дубликата, если проверка приближения сработала дважды подряд.
  private pendingMarkerIds: Set<number> = new Set();

  isActive(markerId: number): boolean {
    return this.activeNotifications.has(markerId);
  }

  async showNotification(marker: Marker): Promise<void> {
    if (this.activeNotifications.has(marker.id) || this.pendingMarkerIds.has(marker.id)) {
      return; // Предотвращаем дубликаты
    }
    if (isNotificationsUnsupported()) {
      return; // Тихо пропускаем в неподдерживаемой среде — баннер об этом уже показан при запросе разрешений
    }

    this.pendingMarkerIds.add(marker.id);
    try {
      const Notifications = await loadNotifications();
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Вы рядом с меткой!',
          body: `Вы находитесь рядом с меткой #${marker.id}.`,
        },
        // Без даты/интервала уведомление отправляется сразу; channelId — чтобы на Android
        // оно попало в канал «Приближение к меткам», а не в запасной канал Expo.
        trigger: Platform.OS === 'android' ? { channelId: PROXIMITY_CHANNEL_ID } : null,
      });

      this.activeNotifications.set(marker.id, {
        markerId: marker.id,
        notificationId,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw new Error(`Не удалось показать уведомление: ${(error as Error).message}`);
    } finally {
      this.pendingMarkerIds.delete(marker.id);
    }
  }

  async removeNotification(markerId: number): Promise<void> {
    const notification = this.activeNotifications.get(markerId);
    if (!notification) {
      return;
    }

    try {
      const Notifications = await loadNotifications();
      // Уведомление с немедленным триггером к этому моменту уже показано, поэтому
      // cancelScheduledNotificationAsync его не уберёт — снимаем его из шторки через
      // dismissNotificationAsync. Отмену тоже вызываем на случай, если доставка ещё не прошла.
      await Promise.all([
        Notifications.dismissNotificationAsync(notification.notificationId),
        Notifications.cancelScheduledNotificationAsync(notification.notificationId),
      ]);
    } catch (error) {
      // Уведомление могло уже быть показано/отменено системой — это не критично,
      // главное убрать его из локального реестра, чтобы не залипнуть в активном состоянии.
      if (__DEV__) {
        console.warn('[notifications] не удалось отменить уведомление', error);
      }
    } finally {
      this.activeNotifications.delete(markerId);
    }
  }

  /** Снимает уведомления для меток, отсутствующих в переданном наборе активных id. */
  async pruneExcept(activeMarkerIds: Set<number>): Promise<void> {
    const toRemove = Array.from(this.activeNotifications.keys()).filter(
      (markerId) => !activeMarkerIds.has(markerId)
    );
    await Promise.all(toRemove.map((markerId) => this.removeNotification(markerId)));
  }

  async clearAll(): Promise<void> {
    await Promise.all(
      Array.from(this.activeNotifications.keys()).map((markerId) =>
        this.removeNotification(markerId)
      )
    );
  }
}

export const notificationManager = new NotificationManager();
