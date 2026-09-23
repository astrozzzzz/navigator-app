import type { SQLiteDatabase } from 'expo-sqlite';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as operations from '../database/operations';
import { openDatabase } from '../database/schema';
import { Marker, MarkerImage } from '../types';

interface DatabaseContextType {
  // Операции с базой данных
  addMarker: (latitude: number, longitude: number) => Promise<number>;
  deleteMarker: (id: number) => Promise<void>;
  getMarkers: () => Promise<Marker[]>;
  getMarkerById: (id: number) => Promise<Marker | null>;
  addImage: (markerId: number, uri: string) => Promise<number>;
  deleteImage: (id: number) => Promise<void>;
  getMarkerImages: (markerId: number) => Promise<MarkerImage[]>;

  // Кэш списка маркеров, обновляется после каждой мутации
  markers: Marker[];
  refreshMarkers: () => Promise<void>;

  // Статусы. `error` — ошибка открытия/инициализации базы: пока она есть, работать с данными
  // нельзя. Ошибки отдельных операций сюда не попадают — их получает вызывающий код.
  isLoading: boolean;
  error: Error | null;
  // Повторная попытка открыть базу после ошибки инициализации.
  retry: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

function logOperation(name: string, ...args: unknown[]) {
  if (__DEV__) {
    console.log(`[database] ${name}`, ...args);
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Ошибка отдельной операции не переводит всё приложение в состояние ошибки:
 * её получает и показывает пользователю вызывающий экран, а здесь только логируем.
 */
function logFailure(err: unknown): Error {
  const wrapped = toError(err);
  logOperation('operation failed', wrapped.message);
  return wrapped;
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const dbRef = useRef<SQLiteDatabase | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    // При повторной попытке закрываем соединение, оставшееся от неудачной инициализации.
    await dbRef.current?.closeAsync().catch(() => undefined);
    dbRef.current = null;

    try {
      const db = await openDatabase();
      if (!mountedRef.current) {
        await db.closeAsync().catch(() => undefined);
        return;
      }
      dbRef.current = db;
      const initialMarkers = await operations.getMarkers(db);
      if (!mountedRef.current) return;
      setMarkers(initialMarkers);
    } catch (err) {
      if (!mountedRef.current) return;
      logOperation('initialize failed', err);
      setError(toError(err));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    initialize();

    return () => {
      mountedRef.current = false;
      // Соединение с базой закрывается при размонтировании провайдера
      // (например, при полной перезагрузке приложения в Fast Refresh).
      dbRef.current?.closeAsync().catch(() => undefined);
      dbRef.current = null;
    };
  }, [initialize]);

  const requireDb = useCallback((): SQLiteDatabase => {
    if (!dbRef.current) {
      throw new Error('База данных ещё не инициализирована');
    }
    return dbRef.current;
  }, []);

  const refreshMarkers = useCallback(async () => {
    try {
      const db = requireDb();
      const result = await operations.getMarkers(db);
      setMarkers(result);
    } catch (err) {
      throw logFailure(err);
    }
  }, [requireDb]);

  const addMarker = useCallback(
    async (latitude: number, longitude: number) => {
      try {
        const db = requireDb();
        const id = await operations.createMarker(db, latitude, longitude);
        logOperation('addMarker', { id, latitude, longitude });
        await refreshMarkers();
        return id;
      } catch (err) {
        throw logFailure(err);
      }
    },
    [requireDb, refreshMarkers]
  );

  const deleteMarker = useCallback(
    async (id: number) => {
      try {
        const db = requireDb();
        await operations.deleteMarker(db, id);
        logOperation('deleteMarker', { id });
        await refreshMarkers();
      } catch (err) {
        throw logFailure(err);
      }
    },
    [requireDb, refreshMarkers]
  );

  const getMarkers = useCallback(async () => {
    try {
      const db = requireDb();
      return await operations.getMarkers(db);
    } catch (err) {
      throw logFailure(err);
    }
  }, [requireDb]);

  const getMarkerById = useCallback(
    async (id: number) => {
      try {
        const db = requireDb();
        return await operations.getMarkerById(db, id);
      } catch (err) {
        throw logFailure(err);
      }
    },
    [requireDb]
  );

  const addImage = useCallback(
    async (markerId: number, uri: string) => {
      try {
        const db = requireDb();
        const id = await operations.addImage(db, markerId, uri);
        logOperation('addImage', { markerId, id });
        await refreshMarkers();
        return id;
      } catch (err) {
        throw logFailure(err);
      }
    },
    [requireDb, refreshMarkers]
  );

  const deleteImage = useCallback(
    async (id: number) => {
      try {
        const db = requireDb();
        await operations.deleteImage(db, id);
        logOperation('deleteImage', { id });
        await refreshMarkers();
      } catch (err) {
        throw logFailure(err);
      }
    },
    [requireDb, refreshMarkers]
  );

  const getMarkerImages = useCallback(
    async (markerId: number) => {
      try {
        const db = requireDb();
        return await operations.getMarkerImages(db, markerId);
      } catch (err) {
        throw logFailure(err);
      }
    },
    [requireDb]
  );

  const value = useMemo<DatabaseContextType>(
    () => ({
      addMarker,
      deleteMarker,
      getMarkers,
      getMarkerById,
      addImage,
      deleteImage,
      getMarkerImages,
      markers,
      refreshMarkers,
      isLoading,
      error,
      retry: initialize,
    }),
    [
      addMarker,
      deleteMarker,
      getMarkers,
      getMarkerById,
      addImage,
      deleteImage,
      getMarkerImages,
      markers,
      refreshMarkers,
      isLoading,
      error,
      initialize,
    ]
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase должен использоваться внутри DatabaseProvider');
  }
  return context;
}
