import { ConfigContext, ExpoConfig } from 'expo/config';

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!googleMapsApiKey) {
	console.warn('GOOGLE_MAPS_API_KEY не задан: карта на Android не загрузится. Добавьте ключ в .env.local.');
}

export default ({ config }: ConfigContext): ExpoConfig => ({
	...(config as ExpoConfig),
	android: {
		...config.android,
		config: {
			...config.android?.config,
			googleMaps: { apiKey: googleMapsApiKey },
		},
	},
});
