import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Marker } from '../types';

interface MarkerListProps {
  markers: Marker[];
  onSelect: (id: number) => void;
}

export default function MarkerList({ markers, onSelect }: MarkerListProps) {
  if (markers.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          Меток пока нет. Зажмите карту, чтобы добавить первую.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={markers}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <Pressable style={styles.item} onPress={() => onSelect(item.id)}>
          <Text style={styles.itemTitle}>Метка #{item.id}</Text>
          <Text style={styles.itemSubtitle}>
            {item.image_count} изображени{item.image_count === 1 ? 'е' : 'й'} ·{' '}
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 160,
    backgroundColor: '#fff',
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  emptyContainer: {
    padding: 16,
    backgroundColor: '#fff',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
  },
});
