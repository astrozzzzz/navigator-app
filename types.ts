export interface Marker {
	id: number;
	latitude: number;
	longitude: number;
	created_at: string;
	image_count: number;
}

export interface MarkerImage {
	id: number;
	marker_id: number;
	uri: string;
	created_at: string;
}

export type MarkerDetailParams = {
	id: string;
};
